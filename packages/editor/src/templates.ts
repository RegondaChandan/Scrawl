import { cloneElements } from './arrange';
import { getSceneBounds, updateBoundConnectors } from '@scrawl/engine';
import {
  createElement,
  type AnyElement,
  type ElementDefaults,
  type Point,
  type StyleMode,
} from '@scrawl/schema';

export interface DiagramTemplate {
  id: string;
  name: string;
  description: string;
  category: 'flowchart' | 'architecture' | 'planning' | 'custom';
  elements: readonly AnyElement[];
}

export interface TemplatePlacement {
  center: Point;
  layerId: string;
  startOrder: number;
  renderStyle?: StyleMode;
  defaults?: ElementDefaults;
}

function templateElement(
  type: Parameters<typeof createElement>[0],
  props: Parameters<typeof createElement>[1],
): AnyElement {
  return createElement(type, { layerId: 'default', ...props });
}

const flowchartElements: AnyElement[] = [
  templateElement('shape', {
    id: 'flow-start',
    x: 20,
    y: 0,
    width: 160,
    height: 60,
    shapeKind: 'terminator',
    label: 'Start',
    backgroundColor: '#cde9d7',
    seed: 101,
  }),
  templateElement('rectangle', {
    id: 'flow-process',
    x: 20,
    y: 120,
    width: 160,
    height: 76,
    label: 'Process',
    backgroundColor: '#c7ede9',
    seed: 102,
  }),
  templateElement('diamond', {
    id: 'flow-decision',
    x: 20,
    y: 256,
    width: 160,
    height: 100,
    label: 'Decision?',
    backgroundColor: '#f6e7be',
    seed: 103,
  }),
  templateElement('shape', {
    id: 'flow-end',
    x: 20,
    y: 416,
    width: 160,
    height: 60,
    shapeKind: 'terminator',
    label: 'End',
    backgroundColor: '#fbd9ce',
    seed: 104,
  }),
  templateElement('arrow', {
    id: 'flow-arrow-1',
    x: 100,
    y: 60,
    width: 0,
    height: 60,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 60 },
    ],
    startBinding: { elementId: 'flow-start' },
    endBinding: { elementId: 'flow-process' },
    seed: 105,
  }),
  templateElement('arrow', {
    id: 'flow-arrow-2',
    x: 100,
    y: 196,
    width: 0,
    height: 60,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 60 },
    ],
    startBinding: { elementId: 'flow-process' },
    endBinding: { elementId: 'flow-decision' },
    seed: 106,
  }),
  templateElement('arrow', {
    id: 'flow-arrow-3',
    x: 100,
    y: 356,
    width: 0,
    height: 60,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 60 },
    ],
    startBinding: { elementId: 'flow-decision' },
    endBinding: { elementId: 'flow-end' },
    seed: 107,
  }),
];

const architectureElements: AnyElement[] = [
  templateElement('shape', {
    id: 'architecture-client',
    x: 0,
    y: 90,
    width: 150,
    height: 100,
    shapeKind: 'browser',
    label: 'Client',
    backgroundColor: '#e6d6f5',
    seed: 201,
  }),
  templateElement('shape', {
    id: 'architecture-service',
    x: 260,
    y: 80,
    width: 130,
    height: 120,
    shapeKind: 'server',
    label: 'Service',
    backgroundColor: '#c7ede9',
    seed: 202,
  }),
  templateElement('shape', {
    id: 'architecture-database',
    x: 510,
    y: 0,
    width: 120,
    height: 110,
    shapeKind: 'cylinder',
    label: 'Database',
    backgroundColor: '#f6e7be',
    seed: 203,
  }),
  templateElement('shape', {
    id: 'architecture-queue',
    x: 490,
    y: 190,
    width: 160,
    height: 76,
    shapeKind: 'queue',
    label: 'Queue',
    backgroundColor: '#fbd9ce',
    seed: 204,
  }),
  templateElement('arrow', {
    id: 'architecture-arrow-client',
    x: 150,
    y: 140,
    width: 110,
    height: 0,
    points: [
      { x: 0, y: 0 },
      { x: 110, y: 0 },
    ],
    startBinding: { elementId: 'architecture-client' },
    endBinding: { elementId: 'architecture-service' },
    seed: 205,
  }),
  templateElement('arrow', {
    id: 'architecture-arrow-database',
    x: 390,
    y: 120,
    width: 120,
    height: -65,
    points: [
      { x: 0, y: 0 },
      { x: 120, y: -65 },
    ],
    startBinding: { elementId: 'architecture-service' },
    endBinding: { elementId: 'architecture-database' },
    seed: 206,
  }),
  templateElement('arrow', {
    id: 'architecture-arrow-queue',
    x: 390,
    y: 160,
    width: 100,
    height: 68,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 68 },
    ],
    startBinding: { elementId: 'architecture-service' },
    endBinding: { elementId: 'architecture-queue' },
    seed: 207,
  }),
];

const planningColors = ['#e6d6f5', '#c7ede9', '#cde9d7'] as const;

const planningElements: AnyElement[] = ['Discover', 'Design', 'Deliver'].flatMap(
  (label, index): AnyElement[] => {
    const id = `planning-step-${index}`;
    const x = index * 230;
    const step = templateElement('rectangle', {
      id,
      x,
      y: 0,
      width: 170,
      height: 90,
      label,
      cornerRadius: 14,
      backgroundColor: planningColors[index]!,
      seed: 301 + index,
    });
    if (index === 0) return [step];
    return [
      templateElement('arrow', {
        id: `planning-arrow-${index}`,
        x: x - 60,
        y: 45,
        width: 60,
        height: 0,
        points: [
          { x: 0, y: 0 },
          { x: 60, y: 0 },
        ],
        startBinding: { elementId: `planning-step-${index - 1}` },
        endBinding: { elementId: id },
        seed: 304 + index,
      }),
      step,
    ];
  },
);

export const BUILT_IN_TEMPLATES: readonly DiagramTemplate[] = [
  {
    id: 'basic-flowchart',
    name: 'Basic flowchart',
    description: 'A connected start, process, decision, and end flow.',
    category: 'flowchart',
    elements: flowchartElements,
  },
  {
    id: 'service-architecture',
    name: 'Service architecture',
    description: 'A client, service, database, and queue system map.',
    category: 'architecture',
    elements: architectureElements,
  },
  {
    id: 'three-step-plan',
    name: 'Three-step plan',
    description: 'A simple connected Discover, Design, Deliver sequence.',
    category: 'planning',
    elements: planningElements,
  },
];

export function instantiateTemplateElements(
  source: readonly AnyElement[],
  placement: TemplatePlacement,
): AnyElement[] {
  if (source.length === 0) return [];
  const bounds = getSceneBounds([...source]);
  if (!bounds) return [];
  const offset = {
    x: placement.center.x - (bounds.x + bounds.width / 2),
    y: placement.center.y - (bounds.y + bounds.height / 2),
  };
  const result = cloneElements([...source], [], offset);
  const elements = result.elements.map((element, index): AnyElement => ({
    ...element,
    layerId: placement.layerId,
    order: placement.startOrder + index,
    ...(placement.renderStyle ? { renderStyle: placement.renderStyle } : {}),
    ...(placement.defaults
      ? {
          strokeColor: placement.defaults.strokeColor,
          strokeWidth: placement.defaults.strokeWidth,
          strokeStyle: placement.defaults.strokeStyle,
          fillStyle: placement.defaults.fillStyle,
          roughness: placement.defaults.roughness,
          opacity: placement.defaults.opacity,
          ...(placement.defaults.fontFamily ? { fontFamily: placement.defaults.fontFamily } : {}),
        }
      : {}),
  }));
  return updateBoundConnectors(elements);
}
