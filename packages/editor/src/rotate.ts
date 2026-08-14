import type { AnyElement, Point } from '@scrawl/schema';
import { hasPoints } from '@scrawl/schema';
import { getElementCenter, getSelectionBounds, normalizeAngle, rotatePoint } from '@scrawl/engine';

export const ROTATION_SNAP_INCREMENT = Math.PI / 12;

const cleanCoordinate = (value: number): number => (Math.abs(value) < 1e-10 ? 0 : value);

export function snapRotationAngle(angle: number, increment = ROTATION_SNAP_INCREMENT): number {
  if (increment <= 0) return normalizeAngle(angle);
  return normalizeAngle(Math.round(angle / increment) * increment);
}

export function getSelectionCenter(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
): Point | null {
  const bounds = getSelectionBounds(elements, [...selectedIds]);
  return bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : null;
}

function rotatePointElement(
  element: Extract<AnyElement, { points: Point[] }>,
  pivot: Point,
  delta: number,
): AnyElement {
  const elementCenter = getElementCenter(element);
  const worldPoints = element.points.map((point) => {
    const world = { x: element.x + point.x, y: element.y + point.y };
    const flattened = rotatePoint(world, elementCenter, normalizeAngle(element.angle));
    return rotatePoint(flattened, pivot, delta);
  });
  const origin = worldPoints[0] ?? rotatePoint({ x: element.x, y: element.y }, pivot, delta);
  const points = worldPoints.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : element.width;
  const height = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : element.height;
  return {
    ...element,
    x: origin.x,
    y: origin.y,
    width,
    height,
    angle: 0,
    points,
    version: element.version + 1,
  };
}

export function rotateElements(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
  pivot: Point,
  delta: number,
): AnyElement[] {
  const normalizedDelta = normalizeAngle(delta);
  if (normalizedDelta === 0) return elements;

  return elements.map((element) => {
    if (!selectedIds.has(element.id) || element.locked) return element;
    if (hasPoints(element)) return rotatePointElement(element, pivot, normalizedDelta);

    const center = getElementCenter(element);
    const rotatedCenter = rotatePoint(center, pivot, normalizedDelta);
    return {
      ...element,
      x: cleanCoordinate(element.x + rotatedCenter.x - center.x),
      y: cleanCoordinate(element.y + rotatedCenter.y - center.y),
      angle: normalizeAngle(element.angle + normalizedDelta),
      version: element.version + 1,
    };
  });
}
