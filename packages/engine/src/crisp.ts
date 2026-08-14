import type { AnyElement, LinearElement, StickyElement } from '@scrawl/schema';
import { resolveFont, themedColor } from '@scrawl/schema';
import type { RenderOpts } from './renderer';
import { BaseRenderer } from './renderer';
import { applyElementRotation, getArrowheadPoints, getShapePath2D } from './geometry';
import { isShapeFillable } from './shapes';

function lineDash(el: AnyElement): number[] | null {
  if (el.strokeStyle === 'dashed') return [el.strokeWidth * 4, el.strokeWidth * 3];
  if (el.strokeStyle === 'dotted') return [0.5, el.strokeWidth * 3];
  return null;
}

/** Precise vectors: clean strokes, exact geometry, solid fills. */
export class CrispRenderer extends BaseRenderer {
  render(el: AnyElement, ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
    ctx.save();
    ctx.globalAlpha = el.opacity;
    applyElementRotation(ctx, el);
    switch (el.type) {
      case 'rectangle': {
        const path = new Path2D();
        const r = Math.min(el.cornerRadius, el.width / 2, el.height / 2);
        path.roundRect(el.x, el.y, el.width, el.height, Math.max(0, r));
        this.fillAndStroke(ctx, path, el, opts);
        break;
      }
      case 'ellipse': {
        const path = new Path2D();
        path.ellipse(
          el.x + el.width / 2,
          el.y + el.height / 2,
          Math.max(el.width / 2, 0.5),
          Math.max(el.height / 2, 0.5),
          0,
          0,
          Math.PI * 2,
        );
        this.fillAndStroke(ctx, path, el, opts);
        break;
      }
      case 'diamond': {
        const path = new Path2D();
        path.moveTo(el.x + el.width / 2, el.y);
        path.lineTo(el.x + el.width, el.y + el.height / 2);
        path.lineTo(el.x + el.width / 2, el.y + el.height);
        path.lineTo(el.x, el.y + el.height / 2);
        path.closePath();
        this.fillAndStroke(ctx, path, el, opts);
        break;
      }
      case 'shape': {
        const path = getShapePath2D(el);
        ctx.save();
        ctx.translate(el.x, el.y);
        if (isShapeFillable(el.shapeKind) && el.backgroundColor !== 'transparent') {
          ctx.fillStyle = themedColor(el.backgroundColor, opts.theme);
          ctx.fill(path);
        }
        ctx.strokeStyle = themedColor(el.strokeColor, opts.theme);
        ctx.lineWidth = el.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke(path);
        ctx.restore();
        break;
      }
      case 'icon':
        this.drawIcon(el, ctx, opts, resolveFont(el.fontFamily, 'crisp'));
        break;
      case 'image':
        this.drawImageEl(el, ctx, opts);
        break;
      case 'line':
      case 'arrow':
        this.drawLinear(el, ctx, opts);
        break;
      case 'freedraw':
        this.drawFreedraw(el, ctx, opts);
        break;
      case 'text':
        this.drawTextLines(el, ctx, opts, resolveFont(el.fontFamily, 'crisp'));
        break;
      case 'sticky':
        this.drawSticky(el, ctx, opts);
        break;
    }
    if (el.label) {
      if (el.type === 'line' || el.type === 'arrow') {
        this.drawConnectorLabel(el, ctx, opts, resolveFont(el.fontFamily, 'crisp'));
      } else if (
        el.type !== 'text' &&
        el.type !== 'sticky' &&
        el.type !== 'freedraw' &&
        el.type !== 'icon'
      ) {
        this.drawLabel(el, ctx, opts, resolveFont(el.fontFamily, 'crisp'));
      }
    }
    ctx.restore();
  }

  private fillAndStroke(
    ctx: CanvasRenderingContext2D,
    path: Path2D,
    el: AnyElement,
    opts: RenderOpts,
  ): void {
    if (el.backgroundColor !== 'transparent') {
      ctx.fillStyle = themedColor(el.backgroundColor, opts.theme);
      ctx.fill(path);
    }
    ctx.strokeStyle = themedColor(el.strokeColor, opts.theme);
    ctx.lineWidth = el.strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const dash = lineDash(el);
    if (dash) ctx.setLineDash(dash);
    ctx.stroke(path);
    ctx.setLineDash([]);
  }

  private drawLinear(el: LinearElement, ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
    if (el.points.length < 2) return;
    ctx.save();
    ctx.translate(el.x, el.y);
    ctx.strokeStyle = themedColor(el.strokeColor, opts.theme);
    ctx.lineWidth = el.strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const dash = lineDash(el);
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    const first = el.points[0]!;
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < el.points.length; i++) {
      const point = el.points[i]!;
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (el.type === 'arrow') {
      const head = getArrowheadPoints(el.points, el.strokeWidth);
      if (head) {
        const [a, b, tip] = head;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawSticky(el: StickyElement, ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
    ctx.save();
    ctx.shadowColor = 'rgba(20, 18, 12, 0.22)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = el.backgroundColor; // stickies stay pastel in dark mode
    const path = new Path2D();
    path.roundRect(el.x, el.y, el.width, el.height, 4);
    ctx.fill(path);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.lineWidth = 1;
    ctx.stroke(path);
    this.drawStickyText(el, ctx, opts, resolveFont(el.fontFamily, 'crisp'));
  }
}
