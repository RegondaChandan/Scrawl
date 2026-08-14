import type { LinearElement, Point } from '@scrawl/schema';

function worldPoints(element: LinearElement): Point[] {
  return element.points.map((point) => ({ x: element.x + point.x, y: element.y + point.y }));
}

function withWorldPoints(element: LinearElement, points: Point[]): LinearElement {
  if (points.length < 2) return element;
  const first = points[0]!;
  const last = points.at(-1)!;
  return {
    ...element,
    x: first.x,
    y: first.y,
    width: Math.abs(last.x - first.x),
    height: Math.abs(last.y - first.y),
    points: points.map((point) => ({ x: point.x - first.x, y: point.y - first.y })),
    fixedPoints: points.length > 2,
    version: element.version + 1,
  };
}

export function insertConnectorWaypoint(
  element: LinearElement,
  segmentIndex: number,
  point: Point,
): LinearElement {
  const points = worldPoints(element);
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) return element;
  points.splice(segmentIndex + 1, 0, point);
  return withWorldPoints(element, points);
}

export function moveConnectorVertex(
  element: LinearElement,
  vertexIndex: number,
  point: Point,
): LinearElement {
  const points = worldPoints(element);
  if (vertexIndex < 0 || vertexIndex >= points.length) return element;
  points[vertexIndex] = point;

  if (element.routing === 'elbow') {
    const previous = points[vertexIndex - 1];
    const previousSource = element.points[vertexIndex - 1];
    const currentSource = element.points[vertexIndex];
    if (previous && previousSource && currentSource) {
      if (
        Math.abs(currentSource.x - previousSource.x) >= Math.abs(currentSource.y - previousSource.y)
      ) {
        previous.y = point.y;
      } else {
        previous.x = point.x;
      }
    }
    const next = points[vertexIndex + 1];
    const nextSource = element.points[vertexIndex + 1];
    if (next && nextSource && currentSource) {
      if (Math.abs(nextSource.x - currentSource.x) >= Math.abs(nextSource.y - currentSource.y)) {
        next.y = point.y;
      } else {
        next.x = point.x;
      }
    }
  }

  return withWorldPoints(element, points);
}

export function moveConnectorSegment(
  element: LinearElement,
  segmentIndex: number,
  point: Point,
): LinearElement {
  const points = worldPoints(element);
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  if (!start || !end) return element;
  if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
    start.y = point.y;
    end.y = point.y;
  } else {
    start.x = point.x;
    end.x = point.x;
  }
  return withWorldPoints(element, points);
}
