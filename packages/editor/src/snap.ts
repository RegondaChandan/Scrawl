import type { AnyElement, Box, Point } from '@scrawl/schema';
import { getElementBounds, type SnapGuide } from '@scrawl/engine';

export interface SnapResult {
  delta: Point;
  guides: SnapGuide[];
}

export interface PointSnapResult {
  point: Point;
  guides: SnapGuide[];
}

export const DEFAULT_GRID_SIZE = 20;

interface AxisMatch {
  offset: number;
  position: number;
  bounds: Box;
}

const xAnchors = (box: Box): number[] => [box.x, box.x + box.width / 2, box.x + box.width];
const yAnchors = (box: Box): number[] => [box.y, box.y + box.height / 2, box.y + box.height];

function closestMatch(
  sourceAnchors: number[],
  candidates: Array<{ value: number; bounds: Box }>,
  threshold: number,
): AxisMatch | null {
  let best: AxisMatch | null = null;
  for (const source of sourceAnchors) {
    for (const candidate of candidates) {
      const offset = candidate.value - source;
      if (Math.abs(offset) > threshold) continue;
      if (!best || Math.abs(offset) < Math.abs(best.offset)) {
        best = { offset, position: candidate.value, bounds: candidate.bounds };
      }
    }
  }
  return best;
}

function translatedBox(box: Box, delta: Point): Box {
  return { ...box, x: box.x + delta.x, y: box.y + delta.y };
}

export function snapPointToGrid(point: Point, gridSize = DEFAULT_GRID_SIZE): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

export function snapSelectionMoveToGrid(
  source: Box,
  requestedDelta: Point,
  gridSize = DEFAULT_GRID_SIZE,
): Point {
  const snappedOrigin = snapPointToGrid(
    { x: source.x + requestedDelta.x, y: source.y + requestedDelta.y },
    gridSize,
  );
  return { x: snappedOrigin.x - source.x, y: snappedOrigin.y - source.y };
}

function horizontalSpacing(
  moving: Box,
  stationary: Box[],
  threshold: number,
): { offset: number; guides: SnapGuide[] } | null {
  const left = stationary
    .filter((box) => box.x + box.width <= moving.x + threshold)
    .toSorted((a, b) => b.x + b.width - (a.x + a.width))[0];
  const right = stationary
    .filter((box) => box.x >= moving.x + moving.width - threshold)
    .toSorted((a, b) => a.x - b.x)[0];
  if (!left || !right) return null;
  const targetX = (left.x + left.width + right.x - moving.width) / 2;
  const offset = targetX - moving.x;
  if (Math.abs(offset) > threshold) return null;
  const snapped = { ...moving, x: targetX };
  const y = snapped.y + snapped.height / 2;
  return {
    offset,
    guides: [
      { axis: 'y', position: y, start: left.x + left.width, end: snapped.x },
      { axis: 'y', position: y, start: snapped.x + snapped.width, end: right.x },
    ],
  };
}

function verticalSpacing(
  moving: Box,
  stationary: Box[],
  threshold: number,
): { offset: number; guides: SnapGuide[] } | null {
  const top = stationary
    .filter((box) => box.y + box.height <= moving.y + threshold)
    .toSorted((a, b) => b.y + b.height - (a.y + a.height))[0];
  const bottom = stationary
    .filter((box) => box.y >= moving.y + moving.height - threshold)
    .toSorted((a, b) => a.y - b.y)[0];
  if (!top || !bottom) return null;
  const targetY = (top.y + top.height + bottom.y - moving.height) / 2;
  const offset = targetY - moving.y;
  if (Math.abs(offset) > threshold) return null;
  const snapped = { ...moving, y: targetY };
  const x = snapped.x + snapped.width / 2;
  return {
    offset,
    guides: [
      { axis: 'x', position: x, start: top.y + top.height, end: snapped.y },
      { axis: 'x', position: x, start: snapped.y + snapped.height, end: bottom.y },
    ],
  };
}

export function snapSelectionMove(
  source: Box,
  requestedDelta: Point,
  stationaryElements: AnyElement[],
  threshold: number,
): SnapResult {
  const stationary = stationaryElements.map(getElementBounds);
  const requested = translatedBox(source, requestedDelta);
  const xCandidates = stationary.flatMap((bounds) =>
    xAnchors(bounds).map((value) => ({ value, bounds })),
  );
  const yCandidates = stationary.flatMap((bounds) =>
    yAnchors(bounds).map((value) => ({ value, bounds })),
  );
  const xMatch = closestMatch(xAnchors(requested), xCandidates, threshold);
  const yMatch = closestMatch(yAnchors(requested), yCandidates, threshold);
  const xSpacing = xMatch ? null : horizontalSpacing(requested, stationary, threshold);
  const ySpacing = yMatch ? null : verticalSpacing(requested, stationary, threshold);
  const delta = {
    x: requestedDelta.x + (xMatch?.offset ?? xSpacing?.offset ?? 0),
    y: requestedDelta.y + (yMatch?.offset ?? ySpacing?.offset ?? 0),
  };
  const snapped = translatedBox(source, delta);
  const guides: SnapGuide[] = [];
  if (xMatch) {
    guides.push({
      axis: 'x',
      position: xMatch.position,
      start: Math.min(snapped.y, xMatch.bounds.y),
      end: Math.max(snapped.y + snapped.height, xMatch.bounds.y + xMatch.bounds.height),
    });
  } else if (xSpacing) {
    guides.push(...xSpacing.guides);
  }
  if (yMatch) {
    guides.push({
      axis: 'y',
      position: yMatch.position,
      start: Math.min(snapped.x, yMatch.bounds.x),
      end: Math.max(snapped.x + snapped.width, yMatch.bounds.x + yMatch.bounds.width),
    });
  } else if (ySpacing) {
    guides.push(...ySpacing.guides);
  }
  return { delta, guides };
}

export function snapPointToElements(
  point: Point,
  stationaryElements: AnyElement[],
  threshold: number,
  axes: { x: boolean; y: boolean } = { x: true, y: true },
): PointSnapResult {
  const bounds = stationaryElements.map(getElementBounds);
  const xMatch = axes.x
    ? closestMatch(
        [point.x],
        bounds.flatMap((box) => xAnchors(box).map((value) => ({ value, bounds: box }))),
        threshold,
      )
    : null;
  const yMatch = axes.y
    ? closestMatch(
        [point.y],
        bounds.flatMap((box) => yAnchors(box).map((value) => ({ value, bounds: box }))),
        threshold,
      )
    : null;
  const snapped = {
    x: point.x + (xMatch?.offset ?? 0),
    y: point.y + (yMatch?.offset ?? 0),
  };
  const guides: SnapGuide[] = [];
  if (xMatch) {
    guides.push({
      axis: 'x',
      position: xMatch.position,
      start: Math.min(point.y, xMatch.bounds.y),
      end: Math.max(point.y, xMatch.bounds.y + xMatch.bounds.height),
    });
  }
  if (yMatch) {
    guides.push({
      axis: 'y',
      position: yMatch.position,
      start: Math.min(point.x, yMatch.bounds.x),
      end: Math.max(point.x, yMatch.bounds.x + yMatch.bounds.width),
    });
  }
  return { point: snapped, guides };
}
