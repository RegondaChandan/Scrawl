import { describe, expect, it } from 'vitest';
import { findLibraryItem } from '@scrawl/engine';
import { DEFAULT_ELEMENT_DEFAULTS, isLinear } from '@scrawl/schema';
import { BUILT_IN_TEMPLATES, instantiateLibraryItem, instantiateTemplateElements } from '../src';

describe('reusable content', () => {
  it('places a typed library item around the requested center', () => {
    const item = findLibraryItem('network-server');
    if (!item) throw new Error('Expected the server library item');

    const element = instantiateLibraryItem(item, {
      center: { x: 300, y: 200 },
      layerId: 'architecture',
      order: 7,
      renderStyle: 'rough',
      defaults: DEFAULT_ELEMENT_DEFAULTS,
    });

    expect(element).toMatchObject({
      type: 'shape',
      shapeKind: 'server',
      x: 245,
      y: 140,
      layerId: 'architecture',
      order: 7,
      renderStyle: 'rough',
    });
  });

  it('instantiates templates with fresh identities and internal bindings', () => {
    const template = BUILT_IN_TEMPLATES.find((candidate) => candidate.id === 'basic-flowchart')!;
    const first = instantiateTemplateElements(template.elements, {
      center: { x: 400, y: 300 },
      layerId: 'default',
      startOrder: 10,
    });
    const second = instantiateTemplateElements(template.elements, {
      center: { x: 400, y: 300 },
      layerId: 'default',
      startOrder: 20,
    });
    const shapeIds = new Set(
      first.filter((element) => element.type !== 'arrow').map((element) => element.id),
    );
    const connectors = first.filter(isLinear);

    expect(first).toHaveLength(template.elements.length);
    expect(new Set(first.map((element) => element.id)).size).toBe(first.length);
    expect(first[0]?.id).not.toBe(second[0]?.id);
    expect(connectors.every((element) => shapeIds.has(element.startBinding?.elementId ?? ''))).toBe(
      true,
    );
    expect(connectors.every((element) => shapeIds.has(element.endBinding?.elementId ?? ''))).toBe(
      true,
    );
  });
});
