import rough from 'roughjs/bin/rough';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { AnyElement, SketchStyle, StickyElement, Theme } from '@scrawl/schema';
import { resolveFont, hasPoints, themedColor } from '@scrawl/schema';
import type { RenderOpts } from './renderer';
import { BaseRenderer } from './renderer';
import { applyElementRotation, getArrowheadPoints } from './geometry';
import { isShapeFillable, shapePath } from './shapes';

const generator = rough.generator();

const roughCanvasCache = new WeakMap<HTMLCanvasElement, RoughCanvas>();
function roughCanvasFor(canvas: HTMLCanvasElement): RoughCanvas {
  let rc = roughCanvasCache.get(canvas);
  if (!rc) {
    rc = rough.canvas(canvas);
    roughCanvasCache.set(canvas, rc);
  }
  return rc;
}

/**
 * Drawables are generated in element-local coordinates so moving an element
 * never regenerates them; the cache key captures everything else that does.
 */
const drawableCache = new Map<string, { key: string; ds: Drawable[] }>();

function shapeKey(el: AnyElement, theme: Theme, sketchStyle: SketchStyle): string {
  let pts = '';
  if (hasPoints(el)) {
    const last = el.points[el.points.length - 1] ?? { x: 0, y: 0 };
    pts = `${el.points.length}:${last.x},${last.y}`;
  }
  const corner =
    el.type === 'rectangle' ? el.cornerRadius : el.type === 'shape' ? el.shapeKind : '';
  return [
    el.width,
    el.height,
    el.strokeColor,
    el.backgroundColor,
    el.fillStyle,
    el.strokeWidth,
    el.strokeStyle,
    el.roughness,
    el.seed,
    corner,
    pts,
    theme,
    sketchStyle,
  ].join('|');
}

/**
 * Scrawl's sketch signatures — the values fed to rough.js that give our
 * hand-drawn strokes their character. Element roughness (the user's
 * "sloppiness") and fillStyle stay user-controlled; a signature shapes
 * everything else. The document selects one and passes it through each render.
 */
interface SketchSignature {
  roughnessScale: number; // multiplies the element's roughness
  bowing: number; // how much straight edges bow between endpoints
  fillWeight: (sw: number) => number; // thickness of hachure fill lines
  hachureGap: (sw: number) => number; // spacing between fill lines
  hachureAngle: number; // angle of the hachure fill
}

const SKETCH_PRESETS: Record<SketchStyle, SketchSignature> = {
  // Pencil — calm, confident lines; clearly hand-drawn without the jitter.
  pencil: {
    roughnessScale: 0.62,
    bowing: 0.5,
    fillWeight: (sw) => sw * 0.55,
    hachureGap: (sw) => 3.5 + sw * 1.7,
    hachureAngle: -50,
  },
  // Marker — warmer, more organic outline with a chunkier ink fill.
  marker: {
    roughnessScale: 1.15,
    bowing: 1.7,
    fillWeight: (sw) => sw * 1,
    hachureGap: (sw) => 3 + sw * 2.6,
    hachureAngle: -30,
  },
};

function roughOptions(el: AnyElement, theme: Theme, sketchStyle: SketchStyle): Options {
  const SKETCH = SKETCH_PRESETS[sketchStyle];
  const opts: Options = {
    seed: el.seed || 1,
    roughness: el.roughness * SKETCH.roughnessScale,
    bowing: SKETCH.bowing,
    stroke: themedColor(el.strokeColor, theme),
    strokeWidth: el.strokeWidth,
    fillWeight: SKETCH.fillWeight(el.strokeWidth),
    hachureGap: SKETCH.hachureGap(el.strokeWidth),
    hachureAngle: SKETCH.hachureAngle,
    preserveVertices: false,
    disableMultiStroke: el.strokeStyle !== 'solid',
  };
  const fillable = el.type === 'shape' ? isShapeFillable(el.shapeKind) : !hasPoints(el);
  if (el.backgroundColor !== 'transparent' && fillable) {
    opts.fill = themedColor(el.backgroundColor, theme);
    opts.fillStyle = el.fillStyle;
  }
  if (el.strokeStyle === 'dashed') {
    opts.strokeLineDash = [el.strokeWidth * 4, el.strokeWidth * 3];
  } else if (el.strokeStyle === 'dotted') {
    opts.strokeLineDash = [1, el.strokeWidth * 3];
  }
  return opts;
}

export function getRoughDrawables(
  el: AnyElement,
  theme: Theme,
  sketchStyle: SketchStyle = 'pencil',
): Drawable[] {
  const key = shapeKey(el, theme, sketchStyle);
  const cached = drawableCache.get(el.id);
  if (cached && cached.key === key) return cached.ds;

  const o = roughOptions(el, theme, sketchStyle);
  const ds: Drawable[] = [];
  switch (el.type) {
    case 'rectangle': {
      const r = Math.min(el.cornerRadius, el.width / 2, el.height / 2);
      if (r > 0) {
        const w = el.width;
        const h = el.height;
        ds.push(
          generator.path(
            `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`,
            o,
          ),
        );
      } else {
        ds.push(generator.rectangle(0, 0, el.width, el.height, o));
      }
      break;
    }
    case 'ellipse':
      ds.push(generator.ellipse(el.width / 2, el.height / 2, el.width, el.height, o));
      break;
    case 'diamond':
      ds.push(
        generator.polygon(
          [
            [el.width / 2, 0],
            [el.width, el.height / 2],
            [el.width / 2, el.height],
            [0, el.height / 2],
          ],
          o,
        ),
      );
      break;
    case 'shape':
      ds.push(generator.path(shapePath(el.shapeKind, el.width, el.height), o));
      break;
    case 'line':
    case 'arrow': {
      if (el.points.length >= 2) {
        ds.push(
          generator.linearPath(
            el.points.map((p) => [p.x, p.y] as [number, number]),
            o,
          ),
        );
        if (el.type === 'arrow') {
          const head = getArrowheadPoints(el.points, el.strokeWidth);
          if (head) {
            const [a, b, tip] = head;
            const headOpts: Options = { ...o };
            delete headOpts.strokeLineDash;
            ds.push(generator.line(a.x, a.y, tip.x, tip.y, headOpts));
            ds.push(generator.line(b.x, b.y, tip.x, tip.y, headOpts));
          }
        }
      }
      break;
    }
    case 'sticky':
      ds.push(
        generator.rectangle(0, 0, el.width, el.height, {
          seed: el.seed || 1,
          roughness: Math.min(el.roughness, 1.5),
          stroke: 'rgba(0,0,0,0.35)',
          strokeWidth: 1,
          fill: el.backgroundColor, // stickies stay pastel in dark mode
          fillStyle: 'solid',
        }),
      );
      break;
    case 'freedraw':
    case 'text':
    case 'image':
      break; // handled without drawables
  }
  if (drawableCache.size > 4000) drawableCache.clear();
  drawableCache.set(el.id, { key, ds });
  return ds;
}

/** Sketchy vectors: Rough.js with a stored per-element seed for stable wobble. */
export class RoughRenderer extends BaseRenderer {
  render(el: AnyElement, ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
    ctx.save();
    ctx.globalAlpha = el.opacity;
    applyElementRotation(ctx, el);
    switch (el.type) {
      case 'freedraw':
        this.drawFreedraw(el, ctx, opts);
        break;
      case 'text':
        this.drawTextLines(el, ctx, opts, resolveFont(el.fontFamily, 'rough'));
        break;
      case 'sticky':
        this.drawRough(el, ctx, opts, true);
        this.drawStickyText(el as StickyElement, ctx, opts, resolveFont(el.fontFamily, 'rough'));
        break;
      case 'icon':
        this.drawIcon(el, ctx, opts, resolveFont(el.fontFamily, 'rough'));
        break;
      case 'image':
        this.drawImageEl(el, ctx, opts);
        break;
      default:
        this.drawRough(el, ctx, opts, false);
    }
    if (el.label) {
      if (el.type === 'line' || el.type === 'arrow') {
        this.drawConnectorLabel(el, ctx, opts, resolveFont(el.fontFamily, 'rough'));
      } else if (
        el.type !== 'text' &&
        el.type !== 'sticky' &&
        el.type !== 'freedraw' &&
        el.type !== 'icon'
      ) {
        this.drawLabel(el, ctx, opts, resolveFont(el.fontFamily, 'rough'));
      }
    }
    ctx.restore();
  }

  private drawRough(
    el: AnyElement,
    ctx: CanvasRenderingContext2D,
    opts: RenderOpts,
    shadow: boolean,
  ): void {
    const rc = roughCanvasFor(ctx.canvas);
    const ds = getRoughDrawables(el, opts.theme, opts.sketchStyle);
    ctx.save();
    ctx.translate(el.x, el.y);
    if (shadow) {
      ctx.shadowColor = 'rgba(20, 18, 12, 0.2)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
    }
    for (const d of ds) rc.draw(d);
    ctx.restore();
  }
}

/** Used by the SVG exporter to reuse the exact same generated geometry. */
export function roughDrawableToPaths(d: Drawable) {
  return generator.toPaths(d);
}
