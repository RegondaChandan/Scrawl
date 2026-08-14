import type { Point } from './geometry';
import type { FillStyle, FontKey, StrokeStyle, StyleMode, TextAlign } from './style';
import { DEFAULT_ELEMENT_DEFAULTS } from './style';

export interface ElementBase {
  id: string;
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  renderStyle: StyleMode;
  seed: number;
  version: number;
  order: number;
  label?: string;
  fontFamily?: FontKey;
  groupIds?: string[];
  locked?: boolean;
}

export interface RectangleElement extends ElementBase {
  type: 'rectangle';
  cornerRadius: number;
}

export interface EllipseElement extends ElementBase {
  type: 'ellipse';
}

export interface DiamondElement extends ElementBase {
  type: 'diamond';
}

export type ShapeKind =
  | 'terminator'
  | 'parallelogram'
  | 'trapezoid'
  | 'hexagon'
  | 'triangle'
  | 'cylinder'
  | 'queue'
  | 'document'
  | 'note'
  | 'package'
  | 'uml-class'
  | 'actor'
  | 'cloud'
  | 'server'
  | 'browser'
  | 'mobile'
  | 'user'
  | 'star';

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shapeKind: ShapeKind;
}

export interface IconElement extends ElementBase {
  type: 'icon';
  iconId: string;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  assetId: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface Binding {
  elementId: string;
}

export type ConnectorRouting = 'straight' | 'elbow';

export interface LinearElement extends ElementBase {
  type: 'line' | 'arrow';
  points: Point[];
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  routing?: ConnectorRouting;
  fixedPoints?: boolean;
}

export interface FreedrawElement extends ElementBase {
  type: 'freedraw';
  points: Point[];
}

export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  fontSize: number;
  textAlign: TextAlign;
}

export interface StickyElement extends ElementBase {
  type: 'sticky';
  text: string;
  fontSize: number;
}

export type AnyElement =
  | RectangleElement
  | EllipseElement
  | DiamondElement
  | ShapeElement
  | IconElement
  | ImageElement
  | LinearElement
  | FreedrawElement
  | TextElement
  | StickyElement;

export type ElementType = AnyElement['type'];

export interface CreateElementProps extends Partial<ElementBase> {
  x: number;
  y: number;
  cornerRadius?: number;
  shapeKind?: ShapeKind;
  iconId?: string;
  assetId?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  points?: Point[];
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  routing?: ConnectorRouting;
  fixedPoints?: boolean;
  text?: string;
  fontSize?: number;
  textAlign?: TextAlign;
}

export function createId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

export function createElement(type: ElementType, props: CreateElementProps): AnyElement {
  const base: ElementBase = {
    id: props.id ?? createId(),
    layerId: props.layerId ?? 'default',
    x: props.x,
    y: props.y,
    width: props.width ?? 0,
    height: props.height ?? 0,
    angle: props.angle ?? 0,
    strokeColor: props.strokeColor ?? DEFAULT_ELEMENT_DEFAULTS.strokeColor,
    backgroundColor: props.backgroundColor ?? DEFAULT_ELEMENT_DEFAULTS.backgroundColor,
    fillStyle: props.fillStyle ?? DEFAULT_ELEMENT_DEFAULTS.fillStyle,
    strokeWidth: props.strokeWidth ?? DEFAULT_ELEMENT_DEFAULTS.strokeWidth,
    strokeStyle: props.strokeStyle ?? DEFAULT_ELEMENT_DEFAULTS.strokeStyle,
    roughness: props.roughness ?? DEFAULT_ELEMENT_DEFAULTS.roughness,
    opacity: props.opacity ?? DEFAULT_ELEMENT_DEFAULTS.opacity,
    renderStyle: props.renderStyle ?? 'crisp',
    seed: props.seed ?? Math.floor(Math.random() * 2 ** 31) + 1,
    version: props.version ?? 1,
    order: props.order ?? 0,
    ...(props.label === undefined ? {} : { label: props.label }),
    ...(props.fontFamily === undefined ? {} : { fontFamily: props.fontFamily }),
    ...(props.groupIds === undefined ? {} : { groupIds: props.groupIds }),
    ...(props.locked === undefined ? {} : { locked: props.locked }),
  };

  switch (type) {
    case 'rectangle':
      return { ...base, type, cornerRadius: props.cornerRadius ?? 0 };
    case 'ellipse':
    case 'diamond':
      return { ...base, type };
    case 'shape':
      return { ...base, type, shapeKind: props.shapeKind ?? 'terminator' };
    case 'icon':
      return { ...base, type, iconId: props.iconId ?? '' };
    case 'image':
      return {
        ...base,
        type,
        assetId: props.assetId ?? '',
        naturalWidth: Math.max(1, props.naturalWidth ?? 1),
        naturalHeight: Math.max(1, props.naturalHeight ?? 1),
      };
    case 'line':
    case 'arrow':
      return {
        ...base,
        type,
        points: props.points ?? [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        startBinding: props.startBinding ?? null,
        endBinding: props.endBinding ?? null,
        routing: props.routing ?? 'straight',
        ...(props.fixedPoints === undefined ? {} : { fixedPoints: props.fixedPoints }),
      };
    case 'freedraw':
      return { ...base, type, points: props.points ?? [{ x: 0, y: 0 }] };
    case 'text':
      return {
        ...base,
        type,
        text: props.text ?? '',
        fontSize: props.fontSize ?? DEFAULT_ELEMENT_DEFAULTS.fontSize,
        textAlign: props.textAlign ?? 'left',
      };
    case 'sticky':
      return {
        ...base,
        type,
        backgroundColor: base.backgroundColor === 'transparent' ? '#fbe6a2' : base.backgroundColor,
        text: props.text ?? '',
        fontSize: props.fontSize ?? 18,
      };
  }
}

export function isLinear(element: AnyElement): element is LinearElement {
  return element.type === 'line' || element.type === 'arrow';
}

export function hasPoints(element: AnyElement): element is LinearElement | FreedrawElement {
  return isLinear(element) || element.type === 'freedraw';
}

export function hasText(element: AnyElement): element is TextElement | StickyElement {
  return element.type === 'text' || element.type === 'sticky';
}

export function isBindable(element: AnyElement): boolean {
  return ['rectangle', 'ellipse', 'diamond', 'shape', 'icon', 'sticky'].includes(element.type);
}

export function isLabelable(element: AnyElement): boolean {
  return ['rectangle', 'ellipse', 'diamond', 'shape', 'icon', 'line', 'arrow'].includes(
    element.type,
  );
}
