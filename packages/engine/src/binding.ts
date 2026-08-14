import type { AnyElement, Box, LinearElement, Point } from '@scrawl/schema';
import { isBindable, isLinear } from '@scrawl/schema';
import { getElementBounds, getElementCenter, normalizeAngle, rotatePoint } from './geometry';
import { boxContainsPoint, clamp, growBox } from './math';
import { shapeConnectionAnchors } from './shapes';

/**
 * Smart connectors: arrows/lines whose endpoints are bound to shapes follow
 * the shape when it moves or resizes. Endpoints attach at the intersection of
 * the shape's outline (approximated per type) with the line to the other end.
 */

function center(el: AnyElement): Point {
  return getElementCenter(el);
}

export function edgePoint(el: AnyElement, toward: Point, gap = 6): Point {
  const c = center(el);
  const angle = normalizeAngle(el.angle);
  if (el.type === 'shape') {
    const anchors = shapeConnectionAnchors(el.shapeKind).map((anchor) =>
      rotatePoint({ x: el.x + anchor.x * el.width, y: el.y + anchor.y * el.height }, c, angle),
    );
    const point = anchors.toSorted(
      (left, right) =>
        Math.hypot(left.x - toward.x, left.y - toward.y) -
        Math.hypot(right.x - toward.x, right.y - toward.y),
    )[0]!;
    const dx = point.x - c.x;
    const dy = point.y - c.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    return { x: point.x + (dx / length) * gap, y: point.y + (dy / length) * gap };
  }
  const localToward = rotatePoint(toward, c, -angle);
  const dx = localToward.x - c.x;
  const dy = localToward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = Math.max(el.width / 2, 1);
  const hh = Math.max(el.height / 2, 1);

  let t: number;
  if (el.type === 'ellipse') {
    t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  } else if (el.type === 'diamond') {
    // |dx|/hw + |dy|/hh = 1 on the diamond boundary
    t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  } else {
    // Rectangular shapes clip the ray to their bounds.
    t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
  }
  const len = Math.hypot(dx, dy);
  const gapT = gap / len;
  const tt = Math.min(t + gapT, 1);
  return rotatePoint({ x: c.x + dx * tt, y: c.y + dy * tt }, c, angle);
}

/**
 * Axis-aligned cousin of edgePoint, used when a hand-routed elbow connector
 * re-attaches: it exits on the side of `el` facing `toward`, aligned with
 * `toward` on the cross axis, so the first leg leaves the shape orthogonally.
 */
export function orthoEdgePoint(el: AnyElement, toward: Point, gap = 6): Point {
  if (normalizeAngle(el.angle) !== 0) return edgePoint(el, toward, gap);
  const c = center(el);
  const hw = Math.max(el.width / 2, 1);
  const hh = Math.max(el.height / 2, 1);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  // Clamp the cross-axis coordinate so the attachment stays on the shape.
  if (Math.abs(dx) * hh >= Math.abs(dy) * hw) {
    return {
      x: c.x + (dx >= 0 ? hw + gap : -hw - gap),
      y: clamp(toward.y, el.y + 2, el.y + el.height - 2),
    };
  }
  return {
    x: clamp(toward.x, el.x + 2, el.x + el.width - 2),
    y: c.y + (dy >= 0 ? hh + gap : -hh - gap),
  };
}

const AVOID_PAD = 12;

function segCrossesBox(a: Point, b: Point, box: Box): boolean {
  if (a.y === b.y) {
    return (
      a.y > box.y &&
      a.y < box.y + box.height &&
      Math.max(a.x, b.x) > box.x &&
      Math.min(a.x, b.x) < box.x + box.width
    );
  }
  if (a.x === b.x) {
    return (
      a.x > box.x &&
      a.x < box.x + box.width &&
      Math.max(a.y, b.y) > box.y &&
      Math.min(a.y, b.y) < box.y + box.height
    );
  }
  return false; // candidate routes only produce axis-aligned legs
}

/**
 * True when no leg of `route` cuts through either endpoint shape. The legs
 * touching a shape necessarily start inside its padded box, so those are held
 * to the tighter "don't cut the shape itself" standard instead.
 */
function routeAvoids(route: Point[], startRect: Box | null, endRect: Box | null): boolean {
  const grownStart = startRect ? growBox(startRect, AVOID_PAD) : null;
  const grownEnd = endRect ? growBox(endRect, AVOID_PAD) : null;
  const lastLeg = route.length - 2;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!;
    const b = route[i + 1]!;
    if (startRect && segCrossesBox(a, b, i === 0 ? startRect : grownStart!)) return false;
    if (endRect && segCrossesBox(a, b, i === lastLeg ? endRect : grownEnd!)) return false;
  }
  return true;
}

const routeLength = (route: Point[]): number => {
  let len = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const current = route[i]!;
    const next = route[i + 1]!;
    len += Math.abs(next.x - current.x) + Math.abs(next.y - current.y);
  }
  return len;
};

/**
 * Orthogonal (elbow) route from `start` to `end` that avoids the two shapes it
 * connects (`startRect`/`endRect` are their raw bounds). Deterministic and
 * cheap: try the dominant-axis Z-route, then the other axis, then four outer
 * detours around the padded shapes, shortest first. If nothing is clean, keep
 * the classic Z — never worse than before.
 */
export function elbowRoute(
  start: Point,
  end: Point,
  startRect: Box | null = null,
  endRect: Box | null = null,
): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < 2 || Math.abs(dy) < 2) return [start, end];

  const midX = start.x + dx / 2;
  const midY = start.y + dy / 2;
  const zh: Point[] = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  const zv: Point[] = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
  const preferred = Math.abs(dx) >= Math.abs(dy) ? zh : zv;
  const fallback = preferred === zh ? zv : zh;
  if (!startRect && !endRect) return preferred;
  if (routeAvoids(preferred, startRect, endRect)) return preferred;
  if (routeAvoids(fallback, startRect, endRect)) return fallback;

  const rects = [startRect, endRect]
    .filter((r): r is Box => r !== null)
    .map((r) => growBox(r, AVOID_PAD));
  const minX = Math.min(start.x, end.x, ...rects.map((r) => r.x));
  const maxX = Math.max(start.x, end.x, ...rects.map((r) => r.x + r.width));
  const minY = Math.min(start.y, end.y, ...rects.map((r) => r.y));
  const maxY = Math.max(start.y, end.y, ...rects.map((r) => r.y + r.height));
  const detours: Point[][] = [
    [start, { x: start.x, y: minY }, { x: end.x, y: minY }, end],
    [start, { x: start.x, y: maxY }, { x: end.x, y: maxY }, end],
    [start, { x: minX, y: start.y }, { x: minX, y: end.y }, end],
    [start, { x: maxX, y: start.y }, { x: maxX, y: end.y }, end],
  ].sort((a, b) => routeLength(a) - routeLength(b));
  for (const d of detours) {
    if (routeAvoids(d, startRect, endRect)) return d;
  }
  return preferred;
}

/**
 * Inserts the corners needed to make every leg of a polyline axis-aligned,
 * leaving the existing points untouched. Each corner picks H-then-V or
 * V-then-H so the path keeps moving in its incoming direction instead of
 * doubling back over the previous leg. Already-orthogonal paths come back
 * unchanged, so re-running is safe.
 */
export function orthogonalizePoints(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const out: Point[] = [points[0]!];
  let prev: { axis: 'h' | 'v'; sign: number } | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1]!;
    const b = points[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 0.5 || Math.abs(dy) < 0.5) {
      const axis: 'h' | 'v' = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      const sign: number = Math.sign(axis === 'h' ? dx : dy) || (prev ? prev.sign : 1);
      prev = { axis, sign };
      out.push(b);
      continue;
    }
    let firstAxis: 'h' | 'v';
    if (prev) {
      const continues: boolean =
        prev.axis === 'h' ? Math.sign(dx) === prev.sign : Math.sign(dy) === prev.sign;
      firstAxis = continues ? prev.axis : prev.axis === 'h' ? 'v' : 'h';
    } else {
      firstAxis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    out.push(firstAxis === 'h' ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
    prev =
      firstAxis === 'h' ? { axis: 'v', sign: Math.sign(dy) } : { axis: 'h', sign: Math.sign(dx) };
    out.push(b);
  }
  return out;
}

/**
 * True when the user has hand-edited this connector's path. Straight routing
 * never generates interior points on its own, so any interiors on a straight
 * connector (hand-placed or imported) count as waypoints too.
 */
function hasManualPoints(el: LinearElement): boolean {
  if (el.points.length <= 2) return false;
  return el.fixedPoints === true || (el.routing ?? 'straight') === 'straight';
}

function rect(el: AnyElement): Box {
  return getElementBounds(el);
}

function withRoute(arrow: LinearElement, route: Point[]): LinearElement {
  if (route.length < 2) return arrow;
  const first = route[0]!;
  const last = route[route.length - 1]!;
  return {
    ...arrow,
    x: first.x,
    y: first.y,
    points: route.map((p) => ({ x: p.x - first.x, y: p.y - first.y })),
    width: Math.abs(last.x - first.x),
    height: Math.abs(last.y - first.y),
    version: arrow.version + 1,
  };
}

export function routeConnector(arrow: LinearElement, byId: Map<string, AnyElement>): LinearElement {
  if (arrow.points.length < 2) return arrow;
  const startEl = arrow.startBinding ? byId.get(arrow.startBinding.elementId) : undefined;
  const endEl = arrow.endBinding ? byId.get(arrow.endBinding.elementId) : undefined;
  if (!startEl && !endEl && arrow.routing !== 'elbow') return arrow;

  const world = arrow.points.map((p) => ({ x: arrow.x + p.x, y: arrow.y + p.y }));
  const rawStart = world[0]!;
  const rawEnd = world[world.length - 1]!;

  if (hasManualPoints(arrow)) {
    // Preserve manual waypoints and reattach only the endpoints.
    const interior = world.slice(1, -1);
    const elbow = arrow.routing === 'elbow';
    const start = startEl
      ? elbow
        ? orthoEdgePoint(startEl, interior[0]!)
        : edgePoint(startEl, interior[0]!)
      : rawStart;
    const end = endEl
      ? elbow
        ? orthoEdgePoint(endEl, interior[interior.length - 1]!)
        : edgePoint(endEl, interior[interior.length - 1]!)
      : rawEnd;
    return withRoute(arrow, [start, ...interior, end]);
  }

  const startAnchor = startEl ? center(startEl) : rawStart;
  const endAnchor = endEl ? center(endEl) : rawEnd;
  const start = startEl ? edgePoint(startEl, endAnchor) : rawStart;
  const end = endEl ? edgePoint(endEl, startAnchor) : rawEnd;

  const route =
    arrow.routing === 'elbow'
      ? elbowRoute(start, end, startEl ? rect(startEl) : null, endEl ? rect(endEl) : null)
      : [start, end];

  return withRoute(arrow, route);
}

export function bindConnectorEndpoints(
  connector: LinearElement,
  elements: AnyElement[],
  tolerance = 8,
): LinearElement {
  const world = connector.points.map((point) => ({
    x: connector.x + point.x,
    y: connector.y + point.y,
  }));
  const start = world[0];
  const end = world.at(-1);
  if (!start || !end) return connector;
  const candidates = elements.filter((element) => element.id !== connector.id);
  const startTarget = findBindTarget(candidates, start, tolerance);
  const endTarget = findBindTarget(candidates, end, tolerance);
  const bound: LinearElement = {
    ...connector,
    startBinding: startTarget ? { elementId: startTarget.id } : null,
    endBinding: endTarget ? { elementId: endTarget.id } : null,
  };
  const byId = new Map([...candidates, bound].map((element) => [element.id, element] as const));
  return routeConnector(bound, byId);
}

export function bindConnectorEndpoint(
  connector: LinearElement,
  elements: AnyElement[],
  endpoint: 'start' | 'end',
  point: Point,
  tolerance = 8,
): LinearElement {
  const candidates = elements.filter((element) => element.id !== connector.id);
  const target = findBindTarget(candidates, point, tolerance);
  const bound: LinearElement = {
    ...connector,
    ...(endpoint === 'start'
      ? { startBinding: target ? { elementId: target.id } : null }
      : { endBinding: target ? { elementId: target.id } : null }),
  };
  const byId = new Map([...candidates, bound].map((element) => [element.id, element] as const));
  return routeConnector(bound, byId);
}

export interface ConnectorHandles {
  /** World positions of the route's vertices (endpoints + waypoints). */
  vertices: Point[];
  /**
   * World midpoint of each segment at least `minSegment` long, with the index
   * of the segment's first vertex — where a new waypoint would splice in.
   */
  midpoints: Array<{ point: Point; index: number }>;
}

export function getConnectorHandles(el: LinearElement, minSegment = 0): ConnectorHandles {
  const vertices = el.points.map((p) => ({ x: el.x + p.x, y: el.y + p.y }));
  const midpoints: ConnectorHandles['midpoints'] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i]!;
    const b = vertices[i + 1]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) < minSegment) continue;
    midpoints.push({ point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, index: i });
  }
  return { vertices, midpoints };
}

/**
 * After `changedIds` moved/resized, re-route every connector bound to them.
 * Pass no ids to re-route all bound connectors (e.g. after import).
 */
export function updateBoundConnectors(
  elements: AnyElement[],
  changedIds?: Set<string>,
): AnyElement[] {
  const byId = new Map(elements.map((el) => [el.id, el] as const));
  return elements.map((el) => {
    if (!isLinear(el)) return el;
    if (!el.startBinding && !el.endBinding) return el;
    if (
      changedIds &&
      !changedIds.has(el.id) &&
      !(el.startBinding && changedIds.has(el.startBinding.elementId)) &&
      !(el.endBinding && changedIds.has(el.endBinding.elementId))
    ) {
      return el;
    }
    return routeConnector(el, byId);
  });
}

export function findBindTarget(
  elements: AnyElement[],
  point: Point,
  tolerance = 8,
): AnyElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    if (!isBindable(el)) continue;
    const localPoint = rotatePoint(point, getElementCenter(el), -normalizeAngle(el.angle));
    if (
      boxContainsPoint(
        { x: el.x, y: el.y, width: el.width, height: el.height },
        localPoint,
        tolerance,
      )
    ) {
      return el;
    }
  }
  return null;
}

export function pruneBindings(elements: AnyElement[]): AnyElement[] {
  const ids = new Set(elements.map((el) => el.id));
  return elements.map((el) => {
    if (!isLinear(el)) return el;
    const startOk = !el.startBinding || ids.has(el.startBinding.elementId);
    const endOk = !el.endBinding || ids.has(el.endBinding.elementId);
    if (startOk && endOk) return el;
    return {
      ...el,
      startBinding: startOk ? (el.startBinding ?? null) : null,
      endBinding: endOk ? (el.endBinding ?? null) : null,
    };
  });
}
