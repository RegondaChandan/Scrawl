import { describe, expect, it, vi } from 'vitest';
import { createDocument, createElement, MAX_DOCUMENT_ASSETS } from '@scrawl/schema';
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

  it('pastes objects around a requested canvas point', () => {
    const store = createEditorStore();
    const source = createElement('rectangle', {
      x: 10,
      y: 20,
      width: 100,
      height: 60,
    });

    store.getState().actions.pasteElements([source], { x: 400, y: 300 });

    expect(getActivePage(store.getState().document).elements[0]).toMatchObject({
      x: 350,
      y: 270,
      width: 100,
      height: 60,
    });
  });

  it('adds multiple image assets as one undoable insertion', () => {
    const store = createEditorStore();
    const insertions = ['one', 'two'].map((id, index) => ({
      asset: {
        id: `asset-${id}`,
        mimeType: 'image/png',
        size: 68,
        data: 'data:image/png;base64,iVBORw0KGgo=',
      },
      element: createElement('image', {
        x: index * 120,
        y: 0,
        width: 100,
        height: 80,
        naturalWidth: 100,
        naturalHeight: 80,
        assetId: `asset-${id}`,
      }),
    }));

    store.getState().actions.addImages(insertions);

    expect(getActivePage(store.getState().document).elements).toHaveLength(2);
    expect(Object.keys(store.getState().document.assets)).toHaveLength(2);
    expect(store.getState().history.past).toHaveLength(1);
    store.getState().actions.undo();
    expect(getActivePage(store.getState().document).elements).toHaveLength(0);
    expect(Object.keys(store.getState().document.assets)).toHaveLength(0);
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

  it('toggles rendering for the selection or the whole page as one undoable change', () => {
    const document = createDocument();
    const first = createElement('rectangle', { x: 0, y: 0, width: 80, height: 50 });
    const second = createElement('ellipse', { x: 120, y: 0, width: 80, height: 50 });
    document.pages[0]!.elements.push(first, second);
    const store = createEditorStore(document);
    const actions = store.getState().actions;

    actions.select([first.id]);
    actions.toggleRenderMode();
    expect(
      getActivePage(store.getState().document).elements.map((element) => element.renderStyle),
    ).toEqual(['rough', 'crisp']);
    expect(store.getState().document.settings.mode).toBe('crisp');
    expect(store.getState().history.past).toHaveLength(1);

    actions.undo();
    actions.select([]);
    actions.toggleRenderMode();
    expect(
      getActivePage(store.getState().document).elements.map((element) => element.renderStyle),
    ).toEqual(['rough', 'rough']);
    expect(store.getState().document.settings.mode).toBe('rough');
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('keeps canvas background changes undoable', () => {
    const store = createEditorStore();
    const actions = store.getState().actions;

    actions.updateSettings({ canvasColor: '#e7f5ff' });
    expect(store.getState().document.settings.canvasColor).toBe('#e7f5ff');
    expect(store.getState().history.past).toHaveLength(1);

    actions.undo();
    expect(store.getState().document.settings.canvasColor).toBeUndefined();
  });

  it('releases unused image assets on deletion and restores them with undo', () => {
    const store = createEditorStore();
    const image = createElement('image', {
      x: 20,
      y: 30,
      width: 100,
      height: 80,
      naturalWidth: 100,
      naturalHeight: 80,
      assetId: 'asset-1',
    });
    const actions = store.getState().actions;
    actions.addImage(
      {
        id: 'asset-1',
        mimeType: 'image/png',
        size: 3,
        data: 'data:image/png;base64,YWJj',
      },
      image,
    );
    actions.select([image.id]);
    actions.deleteSelected();

    expect(store.getState().document.assets).toEqual({});
    actions.undo();
    expect(store.getState().document.assets['asset-1']).toBeDefined();
    expect(getActivePage(store.getState().document).elements[0]?.type).toBe('image');
  });

  it('releases assets from a removed page and restores them with undo', () => {
    const store = createEditorStore();
    const actions = store.getState().actions;
    actions.addPage('Images');
    const imagePageId = store.getState().document.activePageId;
    const image = createElement('image', {
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      naturalWidth: 20,
      naturalHeight: 20,
      assetId: 'page-asset',
    });
    actions.addImage(
      {
        id: 'page-asset',
        mimeType: 'image/png',
        size: 3,
        data: 'data:image/png;base64,YWJj',
      },
      image,
    );

    actions.removePage(imagePageId);

    expect(store.getState().document.assets['page-asset']).toBeUndefined();
    actions.undo();
    expect(store.getState().document.assets['page-asset']).toBeDefined();
    expect(store.getState().document.pages.some((page) => page.id === imagePageId)).toBe(true);
  });

  it('pastes image elements and their assets atomically', () => {
    const store = createEditorStore();
    const image = createElement('image', {
      x: 0,
      y: 0,
      width: 40,
      height: 30,
      naturalWidth: 40,
      naturalHeight: 30,
      assetId: 'clipboard-asset',
    });
    const asset = {
      id: 'clipboard-asset',
      mimeType: 'image/png',
      size: 3,
      data: 'data:image/png;base64,YWJj',
    };

    store.getState().actions.pasteElements([image], { x: 200, y: 160 }, { [asset.id]: asset });

    expect(store.getState().document.assets[asset.id]).toEqual(asset);
    expect(getActivePage(store.getState().document).elements[0]).toMatchObject({
      type: 'image',
      assetId: asset.id,
    });
  });

  it('revalidates image limits inside the atomic store update', () => {
    const document = createDocument();
    for (let index = 0; index < MAX_DOCUMENT_ASSETS; index += 1) {
      const id = `asset-${index}`;
      document.assets[id] = {
        id,
        mimeType: 'image/png',
        size: 1,
        data: 'data:image/png;base64,YQ==',
      };
      document.pages[0]!.elements.push(
        createElement('image', {
          id: `image-${index}`,
          x: index * 2,
          y: 0,
          width: 1,
          height: 1,
          naturalWidth: 1,
          naturalHeight: 1,
          assetId: id,
          order: index,
        }),
      );
    }
    const store = createEditorStore(document);
    const image = createElement('image', {
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      naturalWidth: 20,
      naturalHeight: 20,
      assetId: 'one-too-many',
    });

    expect(() =>
      store.getState().actions.addImage(
        {
          id: 'one-too-many',
          mimeType: 'image/png',
          size: 1,
          data: 'data:image/png;base64,YQ==',
        },
        image,
      ),
    ).toThrow('too many assets');
    expect(getActivePage(store.getState().document).elements).toHaveLength(MAX_DOCUMENT_ASSETS);
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('remeasures free text when its rendering mode changes', () => {
    const context = {
      font: '',
      measureText(value: string) {
        return { width: value.length * (this.font.includes('Bradley Hand') ? 12 : 8) };
      },
    };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
    const document = createDocument();
    const text = createElement('text', {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      text: 'hello',
      fontSize: 20,
    });
    document.pages[0]!.elements.push(text);
    const store = createEditorStore(document);
    store.getState().actions.select([text.id]);

    store.getState().actions.toggleRenderMode();

    expect(getActivePage(store.getState().document).elements[0]).toMatchObject({
      renderStyle: 'rough',
      width: 60,
      height: 27,
    });
    vi.unstubAllGlobals();
  });

  it('applies an explicit rendering mode atomically and remeasures selected text', () => {
    const context = {
      font: '',
      measureText(value: string) {
        return { width: value.length * (this.font.includes('Bradley Hand') ? 12 : 8) };
      },
    };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
    const document = createDocument();
    const text = createElement('text', {
      x: 0,
      y: 0,
      text: 'hello',
      fontSize: 20,
      width: 40,
      height: 27,
    });
    document.pages[0]!.elements.push(text);
    const store = createEditorStore(document);
    const actions = store.getState().actions;
    actions.select([text.id]);

    actions.setRenderMode('rough');

    expect(getActivePage(store.getState().document).elements[0]).toMatchObject({
      renderStyle: 'rough',
      width: 60,
      height: 27,
    });
    expect(store.getState().document.settings.mode).toBe('crisp');
    expect(store.getState().history.past).toHaveLength(1);
    actions.undo();
    expect(getActivePage(store.getState().document).elements[0]).toMatchObject({
      renderStyle: 'crisp',
      width: 40,
    });
    vi.unstubAllGlobals();
  });
});
