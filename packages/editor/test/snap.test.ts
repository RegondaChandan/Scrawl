import { describe, expect, it } from 'vitest';
import { createElement } from '@scrawl/schema';
import {
  snapPointToElements,
  snapPointToGrid,
  snapSelectionMove,
  snapSelectionMoveToGrid,
} from '../src';

describe('smart snapping', () => {
  it('aligns selection edges and emits a visual guide', () => {
    const target = createElement('rectangle', { x: 200, y: 50, width: 100, height: 80 });
    const result = snapSelectionMove(
      { x: 20, y: 55, width: 60, height: 40 },
      { x: 115, y: 0 },
      [target],
      6,
    );

    expect(result.delta.x).toBe(119);
    expect(result.guides).toContainEqual({
      axis: 'x',
      position: 199,
      start: 49,
      end: 131,
    });
  });

  it('snaps a selection to equal spacing between neighboring elements', () => {
    const left = createElement('rectangle', { x: 0, y: 0, width: 40, height: 40 });
    const right = createElement('rectangle', { x: 160, y: 0, width: 40, height: 40 });
    const result = snapSelectionMove(
      { x: 80, y: 80, width: 40, height: 40 },
      { x: 3, y: 0 },
      [left, right],
      6,
    );

    expect(result.delta.x).toBe(0);
    expect(result.guides.filter((guide) => guide.axis === 'y')).toHaveLength(2);
  });

  it('snaps resize points only on the requested axes', () => {
    const target = createElement('rectangle', { x: 100, y: 200, width: 80, height: 60 });
    const result = snapPointToElements({ x: 97, y: 197 }, [target], 5, {
      x: true,
      y: false,
    });

    expect(result.point).toEqual({ x: 99, y: 197 });
    expect(result.guides).toHaveLength(1);
  });

  it('snaps drawing and connector points to the nearest grid intersection', () => {
    expect(snapPointToGrid({ x: 31, y: 49 })).toEqual({ x: 40, y: 40 });
    expect(snapPointToGrid({ x: -11, y: -29 })).toEqual({ x: -20, y: -20 });
  });

  it('moves a selection so its origin lands on the grid', () => {
    const result = snapSelectionMoveToGrid(
      { x: 13, y: 27, width: 80, height: 40 },
      { x: 18, y: 22 },
    );

    expect(result).toEqual({ x: 27, y: 13 });
  });
});
