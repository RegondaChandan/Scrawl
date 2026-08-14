import { describe, expect, it } from 'vitest';
import { createElement, type LinearElement } from '@scrawl/schema';
import { insertConnectorWaypoint, moveConnectorSegment, moveConnectorVertex } from '../src';

describe('connector editing', () => {
  it('inserts and moves a manual waypoint in world coordinates', () => {
    const line = createElement('line', {
      x: 20,
      y: 30,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }) as LinearElement;

    const inserted = insertConnectorWaypoint(line, 0, { x: 70, y: 60 });
    const moved = moveConnectorVertex(inserted, 1, { x: 80, y: 80 });

    expect(inserted.fixedPoints).toBe(true);
    expect(inserted.points).toHaveLength(3);
    expect(moved.points[1]).toEqual({ x: 60, y: 50 });
  });

  it('moves an elbow segment while preserving its axis', () => {
    const line = createElement('line', {
      x: 0,
      y: 0,
      routing: 'elbow',
      points: [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 60 },
      ],
    }) as LinearElement;

    const moved = moveConnectorSegment(line, 0, { x: 0, y: 24 });

    expect(moved.points[0]!.y).toBe(0);
    expect(moved.points[1]!.y).toBe(0);
    expect(moved.y).toBe(24);
  });
});
