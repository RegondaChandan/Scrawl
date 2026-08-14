import { getStroke } from 'perfect-freehand';
import type {
  AnyElement,
  Box,
  FreedrawElement,
  Point,
  ShapeElement,
  StyleMode,
} from '@scrawl/schema';
import { LINE_HEIGHT, resolveFont, hasPoints, type FontKey } from '@scrawl/schema';
import { boxContainsPoint, distToSegment, pointInPolygon } from './math';
import { isShapeFillable, shapePath } from './shapes';

// Bounds

export function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  const normalized = ((((angle + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
  return Math.abs(normalized) < 1e-10 ? 0 : normalized;
}

export function rotatePoint(point: Point, center: Point, angle: number): Point {
  if (angle === 0) return point;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  };
}

function pointBounds(el: AnyElement): Box | null {
  if (!hasPoints(el) || el.points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of el.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    x: el.x + minX,
    y: el.y + minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function getElementCenter(el: AnyElement): Point {
  const bounds = pointBounds(el) ?? {
    x: Math.min(el.x, el.x + el.width),
    y: Math.min(el.y, el.y + el.height),
    width: Math.abs(el.width),
    height: Math.abs(el.height),
  };
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

export function getElementUnrotatedBounds(el: AnyElement): Box {
  const pad = el.strokeWidth / 2 + (el.renderStyle === 'rough' ? 3 : 0);
  const points = pointBounds(el);
  if (points) {
    const extra =
      el.type === 'arrow'
        ? Math.max(12, el.strokeWidth * 4)
        : el.type === 'freedraw'
          ? el.strokeWidth * 2.5
          : 0;
    const p = pad + extra;
    return {
      x: points.x - p,
      y: points.y - p,
      width: points.width + p * 2,
      height: points.height + p * 2,
    };
  }
  const x = Math.min(el.x, el.x + el.width);
  const y = Math.min(el.y, el.y + el.height);
  return {
    x: x - pad,
    y: y - pad,
    width: Math.abs(el.width) + pad * 2,
    height: Math.abs(el.height) + pad * 2,
  };
}

export function getElementBounds(el: AnyElement): Box {
  const bounds = getElementUnrotatedBounds(el);
  const angle = normalizeAngle(el.angle);
  if (angle === 0) return bounds;
  const center = getElementCenter(el);
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => rotatePoint(point, center, angle));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function applyElementRotation(ctx: CanvasRenderingContext2D, el: AnyElement): void {
  const angle = normalizeAngle(el.angle);
  if (angle === 0) return;
  const center = getElementCenter(el);
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);
  ctx.translate(-center.x, -center.y);
}

// Hit testing

export function hitTestElement(el: AnyElement, p: Point, tolerance: number): boolean {
  const point = rotatePoint(p, getElementCenter(el), -normalizeAngle(el.angle));
  const sw = el.strokeWidth / 2 + tolerance + (el.renderStyle === 'rough' ? 2 : 0);
  switch (el.type) {
    case 'rectangle':
    case 'sticky': {
      const b: Box = { x: el.x, y: el.y, width: el.width, height: el.height };
      if (!boxContainsPoint(b, point, sw)) return false;
      const filled = el.type === 'sticky' || el.backgroundColor !== 'transparent';
      if (filled) return true;
      return !boxContainsPoint(b, point, -sw);
    }
    case 'text':
      return boxContainsPoint(
        { x: el.x, y: el.y, width: el.width, height: el.height },
        point,
        tolerance,
      );
    case 'icon':
    case 'image':
      return boxContainsPoint({ x: el.x, y: el.y, width: el.width, height: el.height }, point, sw);
    case 'shape': {
      const ctx = measureCtx();
      const path = getShapePath2D(el);
      const lx = point.x - el.x;
      const ly = point.y - el.y;
      const filled = isShapeFillable(el.shapeKind) && el.backgroundColor !== 'transparent';
      if (filled && ctx.isPointInPath(path, lx, ly)) return true;
      ctx.lineWidth = Math.max(el.strokeWidth, 1) + sw * 2;
      return ctx.isPointInStroke(path, lx, ly);
    }
    case 'ellipse': {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const rx = Math.max(el.width / 2, 0.5);
      const ry = Math.max(el.height / 2, 0.5);
      const fOuter = ((point.x - cx) / (rx + sw)) ** 2 + ((point.y - cy) / (ry + sw)) ** 2 <= 1;
      if (!fOuter) return false;
      if (el.backgroundColor !== 'transparent') return true;
      const irx = Math.max(rx - sw, 0.1);
      const iry = Math.max(ry - sw, 0.1);
      const fInner = ((point.x - cx) / irx) ** 2 + ((point.y - cy) / iry) ** 2 <= 1;
      return !fInner;
    }
    case 'diamond': {
      const poly: Point[] = [
        { x: el.x + el.width / 2, y: el.y },
        { x: el.x + el.width, y: el.y + el.height / 2 },
        { x: el.x + el.width / 2, y: el.y + el.height },
        { x: el.x, y: el.y + el.height / 2 },
      ];
      const inside = pointInPolygon(point, poly);
      if (el.backgroundColor !== 'transparent' && inside) return true;
      for (let i = 0; i < 4; i++) {
        if (distToSegment(point, poly[i]!, poly[(i + 1) % 4]!) <= sw) return true;
      }
      return false;
    }
    case 'line':
    case 'arrow':
    case 'freedraw': {
      const tol = sw + (el.type === 'freedraw' ? el.strokeWidth * 1.5 : 0);
      const pts = el.points;
      if (pts.length === 1) {
        const onlyPoint = pts[0]!;
        return Math.hypot(point.x - (el.x + onlyPoint.x), point.y - (el.y + onlyPoint.y)) <= tol;
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const current = pts[i]!;
        const next = pts[i + 1]!;
        const a = { x: el.x + current.x, y: el.y + current.y };
        const b = { x: el.x + next.x, y: el.y + next.y };
        if (distToSegment(point, a, b) <= tol) return true;
      }
      return false;
    }
  }
}

// Freehand ink shared by both renderers

const avg = (a: number, b: number) => (a + b) / 2;

export function freedrawSvgPath(el: FreedrawElement): string {
  const outline = getStroke(
    el.points.map((p) => [p.x, p.y]),
    {
      size: Math.max(3, el.strokeWidth * 4),
      thinning: 0.55,
      smoothing: 0.6,
      streamline: 0.45,
      last: true,
    },
  );
  const len = outline.length;
  if (len < 2) return '';
  const first = outline[0]!;
  let d = `M${first[0]!.toFixed(2)} ${first[1]!.toFixed(2)} Q`;
  for (let i = 0; i < len; i++) {
    const p0 = outline[i]!;
    const p1 = outline[(i + 1) % len]!;
    d += `${p0[0]!.toFixed(2)} ${p0[1]!.toFixed(2)} ${avg(p0[0]!, p1[0]!).toFixed(2)} ${avg(p0[1]!, p1[1]!).toFixed(2)} `;
  }
  return d + 'Z';
}

const pathCache = new Map<string, { key: string; path: Path2D }>();

export function getFreedrawPath(el: FreedrawElement): Path2D {
  const last = el.points[el.points.length - 1] ?? { x: 0, y: 0 };
  const key = `${el.points.length}|${last.x}|${last.y}|${el.strokeWidth}`;
  const cached = pathCache.get(el.id);
  if (cached && cached.key === key) return cached.path;
  const path = new Path2D(freedrawSvgPath(el));
  if (pathCache.size > 4000) pathCache.clear();
  pathCache.set(el.id, { key, path });
  return path;
}

// Text measurement and wrapping

let mctx: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d')!;
  return mctx;
}

// Parametric shape paths cached by size

const shapePathCache = new Map<string, { key: string; path: Path2D }>();

export function getShapePath2D(el: ShapeElement): Path2D {
  const key = `${el.shapeKind}|${el.width}|${el.height}`;
  const cached = shapePathCache.get(el.id);
  if (cached && cached.key === key) return cached.path;
  const path = new Path2D(shapePath(el.shapeKind, el.width, el.height));
  if (shapePathCache.size > 4000) shapePathCache.clear();
  shapePathCache.set(el.id, { key, path });
  return path;
}

export function polylineMidpoint(points: Point[]): Point {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i]!;
    const next = points[i + 1]!;
    total += Math.hypot(next.x - current.x, next.y - current.y);
  }
  let walk = total / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i]!;
    const next = points[i + 1]!;
    const seg = Math.hypot(next.x - current.x, next.y - current.y);
    if (walk <= seg && seg > 0) {
      const t = walk / seg;
      return {
        x: current.x + (next.x - current.x) * t,
        y: current.y + (next.y - current.y) * t,
      };
    }
    walk -= seg;
  }
  return points[Math.floor(points.length / 2)]!;
}

export function measureTextSize(
  text: string,
  fontSize: number,
  mode: StyleMode,
  fontFamily?: FontKey,
): { width: number; height: number } {
  const ctx = measureCtx();
  ctx.font = `${fontSize}px ${resolveFont(fontFamily, mode)}`;
  const lines = text.split('\n');
  let width = fontSize * 0.5;
  for (const line of lines) {
    width = Math.max(width, ctx.measureText(line).width);
  }
  return { width: Math.ceil(width), height: Math.ceil(lines.length * fontSize * LINE_HEIGHT) };
}

export function wrapText(
  text: string,
  fontSize: number,
  mode: StyleMode,
  maxWidth: number,
  fontFamily?: FontKey,
): string[] {
  const ctx = measureCtx();
  ctx.font = `${fontSize}px ${resolveFont(fontFamily, mode)}`;
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const words = raw.split(' ');
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

// Arrowheads

/** Returns [wingA, wingB, tip] in element-local coords, or null for degenerate arrows. */
export function getArrowheadPoints(
  points: Point[],
  strokeWidth: number,
): [Point, Point, Point] | null {
  if (points.length < 2) return null;
  const tip = points[points.length - 1]!;
  let prev: Point | null = null;
  for (let i = points.length - 2; i >= 0; i--) {
    const candidate = points[i]!;
    if (candidate.x !== tip.x || candidate.y !== tip.y) {
      prev = candidate;
      break;
    }
  }
  if (!prev) return null;
  const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const dist = Math.hypot(tip.x - prev.x, tip.y - prev.y);
  const size = Math.min(Math.max(10, strokeWidth * 5), Math.max(6, dist * 0.8));
  const spread = 0.45;
  const a: Point = {
    x: tip.x - size * Math.cos(angle - spread),
    y: tip.y - size * Math.sin(angle - spread),
  };
  const b: Point = {
    x: tip.x - size * Math.cos(angle + spread),
    y: tip.y - size * Math.sin(angle + spread),
  };
  return [a, b, tip];
}
