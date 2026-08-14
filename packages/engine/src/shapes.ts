import type { ShapeKind } from '@scrawl/schema';

/**
 * Parametric shape definitions. Each kind produces an SVG path string sized to
 * w×h in element-local coordinates — the crisp renderer draws it as a Path2D,
 * the rough renderer feeds the same string to rough.js, and the SVG exporter
 * emits it verbatim. One geometry, three consumers.
 */
export interface ShapeDef {
  path: (w: number, h: number) => string;
  /** Closed silhouettes take backgroundColor fills; line-art kinds don't. */
  fillable: boolean;
  /** Stable normalized connection points used by bound connectors. */
  anchors?: readonly NormalizedConnectionAnchor[];
}

export type ConnectionAnchorId = 'north' | 'east' | 'south' | 'west';

export interface NormalizedConnectionAnchor {
  id: ConnectionAnchorId;
  x: number;
  y: number;
}

const CARDINAL_ANCHORS: readonly NormalizedConnectionAnchor[] = [
  { id: 'north', x: 0.5, y: 0 },
  { id: 'east', x: 1, y: 0.5 },
  { id: 'south', x: 0.5, y: 1 },
  { id: 'west', x: 0, y: 0.5 },
];

const n = (v: number) => +v.toFixed(2);

export const SHAPE_DEFS: Record<ShapeKind, ShapeDef> = {
  terminator: {
    fillable: true,
    path: (w, h) => {
      const r = Math.min(h / 2, w / 2);
      return `M ${n(r)} 0 L ${n(w - r)} 0 A ${n(r)} ${n(h / 2)} 0 0 1 ${n(w - r)} ${n(h)} L ${n(r)} ${n(h)} A ${n(r)} ${n(h / 2)} 0 0 1 ${n(r)} 0 Z`;
    },
  },
  parallelogram: {
    fillable: true,
    path: (w, h) => {
      const o = w * 0.22;
      return `M ${n(o)} 0 L ${n(w)} 0 L ${n(w - o)} ${n(h)} L 0 ${n(h)} Z`;
    },
  },
  trapezoid: {
    fillable: true,
    path: (w, h) => {
      const o = w * 0.2;
      return `M ${n(o)} 0 L ${n(w - o)} 0 L ${n(w)} ${n(h)} L 0 ${n(h)} Z`;
    },
  },
  hexagon: {
    fillable: true,
    path: (w, h) => {
      const o = Math.min(w * 0.25, h * 0.5);
      return `M ${n(o)} 0 L ${n(w - o)} 0 L ${n(w)} ${n(h / 2)} L ${n(w - o)} ${n(h)} L ${n(o)} ${n(h)} L 0 ${n(h / 2)} Z`;
    },
  },
  triangle: {
    fillable: true,
    path: (w, h) => `M ${n(w / 2)} 0 L ${n(w)} ${n(h)} L 0 ${n(h)} Z`,
  },
  cylinder: {
    fillable: true,
    path: (w, h) => {
      const ry = Math.min(h * 0.16, w * 0.5);
      const rx = w / 2;
      return (
        `M 0 ${n(ry)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(w)} ${n(ry)} L ${n(w)} ${n(h - ry)} A ${n(rx)} ${n(ry)} 0 0 1 0 ${n(h - ry)} Z` +
        ` M 0 ${n(ry)} A ${n(rx)} ${n(ry)} 0 0 0 ${n(w)} ${n(ry)}`
      );
    },
  },
  queue: {
    fillable: true,
    path: (w, h) => {
      const rx = Math.min(w * 0.16, h * 0.5);
      const ry = h / 2;
      return (
        `M ${n(rx)} 0 L ${n(w - rx)} 0 A ${n(rx)} ${n(ry)} 0 0 1 ${n(w - rx)} ${n(h)} L ${n(rx)} ${n(h)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(rx)} 0 Z` +
        ` M ${n(rx)} 0 A ${n(rx)} ${n(ry)} 0 0 0 ${n(rx)} ${n(h)}`
      );
    },
  },
  document: {
    fillable: true,
    path: (w, h) => {
      const b = h * 0.12;
      return `M 0 0 L ${n(w)} 0 L ${n(w)} ${n(h - b)} Q ${n(w * 0.75)} ${n(h - 2.6 * b)} ${n(w / 2)} ${n(h - b)} T 0 ${n(h - b)} Z`;
    },
  },
  note: {
    fillable: true,
    path: (w, h) => {
      const d = Math.min(w, h) * 0.25;
      return `M 0 0 L ${n(w - d)} 0 L ${n(w)} ${n(d)} L ${n(w)} ${n(h)} L 0 ${n(h)} Z M ${n(w - d)} 0 L ${n(w - d)} ${n(d)} L ${n(w)} ${n(d)}`;
    },
  },
  package: {
    fillable: true,
    path: (w, h) => {
      const t = h * 0.2;
      return `M 0 ${n(t)} L ${n(w)} ${n(t)} L ${n(w)} ${n(h)} L 0 ${n(h)} Z M 0 ${n(t)} L 0 0 L ${n(w * 0.42)} 0 L ${n(w * 0.42)} ${n(t)}`;
    },
  },
  'uml-class': {
    fillable: true,
    path: (w, h) =>
      `M 0 0 L ${n(w)} 0 L ${n(w)} ${n(h)} L 0 ${n(h)} Z M 0 ${n(h * 0.32)} L ${n(w)} ${n(h * 0.32)} M 0 ${n(h * 0.62)} L ${n(w)} ${n(h * 0.62)}`,
  },
  actor: {
    fillable: false,
    path: (w, h) => {
      const cx = w / 2;
      const rx = w * 0.17;
      const ry = h * 0.14;
      const headY = h * 0.14;
      return (
        `M ${n(cx - rx)} ${n(headY)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(headY)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(headY)}` +
        ` M ${n(cx)} ${n(headY + ry)} L ${n(cx)} ${n(h * 0.66)}` +
        ` M ${n(w * 0.12)} ${n(h * 0.42)} L ${n(w * 0.88)} ${n(h * 0.42)}` +
        ` M ${n(cx)} ${n(h * 0.66)} L ${n(w * 0.12)} ${n(h)}` +
        ` M ${n(cx)} ${n(h * 0.66)} L ${n(w * 0.88)} ${n(h)}`
      );
    },
  },
  cloud: {
    fillable: true,
    path: (w, h) =>
      `M ${n(0.22 * w)} ${n(0.78 * h)} C ${n(0.06 * w)} ${n(0.78 * h)} ${n(0.02 * w)} ${n(0.62 * h)} ${n(0.12 * w)} ${n(0.54 * h)} C ${n(0.04 * w)} ${n(0.36 * h)} ${n(0.22 * w)} ${n(0.26 * h)} ${n(0.34 * w)} ${n(0.32 * h)} C ${n(0.4 * w)} ${n(0.14 * h)} ${n(0.66 * w)} ${n(0.12 * h)} ${n(0.72 * w)} ${n(0.28 * h)} C ${n(0.88 * w)} ${n(0.22 * h)} ${n(0.98 * w)} ${n(0.36 * h)} ${n(0.92 * w)} ${n(0.5 * h)} C ${n(w)} ${n(0.6 * h)} ${n(0.94 * w)} ${n(0.76 * h)} ${n(0.8 * w)} ${n(0.78 * h)} Z`,
  },
  server: {
    fillable: true,
    path: (w, h) =>
      `M 0 0 L ${n(w)} 0 L ${n(w)} ${n(h)} L 0 ${n(h)} Z M 0 ${n(h / 3)} L ${n(w)} ${n(h / 3)} M 0 ${n((2 * h) / 3)} L ${n(w)} ${n((2 * h) / 3)} M ${n(w * 0.12)} ${n(h / 6)} L ${n(w * 0.3)} ${n(h / 6)} M ${n(w * 0.12)} ${n(h / 2)} L ${n(w * 0.3)} ${n(h / 2)} M ${n(w * 0.12)} ${n((5 * h) / 6)} L ${n(w * 0.3)} ${n((5 * h) / 6)}`,
  },
  browser: {
    fillable: true,
    path: (w, h) =>
      `M 0 0 L ${n(w)} 0 L ${n(w)} ${n(h)} L 0 ${n(h)} Z M 0 ${n(h * 0.2)} L ${n(w)} ${n(h * 0.2)} M ${n(w * 0.3)} ${n(h * 0.1)} L ${n(w * 0.92)} ${n(h * 0.1)}`,
  },
  mobile: {
    fillable: true,
    path: (w, h) => {
      const r = w * 0.14;
      return `M ${n(r)} 0 L ${n(w - r)} 0 Q ${n(w)} 0 ${n(w)} ${n(r)} L ${n(w)} ${n(h - r)} Q ${n(w)} ${n(h)} ${n(w - r)} ${n(h)} L ${n(r)} ${n(h)} Q 0 ${n(h)} 0 ${n(h - r)} L 0 ${n(r)} Q 0 0 ${n(r)} 0 Z M ${n(w * 0.35)} ${n(h * 0.92)} L ${n(w * 0.65)} ${n(h * 0.92)}`;
    },
  },
  user: {
    fillable: true,
    path: (w, h) => {
      const cx = w / 2;
      const rx = w * 0.2;
      const ry = h * 0.22;
      const headY = h * 0.24;
      return (
        `M ${n(cx - rx)} ${n(headY)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(headY)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(headY)}` +
        ` M ${n(w * 0.1)} ${n(h)} C ${n(w * 0.1)} ${n(h * 0.6)} ${n(w * 0.9)} ${n(h * 0.6)} ${n(w * 0.9)} ${n(h)} Z`
      );
    },
  },
  star: {
    fillable: true,
    path: (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      let d = '';
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const rx = i % 2 === 0 ? w / 2 : w * 0.19;
        const ry = i % 2 === 0 ? h / 2 : h * 0.19;
        const x = n(cx + rx * Math.cos(angle));
        const y = n(cy + ry * Math.sin(angle));
        d += (i === 0 ? 'M ' : 'L ') + `${x} ${y} `;
      }
      return d + 'Z';
    },
  },
};

export function shapePath(kind: ShapeKind, w: number, h: number): string {
  const def = SHAPE_DEFS[kind] ?? SHAPE_DEFS.terminator;
  return def.path(Math.max(w, 1), Math.max(h, 1));
}

export function isShapeFillable(kind: ShapeKind): boolean {
  return (SHAPE_DEFS[kind] ?? SHAPE_DEFS.terminator).fillable;
}

export function shapeConnectionAnchors(kind: ShapeKind): readonly NormalizedConnectionAnchor[] {
  return (SHAPE_DEFS[kind] ?? SHAPE_DEFS.terminator).anchors ?? CARDINAL_ANCHORS;
}

// Shape library metadata

export interface LibraryItem {
  id: string;
  label: string;
  keywords?: readonly string[];
  /** Base element type to place, or 'shape' with a kind. */
  type: 'rectangle' | 'ellipse' | 'diamond' | 'shape';
  shapeKind?: ShapeKind;
  width: number;
  height: number;
}

export interface LibraryPack {
  id: string;
  name: string;
  items: readonly LibraryItem[];
}

export const SHAPE_LIBRARY: readonly LibraryPack[] = [
  {
    id: 'flowchart',
    name: 'Flowchart',
    items: [
      {
        id: 'flowchart-terminator',
        label: 'Start / End',
        keywords: ['terminator', 'begin', 'finish'],
        type: 'shape',
        shapeKind: 'terminator',
        width: 160,
        height: 64,
      },
      { id: 'flowchart-process', label: 'Process', type: 'rectangle', width: 160, height: 80 },
      { id: 'flowchart-decision', label: 'Decision', type: 'diamond', width: 150, height: 100 },
      {
        id: 'flowchart-input-output',
        label: 'Input / Output',
        keywords: ['data', 'io'],
        type: 'shape',
        shapeKind: 'parallelogram',
        width: 170,
        height: 76,
      },
      {
        id: 'flowchart-database',
        label: 'Database',
        keywords: ['storage', 'cylinder'],
        type: 'shape',
        shapeKind: 'cylinder',
        width: 120,
        height: 110,
      },
      {
        id: 'flowchart-document',
        label: 'Document',
        type: 'shape',
        shapeKind: 'document',
        width: 150,
        height: 100,
      },
      {
        id: 'flowchart-preparation',
        label: 'Preparation',
        type: 'shape',
        shapeKind: 'hexagon',
        width: 170,
        height: 80,
      },
      {
        id: 'flowchart-manual-operation',
        label: 'Manual operation',
        keywords: ['trapezoid'],
        type: 'shape',
        shapeKind: 'trapezoid',
        width: 160,
        height: 80,
      },
    ],
  },
  {
    id: 'uml',
    name: 'UML',
    items: [
      {
        id: 'uml-class',
        label: 'Class',
        keywords: ['object', 'type'],
        type: 'shape',
        shapeKind: 'uml-class',
        width: 170,
        height: 120,
      },
      {
        id: 'uml-actor',
        label: 'Actor',
        type: 'shape',
        shapeKind: 'actor',
        width: 60,
        height: 110,
      },
      { id: 'uml-use-case', label: 'Use case', type: 'ellipse', width: 160, height: 80 },
      { id: 'uml-note', label: 'Note', type: 'shape', shapeKind: 'note', width: 150, height: 100 },
      {
        id: 'uml-package',
        label: 'Package',
        type: 'shape',
        shapeKind: 'package',
        width: 160,
        height: 110,
      },
      { id: 'uml-object', label: 'Object', type: 'rectangle', width: 150, height: 60 },
    ],
  },
  {
    id: 'cloud-network',
    name: 'Cloud & Network',
    items: [
      {
        id: 'network-cloud',
        label: 'Cloud',
        type: 'shape',
        shapeKind: 'cloud',
        width: 170,
        height: 100,
      },
      {
        id: 'network-server',
        label: 'Server',
        type: 'shape',
        shapeKind: 'server',
        width: 110,
        height: 120,
      },
      {
        id: 'network-database',
        label: 'Database',
        keywords: ['storage', 'cylinder'],
        type: 'shape',
        shapeKind: 'cylinder',
        width: 110,
        height: 110,
      },
      {
        id: 'network-queue',
        label: 'Queue',
        type: 'shape',
        shapeKind: 'queue',
        width: 170,
        height: 70,
      },
      {
        id: 'network-browser',
        label: 'Browser',
        type: 'shape',
        shapeKind: 'browser',
        width: 160,
        height: 110,
      },
      {
        id: 'network-mobile',
        label: 'Mobile',
        type: 'shape',
        shapeKind: 'mobile',
        width: 70,
        height: 120,
      },
      {
        id: 'network-user',
        label: 'User',
        type: 'shape',
        shapeKind: 'user',
        width: 90,
        height: 100,
      },
      {
        id: 'network-gateway',
        label: 'Gateway',
        type: 'shape',
        shapeKind: 'hexagon',
        width: 130,
        height: 90,
      },
      {
        id: 'network-event',
        label: 'Event',
        type: 'shape',
        shapeKind: 'star',
        width: 100,
        height: 100,
      },
    ],
  },
];

export function findLibraryItem(id: string): LibraryItem | null {
  for (const pack of SHAPE_LIBRARY) {
    const item = pack.items.find((candidate) => candidate.id === id);
    if (item) return item;
  }
  return null;
}
