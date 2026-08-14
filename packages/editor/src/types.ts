import type { Point } from '@scrawl/schema';

export type Tool =
  | 'select'
  | 'hand'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'sticky'
  | 'eraser';

export interface Camera extends Point {
  zoom: number;
}

export type OpenPanel = 'shapes' | 'templates' | 'commands' | 'export' | 'icons' | 'pages' | null;

export interface EditorViewState {
  tool: Tool;
  camera: Camera;
  selectedIds: string[];
  editingId: string | null;
  openPanel: OpenPanel;
  activeLayerId: string;
}

export const DEFAULT_VIEW_STATE: EditorViewState = {
  tool: 'select',
  camera: { x: 0, y: 0, zoom: 1 },
  selectedIds: [],
  editingId: null,
  openPanel: null,
  activeLayerId: 'default',
};
