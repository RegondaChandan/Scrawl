import { describe, expect, it } from 'vitest';
import { eraserSegmentPoints } from '../src/eraser';

describe('eraser path sampling', () => {
  it('fills the path between sparse pointer events', () => {
    const points = eraserSegmentPoints({ x: 0, y: 0 }, { x: 20, y: 0 }, 4);

    expect(points).toHaveLength(5);
    expect(points.map((point) => point.x)).toEqual([4, 8, 12, 16, 20]);
  });
});
