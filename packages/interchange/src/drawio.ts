import { Inflate, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { routeConnector } from '@scrawl/engine';
import {
  DEFAULT_LAYER_ID,
  MAX_EMBEDDED_IMAGE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
  createDocument,
  createElement,
  createId,
  parseDocument,
  type AnyElement,
  type CreateElementProps,
  type FontKey,
  type LinearElement,
  type Point,
  type ScrawlAsset,
  type ScrawlDocument,
  type ScrawlLayer,
  type ScrawlPage,
  type ShapeKind,
  type StrokeStyle,
  type TextAlign,
} from '@scrawl/schema';
import {
  MAX_DRAWIO_CELLS,
  MAX_DRAWIO_FILE_BYTES,
  MAX_DRAWIO_PAGE_BYTES,
  MAX_DRAWIO_PAGES,
  MAX_DRAWIO_PARENT_DEPTH,
  MAX_DRAWIO_TEXT_LENGTH,
  MAX_DRAWIO_TOTAL_ASSETS,
  MAX_DRAWIO_TOTAL_CELLS,
  MAX_DRAWIO_TOTAL_ELEMENTS,
  MAX_DRAWIO_TOTAL_EMBEDDED_IMAGE_BYTES,
  MAX_DRAWIO_TOTAL_XML_BYTES,
  MAX_DRAWIO_TOTAL_XML_NODES,
  MAX_DRAWIO_XML_DEPTH,
  MAX_DRAWIO_XML_NODES,
} from './limits';

const MAX_DRAWIO_LABEL_SOURCE_LENGTH = 100_000;
const MAX_DRAWIO_COORDINATE = 1_000_000;
const MAX_DRAWIO_ELEMENT_SIZE = 100_000;
const INFLATE_INPUT_CHUNK_BYTES = 256;

export type DrawioIssueCode =
  | 'bidirectional-connector'
  | 'external-image-blocked'
  | 'invalid-embedded-image'
  | 'geometry-clamped'
  | 'missing-geometry'
  | 'missing-connector-endpoints'
  | 'relative-child-skipped'
  | 'text-truncated'
  | 'unsupported-shape';

export interface DrawioImportIssue {
  code: DrawioIssueCode;
  message: string;
  pageName: string;
  cellId?: string;
}

export interface DrawioPageSummary {
  name: string;
  importedElements: number;
  skippedElements: number;
  approximatedElements: number;
}

export interface DrawioImportReport {
  importedPages: number;
  importedElements: number;
  skippedElements: number;
  approximatedElements: number;
  pages: DrawioPageSummary[];
  issues: DrawioImportIssue[];
}

export interface DrawioImportResult {
  document: ScrawlDocument;
  report: DrawioImportReport;
}

export interface DrawioImportOptions {
  title?: string;
}

export class DrawioImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawioImportError';
  }
}

type XmlNode = Record<string, unknown>;

interface RawPage {
  name: string;
  model: XmlNode;
}

interface RawCell {
  node: XmlNode;
  wrapperLabel?: string;
}

interface PageContext {
  pageName: string;
  issues: DrawioImportIssue[];
  importedElements: number;
  skippedElements: number;
  approximatedElements: number;
}

interface ParsedStyle {
  values: Map<string, string>;
  flags: Set<string>;
}

type MappedShape =
  | { type: 'rectangle' }
  | { type: 'ellipse' }
  | { type: 'diamond' }
  | { type: 'shape'; shapeKind: ShapeKind };

interface PageCells {
  cells: RawCell[];
  byId: Map<string, RawCell>;
  layerByCellId: Map<string, ScrawlLayer>;
  layers: ScrawlLayer[];
}

interface ImportBudget {
  xmlBytes: number;
  xmlNodes: number;
  cells: number;
  elements: number;
  assets: number;
  assetBytes: number;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  allowBooleanAttributes: true,
});

function asNode(value: unknown): XmlNode | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as XmlNode)
    : null;
}

function asList(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function nodeText(value: unknown): string {
  if (typeof value === 'string') return value;
  const node = asNode(value);
  return node ? stringValue(node['#text']) : '';
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(stringValue(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code: string) => {
      const radix = code[0]?.toLowerCase() === 'x' ? 16 : 10;
      const numeric = Number.parseInt(radix === 16 ? code.slice(1) : code, radix);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0x10ffff) return match;
      return String.fromCodePoint(numeric);
    })
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function plainText(value: string): string {
  const decoded = decodeXmlEntities(value);
  return decodeXmlEntities(
    decoded
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<li(?:\s[^>]*)?>/gi, '• ')
      .replace(/<\/(?:div|p|li)>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function limitedPlainText(value: string): { text: string; truncated: boolean } {
  const source = value.slice(0, MAX_DRAWIO_LABEL_SOURCE_LENGTH);
  const decoded = plainText(source);
  return {
    text: decoded.slice(0, MAX_DRAWIO_TEXT_LENGTH),
    truncated:
      value.length > MAX_DRAWIO_LABEL_SOURCE_LENGTH || decoded.length > MAX_DRAWIO_TEXT_LENGTH,
  };
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function validateXmlComplexity(source: string, label: string): number {
  let depth = 0;
  let nodes = 0;
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', start)) {
      const end = source.indexOf(']]>', start + 9);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<?', start)) {
      const end = source.indexOf('?>', start + 2);
      cursor = end < 0 ? source.length : end + 2;
      continue;
    }

    let quote = '';
    let end = start + 1;
    for (; end < source.length; end += 1) {
      const character = source[end]!;
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
    }
    if (end >= source.length) break;

    const token = source.slice(start + 1, end).trim();
    if (token && !token.startsWith('!')) {
      const closing = token.startsWith('/');
      const selfClosing = token.endsWith('/');
      if (closing) {
        depth = Math.max(0, depth - 1);
      } else {
        nodes += 1;
        if (nodes > MAX_DRAWIO_XML_NODES) {
          throw new DrawioImportError(`${label} contains too many XML nodes.`);
        }
        if (!selfClosing) {
          depth += 1;
          if (depth > MAX_DRAWIO_XML_DEPTH) {
            throw new DrawioImportError(`${label} is nested too deeply.`);
          }
        }
      }
    }
    cursor = end + 1;
  }
  return nodes;
}

function validateXml(source: string, label: string, limit: number, budget: ImportBudget): void {
  const byteLength = new Blob([source]).size;
  if (byteLength > limit) {
    throw new DrawioImportError(`${label} exceeds the supported size limit.`);
  }
  budget.xmlBytes += byteLength;
  if (budget.xmlBytes > MAX_DRAWIO_TOTAL_XML_BYTES) {
    throw new DrawioImportError('The draw.io document exceeds the total XML size limit.');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new DrawioImportError(`${label} contains a document type or entity declaration.`);
  }
  const nodeCount = validateXmlComplexity(source, label);
  budget.xmlNodes += nodeCount;
  if (budget.xmlNodes > MAX_DRAWIO_TOTAL_XML_NODES) {
    throw new DrawioImportError('The draw.io document contains too many XML nodes.');
  }
  const validation = XMLValidator.validate(source, { allowBooleanAttributes: true });
  if (validation !== true) {
    throw new DrawioImportError(`${label} is not valid XML: ${validation.err.msg}`);
  }
}

function parseXml(source: string, label: string, limit: number, budget: ImportBudget): XmlNode {
  validateXml(source, label, limit, budget);
  const parsed = asNode(xmlParser.parse(source) as unknown);
  if (!parsed) throw new DrawioImportError(`${label} does not contain an XML document.`);
  return parsed;
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, '');
  if (!/^[a-z0-9+/]*={0,2}$/i.test(normalized)) {
    throw new DrawioImportError('A compressed draw.io page contains invalid base64 data.');
  }
  try {
    const binary = atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new DrawioImportError('A compressed draw.io page could not be decoded.');
  }
}

function decodeDiagram(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('<')) return trimmed;
  try {
    const compressed = decodeBase64(trimmed);
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    const inflator = new Inflate((chunk) => {
      byteLength += chunk.byteLength;
      if (byteLength > MAX_DRAWIO_PAGE_BYTES) {
        throw new DrawioImportError(
          'A decompressed draw.io page exceeds the supported size limit.',
        );
      }
      chunks.push(chunk);
    });
    for (let offset = 0; offset < compressed.byteLength; offset += INFLATE_INPUT_CHUNK_BYTES) {
      const end = Math.min(offset + INFLATE_INPUT_CHUNK_BYTES, compressed.byteLength);
      inflator.push(compressed.subarray(offset, end), end === compressed.byteLength);
    }
    const inflated = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      inflated.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return safeDecodeUri(strFromU8(inflated));
  } catch (error) {
    if (error instanceof DrawioImportError) throw error;
    throw new DrawioImportError('A compressed draw.io page could not be decompressed.');
  }
}

function modelFromParsed(value: XmlNode, label: string): XmlNode {
  const model = asNode(value.mxGraphModel);
  if (!model) throw new DrawioImportError(`${label} does not contain an mxGraphModel.`);
  return model;
}

function readPages(source: string, budget: ImportBudget): RawPage[] {
  const parsed = parseXml(source, 'The draw.io file', MAX_DRAWIO_FILE_BYTES, budget);
  const directModel = asNode(parsed.mxGraphModel);
  if (directModel) return [{ name: 'Page 1', model: directModel }];

  const file = asNode(parsed.mxfile);
  if (!file) throw new DrawioImportError('The file is not a supported draw.io document.');
  const diagrams = asList(file.diagram);
  if (diagrams.length === 0) throw new DrawioImportError('The draw.io document has no pages.');
  if (diagrams.length > MAX_DRAWIO_PAGES) {
    throw new DrawioImportError(
      `The draw.io document contains more than ${MAX_DRAWIO_PAGES} pages.`,
    );
  }

  return diagrams.map((value, index) => {
    const diagram = asNode(value);
    const name = limitedPlainText(stringValue(diagram?.name)).text || `Page ${index + 1}`;
    const inlineModel = diagram ? asNode(diagram.mxGraphModel) : null;
    if (inlineModel) return { name, model: inlineModel };

    const encoded = nodeText(value);
    if (!encoded) throw new DrawioImportError(`${name} does not contain diagram data.`);
    const decoded = decodeDiagram(encoded);
    const pageXml = parseXml(decoded, name, MAX_DRAWIO_PAGE_BYTES, budget);
    return { name, model: modelFromParsed(pageXml, name) };
  });
}

function parseStyle(value: unknown): ParsedStyle {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const tokens = stringValue(value).split(';');
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!.trim();
    if (!token) continue;
    const equals = token.indexOf('=');
    if (equals < 0) {
      flags.add(token.toLowerCase());
      continue;
    }
    const key = token.slice(0, equals).trim().toLowerCase();
    let styleValue = token.slice(equals + 1).trim();
    if (key === 'image' && styleValue.toLowerCase().startsWith('data:')) {
      const next = tokens[index + 1]?.trim();
      if (next?.toLowerCase().startsWith('base64,')) {
        styleValue += `;${next}`;
        index += 1;
      }
    }
    values.set(key, styleValue);
  }
  return { values, flags };
}

function cellId(cell: RawCell): string {
  return stringValue(cell.node.id);
}

function cellLabel(cell: RawCell): string {
  return cellLabelDetails(cell).text;
}

function cellLabelDetails(cell: RawCell): { text: string; truncated: boolean } {
  return limitedPlainText(cell.wrapperLabel ?? stringValue(cell.node.value));
}

function collectCells(root: XmlNode): RawCell[] {
  const cells: RawCell[] = [];
  for (const value of asList(root.mxCell)) {
    const node = asNode(value);
    if (node) cells.push({ node });
  }
  for (const key of ['object', 'UserObject']) {
    for (const value of asList(root[key])) {
      const wrapper = asNode(value);
      if (!wrapper) continue;
      const label = stringValue(wrapper.label || wrapper.value);
      for (const cellValue of asList(wrapper.mxCell)) {
        const node = asNode(cellValue);
        if (node) cells.push({ node, ...(label ? { wrapperLabel: label } : {}) });
      }
    }
  }
  return cells;
}

function buildPageCells(model: XmlNode, pageName: string, budget: ImportBudget): PageCells {
  const root = asNode(model.root);
  if (!root) throw new DrawioImportError(`${pageName} does not contain a cell root.`);
  const cells = collectCells(root);
  if (cells.length > MAX_DRAWIO_CELLS) {
    throw new DrawioImportError(`${pageName} contains more than ${MAX_DRAWIO_CELLS} cells.`);
  }
  budget.cells += cells.length;
  if (budget.cells > MAX_DRAWIO_TOTAL_CELLS) {
    throw new DrawioImportError('The draw.io document contains too many cells in total.');
  }
  const byId = new Map(cells.map((cell) => [cellId(cell), cell] as const).filter(([id]) => id));
  for (const cell of cells) {
    let parentId = stringValue(cell.node.parent);
    const visited = new Set<string>();
    while (parentId && byId.has(parentId)) {
      if (visited.has(parentId)) {
        throw new DrawioImportError(`${pageName} contains a cyclic parent relationship.`);
      }
      visited.add(parentId);
      if (visited.size > MAX_DRAWIO_PARENT_DEPTH) {
        throw new DrawioImportError(`${pageName} contains an excessively deep parent chain.`);
      }
      parentId = stringValue(byId.get(parentId)?.node.parent);
    }
  }
  const layerCells = cells.filter((cell) => {
    const node = cell.node;
    return stringValue(node.parent) === '0' && node.vertex !== '1' && node.edge !== '1';
  });
  const layers =
    layerCells.length > 0
      ? layerCells.map((cell, index): ScrawlLayer => ({
          id: createId(),
          name: cellLabel(cell) || `Layer ${index + 1}`,
          visible: stringValue(cell.node.visible) !== '0',
          locked: stringValue(cell.node.locked) === '1',
        }))
      : [{ id: DEFAULT_LAYER_ID, name: 'Default', visible: true, locked: false }];
  const layerByCellId = new Map(
    layerCells.map((cell, index) => [cellId(cell), layers[index]!] as const),
  );
  return { cells, byId, layers, layerByCellId };
}

function resolveLayer(cell: RawCell, page: PageCells): ScrawlLayer {
  let parentId = stringValue(cell.node.parent);
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const layer = page.layerByCellId.get(parentId);
    if (layer) return layer;
    const parent = page.byId.get(parentId);
    parentId = parent ? stringValue(parent.node.parent) : '';
  }
  return page.layers[0]!;
}

function geometryFor(cell: RawCell): XmlNode | null {
  return asNode(cell.node.mxGeometry);
}

function absoluteVertexPosition(
  cell: RawCell,
  page: PageCells,
): { point: Point; clamped: boolean } {
  const geometry = geometryFor(cell);
  let x = finiteNumber(geometry?.x);
  let y = finiteNumber(geometry?.y);
  let parentId = stringValue(cell.node.parent);
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId) && !page.layerByCellId.has(parentId)) {
    visited.add(parentId);
    const parent = page.byId.get(parentId);
    if (!parent) break;
    const parentStyle = parseStyle(parent.node.style);
    if (parentStyle.flags.has('group') || parentStyle.values.get('group') === '1') {
      const parentGeometry = geometryFor(parent);
      x += finiteNumber(parentGeometry?.x);
      y += finiteNumber(parentGeometry?.y);
    }
    parentId = stringValue(parent.node.parent);
  }
  const point = {
    x: clamp(x, -MAX_DRAWIO_COORDINATE, MAX_DRAWIO_COORDINATE),
    y: clamp(y, -MAX_DRAWIO_COORDINATE, MAX_DRAWIO_COORDINATE),
  };
  return { point, clamped: point.x !== x || point.y !== y };
}

function addIssue(
  context: PageContext,
  cell: RawCell,
  code: DrawioIssueCode,
  message: string,
  approximation = false,
): void {
  context.issues.push({
    code,
    message,
    pageName: context.pageName,
    ...(cellId(cell) ? { cellId: cellId(cell) } : {}),
  });
  if (approximation) context.approximatedElements += 1;
}

function normalizedColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (value.toLowerCase() === 'none') return 'transparent';
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function strokeStyle(style: ParsedStyle): StrokeStyle {
  if (style.values.get('dashed') !== '1') return 'solid';
  return style.values.get('dashpattern')?.trim().startsWith('1 ') ? 'dotted' : 'dashed';
}

function fontFamily(style: ParsedStyle): FontKey | undefined {
  const family = style.values.get('fontfamily')?.toLowerCase() ?? '';
  if (/space\s*grotesk/.test(family)) return 'space-grotesk';
  if (/ibm\s*plex\s*mono/.test(family)) return 'ibm-plex-mono';
  if (/caveat/.test(family)) return 'caveat';
  if (/kalam/.test(family)) return 'kalam';
  if (/courier|mono|consolas/.test(family)) return 'mono';
  if (/comic|hand|cursive/.test(family)) return 'hand';
  if (/marker/.test(family)) return 'marker';
  return family ? 'clean' : undefined;
}

function textAlign(style: ParsedStyle): TextAlign {
  const align = style.values.get('align');
  return align === 'left' || align === 'right' ? align : 'center';
}

function shapeFromStyle(style: ParsedStyle): MappedShape | null {
  const shape = (style.values.get('shape') ?? '').toLowerCase();
  if (style.flags.has('ellipse') || shape.includes('ellipse') || shape.includes('usecase')) {
    return { type: 'ellipse' };
  }
  if (style.flags.has('rhombus') || shape.includes('rhombus') || shape.includes('decision')) {
    return { type: 'diamond' };
  }
  const kinds: Array<[RegExp, ShapeKind]> = [
    [/terminator|start.*end/, 'terminator'],
    [/parallelogram|data/, 'parallelogram'],
    [/trapezoid|manualoperation/, 'trapezoid'],
    [/hexagon|preparation/, 'hexagon'],
    [/triangle/, 'triangle'],
    [/cylinder|database|datastore/, 'cylinder'],
    [/queue/, 'queue'],
    [/document/, 'document'],
    [/note/, 'note'],
    [/package/, 'package'],
    [/umlclass|uml\.class|class2/, 'uml-class'],
    [/umlactor|actor/, 'actor'],
    [/cloud/, 'cloud'],
    [/server/, 'server'],
    [/browser/, 'browser'],
    [/mobile|phone/, 'mobile'],
    [/user|person/, 'user'],
    [/star/, 'star'],
  ];
  for (const [pattern, shapeKind] of kinds) {
    if (pattern.test(shape)) return { type: 'shape', shapeKind };
  }
  if (
    !shape ||
    shape === 'rectangle' ||
    shape === 'process' ||
    shape === 'partialrectangle' ||
    shape === 'swimlane'
  ) {
    return { type: 'rectangle' };
  }
  return null;
}

function isTextCell(style: ParsedStyle): boolean {
  const shape = style.values.get('shape')?.toLowerCase();
  return style.flags.has('text') || shape === 'text' || style.values.get('text') === '1';
}

function commonProps(
  cell: RawCell,
  style: ParsedStyle,
  layerId: string,
  order: number,
  groupIds: string[],
  context: PageContext,
): Omit<CreateElementProps, 'x' | 'y'> {
  const label = cellLabelDetails(cell);
  if (label.truncated) {
    addIssue(context, cell, 'text-truncated', 'Text longer than the import limit was truncated.');
  }
  const family = fontFamily(style);
  return {
    width: 0,
    height: 0,
    layerId,
    order,
    angle: (clamp(finiteNumber(style.values.get('rotation')), -36_000, 36_000) * Math.PI) / 180,
    strokeColor: normalizedColor(style.values.get('strokecolor'), '#2b2a26'),
    backgroundColor: normalizedColor(style.values.get('fillcolor'), 'transparent'),
    fillStyle: 'solid',
    strokeWidth: clamp(finiteNumber(style.values.get('strokewidth'), 1.5), 0.5, 20),
    strokeStyle: strokeStyle(style),
    roughness: 0,
    opacity: clamp(finiteNumber(style.values.get('opacity'), 100) / 100, 0, 1),
    renderStyle: 'crisp',
    ...(label.text ? { label: label.text } : {}),
    ...(family ? { fontFamily: family } : {}),
    ...(groupIds.length > 0 ? { groupIds } : {}),
    ...(style.values.get('locked') === '1' ? { locked: true } : {}),
  };
}

function embeddedImage(source: string): { asset: ScrawlAsset; source: string } | null {
  const decoded = safeDecodeUri(decodeXmlEntities(source));
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(decoded);
  if (!match) return null;
  const mimeType = match[1]!.toLowerCase();
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) return null;
  const data = `${decoded.slice(0, decoded.indexOf(',') + 1)}${match[2]!.replace(/\s+/g, '')}`;
  const size = Math.floor((match[2]!.replace(/\s+/g, '').length * 3) / 4);
  if (size > MAX_EMBEDDED_IMAGE_BYTES) return null;
  const id = createId();
  return { asset: { id, mimeType, size, data }, source: data };
}

function groupIdsForCell(
  cell: RawCell,
  page: PageCells,
  groupByCellId: Map<string, string>,
): string[] {
  const groups: string[] = [];
  let parentId = stringValue(cell.node.parent);
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const groupId = groupByCellId.get(parentId);
    if (groupId) groups.unshift(groupId);
    const parent = page.byId.get(parentId);
    parentId = parent ? stringValue(parent.node.parent) : '';
  }
  return groups;
}

function convertVertex(
  cell: RawCell,
  page: PageCells,
  context: PageContext,
  order: number,
  groupByCellId: Map<string, string>,
  assets: Record<string, ScrawlAsset>,
  budget: ImportBudget,
): AnyElement | null {
  const geometry = geometryFor(cell);
  if (!geometry) {
    context.skippedElements += 1;
    addIssue(context, cell, 'missing-geometry', 'An object without geometry was skipped.');
    return null;
  }
  const style = parseStyle(cell.node.style);
  if (style.flags.has('group') || style.values.get('group') === '1') return null;

  const parent = page.byId.get(stringValue(cell.node.parent));
  if (
    stringValue(geometry.relative) === '1' &&
    parent?.node.vertex === '1' &&
    !groupByCellId.has(cellId(parent))
  ) {
    context.skippedElements += 1;
    addIssue(context, cell, 'relative-child-skipped', 'A relative child object was skipped.');
    return null;
  }

  const positionResult = absoluteVertexPosition(cell, page);
  const position = positionResult.point;
  const rawWidth = finiteNumber(geometry.width, isTextCell(style) ? 120 : 80);
  const rawHeight = finiteNumber(geometry.height, isTextCell(style) ? 30 : 60);
  const width = clamp(rawWidth, 1, MAX_DRAWIO_ELEMENT_SIZE);
  const height = clamp(rawHeight, 1, MAX_DRAWIO_ELEMENT_SIZE);
  if (positionResult.clamped || width !== rawWidth || height !== rawHeight) {
    addIssue(
      context,
      cell,
      'geometry-clamped',
      'Extreme object geometry was limited to a safe editable range.',
      true,
    );
  }
  const layer = resolveLayer(cell, page);
  const groups = groupIdsForCell(cell, page, groupByCellId);
  const base = commonProps(cell, style, layer.id, order, groups, context);

  const imageSource = style.values.get('image');
  if (imageSource || style.values.get('shape')?.toLowerCase() === 'image') {
    const localImage = imageSource ? embeddedImage(imageSource) : null;
    if (localImage) {
      budget.assets += 1;
      budget.assetBytes += localImage.asset.size;
      if (budget.assets > MAX_DRAWIO_TOTAL_ASSETS) {
        throw new DrawioImportError('The draw.io document contains too many embedded images.');
      }
      if (budget.assetBytes > MAX_DRAWIO_TOTAL_EMBEDDED_IMAGE_BYTES) {
        throw new DrawioImportError(
          'The draw.io document exceeds the total embedded image size limit.',
        );
      }
      assets[localImage.asset.id] = localImage.asset;
      context.importedElements += 1;
      return createElement('image', {
        ...base,
        x: position.x,
        y: position.y,
        width,
        height,
        assetId: localImage.asset.id,
        naturalWidth: width,
        naturalHeight: height,
      });
    }
    const remote = imageSource && /^https?:/i.test(safeDecodeUri(imageSource));
    addIssue(
      context,
      cell,
      remote ? 'external-image-blocked' : 'invalid-embedded-image',
      remote
        ? 'An external image was replaced with a local placeholder.'
        : 'An unsupported embedded image was replaced with a placeholder.',
      true,
    );
    context.importedElements += 1;
    return createElement('rectangle', {
      ...base,
      x: position.x,
      y: position.y,
      width,
      height,
      backgroundColor: '#f6e7be',
      label: base.label || 'Image not imported',
    });
  }

  if (isTextCell(style)) {
    context.importedElements += 1;
    return createElement('text', {
      ...base,
      x: position.x,
      y: position.y,
      width,
      height,
      strokeColor: normalizedColor(style.values.get('fontcolor'), base.strokeColor ?? '#2b2a26'),
      backgroundColor: 'transparent',
      text: base.label ?? '',
      fontSize: clamp(finiteNumber(style.values.get('fontsize'), 16), 8, 96),
      textAlign: textAlign(style),
    });
  }

  let shape = shapeFromStyle(style);
  if (!shape) {
    shape = { type: 'rectangle' };
    addIssue(
      context,
      cell,
      'unsupported-shape',
      `The “${(style.values.get('shape') ?? 'custom').slice(0, 120)}” shape was imported as a rectangle.`,
      true,
    );
  }
  context.importedElements += 1;
  const props: CreateElementProps = {
    ...base,
    x: position.x,
    y: position.y,
    width,
    height,
  };
  if (shape.type === 'rectangle') {
    const rounded = style.values.get('rounded') === '1' || style.flags.has('rounded');
    return createElement('rectangle', {
      ...props,
      cornerRadius: rounded
        ? Math.min(width, height) *
          clamp(finiteNumber(style.values.get('arcsize'), 20) / 100, 0.05, 0.5)
        : 0,
    });
  }
  if (shape.type === 'ellipse') return createElement('ellipse', props);
  if (shape.type === 'diamond') return createElement('diamond', props);
  return createElement('shape', { ...props, shapeKind: shape.shapeKind });
}

function centerOf(element: AnyElement): Point {
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}

function pointFromNode(value: unknown): { point: Point; clamped: boolean } | null {
  const node = asNode(value);
  if (!node) return null;
  const x = finiteNumber(node.x, Number.NaN);
  const y = finiteNumber(node.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const point = {
    x: clamp(x, -MAX_DRAWIO_COORDINATE, MAX_DRAWIO_COORDINATE),
    y: clamp(y, -MAX_DRAWIO_COORDINATE, MAX_DRAWIO_COORDINATE),
  };
  return { point, clamped: point.x !== x || point.y !== y };
}

function edgeGeometryPoints(geometry: XmlNode): {
  source: Point | null;
  target: Point | null;
  waypoints: Point[];
  clamped: boolean;
} {
  let source: Point | null = null;
  let target: Point | null = null;
  const waypoints: Point[] = [];
  let clamped = false;
  for (const value of asList(geometry.mxPoint)) {
    const pointNode = asNode(value);
    const result = pointFromNode(value);
    if (!pointNode || !result) continue;
    clamped ||= result.clamped;
    if (pointNode.as === 'sourcePoint') source = result.point;
    else if (pointNode.as === 'targetPoint') target = result.point;
  }
  for (const value of asList(geometry.Array)) {
    const array = asNode(value);
    if (!array || stringValue(array.as) !== 'points') continue;
    for (const pointValue of asList(array.mxPoint)) {
      const result = pointFromNode(pointValue);
      if (result) {
        clamped ||= result.clamped;
        waypoints.push(result.point);
      }
    }
  }
  return { source, target, waypoints, clamped };
}

function convertEdge(
  cell: RawCell,
  page: PageCells,
  context: PageContext,
  order: number,
  elementByCellId: Map<string, AnyElement>,
  elementById: Map<string, AnyElement>,
  groupByCellId: Map<string, string>,
): LinearElement | null {
  const geometry = geometryFor(cell);
  if (!geometry) {
    context.skippedElements += 1;
    addIssue(context, cell, 'missing-geometry', 'A connector without geometry was skipped.');
    return null;
  }
  const style = parseStyle(cell.node.style);
  const geometryPoints = edgeGeometryPoints(geometry);
  if (geometryPoints.clamped) {
    addIssue(
      context,
      cell,
      'geometry-clamped',
      'Extreme connector geometry was limited to a safe editable range.',
      true,
    );
  }
  const sourceCellId = stringValue(cell.node.source);
  const targetCellId = stringValue(cell.node.target);
  const sourceElement = elementByCellId.get(sourceCellId);
  const targetElement = elementByCellId.get(targetCellId);
  let start = sourceElement ? centerOf(sourceElement) : geometryPoints.source;
  let end = targetElement ? centerOf(targetElement) : geometryPoints.target;
  if (!start && end) start = { x: end.x - 120, y: end.y };
  if (!end && start) end = { x: start.x + 120, y: start.y };
  if (!start || !end) {
    context.skippedElements += 1;
    addIssue(
      context,
      cell,
      'missing-connector-endpoints',
      'A connector without usable endpoints was skipped.',
    );
    return null;
  }

  const startArrow = style.values.get('startarrow');
  const endArrow = style.values.get('endarrow') ?? 'classic';
  const hasStartArrow = Boolean(startArrow && startArrow !== 'none');
  const hasEndArrow = endArrow !== 'none';
  let waypoints = geometryPoints.waypoints;
  let startBinding = sourceElement ? { elementId: sourceElement.id } : null;
  let endBinding = targetElement ? { elementId: targetElement.id } : null;
  if (hasStartArrow && !hasEndArrow) {
    [start, end] = [end, start];
    [startBinding, endBinding] = [endBinding, startBinding];
    waypoints = [...waypoints].reverse();
  } else if (hasStartArrow && hasEndArrow) {
    addIssue(
      context,
      cell,
      'bidirectional-connector',
      'A two-headed connector was imported with one arrowhead.',
      true,
    );
  }

  const points = [start, ...waypoints, end];
  const origin = points[0]!;
  const last = points.at(-1)!;
  const layer = resolveLayer(cell, page);
  const groups = groupIdsForCell(cell, page, groupByCellId);
  const base = commonProps(cell, style, layer.id, order, groups, context);
  const routing = /orthogonal|elbow/i.test(style.values.get('edgestyle') ?? '')
    ? 'elbow'
    : 'straight';
  const connector = createElement(hasStartArrow || hasEndArrow ? 'arrow' : 'line', {
    ...base,
    x: origin.x,
    y: origin.y,
    width: Math.abs(last.x - origin.x),
    height: Math.abs(last.y - origin.y),
    points: points.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y })),
    startBinding,
    endBinding,
    routing,
    fixedPoints: waypoints.length > 0,
  });
  if (connector.type !== 'line' && connector.type !== 'arrow') return null;
  elementById.set(connector.id, connector);
  const routed = routeConnector(connector, elementById);
  elementById.set(routed.id, routed);
  context.importedElements += 1;
  return routed;
}

function convertPage(
  rawPage: RawPage,
  pageCells: PageCells,
  assets: Record<string, ScrawlAsset>,
  budget: ImportBudget,
): {
  page: ScrawlPage;
  summary: DrawioPageSummary;
  issues: DrawioImportIssue[];
} {
  const context: PageContext = {
    pageName: rawPage.name,
    issues: [],
    importedElements: 0,
    skippedElements: 0,
    approximatedElements: 0,
  };
  const drawableCells = pageCells.cells.filter(
    (cell) => cell.node.vertex === '1' || cell.node.edge === '1',
  );
  const groupByCellId = new Map<string, string>();
  for (const cell of drawableCells) {
    const style = parseStyle(cell.node.style);
    if (
      cell.node.vertex === '1' &&
      (style.flags.has('group') || style.values.get('group') === '1')
    ) {
      groupByCellId.set(cellId(cell), createId());
    }
  }

  const elementByCellId = new Map<string, AnyElement>();
  const elementById = new Map<string, AnyElement>();
  const elements: AnyElement[] = [];
  for (const cell of drawableCells) {
    if (cell.node.vertex !== '1') continue;
    const element = convertVertex(
      cell,
      pageCells,
      context,
      elements.length,
      groupByCellId,
      assets,
      budget,
    );
    if (!element) continue;
    elements.push(element);
    elementByCellId.set(cellId(cell), element);
    elementById.set(element.id, element);
  }
  for (const cell of drawableCells) {
    if (cell.node.edge !== '1') continue;
    const element = convertEdge(
      cell,
      pageCells,
      context,
      elements.length,
      elementByCellId,
      elementById,
      groupByCellId,
    );
    if (!element) continue;
    elements.push(element);
    elementByCellId.set(cellId(cell), element);
  }

  budget.elements += elements.length;
  if (budget.elements > MAX_DRAWIO_TOTAL_ELEMENTS) {
    throw new DrawioImportError('The draw.io document contains too many elements in total.');
  }

  return {
    page: { id: createId(), name: rawPage.name, layers: pageCells.layers, elements },
    summary: {
      name: rawPage.name,
      importedElements: context.importedElements,
      skippedElements: context.skippedElements,
      approximatedElements: context.approximatedElements,
    },
    issues: context.issues,
  };
}

export function importDrawio(
  source: string,
  options: DrawioImportOptions = {},
): DrawioImportResult {
  const budget: ImportBudget = {
    xmlBytes: 0,
    xmlNodes: 0,
    cells: 0,
    elements: 0,
    assets: 0,
    assetBytes: 0,
  };
  const rawPages = readPages(source, budget);
  const title = options.title?.trim() || 'Imported draw.io diagram';
  const baseDocument = createDocument(title);
  const assets: Record<string, ScrawlAsset> = {};
  const preparedPages = rawPages.map((page) => ({
    page,
    cells: buildPageCells(page.model, page.name, budget),
  }));
  const converted = preparedPages.map(({ page, cells }) =>
    convertPage(page, cells, assets, budget),
  );
  const pages = converted.map((entry) => entry.page);
  const document = parseDocument({
    ...baseDocument,
    title,
    activePageId: pages[0]!.id,
    pages,
    assets,
  });
  const summaries = converted.map((entry) => entry.summary);
  const issues = converted.flatMap((entry) => entry.issues);
  return {
    document,
    report: {
      importedPages: pages.length,
      importedElements: summaries.reduce((total, page) => total + page.importedElements, 0),
      skippedElements: summaries.reduce((total, page) => total + page.skippedElements, 0),
      approximatedElements: summaries.reduce((total, page) => total + page.approximatedElements, 0),
      pages: summaries,
      issues,
    },
  };
}
