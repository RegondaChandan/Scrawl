import { describe, expect, it } from 'vitest';
import { createElement, type LinearElement } from '@scrawl/schema';
import {
  bindConnectorEndpoint,
  bindConnectorEndpoints,
  edgePoint,
  pruneBindings,
  routeConnector,
  updateBoundConnectors,
} from '../src';

describe('connector bindings', () => {
  it('attaches connector endpoints to shape edges', () => {
    const source = createElement('rectangle', {
      id: 'source',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const target = createElement('rectangle', {
      id: 'target',
      x: 300,
      y: 0,
      width: 100,
      height: 80,
    });
    const arrow = createElement('arrow', {
      id: 'connector',
      x: 50,
      y: 40,
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
      startBinding: { elementId: source.id },
      endBinding: { elementId: target.id },
    }) as LinearElement;

    const routed = routeConnector(
      arrow,
      new Map([
        [source.id, source],
        [target.id, target],
      ]),
    );
    const last = routed.points.at(-1)!;

    expect(routed.x).toBeGreaterThan(source.x + source.width);
    expect(routed.x + last.x).toBeLessThan(target.x);
    expect(routed.y).toBe(40);
    expect(routed.y + last.y).toBe(40);
  });

  it('updates only connectors affected by a changed element', () => {
    const source = createElement('rectangle', {
      id: 'source',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const target = createElement('rectangle', {
      id: 'target',
      x: 300,
      y: 0,
      width: 100,
      height: 80,
    });
    const arrow = createElement('arrow', {
      id: 'connector',
      x: 0,
      y: 0,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      startBinding: { elementId: source.id },
      endBinding: { elementId: target.id },
    });

    const result = updateBoundConnectors([source, target, arrow], new Set([target.id]));
    const connector = result.find((element) => element.id === arrow.id)!;

    expect(connector.version).toBe(arrow.version + 1);
  });

  it('removes bindings that point to deleted elements', () => {
    const arrow = createElement('arrow', {
      x: 0,
      y: 0,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      startBinding: { elementId: 'missing' },
    }) as LinearElement;

    const [cleaned] = pruneBindings([arrow]) as LinearElement[];
    expect(cleaned!.startBinding).toBeNull();
  });

  it('binds newly drawn endpoints to nearby shapes', () => {
    const source = createElement('rectangle', {
      id: 'source',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const target = createElement('rectangle', {
      id: 'target',
      x: 240,
      y: 0,
      width: 100,
      height: 80,
    });
    const arrow = createElement('arrow', {
      x: 50,
      y: 40,
      points: [
        { x: 0, y: 0 },
        { x: 240, y: 0 },
      ],
    }) as LinearElement;

    const bound = bindConnectorEndpoints(arrow, [source, target], 4);

    expect(bound.startBinding).toEqual({ elementId: 'source' });
    expect(bound.endBinding).toEqual({ elementId: 'target' });
    expect(bound.x).toBeGreaterThan(source.x + source.width);
  });

  it('detaches an endpoint when it is dragged away from a shape', () => {
    const source = createElement('rectangle', {
      id: 'source',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const arrow = createElement('arrow', {
      x: 50,
      y: 40,
      points: [
        { x: 0, y: 0 },
        { x: 180, y: 0 },
      ],
      startBinding: { elementId: source.id },
    }) as LinearElement;

    const detached = bindConnectorEndpoint(arrow, [source], 'start', { x: 180, y: 180 }, 4);

    expect(detached.startBinding).toBeNull();
  });

  it('routes a free elbow connector without requiring shape bindings', () => {
    const arrow = createElement('arrow', {
      x: 0,
      y: 0,
      points: [
        { x: 0, y: 0 },
        { x: 120, y: 80 },
      ],
      routing: 'elbow',
    }) as LinearElement;

    const routed = routeConnector(arrow, new Map());

    expect(routed.points).toHaveLength(4);
    expect(routed.points[1]!.y).toBe(0);
  });

  it('attaches to the visible edge of a rotated shape', () => {
    const rectangle = createElement('rectangle', {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      angle: Math.PI / 2,
    });
    const point = edgePoint(rectangle, { x: 300, y: 25 });

    expect(point.x).toBeCloseTo(81);
    expect(point.y).toBeCloseTo(25);
  });

  it('uses stable cardinal anchors for reusable library shapes', () => {
    const server = createElement('shape', {
      x: 40,
      y: 20,
      width: 100,
      height: 120,
      shapeKind: 'server',
      angle: Math.PI / 2,
    });

    const point = edgePoint(server, { x: 500, y: 80 });

    expect(point.x).toBeCloseTo(156);
    expect(point.y).toBeCloseTo(80);
  });
});
