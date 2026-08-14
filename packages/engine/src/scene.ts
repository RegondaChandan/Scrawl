import type { AnyElement, Box, LinearElement, Point, Theme } from '@scrawl/schema';
import { isLinear } from '@scrawl/schema';
import { CrispRenderer } from './crisp';
import { RoughRenderer } from './rough';
import type { AssetSourceResolver } from './images';
import type { Renderer } from './renderer';
import { getConnectorHandles } from './binding';
import {
  getElementCenter,
  getElementUnrotatedBounds,
  normalizeAngle,
  rotatePoint,
} from './geometry';
import { growBox, unionBoxes } from './math';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const crispRenderer = new CrispRenderer();
export const roughRenderer = new RoughRenderer();

export function rendererFor(el: AnyElement): Renderer {
  return el.renderStyle === 'rough' ? roughRenderer : crispRenderer;
}

export { CANVAS_COLORS, GRID_COLORS } from '@scrawl/schema';
import { CANVAS_COLORS, GRID_COLORS } from '@scrawl/schema';

export const ACCENT = '#12afa6';
export const GRID_SIZE = 20;
export const RESIZE_HANDLE_SIZE = 9;
export const ROTATION_HANDLE_OFFSET = 28;
export const SELECTION_PADDING = 4;
export const MAX_RASTER_EXPORT_DIMENSION = 8192;
export const MAX_RASTER_EXPORT_PIXELS = 24_000_000;

export function screenToWorld(camera: Camera, sx: number, sy: number): Point {
  return { x: (sx - camera.x) / camera.zoom, y: (sy - camera.y) / camera.zoom };
}

export function worldToScreen(camera: Camera, wx: number, wy: number): Point {
  return { x: wx * camera.zoom + camera.x, y: wy * camera.zoom + camera.y };
}

export function getSceneBounds(elements: AnyElement[]): Box | null {
  return unionBoxes(elements.map((el) => rendererFor(el).getBounds(el)));
}

export function safeRasterScale(width: number, height: number, requestedScale: number): number {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(
    requestedScale,
    MAX_RASTER_EXPORT_DIMENSION / safeWidth,
    MAX_RASTER_EXPORT_DIMENSION / safeHeight,
    Math.sqrt(MAX_RASTER_EXPORT_PIXELS / (safeWidth * safeHeight)),
  );
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('The scene is too large to export safely.');
  }
  return scale;
}

export function getSelectionBounds(elements: AnyElement[], selectedIds: string[]): Box | null {
  const sel = elements.filter((el) => selectedIds.includes(el.id));
  return unionBoxes(sel.map((el) => rendererFor(el).getBounds(el)));
}

export function getSelectionFrame(
  elements: AnyElement[],
  selectedIds: string[],
  zoom: number,
): Box | null {
  const bounds = getSelectionBounds(elements, selectedIds);
  return bounds ? growBox(bounds, SELECTION_PADDING / zoom) : null;
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

export type TransformHandleId = HandleId | 'rotate';

export interface TransformHandle {
  id: TransformHandleId;
  x: number;
  y: number;
}

export interface SelectionOutline {
  box: Box;
  center: Point;
  angle: number;
}

export function getHandles(box: Box): Handle[] {
  const { x, y, width: w, height: h } = box;
  return [
    { id: 'nw', x, y },
    { id: 'n', x: x + w / 2, y },
    { id: 'ne', x: x + w, y },
    { id: 'e', x: x + w, y: y + h / 2 },
    { id: 'se', x: x + w, y: y + h },
    { id: 's', x: x + w / 2, y: y + h },
    { id: 'sw', x, y: y + h },
    { id: 'w', x, y: y + h / 2 },
  ];
}

export function getSelectionOutline(
  elements: AnyElement[],
  selectedIds: string[],
  zoom: number,
): SelectionOutline | null {
  const selected = elements.filter((element) => selectedIds.includes(element.id));
  if (selected.length === 0) return null;
  if (selected.length === 1) {
    const element = selected[0]!;
    return {
      box: growBox(getElementUnrotatedBounds(element), SELECTION_PADDING / zoom),
      center: getElementCenter(element),
      angle: normalizeAngle(element.angle),
    };
  }
  const box = getSelectionFrame(elements, selectedIds, zoom);
  return box
    ? {
        box,
        center: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        angle: 0,
      }
    : null;
}

export function getSelectionHandles(
  elements: AnyElement[],
  selectedIds: string[],
  zoom: number,
): TransformHandle[] {
  const outline = getSelectionOutline(elements, selectedIds, zoom);
  if (!outline) return [];
  const resizeHandles = getHandles(outline.box).map((handle) => ({
    ...handle,
    ...rotatePoint(handle, outline.center, outline.angle),
  }));
  const rotationHandle = rotatePoint(
    {
      x: outline.box.x + outline.box.width / 2,
      y: outline.box.y - ROTATION_HANDLE_OFFSET / zoom,
    },
    outline.center,
    outline.angle,
  );
  return [...resizeHandles, { id: 'rotate', ...rotationHandle }];
}

export interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
}

export interface SceneOpts {
  canvas: HTMLCanvasElement;
  elements: AnyElement[];
  camera: Camera;
  theme: Theme;
  selectedIds: string[];
  editingId?: string | null;
  marquee?: Box | null;
  guides?: SnapGuide[];
  gridOn?: boolean;
  backgroundOn?: boolean;
  dpr?: number;
  resolveAsset?: AssetSourceResolver;
}

export function renderScene(opts: SceneOpts): void {
  const {
    canvas,
    elements,
    camera,
    theme,
    selectedIds,
    editingId = null,
    marquee = null,
    guides = [],
    gridOn = false,
    backgroundOn = true,
    dpr = 1,
    resolveAsset,
  } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (backgroundOn) {
    ctx.fillStyle = CANVAS_COLORS[theme];
    ctx.fillRect(0, 0, cssW, cssH);
  }

  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.zoom, camera.zoom);

  if (gridOn) drawGrid(ctx, camera, cssW, cssH, theme);

  const renderOpts = {
    theme,
    editingId,
    ...(resolveAsset === undefined ? {} : { resolveAsset }),
  };
  for (const el of elements) {
    rendererFor(el).render(el, ctx, renderOpts);
  }

  drawSnapGuides(ctx, guides, camera.zoom);

  drawSelection(ctx, elements, selectedIds, camera, theme, editingId);

  if (marquee) {
    ctx.fillStyle = 'rgba(79, 93, 255, 0.08)';
    ctx.fillRect(marquee.x, marquee.y, marquee.width, marquee.height);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1 / camera.zoom;
    ctx.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height);
  }
}

function drawSnapGuides(ctx: CanvasRenderingContext2D, guides: SnapGuide[], zoom: number): void {
  if (guides.length === 0) return;
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.fillStyle = ACCENT;
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([4 / zoom, 3 / zoom]);
  for (const guide of guides) {
    ctx.beginPath();
    if (guide.axis === 'x') {
      ctx.moveTo(guide.position, guide.start);
      ctx.lineTo(guide.position, guide.end);
    } else {
      ctx.moveTo(guide.start, guide.position);
      ctx.lineTo(guide.end, guide.position);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  cssW: number,
  cssH: number,
  theme: Theme,
): void {
  let g = GRID_SIZE;
  while (g * camera.zoom < 14) g *= 2;
  if (g * camera.zoom < 8) return;
  const left = -camera.x / camera.zoom;
  const top = -camera.y / camera.zoom;
  const right = left + cssW / camera.zoom;
  const bottom = top + cssH / camera.zoom;
  const r = 1.1 / camera.zoom;
  ctx.fillStyle = GRID_COLORS[theme];
  for (let x = Math.floor(left / g) * g; x <= right; x += g) {
    for (let y = Math.floor(top / g) * g; y <= bottom; y += g) {
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  elements: AnyElement[],
  selectedIds: string[],
  camera: Camera,
  theme: Theme,
  editingId: string | null = null,
): void {
  if (!selectedIds.length) return;
  // Hide selection chrome on the element currently being edited as text.
  const selected = elements.filter((el) => selectedIds.includes(el.id) && el.id !== editingId);
  if (!selected.length) return;
  const z = camera.zoom;

  if (selected.length > 1) {
    ctx.strokeStyle = 'rgba(79, 93, 255, 0.45)';
    ctx.lineWidth = 1 / z;
    for (const el of selected) {
      const box = getElementUnrotatedBounds(el);
      const center = getElementCenter(el);
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(normalizeAngle(el.angle));
      ctx.translate(-center.x, -center.y);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.restore();
    }
  }

  const outline = getSelectionOutline(
    selected,
    selected.map((element) => element.id),
    z,
  );
  if (!outline) return;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.4 / z;
  ctx.save();
  ctx.translate(outline.center.x, outline.center.y);
  ctx.rotate(outline.angle);
  ctx.translate(-outline.center.x, -outline.center.y);
  ctx.strokeRect(outline.box.x, outline.box.y, outline.box.width, outline.box.height);
  ctx.restore();

  const size = RESIZE_HANDLE_SIZE / z;
  ctx.fillStyle = theme === 'dark' ? '#201f26' : '#ffffff';
  const transformHandles = selected.some((element) => !element.locked)
    ? getSelectionHandles(
        selected,
        selected.map((element) => element.id),
        z,
      )
    : [];
  const rotation = transformHandles.find((handle) => handle.id === 'rotate');
  const top = rotatePoint(
    { x: outline.box.x + outline.box.width / 2, y: outline.box.y },
    outline.center,
    outline.angle,
  );
  if (rotation) {
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(rotation.x, rotation.y);
    ctx.stroke();
  }
  for (const h of transformHandles) {
    if (h.id === 'rotate') {
      ctx.beginPath();
      ctx.arc(h.x, h.y, size * 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      continue;
    }
    const path = new Path2D();
    path.roundRect(h.x - size / 2, h.y - size / 2, size, size, 2 / z);
    ctx.fill(path);
    ctx.stroke(path);
  }

  if (selected.length === 1) {
    const onlyElement = selected[0]!;
    if (isLinear(onlyElement)) drawConnectorHandles(ctx, onlyElement, z, theme);
  }
}

/**
 * Waypoint-editing UI for a selected connector: solid accent dots on the
 * route's vertices, hollow dots on segment midpoints (grab one to add a
 * waypoint there). Short segments skip their midpoint to avoid clutter.
 */
function drawConnectorHandles(
  ctx: CanvasRenderingContext2D,
  el: LinearElement,
  z: number,
  theme: Theme,
): void {
  const { vertices, midpoints } = getConnectorHandles(el, 20 / z);
  const r = 5 / z;
  const panel = theme === 'dark' ? '#201f26' : '#ffffff';
  ctx.lineWidth = 1.4 / z;
  ctx.fillStyle = panel;
  ctx.strokeStyle = ACCENT;
  for (const m of midpoints) {
    ctx.beginPath();
    ctx.arc(m.point.x, m.point.y, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = ACCENT;
  ctx.strokeStyle = panel;
  for (const v of vertices) {
    ctx.beginPath();
    ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** Renders the whole scene (or nothing) into an offscreen canvas for PNG export. */
export function exportToCanvas(
  elements: AnyElement[],
  opts: {
    scale?: number;
    padding?: number;
    theme?: Theme;
    background?: boolean;
    grid?: boolean;
    resolveAsset?: AssetSourceResolver;
  },
): HTMLCanvasElement {
  const {
    scale = 2,
    padding = 24,
    theme = 'light',
    background = true,
    grid = false,
    resolveAsset,
  } = opts;
  const canvas = document.createElement('canvas');
  const bounds = getSceneBounds(elements);
  if (!bounds) {
    canvas.width = 64;
    canvas.height = 64;
    return canvas;
  }
  const exportWidth = bounds.width + padding * 2;
  const exportHeight = bounds.height + padding * 2;
  const effectiveScale = safeRasterScale(exportWidth, exportHeight, scale);
  canvas.width = Math.max(1, Math.floor(exportWidth * effectiveScale));
  canvas.height = Math.max(1, Math.floor(exportHeight * effectiveScale));
  renderScene({
    canvas,
    elements,
    camera: {
      x: (padding - bounds.x) * effectiveScale,
      y: (padding - bounds.y) * effectiveScale,
      zoom: effectiveScale,
    },
    theme,
    selectedIds: [],
    gridOn: grid,
    backgroundOn: background,
    dpr: 1,
    ...(resolveAsset === undefined ? {} : { resolveAsset }),
  });
  return canvas;
}
