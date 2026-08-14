import { describe, expect, it } from 'vitest';
import { createElement } from '@scrawl/schema';
import { exportSVG, getSceneBounds } from '../src';

describe('large-scene performance budget', () => {
  it('calculates bounds and exports 2,500 crisp elements within two seconds', () => {
    const elements = Array.from({ length: 2_500 }, (_, index) =>
      createElement(index % 3 === 0 ? 'ellipse' : 'rectangle', {
        x: (index % 50) * 140,
        y: Math.floor(index / 50) * 100,
        width: 110,
        height: 70,
        order: index,
        renderStyle: 'crisp',
      }),
    );

    const startedAt = performance.now();
    const bounds = getSceneBounds(elements);
    const svg = exportSVG(elements);
    const duration = performance.now() - startedAt;

    expect(bounds).toMatchObject({ x: -1, y: -1, width: 6_972, height: 4_972 });
    expect(svg).toContain('</svg>');
    expect(svg.match(/<g transform=/g)).toHaveLength(2_500);
    expect(duration).toBeLessThan(2_000);
  });
});
