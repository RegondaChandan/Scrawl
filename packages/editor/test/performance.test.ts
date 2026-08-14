import { describe, expect, it } from 'vitest';
import { createElement } from '@scrawl/schema';
import { snapSelectionMove } from '../src';

describe('interactive performance budget', () => {
  it('calculates repeated smart-snapping moves against 2,500 elements within one second', () => {
    const stationary = Array.from({ length: 2_500 }, (_, index) =>
      createElement('rectangle', {
        x: (index % 50) * 120,
        y: Math.floor(index / 50) * 90,
        width: 90,
        height: 60,
        order: index,
      }),
    );
    const source = { x: 6_200, y: 4_800, width: 100, height: 80 };

    const startedAt = performance.now();
    const results = Array.from({ length: 20 }, (_, index) =>
      snapSelectionMove(source, { x: index * 3, y: index * 2 }, stationary, 6),
    );
    const duration = performance.now() - startedAt;

    expect(results).toHaveLength(20);
    expect(results.every((result) => Number.isFinite(result.delta.x))).toBe(true);
    expect(duration).toBeLessThan(1_000);
  });
});
