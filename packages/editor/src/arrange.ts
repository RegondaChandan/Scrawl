import { getElementBounds, updateBoundConnectors } from '@scrawl/engine';
import {
  createDocument,
  createId,
  isLinear,
  maxOrder,
  parseDocument,
  type AnyElement,
  type Binding,
  type Box,
  type Point,
  type ScrawlAsset,
} from '@scrawl/schema';

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type Distribution = 'horizontal' | 'vertical';
export type OrderChange = 'back' | 'backward' | 'forward' | 'front';

interface CloneResult {
  elements: AnyElement[];
  selectedIds: string[];
}

const isSelected = (selectedIds: ReadonlySet<string>, element: AnyElement): boolean =>
  selectedIds.has(element.id);

function selectionBounds(elements: AnyElement[]): Box | null {
  if (elements.length === 0) return null;
  const boxes = elements.map(getElementBounds);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function moveElement(element: AnyElement, dx: number, dy: number): AnyElement {
  if (element.locked || (dx === 0 && dy === 0)) return element;
  return {
    ...element,
    x: element.x + dx,
    y: element.y + dy,
    version: element.version + 1,
  };
}

function bindingForClone(
  binding: Binding | null | undefined,
  idMap: ReadonlyMap<string, string>,
  existingIds: ReadonlySet<string>,
): Binding | null {
  if (!binding) return null;
  const mappedId = idMap.get(binding.elementId);
  if (mappedId) return { elementId: mappedId };
  return existingIds.has(binding.elementId) ? binding : null;
}

export function cloneElements(
  source: AnyElement[],
  existing: AnyElement[],
  offset: Point = { x: 20, y: 20 },
): CloneResult {
  const idMap = new Map(source.map((element) => [element.id, createId()]));
  const groupIds = new Set(source.flatMap((element) => element.groupIds ?? []));
  const groupMap = new Map([...groupIds].map((groupId) => [groupId, createId()]));
  const existingIds = new Set(existing.map((element) => element.id));
  const firstOrder = maxOrder(existing) + 1;

  const clones = source.map((element, index): AnyElement => {
    const groupIds = element.groupIds?.map((groupId) => groupMap.get(groupId) ?? groupId);
    const common = {
      id: idMap.get(element.id)!,
      x: element.x + offset.x,
      y: element.y + offset.y,
      order: firstOrder + index,
      seed: Math.floor(Math.random() * 2 ** 31) + 1,
      version: 1,
      ...(groupIds === undefined ? {} : { groupIds }),
    };
    if (isLinear(element)) {
      return {
        ...element,
        ...common,
        startBinding: bindingForClone(element.startBinding, idMap, existingIds),
        endBinding: bindingForClone(element.endBinding, idMap, existingIds),
      };
    }
    return { ...element, ...common };
  });

  return { elements: [...existing, ...clones], selectedIds: clones.map((element) => element.id) };
}

export function expandGroupedSelection(elements: AnyElement[], elementId: string): string[] {
  const element = elements.find((candidate) => candidate.id === elementId);
  const groupId = element?.groupIds?.at(-1);
  if (!element || !groupId) return element ? [element.id] : [];
  return elements
    .filter((candidate) => candidate.groupIds?.includes(groupId))
    .map((candidate) => candidate.id);
}

export function groupElements(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
): AnyElement[] {
  if (selectedIds.size < 2) return elements;
  const groupId = createId();
  return elements.map((element) => {
    if (!isSelected(selectedIds, element)) return element;
    return {
      ...element,
      groupIds: [...(element.groupIds ?? []), groupId],
      version: element.version + 1,
    };
  });
}

export function ungroupElements(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
): AnyElement[] {
  return elements.map((element) => {
    if (!isSelected(selectedIds, element) || !element.groupIds?.length) return element;
    const groupIds = element.groupIds.slice(0, -1);
    return {
      ...element,
      ...(groupIds.length > 0 ? { groupIds } : { groupIds: [] }),
      version: element.version + 1,
    };
  });
}

export function alignElements(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
  alignment: Alignment,
): AnyElement[] {
  const selected = elements.filter(
    (element) => isSelected(selectedIds, element) && !element.locked,
  );
  const bounds = selectionBounds(selected);
  if (!bounds || selected.length < 2) return elements;

  const moved = elements.map((element) => {
    if (!isSelected(selectedIds, element) || element.locked) return element;
    const box = getElementBounds(element);
    let dx = 0;
    let dy = 0;
    if (alignment === 'left') dx = bounds.x - box.x;
    if (alignment === 'center') dx = bounds.x + bounds.width / 2 - (box.x + box.width / 2);
    if (alignment === 'right') dx = bounds.x + bounds.width - (box.x + box.width);
    if (alignment === 'top') dy = bounds.y - box.y;
    if (alignment === 'middle') dy = bounds.y + bounds.height / 2 - (box.y + box.height / 2);
    if (alignment === 'bottom') dy = bounds.y + bounds.height - (box.y + box.height);
    return moveElement(element, dx, dy);
  });
  return updateBoundConnectors(moved, new Set(selectedIds));
}

export function distributeElements(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
  distribution: Distribution,
): AnyElement[] {
  const selected = elements
    .filter((element) => isSelected(selectedIds, element) && !element.locked)
    .map((element) => ({ element, box: getElementBounds(element) }))
    .toSorted((left, right) =>
      distribution === 'horizontal' ? left.box.x - right.box.x : left.box.y - right.box.y,
    );
  if (selected.length < 3) return elements;

  const first = selected[0]!.box;
  const last = selected.at(-1)!.box;
  const extent =
    distribution === 'horizontal' ? last.x + last.width - first.x : last.y + last.height - first.y;
  const occupied = selected.reduce(
    (total, item) => total + (distribution === 'horizontal' ? item.box.width : item.box.height),
    0,
  );
  const gap = (extent - occupied) / (selected.length - 1);
  const offsets = new Map<string, Point>();
  let cursor = distribution === 'horizontal' ? first.x : first.y;

  for (const item of selected) {
    const position = distribution === 'horizontal' ? item.box.x : item.box.y;
    offsets.set(item.element.id, {
      x: distribution === 'horizontal' ? cursor - position : 0,
      y: distribution === 'vertical' ? cursor - position : 0,
    });
    cursor += (distribution === 'horizontal' ? item.box.width : item.box.height) + gap;
  }

  const moved = elements.map((element) => {
    const offset = offsets.get(element.id);
    return offset ? moveElement(element, offset.x, offset.y) : element;
  });
  return updateBoundConnectors(moved, new Set(selectedIds));
}

export function reorderElements(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
  change: OrderChange,
): AnyElement[] {
  const ordered = elements.toSorted((left, right) => left.order - right.order);
  if (change === 'front') {
    ordered.sort(
      (left, right) =>
        Number(isSelected(selectedIds, left)) - Number(isSelected(selectedIds, right)),
    );
  } else if (change === 'back') {
    ordered.sort(
      (left, right) =>
        Number(isSelected(selectedIds, right)) - Number(isSelected(selectedIds, left)),
    );
  } else if (change === 'forward') {
    for (let index = ordered.length - 2; index >= 0; index -= 1) {
      if (
        isSelected(selectedIds, ordered[index]!) &&
        !isSelected(selectedIds, ordered[index + 1]!)
      ) {
        [ordered[index], ordered[index + 1]] = [ordered[index + 1]!, ordered[index]!];
      }
    }
  } else {
    for (let index = 1; index < ordered.length; index += 1) {
      if (
        isSelected(selectedIds, ordered[index]!) &&
        !isSelected(selectedIds, ordered[index - 1]!)
      ) {
        [ordered[index], ordered[index - 1]] = [ordered[index - 1]!, ordered[index]!];
      }
    }
  }

  const orders = new Map(ordered.map((element, index) => [element.id, index + 1]));
  return elements.map((element) => {
    const order = orders.get(element.id)!;
    return order === element.order ? element : { ...element, order, version: element.version + 1 };
  });
}

export function toggleElementLocks(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
): AnyElement[] {
  const selected = elements.filter((element) => isSelected(selectedIds, element));
  const locked = selected.some((element) => !element.locked);
  return elements.map((element) =>
    isSelected(selectedIds, element) && Boolean(element.locked) !== locked
      ? { ...element, locked, version: element.version + 1 }
      : element,
  );
}

export function nudgeElements(
  elements: AnyElement[],
  selectedIds: ReadonlySet<string>,
  offset: Point,
): AnyElement[] {
  const moved = elements.map((element) =>
    isSelected(selectedIds, element) ? moveElement(element, offset.x, offset.y) : element,
  );
  return updateBoundConnectors(moved, new Set(selectedIds));
}

export interface ScrawlClipboardPayload {
  elements: AnyElement[];
  assets: Record<string, ScrawlAsset>;
}

export type ScrawlClipboardParseResult =
  | { kind: 'scrawl'; payload: ScrawlClipboardPayload }
  | { kind: 'invalid-scrawl' }
  | { kind: 'text' };

export const MAX_SCRAWL_CLIPBOARD_BYTES = 48 * 1024 * 1024;

function clipboardElements(elements: AnyElement[]): AnyElement[] {
  const includedIds = new Set(elements.map((element) => element.id));
  return elements.map((element) => {
    if (!isLinear(element)) return element;
    return {
      ...element,
      startBinding:
        element.startBinding && includedIds.has(element.startBinding.elementId)
          ? element.startBinding
          : null,
      endBinding:
        element.endBinding && includedIds.has(element.endBinding.elementId)
          ? element.endBinding
          : null,
    };
  });
}

export function serializeClipboardElements(
  elements: AnyElement[],
  documentAssets: Readonly<Record<string, ScrawlAsset>> = {},
): string {
  const assetIds = new Set(
    elements.flatMap((element) => (element.type === 'image' ? [element.assetId] : [])),
  );
  const assets = Object.fromEntries(
    [...assetIds]
      .map((assetId) => documentAssets[assetId])
      .filter((asset): asset is ScrawlAsset => Boolean(asset))
      .map((asset) => [asset.id, asset] as const),
  );
  return JSON.stringify({
    type: 'scrawl/clipboard',
    version: 2,
    elements: clipboardElements(elements),
    assets,
  });
}

export function parseClipboardContent(value: string): ScrawlClipboardParseResult {
  const looksLikeScrawlClipboard = /"type"\s*:\s*"scrawl\/clipboard"/.test(value);
  try {
    if (
      value.length > MAX_SCRAWL_CLIPBOARD_BYTES ||
      new TextEncoder().encode(value).byteLength > MAX_SCRAWL_CLIPBOARD_BYTES
    ) {
      return looksLikeScrawlClipboard ? { kind: 'invalid-scrawl' } : { kind: 'text' };
    }
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { kind: 'text' };
    }
    const record = parsed as Record<string, unknown>;
    if (record.type !== 'scrawl/clipboard') return { kind: 'text' };
    if ((record.version !== 1 && record.version !== 2) || !Array.isArray(record.elements)) {
      return { kind: 'invalid-scrawl' };
    }
    const assets = record.version === 2 ? record.assets : {};
    const document = createDocument('Clipboard');
    const page = document.pages[0]!;
    const elements = record.elements.map((element) =>
      typeof element === 'object' && element !== null && !Array.isArray(element)
        ? { ...(element as Record<string, unknown>), layerId: page.layers[0]!.id }
        : element,
    );
    const validated = parseDocument({
      ...document,
      assets,
      pages: [{ ...page, elements }],
    });
    return {
      kind: 'scrawl',
      payload: {
        elements: validated.pages[0]!.elements,
        assets: validated.assets,
      },
    };
  } catch {
    return looksLikeScrawlClipboard ? { kind: 'invalid-scrawl' } : { kind: 'text' };
  }
}

export function parseClipboardElements(value: string): AnyElement[] | null {
  const result = parseClipboardContent(value);
  return result.kind === 'scrawl' ? result.payload.elements : null;
}
