import { createStore, type StoreApi } from 'zustand/vanilla';
import { getSceneBounds, measureTextSize } from '@scrawl/engine';
import {
  createDocument,
  createId,
  LINE_HEIGHT,
  parseDocument,
  type AnyElement,
  type DocumentSettings,
  type Point,
  type ScrawlAsset,
  type ScrawlDocument,
  type StyleMode,
} from '@scrawl/schema';
import {
  addPage as addDocumentPage,
  addLayer as addDocumentLayer,
  appendElement,
  appendElements,
  duplicatePage as duplicateDocumentPage,
  getActivePage,
  mapElements,
  moveElementsToLayer as moveDocumentElementsToLayer,
  pruneUnusedAssets,
  removeLayer as removeDocumentLayer,
  removeElements,
  removePage as removeDocumentPage,
  reorderPage as reorderDocumentPage,
  renamePage as renameDocumentPage,
  renameLayer as renameDocumentLayer,
  reorderLayer as reorderDocumentLayer,
  replaceActiveElements,
  updateLayer as updateDocumentLayer,
} from './document';
import {
  alignElements,
  cloneElements,
  distributeElements,
  groupElements,
  nudgeElements,
  reorderElements,
  toggleElementLocks,
  ungroupElements,
  type Alignment,
  type Distribution,
  type OrderChange,
} from './arrange';
import {
  DEFAULT_VIEW_STATE,
  type Camera,
  type EditorViewState,
  type OpenPanel,
  type Tool,
} from './types';

const HISTORY_LIMIT = 100;

interface HistoryState {
  past: ScrawlDocument[];
  future: ScrawlDocument[];
  checkpoint: ScrawlDocument | null;
}

export interface AddElementOptions {
  selectAfterInsert?: boolean;
}

export interface ImageInsertion {
  asset: ScrawlAsset;
  element: AnyElement;
}

export interface EditorActions {
  loadDocument: (document: unknown) => void;
  setTitle: (title: string) => void;
  setTool: (tool: Tool) => void;
  setCamera: (camera: Camera) => void;
  select: (ids: string[]) => void;
  setEditingId: (id: string | null) => void;
  setOpenPanel: (panel: OpenPanel) => void;
  setRenderMode: (mode: StyleMode) => void;
  toggleRenderMode: () => void;
  updateSettings: (settings: Partial<DocumentSettings>) => void;
  addElement: (element: AnyElement, options?: AddElementOptions) => void;
  insertElements: (elements: AnyElement[]) => void;
  addImage: (asset: ScrawlAsset, element: AnyElement) => void;
  addImages: (insertions: ImageInsertion[]) => void;
  updateElements: (ids: Iterable<string>, update: (element: AnyElement) => AnyElement) => void;
  deleteSelected: () => void;
  selectAll: () => void;
  duplicateSelected: () => void;
  pasteElements: (
    elements: AnyElement[],
    center?: Point,
    assets?: Readonly<Record<string, ScrawlAsset>>,
  ) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  alignSelected: (alignment: Alignment) => void;
  distributeSelected: (distribution: Distribution) => void;
  reorderSelected: (change: OrderChange) => void;
  toggleLockSelected: () => void;
  nudgeSelected: (x: number, y: number) => void;
  setActiveLayer: (layerId: string) => void;
  addLayer: (name?: string) => void;
  renameLayer: (layerId: string, name: string) => void;
  updateLayer: (layerId: string, update: { visible?: boolean; locked?: boolean }) => void;
  reorderLayer: (layerId: string, direction: -1 | 1) => void;
  moveSelectedToLayer: (layerId: string) => void;
  removeLayer: (layerId: string) => void;
  beginTransaction: () => void;
  previewElements: (elements: AnyElement[]) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  undo: () => void;
  redo: () => void;
  addPage: (name?: string) => void;
  setActivePage: (pageId: string) => void;
  renamePage: (pageId: string, name: string) => void;
  duplicatePage: (pageId: string) => void;
  reorderPage: (pageId: string, targetIndex: number) => void;
  removePage: (pageId: string) => void;
}

export interface EditorStoreState {
  document: ScrawlDocument;
  view: EditorViewState;
  history: HistoryState;
  actions: EditorActions;
}

export type EditorStore = StoreApi<EditorStoreState>;

function cloneDocument(document: ScrawlDocument): ScrawlDocument {
  return structuredClone(document);
}

function pushHistory(history: HistoryState, document: ScrawlDocument): HistoryState {
  return {
    past: [...history.past, cloneDocument(document)].slice(-HISTORY_LIMIT),
    future: [],
    checkpoint: null,
  };
}

export function createEditorStore(initialDocument: ScrawlDocument = createDocument()): EditorStore {
  const document = parseDocument(initialDocument);

  return createStore<EditorStoreState>((set, get) => {
    const commit = (update: (current: ScrawlDocument) => ScrawlDocument): void => {
      const state = get();
      const next = update(state.document);
      if (next === state.document) return;
      set({ document: next, history: pushHistory(state.history, state.document) });
    };

    const resetSelection = (nextDocument = get().document): Partial<EditorStoreState> => {
      const page = getActivePage(nextDocument);
      const activeLayerId = page.layers.some((layer) => layer.id === get().view.activeLayerId)
        ? get().view.activeLayerId
        : page.layers[0]!.id;
      return {
        view: { ...get().view, selectedIds: [], editingId: null, activeLayerId },
      };
    };

    const changeActiveElements = (update: (elements: AnyElement[]) => AnyElement[]): boolean => {
      const current = getActivePage(get().document).elements;
      const next = update(current);
      const unchanged =
        next.length === current.length &&
        next.every((element, index) => element === current[index]);
      if (unchanged) return false;
      commit((document) => replaceActiveElements(document, next));
      return true;
    };

    const applyRenderMode = (targetMode: StyleMode): void => {
      const state = get();
      const selectedIds = new Set(state.view.selectedIds);
      commit((current) => {
        const page = getActivePage(current);
        const convertWholePage = selectedIds.size === 0;
        let elementsChanged = false;
        const nextElements = page.elements.map((element) => {
          if (!convertWholePage && !selectedIds.has(element.id)) return element;
          if (element.type === 'text') {
            const size = measureTextSize(
              element.text || ' ',
              element.fontSize,
              targetMode,
              element.fontFamily,
            );
            const width = Math.max(24, size.width);
            const height = Math.max(element.fontSize * LINE_HEIGHT, size.height);
            if (
              element.renderStyle === targetMode &&
              element.width === width &&
              element.height === height
            ) {
              return element;
            }
            elementsChanged = true;
            return {
              ...element,
              renderStyle: targetMode,
              width,
              height,
              version: element.version + 1,
            };
          }
          if (element.renderStyle === targetMode) return element;
          elementsChanged = true;
          return { ...element, renderStyle: targetMode, version: element.version + 1 };
        });
        const settingsChanged = convertWholePage && current.settings.mode !== targetMode;
        if (!elementsChanged && !settingsChanged) return current;
        const next = elementsChanged ? replaceActiveElements(current, nextElements) : current;
        return settingsChanged
          ? { ...next, settings: { ...next.settings, mode: targetMode } }
          : next;
      });
    };

    const actions: EditorActions = {
      loadDocument(value) {
        const document = parseDocument(value);
        set({
          document,
          history: { past: [], future: [], checkpoint: null },
          view: {
            ...get().view,
            selectedIds: [],
            editingId: null,
            activeLayerId: getActivePage(document).layers[0]!.id,
          },
        });
      },
      setTitle(title) {
        const nextTitle = title.trim();
        if (nextTitle) commit((current) => ({ ...current, title: nextTitle }));
      },
      setTool(tool) {
        set({ view: { ...get().view, tool, editingId: null, openPanel: null } });
      },
      setCamera(camera) {
        set({ view: { ...get().view, camera } });
      },
      select(ids) {
        set({ view: { ...get().view, selectedIds: [...new Set(ids)] } });
      },
      setEditingId(editingId) {
        set({ view: { ...get().view, editingId } });
      },
      setOpenPanel(openPanel) {
        set({ view: { ...get().view, openPanel } });
      },
      setRenderMode(mode) {
        applyRenderMode(mode);
      },
      toggleRenderMode() {
        const state = get();
        const activePage = getActivePage(state.document);
        const selectedIds = new Set(state.view.selectedIds);
        const representative = activePage.elements.find((element) => selectedIds.has(element.id));
        const sourceMode = representative?.renderStyle ?? state.document.settings.mode;
        const targetMode: StyleMode = sourceMode === 'rough' ? 'crisp' : 'rough';
        applyRenderMode(targetMode);
      },
      updateSettings(settings) {
        commit((current) => ({
          ...current,
          settings: {
            ...current.settings,
            ...settings,
            defaults: settings.defaults ?? current.settings.defaults,
          },
        }));
      },
      addElement(element, options) {
        commit((current) => appendElement(current, element));
        const view = get().view;
        const selectAfterInsert = options?.selectAfterInsert ?? true;
        set({
          view: {
            ...view,
            selectedIds: selectAfterInsert ? [element.id] : [],
            tool: selectAfterInsert ? 'select' : view.tool,
          },
        });
      },
      insertElements(elements) {
        if (elements.length === 0) return;
        commit((current) => appendElements(current, elements));
        set({
          view: {
            ...get().view,
            selectedIds: elements.map((element) => element.id),
            editingId: null,
            tool: 'select',
          },
        });
      },
      addImage(asset, element) {
        commit((current) => {
          const retained = pruneUnusedAssets(current);
          return parseDocument({
            ...appendElement(retained, element),
            assets: { ...retained.assets, [asset.id]: asset },
          });
        });
        set({ view: { ...get().view, selectedIds: [element.id], tool: 'select' } });
      },
      addImages(insertions) {
        if (insertions.length === 0) return;
        const assets = Object.fromEntries(
          insertions.map(({ asset }) => [asset.id, asset] as const),
        );
        const elements = insertions.map(({ element }) => element);
        commit((current) => {
          const retained = pruneUnusedAssets(current);
          return parseDocument({
            ...appendElements(retained, elements),
            assets: { ...retained.assets, ...assets },
          });
        });
        set({
          view: {
            ...get().view,
            selectedIds: elements.map((element) => element.id),
            editingId: null,
            tool: 'select',
          },
        });
      },
      updateElements(ids, update) {
        const selected = new Set(ids);
        commit((current) => mapElements(current, selected, update));
      },
      deleteSelected() {
        const ids = new Set(get().view.selectedIds);
        if (ids.size === 0) return;
        commit((current) => pruneUnusedAssets(removeElements(current, ids)));
        set(resetSelection());
      },
      selectAll() {
        const ids = getActivePage(get().document)
          .elements.filter((element) => !element.locked)
          .map((element) => element.id);
        set({ view: { ...get().view, selectedIds: ids, editingId: null } });
      },
      duplicateSelected() {
        const state = get();
        const page = getActivePage(state.document);
        const selectedIds = new Set(state.view.selectedIds);
        const selected = page.elements.filter((element) => selectedIds.has(element.id));
        if (selected.length === 0) return;
        const result = cloneElements(selected, page.elements);
        commit((document) => replaceActiveElements(document, result.elements));
        set({ view: { ...get().view, selectedIds: result.selectedIds, editingId: null } });
      },
      pasteElements(elements, center, assets = {}) {
        if (elements.length === 0) return;
        const state = get();
        const page = getActivePage(state.document);
        const layerIds = new Set(page.layers.map((layer) => layer.id));
        const fallbackLayerId = layerIds.has(state.view.activeLayerId)
          ? state.view.activeLayerId
          : page.layers[0]!.id;
        const assetIdMap = new Map<string, string>();
        const pastedAssets: Record<string, ScrawlAsset> = {};
        for (const asset of Object.values(assets)) {
          const existing = state.document.assets[asset.id];
          const targetId =
            existing && JSON.stringify(existing) !== JSON.stringify(asset) ? createId() : asset.id;
          assetIdMap.set(asset.id, targetId);
          if (!existing || targetId !== asset.id) {
            pastedAssets[targetId] = { ...asset, id: targetId };
          }
        }
        const normalized = elements.map((element) => {
          const layerElement = layerIds.has(element.layerId)
            ? element
            : { ...element, layerId: fallbackLayerId };
          return layerElement.type === 'image' && assetIdMap.has(layerElement.assetId)
            ? { ...layerElement, assetId: assetIdMap.get(layerElement.assetId)! }
            : layerElement;
        });
        const bounds = center ? getSceneBounds(normalized) : null;
        const offset =
          center && bounds
            ? {
                x: center.x - (bounds.x + bounds.width / 2),
                y: center.y - (bounds.y + bounds.height / 2),
              }
            : undefined;
        const result = cloneElements(normalized, page.elements, offset);
        commit((document) => {
          const retained = pruneUnusedAssets(document);
          return parseDocument({
            ...replaceActiveElements(retained, result.elements),
            assets: { ...retained.assets, ...pastedAssets },
          });
        });
        set({ view: { ...get().view, selectedIds: result.selectedIds, editingId: null } });
      },
      groupSelected() {
        const ids = new Set(get().view.selectedIds);
        changeActiveElements((elements) => groupElements(elements, ids));
      },
      ungroupSelected() {
        const ids = new Set(get().view.selectedIds);
        changeActiveElements((elements) => ungroupElements(elements, ids));
      },
      alignSelected(alignment) {
        const ids = new Set(get().view.selectedIds);
        changeActiveElements((elements) => alignElements(elements, ids, alignment));
      },
      distributeSelected(distribution) {
        const ids = new Set(get().view.selectedIds);
        changeActiveElements((elements) => distributeElements(elements, ids, distribution));
      },
      reorderSelected(change) {
        const ids = new Set(get().view.selectedIds);
        changeActiveElements((elements) => reorderElements(elements, ids, change));
      },
      toggleLockSelected() {
        const ids = new Set(get().view.selectedIds);
        changeActiveElements((elements) => toggleElementLocks(elements, ids));
      },
      nudgeSelected(x, y) {
        const ids = new Set(get().view.selectedIds);
        changeActiveElements((elements) => nudgeElements(elements, ids, { x, y }));
      },
      setActiveLayer(layerId) {
        const layer = getActivePage(get().document).layers.find(
          (candidate) => candidate.id === layerId,
        );
        if (!layer || !layer.visible || layer.locked) return;
        set({ view: { ...get().view, activeLayerId: layerId } });
      },
      addLayer(name) {
        const layer = {
          id: createId(),
          name: name?.trim() || `Layer ${getActivePage(get().document).layers.length + 1}`,
          visible: true,
          locked: false,
        };
        commit((current) => addDocumentLayer(current, layer));
        set({ view: { ...get().view, activeLayerId: layer.id } });
      },
      renameLayer(layerId, name) {
        commit((current) => renameDocumentLayer(current, layerId, name));
      },
      updateLayer(layerId, update) {
        commit((current) => updateDocumentLayer(current, layerId, update));
        const layer = getActivePage(get().document).layers.find(
          (candidate) => candidate.id === layerId,
        );
        if (!layer?.visible || layer.locked) {
          const hiddenIds = new Set(
            getActivePage(get().document)
              .elements.filter((element) => element.layerId === layerId)
              .map((element) => element.id),
          );
          set({
            view: {
              ...get().view,
              selectedIds: get().view.selectedIds.filter((id) => !hiddenIds.has(id)),
              editingId: hiddenIds.has(get().view.editingId ?? '') ? null : get().view.editingId,
            },
          });
        }
        if (get().view.activeLayerId === layerId && (!layer?.visible || layer.locked)) {
          const fallback = getActivePage(get().document).layers.find(
            (candidate) => candidate.visible && !candidate.locked,
          );
          if (fallback) set({ view: { ...get().view, activeLayerId: fallback.id } });
        }
      },
      reorderLayer(layerId, direction) {
        commit((current) => reorderDocumentLayer(current, layerId, direction));
      },
      moveSelectedToLayer(layerId) {
        const ids = new Set(get().view.selectedIds);
        if (ids.size === 0) return;
        commit((current) => moveDocumentElementsToLayer(current, ids, layerId));
      },
      removeLayer(layerId) {
        const before = getActivePage(get().document);
        if (before.layers.length === 1) return;
        commit((current) => removeDocumentLayer(current, layerId));
        if (get().view.activeLayerId === layerId) {
          set({
            view: { ...get().view, activeLayerId: getActivePage(get().document).layers[0]!.id },
          });
        }
      },
      beginTransaction() {
        const state = get();
        if (state.history.checkpoint) return;
        set({ history: { ...state.history, checkpoint: cloneDocument(state.document) } });
      },
      previewElements(elements) {
        set({ document: replaceActiveElements(get().document, elements) });
      },
      commitTransaction() {
        const state = get();
        const checkpoint = state.history.checkpoint;
        if (!checkpoint) return;
        if (JSON.stringify(checkpoint) === JSON.stringify(state.document)) {
          set({ history: { ...state.history, checkpoint: null } });
          return;
        }
        set({
          document: pruneUnusedAssets(state.document),
          history: pushHistory(state.history, checkpoint),
        });
      },
      cancelTransaction() {
        const state = get();
        if (!state.history.checkpoint) return;
        set({
          document: state.history.checkpoint,
          history: { ...state.history, checkpoint: null },
        });
      },
      undo() {
        const state = get();
        const previous = state.history.past.at(-1);
        if (!previous) return;
        set({
          document: cloneDocument(previous),
          history: {
            past: state.history.past.slice(0, -1),
            future: [cloneDocument(state.document), ...state.history.future],
            checkpoint: null,
          },
          ...resetSelection(previous),
        });
      },
      redo() {
        const state = get();
        const next = state.history.future[0];
        if (!next) return;
        set({
          document: cloneDocument(next),
          history: {
            past: [...state.history.past, cloneDocument(state.document)].slice(-HISTORY_LIMIT),
            future: state.history.future.slice(1),
            checkpoint: null,
          },
          ...resetSelection(next),
        });
      },
      addPage(name) {
        commit((current) => addDocumentPage(current, name));
        set(resetSelection());
      },
      setActivePage(pageId) {
        if (!get().document.pages.some((page) => page.id === pageId)) return;
        commit((current) => ({ ...current, activePageId: pageId }));
        set(resetSelection());
      },
      renamePage(pageId, name) {
        commit((current) => renameDocumentPage(current, pageId, name));
      },
      duplicatePage(pageId) {
        commit((current) => duplicateDocumentPage(current, pageId));
        set(resetSelection());
      },
      reorderPage(pageId, targetIndex) {
        commit((current) => reorderDocumentPage(current, pageId, targetIndex));
      },
      removePage(pageId) {
        commit((current) => pruneUnusedAssets(removeDocumentPage(current, pageId)));
        set(resetSelection());
      },
    };

    return {
      document,
      view: structuredClone(DEFAULT_VIEW_STATE),
      history: { past: [], future: [], checkpoint: null },
      actions,
    };
  });
}

export function selectActiveElements(state: EditorStoreState): AnyElement[] {
  return getActivePage(state.document).elements;
}
