import { describe, expect, it } from 'vitest';
import { createElement } from '@scrawl/schema';
import { recognizeFreedraw } from '../src';

describe('freehand recognition', () => {
  it('converts a clean open stroke to a line while preserving its identity and style', () => {
    const stroke = createElement('freedraw', {
      id: 'stroke',
      layerId: 'annotations',
      x: 30,
      y: 40,
      order: 7,
      angle: Math.PI / 6,
      strokeColor: '#e8663d',
      renderStyle: 'rough',
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 1 },
        { x: 40, y: 2 },
        { x: 60, y: 3 },
        { x: 80, y: 4 },
        { x: 100, y: 5 },
      ],
    });
    if (stroke.type !== 'freedraw') throw new Error('Expected freehand');

    expect(recognizeFreedraw(stroke)).toMatchObject({
      id: 'stroke',
      type: 'line',
      layerId: 'annotations',
      x: 30,
      y: 40,
      order: 7,
      angle: Math.PI / 6,
      strokeColor: '#e8663d',
      renderStyle: 'rough',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 5 },
      ],
    });
  });

  it('recognizes a closed box and refuses short ambiguous scribbles', () => {
    const box = createElement('freedraw', {
      x: 10,
      y: 20,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 40 },
        { x: 100, y: 80 },
        { x: 50, y: 80 },
        { x: 0, y: 80 },
        { x: 0, y: 40 },
        { x: 0, y: 0 },
      ],
    });
    const scribble = createElement('freedraw', {
      x: 0,
      y: 0,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 0, y: 1 },
      ],
    });
    if (box.type !== 'freedraw' || scribble.type !== 'freedraw') {
      throw new Error('Expected freehand');
    }

    expect(recognizeFreedraw(box)).toMatchObject({
      id: box.id,
      type: 'rectangle',
      x: 10,
      y: 20,
      width: 100,
      height: 80,
    });
    expect(recognizeFreedraw(scribble)).toBeNull();
  });
});
