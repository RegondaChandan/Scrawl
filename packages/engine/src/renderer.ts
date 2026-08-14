import type {
  AnyElement,
  Box,
  LinearElement,
  Point,
  StickyElement,
  TextElement,
  Theme,
} from '@scrawl/schema';
import { CANVAS_COLORS, LABEL_FONT_SIZE, LINE_HEIGHT, themedColor } from '@scrawl/schema';
import {
  getElementBounds,
  getFreedrawPath,
  hitTestElement,
  polylineMidpoint,
  wrapText,
} from './geometry';
import { getIconImage } from './icons';
import { getImageForAsset, type AssetSourceResolver } from './images';

export interface RenderOpts {
  theme: Theme;
  editingId?: string | null;
  resolveAsset?: AssetSourceResolver;
}

/** Geometry is shared; each renderer supplies only its visual treatment. */
export interface Renderer {
  render(element: AnyElement, ctx: CanvasRenderingContext2D, opts: RenderOpts): void;
  hitTest(element: AnyElement, point: Point, tolerance: number): boolean;
  getBounds(element: AnyElement): Box;
}

export const STICKY_PADDING = 14;
export const STICKY_TEXT_COLOR = '#2b2a26';

export abstract class BaseRenderer implements Renderer {
  abstract render(element: AnyElement, ctx: CanvasRenderingContext2D, opts: RenderOpts): void;

  hitTest(element: AnyElement, point: Point, tolerance: number): boolean {
    return hitTestElement(element, point, tolerance);
  }

  getBounds(element: AnyElement): Box {
    return getElementBounds(element);
  }

  protected drawFreedraw(
    el: Extract<AnyElement, { type: 'freedraw' }>,
    ctx: CanvasRenderingContext2D,
    opts: RenderOpts,
  ): void {
    ctx.save();
    ctx.translate(el.x, el.y);
    ctx.fillStyle = themedColor(el.strokeColor, opts.theme);
    ctx.fill(getFreedrawPath(el));
    ctx.restore();
  }

  protected drawTextLines(
    el: TextElement,
    ctx: CanvasRenderingContext2D,
    opts: RenderOpts,
    fontFamily: string,
  ): void {
    if (opts.editingId === el.id) return;
    ctx.font = `${el.fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = themedColor(el.strokeColor, opts.theme);
    const lh = el.fontSize * LINE_HEIGHT;
    const offset = (LINE_HEIGHT - 1) * el.fontSize * 0.4;
    el.text.split('\n').forEach((line, i) => {
      let x = el.x;
      if (el.textAlign === 'center') {
        x = el.x + (el.width - ctx.measureText(line).width) / 2;
      } else if (el.textAlign === 'right') {
        x = el.x + el.width - ctx.measureText(line).width;
      }
      ctx.fillText(line, x, el.y + i * lh + offset);
    });
  }

  protected drawLabel(
    el: AnyElement,
    ctx: CanvasRenderingContext2D,
    opts: RenderOpts,
    fontFamily: string,
  ): void {
    if (!el.label || opts.editingId === el.id) return;
    const fs = LABEL_FONT_SIZE;
    const maxWidth = Math.max(el.width - 14, 24);
    ctx.font = `${fs}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = themedColor(el.strokeColor, opts.theme);
    const lines = wrapText(el.label, fs, el.renderStyle, maxWidth, el.fontFamily);
    const lh = fs * LINE_HEIGHT;
    const startY = el.y + (el.height - lines.length * lh) / 2;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const w = ctx.measureText(line).width;
      ctx.fillText(line, el.x + (el.width - w) / 2, startY + i * lh);
    }
  }

  protected drawConnectorLabel(
    el: LinearElement,
    ctx: CanvasRenderingContext2D,
    opts: RenderOpts,
    fontFamily: string,
  ): void {
    if (!el.label || opts.editingId === el.id || el.points.length < 2) return;
    const fs = LABEL_FONT_SIZE;
    ctx.font = `${fs}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    const mid = polylineMidpoint(el.points);
    const lines = el.label.split('\n');
    const lh = fs * LINE_HEIGHT;
    let width = 0;
    for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
    const height = lines.length * lh;
    const cx = el.x + mid.x;
    const cy = el.y + mid.y;
    ctx.save();
    ctx.fillStyle = CANVAS_COLORS[opts.theme];
    ctx.fillRect(cx - width / 2 - 5, cy - height / 2 - 3, width + 10, height + 6);
    ctx.fillStyle = themedColor(el.strokeColor, opts.theme);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const w = ctx.measureText(line).width;
      ctx.fillText(line, cx - w / 2, cy - height / 2 + i * lh);
    }
    ctx.restore();
  }

  /** Draw a placeholder until the icon cache triggers a repaint. */
  protected drawIcon(
    el: Extract<AnyElement, { type: 'icon' }>,
    ctx: CanvasRenderingContext2D,
    opts: RenderOpts,
    fontFamily: string,
  ): void {
    const img = getIconImage(el.iconId);
    if (img) {
      ctx.drawImage(img, el.x, el.y, el.width, el.height);
    } else {
      const path = new Path2D();
      path.roundRect(el.x, el.y, el.width, el.height, Math.min(el.width, el.height) * 0.18);
      ctx.fillStyle = opts.theme === 'dark' ? '#2a2833' : '#e9e7f0';
      ctx.fill(path);
    }
    if (!el.label || opts.editingId === el.id) return;
    const fs = LABEL_FONT_SIZE - 2;
    ctx.font = `${fs}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = themedColor(el.strokeColor, opts.theme);
    const lines = wrapText(
      el.label,
      fs,
      el.renderStyle,
      Math.max(el.width + 48, 108),
      el.fontFamily,
    );
    const lh = fs * LINE_HEIGHT;
    const startY = el.y + el.height + 5;
    const cx = el.x + el.width / 2;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const w = ctx.measureText(line).width;
      ctx.fillText(line, cx - w / 2, startY + i * lh);
    }
  }

  /** Draw a placeholder until the bitmap cache triggers a repaint. */
  protected drawImageEl(
    el: Extract<AnyElement, { type: 'image' }>,
    ctx: CanvasRenderingContext2D,
    opts: RenderOpts,
  ): void {
    const img = getImageForAsset(el.assetId, opts.resolveAsset);
    if (img) {
      ctx.drawImage(img, el.x, el.y, el.width, el.height);
      return;
    }
    const path = new Path2D();
    path.roundRect(el.x, el.y, el.width, el.height, Math.min(el.width, el.height) * 0.06);
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.fillStyle = opts.theme === 'dark' ? '#2a2833' : '#e9e7f0';
    ctx.fill(path);
    ctx.restore();
  }

  protected drawStickyText(
    el: StickyElement,
    ctx: CanvasRenderingContext2D,
    opts: RenderOpts,
    fontFamily: string,
  ): void {
    if (opts.editingId === el.id) return;
    const maxWidth = el.width - STICKY_PADDING * 2;
    if (maxWidth <= 8) return;
    ctx.font = `${el.fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = STICKY_TEXT_COLOR;
    const lines = wrapText(el.text, el.fontSize, el.renderStyle, maxWidth, el.fontFamily);
    const lh = el.fontSize * LINE_HEIGHT;
    lines.forEach((line, i) => {
      const y = el.y + STICKY_PADDING + i * lh;
      if (y > el.y + el.height - STICKY_PADDING - el.fontSize * 0.6) return;
      ctx.fillText(line, el.x + STICKY_PADDING, y);
    });
  }
}
