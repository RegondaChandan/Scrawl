import type { AnyElement, Theme } from '@scrawl/schema';
import {
  CANVAS_COLORS,
  GRID_COLORS,
  LABEL_FONT_SIZE,
  LINE_HEIGHT,
  resolveFont,
  themedColor,
} from '@scrawl/schema';
import {
  freedrawSvgPath,
  getArrowheadPoints,
  getElementCenter,
  normalizeAngle,
  polylineMidpoint,
  wrapText,
} from './geometry';
import { getRoughDrawables, roughDrawableToPaths } from './rough';
import { getSceneBounds } from './scene';
import { STICKY_PADDING, STICKY_TEXT_COLOR } from './renderer';
import { isShapeFillable, shapePath } from './shapes';
import { iconInner } from './icons';
import type { AssetSourceResolver } from './images';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function safeSvgColor(value: string, fallback: string): string {
  const color = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(color) || color === 'none') return color;
  if (/^rgba?\(\s*[-+.\d%]+(?:\s*,\s*[-+.\d%]+){2,3}\s*\)$/i.test(color)) return color;
  return fallback;
}

function dashAttr(el: AnyElement): string {
  if (el.strokeStyle === 'dashed') {
    return ` stroke-dasharray="${el.strokeWidth * 4} ${el.strokeWidth * 3}"`;
  }
  if (el.strokeStyle === 'dotted') {
    return ` stroke-dasharray="1 ${el.strokeWidth * 3}" stroke-linecap="round"`;
  }
  return '';
}

export function exportSVG(
  elements: AnyElement[],
  opts: {
    theme?: Theme;
    background?: boolean;
    grid?: boolean;
    resolveAsset?: AssetSourceResolver;
  } = {},
): string {
  const { theme = 'light', background = true, grid = false, resolveAsset } = opts;
  const bounds = getSceneBounds(elements);
  const pad = 24;
  const b = bounds ?? { x: 0, y: 0, width: 100, height: 100 };
  const w = Math.ceil(b.width + pad * 2);
  const h = Math.ceil(b.height + pad * 2);
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${(b.x - pad).toFixed(2)} ${(b.y - pad).toFixed(2)} ${w} ${h}">`,
  );
  if (background) {
    parts.push(
      `<rect x="${(b.x - pad).toFixed(2)}" y="${(b.y - pad).toFixed(2)}" width="${w}" height="${h}" fill="${CANVAS_COLORS[theme]}"/>`,
    );
  }
  if (grid) {
    parts.push(
      `<defs><pattern id="scrawl-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${GRID_COLORS[theme]}"/></pattern></defs>`,
      `<rect x="${(b.x - pad).toFixed(2)}" y="${(b.y - pad).toFixed(2)}" width="${w}" height="${h}" fill="url(#scrawl-grid)"/>`,
    );
  }
  for (const el of elements) {
    parts.push(elementToSVG(el, theme, resolveAsset));
  }
  parts.push('</svg>');
  return parts.join('\n');
}

function elementToSVG(
  el: AnyElement,
  theme: Theme,
  resolveAsset: AssetSourceResolver | undefined,
): string {
  const opacity = el.opacity < 1 ? ` opacity="${el.opacity}"` : '';
  const center = getElementCenter(el);
  const angle = (normalizeAngle(el.angle) * 180) / Math.PI;
  const rotation =
    angle === 0
      ? ''
      : ` rotate(${angle.toFixed(4)} ${(center.x - el.x).toFixed(2)} ${(center.y - el.y).toFixed(2)})`;
  const inner =
    el.type === 'freedraw'
      ? freedrawToSVG(el, theme)
      : el.type === 'text'
        ? textToSVG(el, theme)
        : el.type === 'sticky'
          ? stickyToSVG(el, theme)
          : el.type === 'icon'
            ? iconToSVGEl(el, theme)
            : el.type === 'image'
              ? imageToSVG(el, resolveAsset)
              : el.renderStyle === 'rough'
                ? roughToSVG(el, theme)
                : crispToSVG(el, theme);
  return `<g transform="translate(${el.x.toFixed(2)} ${el.y.toFixed(2)})${rotation}"${opacity}>${inner}${labelToSVG(el, theme)}</g>`;
}

function labelToSVG(el: AnyElement, theme: Theme): string {
  if (
    !el.label ||
    el.type === 'text' ||
    el.type === 'sticky' ||
    el.type === 'freedraw' ||
    el.type === 'icon'
  ) {
    return '';
  }
  const family = resolveFont(el.fontFamily, el.renderStyle);
  const fs = LABEL_FONT_SIZE;
  const lh = fs * LINE_HEIGHT;
  const color = safeSvgColor(themedColor(el.strokeColor, theme), '#2b2a26');
  if (el.type === 'line' || el.type === 'arrow') {
    const mid = polylineMidpoint(el.points);
    const lines = el.label.split('\n');
    const chipW = Math.max(...lines.map((l) => l.length)) * fs * 0.62 + 10;
    const chipH = lines.length * lh + 6;
    const chip = `<rect x="${(mid.x - chipW / 2).toFixed(2)}" y="${(mid.y - chipH / 2).toFixed(2)}" width="${chipW.toFixed(2)}" height="${chipH.toFixed(2)}" fill="${CANVAS_COLORS[theme]}"/>`;
    const spans = lines
      .map(
        (line, i) =>
          `<text x="${mid.x.toFixed(2)}" y="${(mid.y - chipH / 2 + i * lh + fs * 0.9).toFixed(2)}" text-anchor="middle" font-family="${esc(family)}" font-size="${fs}" fill="${color}">${esc(line)}</text>`,
      )
      .join('');
    return chip + spans;
  }
  const lines = wrapText(el.label, fs, el.renderStyle, Math.max(el.width - 14, 24), el.fontFamily);
  const startY = (el.height - lines.length * lh) / 2;
  return lines
    .map(
      (line, i) =>
        `<text x="${(el.width / 2).toFixed(2)}" y="${(startY + i * lh + fs * 0.9).toFixed(2)}" text-anchor="middle" font-family="${esc(family)}" font-size="${fs}" fill="${color}">${esc(line)}</text>`,
    )
    .join('');
}

function roughToSVG(el: AnyElement, theme: Theme): string {
  const out: string[] = [];
  for (const d of getRoughDrawables(el, theme)) {
    for (const p of roughDrawableToPaths(d)) {
      const stroke = safeSvgColor(p.stroke || 'none', 'none');
      const fill = safeSvgColor(p.fill || 'none', 'none');
      const dash = stroke !== 'none' && fill === 'none' ? dashAttr(el) : '';
      out.push(
        `<path d="${p.d}" stroke="${stroke}" stroke-width="${p.strokeWidth}" fill="${fill}"${dash}/>`,
      );
    }
  }
  return out.join('');
}

function crispToSVG(el: AnyElement, theme: Theme): string {
  const stroke = safeSvgColor(themedColor(el.strokeColor, theme), '#2b2a26');
  const fill =
    el.backgroundColor !== 'transparent'
      ? safeSvgColor(themedColor(el.backgroundColor, theme), 'none')
      : 'none';
  const common = `stroke="${stroke}" stroke-width="${el.strokeWidth}" fill="${fill}" stroke-linejoin="round" stroke-linecap="round"${dashAttr(el)}`;
  switch (el.type) {
    case 'shape': {
      const f = isShapeFillable(el.shapeKind) ? fill : 'none';
      return `<path d="${shapePath(el.shapeKind, el.width, el.height)}" ${common.replace(`fill="${fill}"`, `fill="${f}"`)}/>`;
    }
    case 'rectangle':
      return `<rect x="0" y="0" width="${el.width}" height="${el.height}" rx="${el.cornerRadius}" ${common}/>`;
    case 'ellipse':
      return `<ellipse cx="${el.width / 2}" cy="${el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" ${common}/>`;
    case 'diamond':
      return `<polygon points="${el.width / 2},0 ${el.width},${el.height / 2} ${el.width / 2},${el.height} 0,${el.height / 2}" ${common}/>`;
    case 'line':
    case 'arrow': {
      const pts = el.points.map((p) => `${p.x},${p.y}`).join(' ');
      let head = '';
      if (el.type === 'arrow') {
        const hp = getArrowheadPoints(el.points, el.strokeWidth);
        if (hp) {
          const [a, bb, tip] = hp;
          head = `<polyline points="${a.x},${a.y} ${tip.x},${tip.y} ${bb.x},${bb.y}" stroke="${stroke}" stroke-width="${el.strokeWidth}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
        }
      }
      return `<polyline points="${pts}" ${common.replace(`fill="${fill}"`, 'fill="none"')}/>${head}`;
    }
    default:
      return '';
  }
}

function iconToSVGEl(el: Extract<AnyElement, { type: 'icon' }>, theme: Theme): string {
  const icon = iconInner(el.iconId);
  const glyph = icon
    ? `<svg x="0" y="0" width="${el.width}" height="${el.height}" viewBox="${icon.viewBox}">${icon.body}</svg>`
    : `<rect x="0" y="0" width="${el.width}" height="${el.height}" rx="${(Math.min(el.width, el.height) * 0.18).toFixed(1)}" fill="#e9e7f0"/>`;
  if (!el.label) return glyph;
  const family = resolveFont(el.fontFamily, el.renderStyle);
  const fs = LABEL_FONT_SIZE - 2;
  const lh = fs * LINE_HEIGHT;
  const color = safeSvgColor(themedColor(el.strokeColor, theme), '#2b2a26');
  const lines = wrapText(el.label, fs, el.renderStyle, Math.max(el.width + 48, 108), el.fontFamily);
  const caption = lines
    .map(
      (line, i) =>
        `<text x="${(el.width / 2).toFixed(2)}" y="${(el.height + 5 + i * lh + fs * 0.85).toFixed(2)}" text-anchor="middle" font-family="${esc(family)}" font-size="${fs}" fill="${color}">${esc(line)}</text>`,
    )
    .join('');
  return glyph + caption;
}

/** The element box is the truth — the bitmap stretches to fill it. */
function imageToSVG(
  el: Extract<AnyElement, { type: 'image' }>,
  resolveAsset: AssetSourceResolver | undefined,
): string {
  const source = resolveAsset?.(el.assetId);
  if (!source) return '';
  return `<image href="${esc(source)}" x="0" y="0" width="${el.width.toFixed(2)}" height="${el.height.toFixed(2)}" preserveAspectRatio="none"/>`;
}

function freedrawToSVG(el: Extract<AnyElement, { type: 'freedraw' }>, theme: Theme): string {
  const d = freedrawSvgPath(el);
  if (!d) return '';
  return `<path d="${d}" fill="${safeSvgColor(themedColor(el.strokeColor, theme), '#2b2a26')}"/>`;
}

function textToSVG(el: Extract<AnyElement, { type: 'text' }>, theme: Theme): string {
  const family = resolveFont(el.fontFamily, el.renderStyle);
  const lh = el.fontSize * LINE_HEIGHT;
  const lines = el.text.split('\n');
  const x = el.textAlign === 'left' ? 0 : el.textAlign === 'center' ? el.width / 2 : el.width;
  const anchor = el.textAlign === 'left' ? 'start' : el.textAlign === 'center' ? 'middle' : 'end';
  const spans = lines
    .map(
      (line, i) =>
        `<text x="${x.toFixed(2)}" y="${(i * lh + el.fontSize * 0.85).toFixed(2)}" text-anchor="${anchor}" font-family="${esc(family)}" font-size="${el.fontSize}" fill="${safeSvgColor(themedColor(el.strokeColor, theme), '#2b2a26')}">${esc(line)}</text>`,
    )
    .join('');
  return spans;
}

function stickyToSVG(el: Extract<AnyElement, { type: 'sticky' }>, _theme: Theme): string {
  const family = resolveFont(el.fontFamily, el.renderStyle);
  const lh = el.fontSize * LINE_HEIGHT;
  const lines = wrapText(
    el.text,
    el.fontSize,
    el.renderStyle,
    el.width - STICKY_PADDING * 2,
    el.fontFamily,
  );
  const spans = lines
    .map((line, i) => {
      const y = STICKY_PADDING + i * lh + el.fontSize * 0.85;
      if (y > el.height - STICKY_PADDING) return '';
      return `<text x="${STICKY_PADDING}" y="${y.toFixed(2)}" font-family="${esc(family)}" font-size="${el.fontSize}" fill="${STICKY_TEXT_COLOR}">${esc(line)}</text>`;
    })
    .join('');
  return `<rect x="0" y="0" width="${el.width}" height="${el.height}" rx="4" fill="${safeSvgColor(el.backgroundColor, '#fbe6a2')}" stroke="rgba(0,0,0,0.08)"/>${spans}`;
}
