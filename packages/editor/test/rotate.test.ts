import { describe, expect, it } from 'vitest';
import { routeConnector, updateBoundConnectors } from '@scrawl/engine';
import { createElement, type LinearElement } from '@scrawl/schema';
import { getSelectionCenter, rotateElements, snapRotationAngle } from '../src';

describe('selection rotation', () => {
  it('rotates a box around its own center without moving it', () => {
    const rectangle = createElement('rectangle', {
      id: 'rectangle',
      x: 20,
      y: 30,
      width: 100,
      height: 60,
    });
    const result = rotateElements(
      [rectangle],
      new Set([rectangle.id]),
      { x: 70, y: 60 },
      Math.PI / 2,
    );

    expect(result[0]).toMatchObject({
      x: 20,
      y: 30,
      angle: Math.PI / 2,
      version: rectangle.version + 1,
    });
  });

  it('rotates multiple element centers around the shared pivot', () => {
    const left = createElement('rectangle', {
      id: 'left',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    });
    const right = createElement('rectangle', {
      id: 'right',
      x: 80,
      y: 0,
      width: 20,
      height: 20,
    });
    const result = rotateElements(
      [left, right],
      new Set([left.id, right.id]),
      { x: 50, y: 10 },
      Math.PI,
    );

    expect(result[0]).toMatchObject({ x: 80, y: 0 });
    expect(result[1]).toMatchObject({ x: 0, y: 0 });
  });

  it('flattens rotated point geometry so connectors keep world-space routes', () => {
    const arrow = createElement('arrow', {
      id: 'arrow',
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    const result = rotateElements([arrow], new Set([arrow.id]), { x: 50, y: 0 }, Math.PI / 2);

    expect(result[0]).toMatchObject({
      x: 50,
      y: -50,
      angle: 0,
      width: 0,
      height: 100,
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
    });
  });

  it('reattaches bound connectors to a shape after rotation', () => {
    const source = createElement('rectangle', {
      id: 'source',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
    });
    const target = createElement('rectangle', {
      id: 'target',
      x: 300,
      y: 0,
      width: 100,
      height: 40,
    });
    const connector = createElement('arrow', {
      id: 'connector',
      x: 50,
      y: 20,
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
      startBinding: { elementId: source.id },
      endBinding: { elementId: target.id },
    }) as LinearElement;
    const routed = routeConnector(
      connector,
      new Map([
        [source.id, source],
        [target.id, target],
      ]),
    );

    const rotated = rotateElements(
      [source, target, routed],
      new Set([source.id]),
      { x: 50, y: 20 },
      Math.PI / 2,
    );
    const updated = updateBoundConnectors(rotated, new Set([source.id]));
    const updatedConnector = updated.find((element) => element.id === connector.id);

    expect(updatedConnector?.x).toBeCloseTo(76);
    expect(updatedConnector?.version).toBe(routed.version + 1);
    expect(updatedConnector).toMatchObject({
      startBinding: { elementId: source.id },
      endBinding: { elementId: target.id },
    });
  });

  it('snaps to fifteen-degree increments and finds selection centers', () => {
    expect(snapRotationAngle((16 * Math.PI) / 180)).toBeCloseTo(Math.PI / 12);
    const rectangle = createElement('rectangle', { x: 10, y: 20, width: 40, height: 20 });
    expect(getSelectionCenter([rectangle], new Set([rectangle.id]))).toEqual({ x: 30, y: 30 });
  });
});
