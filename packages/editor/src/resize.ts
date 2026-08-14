import type { AnyElement, Box, Point } from '@scrawl/schema';
import { getElementCenter, normalizeAngle, rotatePoint } from '@scrawl/engine';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ResizeBoxOptions {
  keepAspectRatio?: boolean;
  minimumSize?: number;
}

const includesWest = (handle: ResizeHandle): boolean => handle.includes('w');
const includesEast = (handle: ResizeHandle): boolean => handle.includes('e');
const includesNorth = (handle: ResizeHandle): boolean => handle.includes('n');
const includesSouth = (handle: ResizeHandle): boolean => handle.includes('s');

export function resizeBoxFromHandle(
  source: Box,
  handle: ResizeHandle,
  pointer: Point,
  options: ResizeBoxOptions = {},
): Box {
  const minimumSize = Math.max(1, options.minimumSize ?? 12);
  const sourceRight = source.x + source.width;
  const sourceBottom = source.y + source.height;
  let left = source.x;
  let right = sourceRight;
  let top = source.y;
  let bottom = sourceBottom;

  if (includesWest(handle)) left = Math.min(pointer.x, sourceRight - minimumSize);
  if (includesEast(handle)) right = Math.max(pointer.x, source.x + minimumSize);
  if (includesNorth(handle)) top = Math.min(pointer.y, sourceBottom - minimumSize);
  if (includesSouth(handle)) bottom = Math.max(pointer.y, source.y + minimumSize);

  const isCorner = handle.length === 2;
  if (options.keepAspectRatio && isCorner && source.width > 0 && source.height > 0) {
    const widthScale = (right - left) / source.width;
    const heightScale = (bottom - top) / source.height;
    const scale = Math.max(
      widthScale,
      heightScale,
      minimumSize / source.width,
      minimumSize / source.height,
    );
    const width = source.width * scale;
    const height = source.height * scale;
    if (includesWest(handle)) left = sourceRight - width;
    else right = source.x + width;
    if (includesNorth(handle)) top = sourceBottom - height;
    else bottom = source.y + height;
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function resizeElements(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
  source: Box,
  target: Box,
): AnyElement[] {
  if (source.width <= 0 || source.height <= 0) return elements;
  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;

  return elements.map((element) => {
    if (!selectedIds.has(element.id) || element.locked) return element;
    const x = target.x + (element.x - source.x) * scaleX;
    const y = target.y + (element.y - source.y) * scaleY;
    const common = {
      ...element,
      x,
      y,
      width: Math.max(1, element.width * scaleX),
      height: Math.max(1, element.height * scaleY),
      version: element.version + 1,
    };

    if (element.type === 'line' || element.type === 'arrow' || element.type === 'freedraw') {
      return {
        ...common,
        points: element.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
      };
    }
    if (element.type === 'text') {
      return { ...common, fontSize: Math.max(8, element.fontSize * Math.min(scaleX, scaleY)) };
    }
    if (element.type === 'sticky') {
      return { ...common, fontSize: Math.max(10, element.fontSize * Math.min(scaleX, scaleY)) };
    }
    return common;
  });
}

export function resizeElementsInFrame(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
  source: Box,
  target: Box,
  frameCenter: Point,
  frameAngle: number,
): AnyElement[] {
  const resized = resizeElements(elements, selectedIds, source, target);
  const angle = normalizeAngle(frameAngle);
  if (angle === 0) return resized;

  return resized.map((element, index) => {
    if (!selectedIds.has(element.id) || element.locked) return element;
    const sourceElement = elements[index];
    if (element === sourceElement) return element;
    const localCenter = getElementCenter(element);
    const worldCenter = rotatePoint(localCenter, frameCenter, angle);
    return {
      ...element,
      x: element.x + worldCenter.x - localCenter.x,
      y: element.y + worldCenter.y - localCenter.y,
    };
  });
}
