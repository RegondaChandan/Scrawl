import { describe, expect, it } from 'vitest';
import { createDocument, createElement } from '@scrawl/schema';
import { createEditorStore, getActivePage } from '../src';

describe('editor store', () => {
  it('keeps document changes undoable without persisting view state', () => {
    const store = createEditorStore(createDocument('System Map'));
    const rectangle = createElement('rectangle', {
      x: 40,
      y: 60,
      width: 160,
      height: 100,
    });

    store.getState().actions.setCamera({ x: 120, y: 80, zoom: 1.5 });
    store.getState().actions.addElement(rectangle);

    expect(getActivePage(store.getState().document).elements).toHaveLength(1);
    expect(store.getState().history.past).toHaveLength(1);

    store.getState().actions.undo();
    expect(getActivePage(store.getState().document).elements).toHaveLength(0);
    expect(store.getState().view.camera).toEqual({ x: 120, y: 80, zoom: 1.5 });

    store.getState().actions.redo();
    expect(getActivePage(store.getState().document).elements[0]?.id).toBe(rectangle.id);
  });

  it('can insert an element without selecting it or leaving the active tool', () => {
    const store = createEditorStore();
    const stroke = createElement('freedraw', {
      x: 20,
      y: 30,
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 25 },
      ],
    });
    const actions = store.getState().actions;

    actions.setTool('freedraw');
    actions.addElement(stroke, { selectAfterInsert: false });

    expect(getActivePage(store.getState().document).elements[0]?.id).toBe(stroke.id);
    expect(store.getState().view.tool).toBe('freedraw');
    expect(store.getState().view.selectedIds).toEqual([]);
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('records a drag preview as one history entry', () => {
    const document = createDocument();
    const rectangle = createElement('rectangle', {
      x: 10,
      y: 20,
      width: 100,
      height: 60,
    });
    document.pages[0]!.elements.push(rectangle);
    const store = createEditorStore(document);
    const actions = store.getState().actions;

    actions.beginTransaction();
    actions.previewElements([{ ...rectangle, x: 40 }]);
    actions.previewElements([{ ...rectangle, x: 90 }]);
    actions.commitTransaction();

    expect(getActivePage(store.getState().document).elements[0]?.x).toBe(90);
    expect(store.getState().history.past).toHaveLength(1);

    actions.undo();
    expect(getActivePage(store.getState().document).elements[0]?.x).toBe(10);
  });

  it('records text insertion and typing as one undoable transaction', () => {
    const store = createEditorStore();
    const text = createElement('text', {
      x: 20,
      y: 30,
      width: 100,
      height: 40,
      text: '',
    });
    if (text.type !== 'text') throw new Error('Expected a text element');
    const actions = store.getState().actions;

    actions.beginTransaction();
    actions.previewElements([text]);
    actions.previewElements([{ ...text, text: 'System boundary' }]);
    actions.commitTransaction();

    expect(getActivePage(store.getState().document).elements[0]).toMatchObject({
      id: text.id,
      text: 'System boundary',
    });
    expect(store.getState().history.past).toHaveLength(1);

    actions.undo();
    expect(getActivePage(store.getState().document).elements).toHaveLength(0);
  });

  it('keeps every page inside the document contract', () => {
    const store = createEditorStore();
    const firstPageId = store.getState().document.activePageId;

    store.getState().actions.addPage('Data Flow');
    const secondPageId = store.getState().document.activePageId;
    store
      .getState()
      .actions.addElement(createElement('ellipse', { x: 10, y: 10, width: 80, height: 80 }));
    store.getState().actions.setActivePage(firstPageId);

    expect(store.getState().document.pages).toHaveLength(2);
    expect(
      store.getState().document.pages.find((page) => page.id === secondPageId)?.elements,
    ).toHaveLength(1);
    expect(getActivePage(store.getState().document).elements).toHaveLength(0);
  });

  it('duplicates pages with independent layers, groups, and connector bindings', () => {
    const document = createDocument();
    const sourcePage = document.pages[0]!;
    const shape = createElement('rectangle', {
      id: 'shape',
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      groupIds: ['group'],
    });
    const connector = createElement('arrow', {
      id: 'connector',
      x: 100,
      y: 30,
      width: 100,
      height: 0,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      startBinding: { elementId: shape.id },
      groupIds: ['group'],
    });
    sourcePage.elements.push(shape, connector);
    const store = createEditorStore(document);

    store.getState().actions.duplicatePage(sourcePage.id);

    const copy = getActivePage(store.getState().document);
    const copiedShape = copy.elements.find((element) => element.type === 'rectangle')!;
    const copiedConnector = copy.elements.find((element) => element.type === 'arrow');
    expect(copy.name).toBe('Page 1 copy');
    expect(copy.id).not.toBe(sourcePage.id);
    expect(copiedShape.id).not.toBe(shape.id);
    expect(copiedShape.groupIds?.[0]).not.toBe('group');
    expect(copiedConnector).toMatchObject({
      startBinding: { elementId: copiedShape.id },
      groupIds: copiedShape.groupIds,
    });
  });

  it('reorders and safely removes pages with undo support', () => {
    const store = createEditorStore();
    const actions = store.getState().actions;
    const firstPageId = store.getState().document.activePageId;
    actions.addPage('Second');
    const secondPageId = store.getState().document.activePageId;
    actions.addPage('Third');
    const thirdPageId = store.getState().document.activePageId;

    actions.reorderPage(thirdPageId, 0);
    expect(store.getState().document.pages.map((page) => page.id)).toEqual([
      thirdPageId,
      firstPageId,
      secondPageId,
    ]);

    actions.removePage(thirdPageId);
    expect(store.getState().document.activePageId).toBe(firstPageId);
    actions.undo();
    expect(store.getState().document.pages[0]?.id).toBe(thirdPageId);

    actions.removePage(thirdPageId);
    actions.removePage(firstPageId);
    actions.removePage(secondPageId);
    expect(store.getState().document.pages).toHaveLength(1);
  });

  it('removes dangling connector bindings when a shape is deleted', () => {
    const document = createDocument();
    const shape = createElement('rectangle', {
      id: 'shape',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const arrow = createElement('arrow', {
      id: 'arrow',
      x: 0,
      y: 0,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      startBinding: { elementId: shape.id },
    });
    document.pages[0]!.elements.push(shape, arrow);
    const store = createEditorStore(document);

    store.getState().actions.select([shape.id]);
    store.getState().actions.deleteSelected();

    const remaining = getActivePage(store.getState().document).elements[0];
    expect(remaining?.type).toBe('arrow');
    if (remaining?.type === 'arrow') expect(remaining.startBinding).toBeNull();
  });

  it('manages layers and safely moves elements when a layer is removed', () => {
    const store = createEditorStore();
    const actions = store.getState().actions;
    actions.addLayer('Annotations');
    const layerId = store.getState().view.activeLayerId;
    const element = createElement('rectangle', {
      x: 10,
      y: 20,
      width: 80,
      height: 50,
      layerId,
    });
    actions.addElement(element);
    actions.renameLayer(layerId, 'Notes');
    actions.updateLayer(layerId, { locked: true });

    expect(
      getActivePage(store.getState().document).layers.find((layer) => layer.id === layerId),
    ).toMatchObject({
      name: 'Notes',
      locked: true,
    });

    actions.removeLayer(layerId);
    const page = getActivePage(store.getState().document);
    expect(page.layers).toHaveLength(1);
    expect(page.elements[0]?.layerId).toBe(page.layers[0]?.id);
  });

  it('stores a local image asset and element in one undoable change', () => {
    const store = createEditorStore();
    const image = createElement('image', {
      x: 20,
      y: 30,
      width: 100,
      height: 80,
      naturalWidth: 400,
      naturalHeight: 320,
      assetId: 'asset-1',
    });
    store.getState().actions.addImage(
      {
        id: 'asset-1',
        mimeType: 'image/png',
        size: 68,
        name: 'sample.png',
        data: 'data:image/png;base64,iVBORw0KGgo=',
      },
      image,
    );

    expect(store.getState().document.assets['asset-1']?.name).toBe('sample.png');
    expect(getActivePage(store.getState().document).elements[0]?.type).toBe('image');
    expect(store.getState().history.past).toHaveLength(1);

    store.getState().actions.undo();
    expect(store.getState().document.assets['asset-1']).toBeUndefined();
    expect(getActivePage(store.getState().document).elements).toHaveLength(0);
  });

  it('repairs the active drawing layer when layer history changes', () => {
    const store = createEditorStore();
    store.getState().actions.addLayer('Temporary');
    const temporaryLayerId = store.getState().view.activeLayerId;

    store.getState().actions.undo();

    const page = getActivePage(store.getState().document);
    expect(page.layers.some((layer) => layer.id === temporaryLayerId)).toBe(false);
    expect(store.getState().view.activeLayerId).toBe(page.layers[0]?.id);
  });
});
