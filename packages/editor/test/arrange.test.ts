import { describe, expect, it } from 'vitest';
import { createElement, type AnyElement } from '@scrawl/schema';
import {
  alignElements,
  cloneElements,
  distributeElements,
  expandGroupedSelection,
  groupElements,
  nudgeElements,
  MAX_SCRAWL_CLIPBOARD_BYTES,
  parseClipboardElements,
  reorderElements,
  serializeClipboardElements,
  toggleElementLocks,
  ungroupElements,
} from '../src';

function rectangle(id: string, x: number, order: number): AnyElement {
  return createElement('rectangle', { id, x, y: 20, width: 20, height: 20, order });
}

describe('selection arrangement', () => {
  it('clones groups and connector bindings without reusing their identities', () => {
    const shape = createElement('rectangle', {
      id: 'shape',
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      groupIds: ['group'],
    });
    const arrow = createElement('arrow', {
      id: 'arrow',
      x: 80,
      y: 20,
      points: [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
      ],
      startBinding: { elementId: 'shape' },
      groupIds: ['group'],
    });

    const result = cloneElements([shape, arrow], [shape, arrow]);
    const clonedShape = result.elements[2]!;
    const clonedArrow = result.elements[3]!;

    expect(result.selectedIds).toEqual([clonedShape.id, clonedArrow.id]);
    expect(clonedShape.id).not.toBe('shape');
    expect(clonedShape.groupIds?.[0]).not.toBe('group');
    expect(clonedArrow.groupIds).toEqual(clonedShape.groupIds);
    expect(clonedArrow.type).toBe('arrow');
    if (clonedArrow.type !== 'arrow') throw new Error('Expected an arrow');
    expect(clonedArrow.startBinding?.elementId).toBe(clonedShape.id);
  });

  it('groups, expands, and ungroups a selection as one unit', () => {
    const elements = [rectangle('a', 0, 1), rectangle('b', 40, 2), rectangle('c', 80, 3)];
    const grouped = groupElements(elements, new Set(['a', 'b']));

    expect(expandGroupedSelection(grouped, 'a')).toEqual(['a', 'b']);
    const ungrouped = ungroupElements(grouped, new Set(['a', 'b']));
    expect(expandGroupedSelection(ungrouped, 'a')).toEqual(['a']);
  });

  it('aligns selected objects while leaving unselected objects in place', () => {
    const elements = [rectangle('a', 10, 1), rectangle('b', 80, 2), rectangle('c', 160, 3)];
    const aligned = alignElements(elements, new Set(['a', 'b']), 'left');

    expect(aligned[1]!.x).toBe(aligned[0]!.x);
    expect(aligned[2]!.x).toBe(160);
  });

  it('distributes three or more objects with equal gaps', () => {
    const elements = [rectangle('a', 0, 1), rectangle('b', 50, 2), rectangle('c', 200, 3)];
    const distributed = distributeElements(elements, new Set(['a', 'b', 'c']), 'horizontal');

    expect(distributed.map((element) => element.x)).toEqual([0, 100, 200]);
  });

  it('moves selected objects through the stacking order', () => {
    const elements = [rectangle('a', 0, 1), rectangle('b', 40, 2), rectangle('c', 80, 3)];
    const forward = reorderElements(elements, new Set(['b']), 'forward');
    const back = reorderElements(forward, new Set(['b']), 'back');

    expect(forward.find((element) => element.id === 'b')?.order).toBe(3);
    expect(back.find((element) => element.id === 'b')?.order).toBe(1);
  });

  it('locks a mixed selection and keeps locked objects fixed when nudging', () => {
    const elements = [rectangle('a', 0, 1), rectangle('b', 40, 2)];
    const locked = toggleElementLocks(elements, new Set(['a', 'b']));
    const nudged = nudgeElements(locked, new Set(['a', 'b']), { x: 10, y: 5 });

    expect(locked.every((element) => element.locked)).toBe(true);
    expect(nudged.map((element) => element.x)).toEqual([0, 40]);
    expect(
      toggleElementLocks(locked, new Set(['a', 'b'])).every((element) => !element.locked),
    ).toBe(true);
  });

  it('round-trips valid object clipboard data and rejects unrelated text', () => {
    const elements = [{ ...rectangle('a', 0, 1), layerId: 'annotations' }];
    const parsed = parseClipboardElements(serializeClipboardElements(elements));

    expect(parsed).toMatchObject([{ id: 'a', type: 'rectangle', layerId: 'default' }]);
    expect(parseClipboardElements('ordinary clipboard text')).toBeNull();
    expect(parseClipboardElements('{"type":"unknown"}')).toBeNull();
  });

  it('rejects clipboard payloads before parsing when they exceed the byte limit', () => {
    expect(parseClipboardElements(' '.repeat(MAX_SCRAWL_CLIPBOARD_BYTES + 1))).toBeNull();
  });
});
