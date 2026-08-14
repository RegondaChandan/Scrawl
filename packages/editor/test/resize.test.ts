import { describe, expect, it } from 'vitest';
import { createElement } from '@scrawl/schema';
import { resizeBoxFromHandle, resizeElements, resizeElementsInFrame } from '../src';

describe('selection resizing', () => {
  it('resizes from each edge without moving the opposite edge', () => {
    const source = { x: 100, y: 100, width: 200, height: 120 };

    expect(resizeBoxFromHandle(source, 'e', { x: 360, y: 0 })).toEqual({
      x: 100,
      y: 100,
      width: 260,
      height: 120,
    });
    expect(resizeBoxFromHandle(source, 'nw', { x: 40, y: 60 })).toEqual({
      x: 40,
      y: 60,
      width: 260,
      height: 160,
    });
  });

  it('enforces a minimum size when a handle crosses the opposite edge', () => {
    expect(
      resizeBoxFromHandle(
        { x: 100, y: 100, width: 200, height: 120 },
        'nw',
        { x: 500, y: 500 },
        { minimumSize: 16 },
      ),
    ).toEqual({ x: 284, y: 204, width: 16, height: 16 });
  });

  it('preserves the source aspect ratio for corner resizing', () => {
    const resized = resizeBoxFromHandle(
      { x: 100, y: 100, width: 200, height: 100 },
      'se',
      { x: 400, y: 220 },
      { keepAspectRatio: true },
    );

    expect(resized).toEqual({ x: 100, y: 100, width: 300, height: 150 });
  });

  it('scales every selected element around the shared bounds', () => {
    const left = createElement('rectangle', {
      id: 'left',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
    const right = createElement('ellipse', {
      id: 'right',
      x: 100,
      y: 50,
      width: 100,
      height: 50,
    });
    const result = resizeElements(
      [left, right],
      new Set([left.id, right.id]),
      { x: 0, y: 0, width: 200, height: 100 },
      { x: 20, y: 30, width: 400, height: 200 },
    );

    expect(result[0]).toMatchObject({ x: 20, y: 30, width: 200, height: 100 });
    expect(result[1]).toMatchObject({ x: 220, y: 130, width: 200, height: 100 });
  });

  it('scales connector points and respects locked elements', () => {
    const arrow = createElement('arrow', {
      id: 'arrow',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
    });
    const locked = createElement('rectangle', {
      id: 'locked',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      locked: true,
    });
    const result = resizeElements(
      [arrow, locked],
      new Set([arrow.id, locked.id]),
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 0, width: 200, height: 150 },
    );

    expect(result[0]).toMatchObject({
      width: 200,
      height: 150,
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 150 },
      ],
    });
    expect(result[1]).toBe(locked);
  });

  it('resizes inside a rotated frame while keeping the frame orientation', () => {
    const rectangle = createElement('rectangle', {
      id: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      angle: Math.PI / 2,
    });
    const result = resizeElementsInFrame(
      [rectangle],
      new Set([rectangle.id]),
      { x: 0, y: 0, width: 100, height: 60 },
      { x: 0, y: 0, width: 150, height: 60 },
      { x: 50, y: 30 },
      rectangle.angle,
    );

    expect(result[0]).toMatchObject({
      x: -25,
      y: 25,
      width: 150,
      height: 60,
      angle: Math.PI / 2,
    });
  });
});
