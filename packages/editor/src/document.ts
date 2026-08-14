import { pruneBindings } from '@scrawl/engine';
import {
  DEFAULT_LAYER_ID,
  createId,
  maxOrder,
  type AnyElement,
  type ScrawlDocument,
  type ScrawlLayer,
  type ScrawlPage,
} from '@scrawl/schema';

export function getActivePage(document: ScrawlDocument): ScrawlPage {
  const page = document.pages.find((candidate) => candidate.id === document.activePageId);
  if (!page) throw new Error('The active page does not exist');
  return page;
}

export function updateActivePage(
  document: ScrawlDocument,
  update: (page: ScrawlPage) => ScrawlPage,
): ScrawlDocument {
  return {
    ...document,
    pages: document.pages.map((page) => (page.id === document.activePageId ? update(page) : page)),
  };
}

export function replaceActiveElements(
  document: ScrawlDocument,
  elements: AnyElement[],
): ScrawlDocument {
  return updateActivePage(document, (page) => ({ ...page, elements }));
}

export function appendElement(document: ScrawlDocument, element: AnyElement): ScrawlDocument {
  return updateActivePage(document, (page) => {
    const layerId = page.layers.some((layer) => layer.id === element.layerId)
      ? element.layerId
      : DEFAULT_LAYER_ID;
    return {
      ...page,
      elements: [
        ...page.elements,
        {
          ...element,
          layerId,
          order: Math.max(element.order, maxOrder(page.elements) + 1),
        },
      ],
    };
  });
}

export function appendElements(document: ScrawlDocument, elements: AnyElement[]): ScrawlDocument {
  if (elements.length === 0) return document;
  return updateActivePage(document, (page) => {
    const layerIds = new Set(page.layers.map((layer) => layer.id));
    const fallbackLayerId = page.layers[0]!.id;
    const firstOrder = maxOrder(page.elements) + 1;
    return {
      ...page,
      elements: [
        ...page.elements,
        ...elements.map((element, index) => ({
          ...element,
          layerId: layerIds.has(element.layerId) ? element.layerId : fallbackLayerId,
          order: firstOrder + index,
        })),
      ],
    };
  });
}

export function mapElements(
  document: ScrawlDocument,
  ids: ReadonlySet<string>,
  update: (element: AnyElement) => AnyElement,
): ScrawlDocument {
  return updateActivePage(document, (page) => ({
    ...page,
    elements: page.elements.map((element) => (ids.has(element.id) ? update(element) : element)),
  }));
}

export function removeElements(document: ScrawlDocument, ids: ReadonlySet<string>): ScrawlDocument {
  return updateActivePage(document, (page) => ({
    ...page,
    elements: pruneBindings(page.elements.filter((element) => !ids.has(element.id))),
  }));
}

export function addLayer(document: ScrawlDocument, layer: ScrawlLayer): ScrawlDocument {
  return updateActivePage(document, (page) => ({ ...page, layers: [...page.layers, layer] }));
}

export function renameLayer(
  document: ScrawlDocument,
  layerId: string,
  name: string,
): ScrawlDocument {
  const nextName = name.trim();
  if (!nextName) return document;
  return updateActivePage(document, (page) => ({
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === layerId ? { ...layer, name: nextName } : layer,
    ),
  }));
}

export function updateLayer(
  document: ScrawlDocument,
  layerId: string,
  update: Partial<Pick<ScrawlLayer, 'visible' | 'locked'>>,
): ScrawlDocument {
  return updateActivePage(document, (page) => ({
    ...page,
    layers: page.layers.map((layer) => (layer.id === layerId ? { ...layer, ...update } : layer)),
  }));
}

export function reorderLayer(
  document: ScrawlDocument,
  layerId: string,
  direction: -1 | 1,
): ScrawlDocument {
  return updateActivePage(document, (page) => {
    const index = page.layers.findIndex((layer) => layer.id === layerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= page.layers.length) return page;
    const layers = [...page.layers];
    [layers[index], layers[target]] = [layers[target]!, layers[index]!];
    return { ...page, layers };
  });
}

export function moveElementsToLayer(
  document: ScrawlDocument,
  ids: ReadonlySet<string>,
  layerId: string,
): ScrawlDocument {
  return updateActivePage(document, (page) => {
    if (!page.layers.some((layer) => layer.id === layerId)) return page;
    return {
      ...page,
      elements: page.elements.map((element) =>
        ids.has(element.id) && element.layerId !== layerId
          ? { ...element, layerId, version: element.version + 1 }
          : element,
      ),
    };
  });
}

export function removeLayer(document: ScrawlDocument, layerId: string): ScrawlDocument {
  return updateActivePage(document, (page) => {
    if (page.layers.length === 1) return page;
    const layers = page.layers.filter((layer) => layer.id !== layerId);
    if (layers.length === page.layers.length) return page;
    const fallback = layers[0]!;
    return {
      ...page,
      layers,
      elements: page.elements.map((element) =>
        element.layerId === layerId
          ? { ...element, layerId: fallback.id, version: element.version + 1 }
          : element,
      ),
    };
  });
}

export function addPage(document: ScrawlDocument, name?: string): ScrawlDocument {
  const page: ScrawlPage = {
    id: createId(),
    name: name?.trim() || `Page ${document.pages.length + 1}`,
    layers: [{ id: DEFAULT_LAYER_ID, name: 'Default', visible: true, locked: false }],
    elements: [],
  };
  return { ...document, activePageId: page.id, pages: [...document.pages, page] };
}

export function renamePage(document: ScrawlDocument, pageId: string, name: string): ScrawlDocument {
  const nextName = name.trim();
  if (!nextName) return document;
  return {
    ...document,
    pages: document.pages.map((page) => (page.id === pageId ? { ...page, name: nextName } : page)),
  };
}

export function duplicatePage(document: ScrawlDocument, pageId: string): ScrawlDocument {
  const pageIndex = document.pages.findIndex((page) => page.id === pageId);
  if (pageIndex < 0) return document;
  const source = document.pages[pageIndex]!;
  const layerIds = new Map(source.layers.map((layer) => [layer.id, createId()] as const));
  const elementIds = new Map(source.elements.map((element) => [element.id, createId()] as const));
  const groupIds = new Map(
    source.elements
      .flatMap((element) => element.groupIds ?? [])
      .map((groupId) => [groupId, createId()] as const),
  );
  const elements = source.elements.map((element) => {
    const copy: AnyElement = {
      ...structuredClone(element),
      id: elementIds.get(element.id)!,
      layerId: layerIds.get(element.layerId) ?? DEFAULT_LAYER_ID,
      version: 1,
      ...(element.groupIds
        ? { groupIds: element.groupIds.map((groupId) => groupIds.get(groupId) ?? createId()) }
        : {}),
    };
    if (copy.type === 'line' || copy.type === 'arrow') {
      copy.startBinding = elementIds.has(copy.startBinding?.elementId ?? '')
        ? { elementId: elementIds.get(copy.startBinding!.elementId)! }
        : null;
      copy.endBinding = elementIds.has(copy.endBinding?.elementId ?? '')
        ? { elementId: elementIds.get(copy.endBinding!.elementId)! }
        : null;
    }
    return copy;
  });
  const page: ScrawlPage = {
    id: createId(),
    name: `${source.name} copy`,
    layers: source.layers.map((layer) => ({ ...layer, id: layerIds.get(layer.id)! })),
    elements,
  };
  const pages = [...document.pages];
  pages.splice(pageIndex + 1, 0, page);
  return { ...document, activePageId: page.id, pages };
}

export function reorderPage(
  document: ScrawlDocument,
  pageId: string,
  targetIndex: number,
): ScrawlDocument {
  const sourceIndex = document.pages.findIndex((page) => page.id === pageId);
  if (sourceIndex < 0) return document;
  const destination = Math.max(0, Math.min(Math.trunc(targetIndex), document.pages.length - 1));
  if (sourceIndex === destination) return document;
  const pages = [...document.pages];
  const [page] = pages.splice(sourceIndex, 1);
  pages.splice(destination, 0, page!);
  return { ...document, pages };
}

export function removePage(document: ScrawlDocument, pageId: string): ScrawlDocument {
  if (document.pages.length === 1) return document;
  const pageIndex = document.pages.findIndex((page) => page.id === pageId);
  if (pageIndex < 0) return document;
  const pages = document.pages.filter((page) => page.id !== pageId);
  const fallback = pages[Math.min(pageIndex, pages.length - 1)]!;
  return {
    ...document,
    pages,
    activePageId: document.activePageId === pageId ? fallback.id : document.activePageId,
  };
}
