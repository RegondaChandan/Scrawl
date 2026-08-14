import { describe, expect, it } from 'vitest';
import { createElement } from '@scrawl/schema';
import { getElementBounds, hitTestElement, polylineMidpoint, rotatePoint } from '../src';

describe('element geometry', () => {
  it('finds filled and outlined shapes accurately', () => {
    const filled = createElement('rectangle', {
      x: 20,
      y: 30,
      width: 100,
      height: 60,
      backgroundColor: '#ffffff',
    });
    const outline = createElement('ellipse', {
      x: 200,
      y: 40,
      width: 80,
      height: 80,
    });

    expect(hitTestElement(filled, { x: 70, y: 60 }, 2)).toBe(true);
    expect(hitTestElement(filled, { x: 150, y: 60 }, 2)).toBe(false);
    expect(hitTestElement(outline, { x: 240, y: 80 }, 2)).toBe(false);
    expect(hitTestElement(outline, { x: 280, y: 80 }, 2)).toBe(true);
  });

  it('includes arrowhead space in connector bounds', () => {
    const arrow = createElement('arrow', {
      x: 10,
      y: 20,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
    });
    const bounds = getElementBounds(arrow);

    expect(bounds.x).toBeLessThan(10);
    expect(bounds.y).toBeLessThan(20);
    expect(bounds.width).toBeGreaterThan(100);
    expect(bounds.height).toBeGreaterThan(50);
  });

  it('finds the distance-weighted midpoint of a polyline', () => {
    expect(
      polylineMidpoint([
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 20 },
      ]),
    ).toEqual({ x: 50, y: 0 });
  });

  it('uses rotated geometry for bounds and hit testing', () => {
    const rectangle = createElement('rectangle', {
      x: 20,
      y: 30,
      width: 100,
      height: 60,
      angle: Math.PI / 2,
      backgroundColor: '#ffffff',
    });
    const bounds = getElementBounds(rectangle);

    expect(bounds.width).toBeCloseTo(62);
    expect(bounds.height).toBeCloseTo(102);
    expect(hitTestElement(rectangle, { x: 70, y: 10 }, 1)).toBe(true);
    expect(hitTestElement(rectangle, { x: 20, y: 30 }, 1)).toBe(false);
    expect(rotatePoint({ x: 80, y: 60 }, { x: 70, y: 60 }, Math.PI / 2)).toEqual({
      x: 70,
      y: 70,
    });
  });
});
