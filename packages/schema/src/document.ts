import type { AnyElement, Binding, ElementBase, ElementType, ShapeKind } from './elements';
import { createId } from './elements';
import {
  MAX_DOCUMENT_ASSETS,
  MAX_DOCUMENT_COORDINATE,
  MAX_DOCUMENT_ELEMENTS,
  MAX_DOCUMENT_ELEMENT_SIZE,
  MAX_DOCUMENT_EMBEDDED_IMAGE_BYTES,
  MAX_DOCUMENT_IDENTIFIER_LENGTH,
  MAX_DOCUMENT_LAYERS,
  MAX_DOCUMENT_NAME_LENGTH,
  MAX_DOCUMENT_PAGES,
  MAX_DOCUMENT_POINTS,
  MAX_DOCUMENT_TEXT_LENGTH,
  MAX_ELEMENTS_PER_PAGE,
  MAX_ELEMENT_TEXT_LENGTH,
  MAX_EMBEDDED_IMAGE_BYTES,
  MAX_GROUP_IDS_PER_ELEMENT,
  MAX_LAYERS_PER_PAGE,
  MAX_POINTS_PER_ELEMENT,
} from './limits';
import type { ElementDefaults, FillStyle, StrokeStyle, StyleMode, TextAlign, Theme } from './style';
import { DEFAULT_ELEMENT_DEFAULTS, isFontKey } from './style';

export const SCHEMA_VERSION = 3 as const;
export const DEFAULT_LAYER_ID = 'default';
export const SUPPORTED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export interface ScrawlLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface ScrawlPage {
  id: string;
  name: string;
  layers: ScrawlLayer[];
  elements: AnyElement[];
}

export interface ScrawlAsset {
  id: string;
  mimeType: string;
  size: number;
  name?: string;
  data?: string;
}

export interface DocumentSettings {
  mode: StyleMode;
  theme: Theme;
  grid: boolean;
  snapToGrid: boolean;
  defaults: ElementDefaults;
}

export interface ScrawlDocument {
  type: 'scrawl';
  version: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  activePageId: string;
  pages: ScrawlPage[];
  assets: Record<string, ScrawlAsset>;
  settings: DocumentSettings;
}

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

export function createDocument(title = 'Untitled'): ScrawlDocument {
  const pageId = createId();
  return {
    type: 'scrawl',
    version: SCHEMA_VERSION,
    id: createId(),
    title,
    activePageId: pageId,
    pages: [
      {
        id: pageId,
        name: 'Page 1',
        layers: [{ id: DEFAULT_LAYER_ID, name: 'Default', visible: true, locked: false }],
        elements: [],
      },
    ],
    assets: {},
    settings: {
      mode: 'crisp',
      theme: 'light',
      grid: true,
      snapToGrid: false,
      defaults: { ...DEFAULT_ELEMENT_DEFAULTS },
    },
  };
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DocumentValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new DocumentValidationError(`${label} must be a string`);
  return value;
}

function asBoundedString(value: unknown, label: string, maximum: number): string {
  const parsed = asString(value, label);
  if (parsed.length > maximum) {
    throw new DocumentValidationError(`${label} is too long`);
  }
  return parsed;
}

function asIdentifier(value: unknown, label: string): string {
  const parsed = asBoundedString(value, label, MAX_DOCUMENT_IDENTIFIER_LENGTH);
  if (!parsed) throw new DocumentValidationError(`${label} must not be empty`);
  return parsed;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new DocumentValidationError(`${label} must be a boolean`);
  }
  return value;
}

function asFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DocumentValidationError(`${label} must be a finite number`);
  }
  return value;
}

function asNumberInRange(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = asFiniteNumber(value, label);
  if (parsed < minimum || parsed > maximum) {
    throw new DocumentValidationError(`${label} is outside the supported range`);
  }
  return parsed;
}

function asIntegerInRange(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = asNumberInRange(value, label, minimum, maximum);
  if (!Number.isSafeInteger(parsed)) {
    throw new DocumentValidationError(`${label} must be an integer`);
  }
  return parsed;
}

function asEnum<T extends string>(value: unknown, label: string, values: ReadonlySet<string>): T {
  const parsed = asString(value, label);
  if (!values.has(parsed)) {
    throw new DocumentValidationError(`${label} is not supported`);
  }
  return parsed as T;
}

const ELEMENT_TYPES: ReadonlySet<string> = new Set<ElementType>([
  'rectangle',
  'ellipse',
  'diamond',
  'shape',
  'icon',
  'image',
  'line',
  'arrow',
  'freedraw',
  'text',
  'sticky',
]);
const SHAPE_KINDS: ReadonlySet<string> = new Set<ShapeKind>([
  'terminator',
  'parallelogram',
  'trapezoid',
  'hexagon',
  'triangle',
  'cylinder',
  'queue',
  'document',
  'note',
  'package',
  'uml-class',
  'actor',
  'cloud',
  'server',
  'browser',
  'mobile',
  'user',
  'star',
]);
const FILL_STYLES: ReadonlySet<string> = new Set<FillStyle>(['hachure', 'cross-hatch', 'solid']);
const STROKE_STYLES: ReadonlySet<string> = new Set<StrokeStyle>(['solid', 'dashed', 'dotted']);
const STYLE_MODES: ReadonlySet<string> = new Set<StyleMode>(['crisp', 'rough']);
const TEXT_ALIGNS: ReadonlySet<string> = new Set<TextAlign>(['left', 'center', 'right']);
const ROUTING_STYLES: ReadonlySet<string> = new Set(['straight', 'elbow']);

interface DocumentBudget {
  points: number;
  textLength: number;
}

function addTextLength(budget: DocumentBudget, length: number): void {
  budget.textLength += length;
  if (budget.textLength > MAX_DOCUMENT_TEXT_LENGTH) {
    throw new DocumentValidationError('Document text exceeds the supported limit');
  }
}

function validateBinding(value: unknown, label: string): Binding | null {
  if (value === null) return null;
  const binding = asObject(value, label);
  return { elementId: asIdentifier(binding.elementId, `${label}.elementId`) };
}

function validatePoints(value: unknown, label: string, budget: DocumentBudget) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DocumentValidationError(`${label} must be a non-empty array`);
  }
  if (value.length > MAX_POINTS_PER_ELEMENT) {
    throw new DocumentValidationError(`${label} contains too many points`);
  }
  budget.points += value.length;
  if (budget.points > MAX_DOCUMENT_POINTS) {
    throw new DocumentValidationError('Document geometry contains too many points');
  }
  return value.map((point, pointIndex) => {
    const prefix = `${label}[${pointIndex}]`;
    const parsed = asObject(point, prefix);
    return {
      x: asNumberInRange(
        parsed.x,
        `${prefix}.x`,
        -MAX_DOCUMENT_COORDINATE,
        MAX_DOCUMENT_COORDINATE,
      ),
      y: asNumberInRange(
        parsed.y,
        `${prefix}.y`,
        -MAX_DOCUMENT_COORDINATE,
        MAX_DOCUMENT_COORDINATE,
      ),
    };
  });
}

function validateElement(
  value: unknown,
  pageIndex: number,
  elementIndex: number,
  budget: DocumentBudget,
): AnyElement {
  const prefix = `pages[${pageIndex}].elements[${elementIndex}]`;
  const raw = asObject(value, prefix);
  const type = asEnum<ElementType>(raw.type, `${prefix}.type`, ELEMENT_TYPES);
  const label =
    raw.label === undefined
      ? undefined
      : asBoundedString(raw.label, `${prefix}.label`, MAX_ELEMENT_TEXT_LENGTH);
  if (label !== undefined) addTextLength(budget, label.length);
  const fontFamily = raw.fontFamily === undefined ? undefined : raw.fontFamily;
  if (fontFamily !== undefined && !isFontKey(fontFamily)) {
    throw new DocumentValidationError(`${prefix}.fontFamily is not supported`);
  }
  let groupIds: string[] | undefined;
  if (raw.groupIds !== undefined) {
    if (!Array.isArray(raw.groupIds)) {
      throw new DocumentValidationError(`${prefix}.groupIds must be an array`);
    }
    if (raw.groupIds.length > MAX_GROUP_IDS_PER_ELEMENT) {
      throw new DocumentValidationError(`${prefix}.groupIds contains too many groups`);
    }
    groupIds = raw.groupIds.map((groupId, groupIndex) =>
      asIdentifier(groupId, `${prefix}.groupIds[${groupIndex}]`),
    );
    if (new Set(groupIds).size !== groupIds.length) {
      throw new DocumentValidationError(`${prefix}.groupIds contains duplicate groups`);
    }
  }
  const locked = raw.locked === undefined ? undefined : asBoolean(raw.locked, `${prefix}.locked`);
  const base: ElementBase = {
    id: asIdentifier(raw.id, `${prefix}.id`),
    layerId: asIdentifier(raw.layerId, `${prefix}.layerId`),
    x: asNumberInRange(raw.x, `${prefix}.x`, -MAX_DOCUMENT_COORDINATE, MAX_DOCUMENT_COORDINATE),
    y: asNumberInRange(raw.y, `${prefix}.y`, -MAX_DOCUMENT_COORDINATE, MAX_DOCUMENT_COORDINATE),
    width: asNumberInRange(raw.width, `${prefix}.width`, 0, MAX_DOCUMENT_ELEMENT_SIZE),
    height: asNumberInRange(raw.height, `${prefix}.height`, 0, MAX_DOCUMENT_ELEMENT_SIZE),
    angle: asNumberInRange(
      raw.angle,
      `${prefix}.angle`,
      -MAX_DOCUMENT_COORDINATE,
      MAX_DOCUMENT_COORDINATE,
    ),
    strokeColor: asBoundedString(raw.strokeColor, `${prefix}.strokeColor`, 100),
    backgroundColor: asBoundedString(raw.backgroundColor, `${prefix}.backgroundColor`, 100),
    fillStyle: asEnum<FillStyle>(raw.fillStyle, `${prefix}.fillStyle`, FILL_STYLES),
    strokeWidth: asNumberInRange(raw.strokeWidth, `${prefix}.strokeWidth`, 0, 1_000),
    strokeStyle: asEnum<StrokeStyle>(raw.strokeStyle, `${prefix}.strokeStyle`, STROKE_STYLES),
    roughness: asNumberInRange(raw.roughness, `${prefix}.roughness`, 0, 100),
    opacity: asNumberInRange(raw.opacity, `${prefix}.opacity`, 0, 1),
    renderStyle: asEnum<StyleMode>(raw.renderStyle, `${prefix}.renderStyle`, STYLE_MODES),
    seed: asIntegerInRange(raw.seed, `${prefix}.seed`, 0, 2 ** 32),
    version: asIntegerInRange(raw.version, `${prefix}.version`, 0, 1_000_000_000),
    order: asIntegerInRange(raw.order, `${prefix}.order`, -1_000_000_000, 1_000_000_000),
    ...(label === undefined ? {} : { label }),
    ...(fontFamily === undefined ? {} : { fontFamily }),
    ...(groupIds === undefined ? {} : { groupIds }),
    ...(locked === undefined ? {} : { locked }),
  };

  switch (type) {
    case 'rectangle':
      return {
        ...base,
        type,
        cornerRadius: asNumberInRange(
          raw.cornerRadius,
          `${prefix}.cornerRadius`,
          0,
          MAX_DOCUMENT_ELEMENT_SIZE,
        ),
      };
    case 'ellipse':
    case 'diamond':
      return { ...base, type };
    case 'shape':
      return {
        ...base,
        type,
        shapeKind: asEnum<ShapeKind>(raw.shapeKind, `${prefix}.shapeKind`, SHAPE_KINDS),
      };
    case 'icon':
      return {
        ...base,
        type,
        iconId: asBoundedString(raw.iconId, `${prefix}.iconId`, MAX_DOCUMENT_NAME_LENGTH),
      };
    case 'image':
      return {
        ...base,
        type,
        assetId: asIdentifier(raw.assetId, `${prefix}.assetId`),
        naturalWidth: asNumberInRange(
          raw.naturalWidth,
          `${prefix}.naturalWidth`,
          1,
          MAX_DOCUMENT_ELEMENT_SIZE,
        ),
        naturalHeight: asNumberInRange(
          raw.naturalHeight,
          `${prefix}.naturalHeight`,
          1,
          MAX_DOCUMENT_ELEMENT_SIZE,
        ),
      };
    case 'line':
    case 'arrow':
      return {
        ...base,
        type,
        points: validatePoints(raw.points, `${prefix}.points`, budget),
        startBinding:
          raw.startBinding === undefined
            ? null
            : validateBinding(raw.startBinding, `${prefix}.startBinding`),
        endBinding:
          raw.endBinding === undefined
            ? null
            : validateBinding(raw.endBinding, `${prefix}.endBinding`),
        routing:
          raw.routing === undefined
            ? 'straight'
            : asEnum(raw.routing, `${prefix}.routing`, ROUTING_STYLES),
        ...(raw.fixedPoints === undefined
          ? {}
          : { fixedPoints: asBoolean(raw.fixedPoints, `${prefix}.fixedPoints`) }),
      };
    case 'freedraw':
      return { ...base, type, points: validatePoints(raw.points, `${prefix}.points`, budget) };
    case 'text': {
      const text = asBoundedString(raw.text, `${prefix}.text`, MAX_ELEMENT_TEXT_LENGTH);
      addTextLength(budget, text.length);
      return {
        ...base,
        type,
        text,
        fontSize: asNumberInRange(raw.fontSize, `${prefix}.fontSize`, 1, 1_000),
        textAlign:
          raw.textAlign === undefined
            ? 'left'
            : asEnum<TextAlign>(raw.textAlign, `${prefix}.textAlign`, TEXT_ALIGNS),
      };
    }
    case 'sticky': {
      const text = asBoundedString(raw.text, `${prefix}.text`, MAX_ELEMENT_TEXT_LENGTH);
      addTextLength(budget, text.length);
      return {
        ...base,
        type,
        text,
        fontSize: asNumberInRange(raw.fontSize, `${prefix}.fontSize`, 1, 1_000),
      };
    }
  }
}

function migrateElement(value: unknown, assets: Record<string, ScrawlAsset>): AnyElement {
  const element = asObject(value, 'legacy element');
  if (element.type === 'image') {
    const { src, ...rest } = element;
    const id = typeof element.id === 'string' ? element.id : createId();
    const assetId = `legacy-${id}`;
    if (typeof src === 'string' && src.startsWith('data:')) {
      const mimeType = /^data:([^;,]+)/.exec(src)?.[1] ?? 'application/octet-stream';
      assets[assetId] = { id: assetId, mimeType, size: src.length, data: src };
    }
    return {
      ...rest,
      id,
      assetId,
      layerId: typeof element.layerId === 'string' ? element.layerId : DEFAULT_LAYER_ID,
    } as unknown as AnyElement;
  }
  return {
    ...element,
    layerId: typeof element.layerId === 'string' ? element.layerId : DEFAULT_LAYER_ID,
  } as unknown as AnyElement;
}

function migrateLegacy(root: Record<string, unknown>): ScrawlDocument | null {
  if (root.type !== 'scrawl' || (root.version !== 1 && root.version !== 2)) return null;

  const legacyPages =
    root.version === 1
      ? [
          {
            id: createId(),
            name: 'Page 1',
            elements: Array.isArray(root.elements) ? root.elements : [],
          },
        ]
      : Array.isArray(root.pages)
        ? root.pages
        : [];
  if (legacyPages.length === 0) throw new DocumentValidationError('Legacy document has no pages');

  const document = createDocument(
    typeof root.title === 'string' ? root.title : 'Imported document',
  );
  const assets: Record<string, ScrawlAsset> = {};
  document.pages = legacyPages.map((value, index) => {
    const page = asObject(value, `legacy pages[${index}]`);
    const elements = Array.isArray(page.elements)
      ? page.elements.map((element) => migrateElement(element, assets))
      : [];
    return {
      id: typeof page.id === 'string' ? page.id : createId(),
      name: typeof page.name === 'string' ? page.name : `Page ${index + 1}`,
      layers: [{ id: DEFAULT_LAYER_ID, name: 'Default', visible: true, locked: false }],
      elements,
    };
  });
  document.activePageId =
    typeof root.activePageId === 'string' ? root.activePageId : document.pages[0]!.id;
  document.assets = assets;
  document.settings.mode = root.mode === 'rough' ? 'rough' : 'crisp';
  return document;
}

function validateAssets(value: unknown): Record<string, ScrawlAsset> {
  const raw = asObject(value, 'assets');
  const entries = Object.entries(raw);
  if (entries.length > MAX_DOCUMENT_ASSETS) {
    throw new DocumentValidationError('Document contains too many assets');
  }
  let totalBytes = 0;
  return Object.fromEntries(
    entries.map(([key, value]) => {
      asIdentifier(key, `assets.${key}`);
      const asset = asObject(value, `assets.${key}`);
      const name =
        asset.name === undefined
          ? undefined
          : asBoundedString(asset.name, `assets.${key}.name`, MAX_DOCUMENT_NAME_LENGTH);
      const data =
        asset.data === undefined ? undefined : asString(asset.data, `assets.${key}.data`);
      const parsed: ScrawlAsset = {
        id: asIdentifier(asset.id, `assets.${key}.id`),
        mimeType: asBoundedString(asset.mimeType, `assets.${key}.mimeType`, 100),
        size: asIntegerInRange(asset.size, `assets.${key}.size`, 0, MAX_EMBEDDED_IMAGE_BYTES),
        ...(name === undefined ? {} : { name }),
        ...(data === undefined ? {} : { data }),
      };
      if (parsed.id !== key)
        throw new DocumentValidationError(`Asset key ${key} does not match its id`);
      if (!SUPPORTED_IMAGE_MIME_TYPES.has(parsed.mimeType)) {
        throw new DocumentValidationError(`Asset ${key} has an unsupported image type`);
      }
      if (parsed.data !== undefined && !parsed.data.startsWith(`data:${parsed.mimeType};base64,`)) {
        throw new DocumentValidationError(`Asset ${key} must contain embedded image data`);
      }
      let retainedBytes = parsed.size;
      if (parsed.data !== undefined) {
        const payload = parsed.data.slice(parsed.data.indexOf(',') + 1);
        const maximumEncodedLength = Math.ceil(MAX_EMBEDDED_IMAGE_BYTES / 3) * 4;
        if (
          payload.length === 0 ||
          payload.length > maximumEncodedLength ||
          payload.length % 4 !== 0 ||
          !/^[a-z0-9+/]*={0,2}$/i.test(payload)
        ) {
          throw new DocumentValidationError(`Asset ${key} contains invalid base64 image data`);
        }
        const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
        const decodedSize = Math.floor((payload.length * 3) / 4) - padding;
        if (decodedSize > MAX_EMBEDDED_IMAGE_BYTES) {
          throw new DocumentValidationError(`Asset ${key} exceeds the embedded image limit`);
        }
        retainedBytes = decodedSize;
      }
      totalBytes += retainedBytes;
      if (totalBytes > MAX_DOCUMENT_EMBEDDED_IMAGE_BYTES) {
        throw new DocumentValidationError('Document embedded images exceed the total size limit');
      }
      return [key, parsed];
    }),
  );
}

function validateDefaults(value: unknown): ElementDefaults {
  const defaults = asObject(value, 'settings.defaults');
  const fontFamily = defaults.fontFamily === undefined ? undefined : defaults.fontFamily;
  if (fontFamily !== undefined && !isFontKey(fontFamily)) {
    throw new DocumentValidationError('settings.defaults.fontFamily is not supported');
  }

  return {
    strokeColor: asBoundedString(defaults.strokeColor, 'settings.defaults.strokeColor', 100),
    backgroundColor: asBoundedString(
      defaults.backgroundColor,
      'settings.defaults.backgroundColor',
      100,
    ),
    fillStyle: asEnum<FillStyle>(defaults.fillStyle, 'settings.defaults.fillStyle', FILL_STYLES),
    strokeWidth: asNumberInRange(defaults.strokeWidth, 'settings.defaults.strokeWidth', 0, 1_000),
    strokeStyle: asEnum<StrokeStyle>(
      defaults.strokeStyle,
      'settings.defaults.strokeStyle',
      STROKE_STYLES,
    ),
    roughness: asNumberInRange(defaults.roughness, 'settings.defaults.roughness', 0, 100),
    opacity: asNumberInRange(defaults.opacity, 'settings.defaults.opacity', 0, 1),
    fontSize: asNumberInRange(defaults.fontSize, 'settings.defaults.fontSize', 1, 1_000),
    ...(fontFamily === undefined ? {} : { fontFamily }),
  };
}

export function parseDocument(value: unknown): ScrawlDocument {
  const root = asObject(value, 'document');
  const migrated = migrateLegacy(root);
  if (migrated) return parseDocument(migrated);

  if (root.type !== 'scrawl') throw new DocumentValidationError('Unsupported document type');
  if (root.version !== SCHEMA_VERSION) {
    throw new DocumentValidationError(`Unsupported document version: ${String(root.version)}`);
  }
  if (!Array.isArray(root.pages) || root.pages.length === 0) {
    throw new DocumentValidationError('Document must contain at least one page');
  }
  if (root.pages.length > MAX_DOCUMENT_PAGES) {
    throw new DocumentValidationError(`Document contains more than ${MAX_DOCUMENT_PAGES} pages`);
  }

  const rawPages = root.pages.map((value, pageIndex) => asObject(value, `pages[${pageIndex}]`));
  let totalLayers = 0;
  let totalElements = 0;
  for (const [pageIndex, page] of rawPages.entries()) {
    if (!Array.isArray(page.layers) || page.layers.length === 0) {
      throw new DocumentValidationError(`pages[${pageIndex}] must contain a layer`);
    }
    if (page.layers.length > MAX_LAYERS_PER_PAGE) {
      throw new DocumentValidationError(`pages[${pageIndex}] contains too many layers`);
    }
    if (!Array.isArray(page.elements)) {
      throw new DocumentValidationError(`pages[${pageIndex}].elements must be an array`);
    }
    if (page.elements.length > MAX_ELEMENTS_PER_PAGE) {
      throw new DocumentValidationError(`pages[${pageIndex}] contains too many elements`);
    }
    totalLayers += page.layers.length;
    totalElements += page.elements.length;
  }
  if (totalLayers > MAX_DOCUMENT_LAYERS) {
    throw new DocumentValidationError('Document contains too many layers');
  }
  if (totalElements > MAX_DOCUMENT_ELEMENTS) {
    throw new DocumentValidationError('Document contains too many elements');
  }

  const assets = validateAssets(root.assets);
  const budget: DocumentBudget = { points: 0, textLength: 0 };
  const pageIds = new Set<string>();
  const elementIds = new Set<string>();

  const pages = rawPages.map((page, pageIndex): ScrawlPage => {
    const pageId = asIdentifier(page.id, `pages[${pageIndex}].id`);
    if (pageIds.has(pageId)) {
      throw new DocumentValidationError(`Duplicate page id: ${pageId}`);
    }
    pageIds.add(pageId);
    const layerIds = new Set<string>();
    const layerValues = page.layers as unknown[];
    const elementValues = page.elements as unknown[];
    const layers = layerValues.map((value, layerIndex): ScrawlLayer => {
      const layer = asObject(value, `pages[${pageIndex}].layers[${layerIndex}]`);
      const layerId = asIdentifier(layer.id, `pages[${pageIndex}].layers[${layerIndex}].id`);
      if (layerIds.has(layerId)) {
        throw new DocumentValidationError(`Duplicate layer id on page ${pageId}: ${layerId}`);
      }
      layerIds.add(layerId);
      return {
        id: layerId,
        name: asBoundedString(
          layer.name,
          `pages[${pageIndex}].layers[${layerIndex}].name`,
          MAX_DOCUMENT_NAME_LENGTH,
        ),
        visible: asBoolean(layer.visible, `pages[${pageIndex}].layers[${layerIndex}].visible`),
        locked: asBoolean(layer.locked, `pages[${pageIndex}].layers[${layerIndex}].locked`),
      };
    });
    const elements = elementValues.map((element, elementIndex) =>
      validateElement(element, pageIndex, elementIndex, budget),
    );
    const pageElementIds = new Set<string>();
    for (const element of elements) {
      if (elementIds.has(element.id)) {
        throw new DocumentValidationError(`Duplicate element id: ${element.id}`);
      }
      elementIds.add(element.id);
      pageElementIds.add(element.id);
      if (!layerIds.has(element.layerId)) {
        throw new DocumentValidationError(`Element ${element.id} references a missing layer`);
      }
      if (element.type === 'image' && !assets[element.assetId]) {
        throw new DocumentValidationError(`Element ${element.id} references a missing asset`);
      }
    }
    for (const element of elements) {
      if (element.type !== 'line' && element.type !== 'arrow') continue;
      for (const binding of [element.startBinding, element.endBinding]) {
        if (binding && !pageElementIds.has(binding.elementId)) {
          throw new DocumentValidationError(
            `Element ${element.id} references a missing binding target`,
          );
        }
      }
    }
    return {
      id: pageId,
      name: asBoundedString(page.name, `pages[${pageIndex}].name`, MAX_DOCUMENT_NAME_LENGTH),
      layers,
      elements,
    };
  });

  const activePageId = asIdentifier(root.activePageId, 'activePageId');
  if (!pages.some((page) => page.id === activePageId)) {
    throw new DocumentValidationError('activePageId does not reference a page');
  }
  const settings = asObject(root.settings, 'settings');

  return {
    type: 'scrawl',
    version: SCHEMA_VERSION,
    id: asIdentifier(root.id, 'id'),
    title: asBoundedString(root.title, 'title', MAX_DOCUMENT_NAME_LENGTH),
    activePageId,
    pages,
    assets,
    settings: {
      mode: asEnum<StyleMode>(settings.mode, 'settings.mode', STYLE_MODES),
      theme: asEnum<Theme>(settings.theme, 'settings.theme', new Set(['light', 'dark'])),
      grid: asBoolean(settings.grid, 'settings.grid'),
      snapToGrid: asBoolean(settings.snapToGrid, 'settings.snapToGrid'),
      defaults: validateDefaults(settings.defaults),
    },
  };
}

export function serializeDocument(document: ScrawlDocument): string {
  return `${JSON.stringify(parseDocument(document), null, 2)}\n`;
}

export type LegacyElementBase = Omit<ElementBase, 'layerId'> & { layerId?: string };
