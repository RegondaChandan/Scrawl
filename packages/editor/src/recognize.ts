import { createElement, type AnyElement, type FreedrawElement, type Point } from '@scrawl/schema';

/**
 * Conservatively converts one freehand stroke into a basic vector shape.
 * Returning null is preferable to surprising the user with a bad guess.
 */
export function recognizeFreedraw(element: FreedrawElement): AnyElement | null {
  const points = element.points;
  if (points.length < 6) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const diagonal = Math.hypot(width, height);
  if (diagonal < 12) return null;

  const simplified = simplify(points, diagonal * 0.045);
  const first = points[0]!;
  const last = points.at(-1)!;
  const closed = Math.hypot(last.x - first.x, last.y - first.y) < diagonal * 0.22;
  const shared = {
    id: element.id,
    layerId: element.layerId,
    angle: element.angle,
    strokeColor: element.strokeColor,
    backgroundColor: element.backgroundColor,
    fillStyle: element.fillStyle,
    strokeWidth: element.strokeWidth,
    strokeStyle: element.strokeStyle,
    roughness: element.roughness,
    opacity: element.opacity,
    renderStyle: element.renderStyle,
    seed: element.seed,
    version: element.version + 1,
    order: element.order,
    ...(element.groupIds ? { groupIds: element.groupIds } : {}),
    ...(element.locked === undefined ? {} : { locked: element.locked }),
  };

  if (!closed) {
    if (simplified.length > 3) return null;
    return createElement('line', {
      ...shared,
      x: element.x + first.x,
      y: element.y + first.y,
      width: Math.abs(last.x - first.x),
      height: Math.abs(last.y - first.y),
      points: [
        { x: 0, y: 0 },
        { x: last.x - first.x, y: last.y - first.y },
      ],
    });
  }

  const box = {
    ...shared,
    x: element.x + minX,
    y: element.y + minY,
    width,
    height,
  };
  const corners = simplified.length - 1;
  if (corners >= 3 && corners <= 4) {
    if (corners === 3) return createElement('shape', { ...box, shapeKind: 'triangle' });
    const candidates = simplified.slice(0, 4);
    let cornerScore = 0;
    let midpointScore = 0;
    for (const point of candidates) {
      const nx = (point.x - minX) / Math.max(width, 1);
      const ny = (point.y - minY) / Math.max(height, 1);
      const nearEdgeX = Math.min(nx, 1 - nx) < 0.25;
      const nearEdgeY = Math.min(ny, 1 - ny) < 0.25;
      const nearMidX = Math.abs(nx - 0.5) < 0.25;
      const nearMidY = Math.abs(ny - 0.5) < 0.25;
      if (nearEdgeX && nearEdgeY) cornerScore += 1;
      if ((nearMidX && nearEdgeY) || (nearEdgeX && nearMidY)) midpointScore += 1;
    }
    return midpointScore > cornerScore
      ? createElement('diamond', box)
      : createElement('rectangle', box);
  }
  return corners >= 6 ? createElement('ellipse', box) : createElement('rectangle', box);
}

function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const first = points[0]!;
  const last = points.at(-1)!;
  let furthestDistance = 0;
  let furthestIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index]!, first, last);
    if (distance > furthestDistance) {
      furthestDistance = distance;
      furthestIndex = index;
    }
  }
  if (furthestDistance <= epsilon) return [first, last];
  const left = simplify(points.slice(0, furthestIndex + 1), epsilon);
  const right = simplify(points.slice(furthestIndex), epsilon);
  return [...left.slice(0, -1), ...right];
}

function perpendicularDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / length;
}
