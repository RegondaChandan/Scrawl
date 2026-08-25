import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bindConnectorEndpoint,
  bindConnectorEndpoints,
  boxContainsPoint,
  boxesIntersect,
  getConnectorHandles,
  getElementBounds,
  findLibraryItem,
  getIconDef,
  getSceneBounds,
  getSelectionBounds,
  getSelectionHandles,
  getSelectionOutline,
  normalizeAngle,
  measureTextSize,
  renderScene,
  RESIZE_HANDLE_SIZE,
  rendererFor,
  rotatePoint,
  screenToWorld,
  setAssetReadyCallback,
  updateBoundConnectors,
  type Camera,
  type SnapGuide,
  type TransformHandleId,
} from '@scrawl/engine';
import {
  CANVAS_COLORS,
  createElement,
  isLinear,
  LINE_HEIGHT,
  MAX_ELEMENT_TEXT_LENGTH,
  maxOrder,
  type AnyElement,
  type Box,
  type ElementType,
  type Point,
} from '@scrawl/schema';
import {
  expandGroupedSelection,
  getActivePage,
  insertConnectorWaypoint,
  instantiateLibraryItem,
  moveConnectorSegment,
  moveConnectorVertex,
  parseClipboardContent,
  resizeBoxFromHandle,
  resizeElementsInFrame,
  rotateElements,
  serializeClipboardElements,
  snapPointToElements,
  snapPointToGrid,
  snapRotationAngle,
  snapSelectionMove,
  snapSelectionMoveToGrid,
  type ResizeHandle,
  type ScrawlClipboardPayload,
  type Tool,
} from '@scrawl/editor';
import { readCanvasLibraryTransfer, SCRAWL_LIBRARY_TRANSFER_TYPE } from './canvas-transfer';
import { eraserSegmentPoints } from './eraser';
import { imageInsertionError, imageInsertionFailureMessage, prepareImageFile } from './image-files';
import { drawLaserTrail, trimLaserTrail, type LaserPoint } from './laser';
import { useEditor } from './use-editor';
import { TextOverlay } from './TextOverlay';
import { ContextualRadialMenu } from './components/ContextualRadialMenu';

interface PanInteraction {
  kind: 'pan';
  startScreen: Point;
  camera: Camera;
}

interface MoveInteraction {
  kind: 'move';
  startWorld: Point;
  source: AnyElement[];
  ids: Set<string>;
  sourceBounds: Box;
}

interface MarqueeInteraction {
  kind: 'marquee';
  startWorld: Point;
  currentWorld: Point;
}

interface DrawInteraction {
  kind: 'draw';
  startWorld: Point;
  element: AnyElement;
}

interface EraseInteraction {
  kind: 'erase';
  source: AnyElement[];
  candidates: AnyElement[];
  erasedIds: Set<string>;
  lastWorld: Point;
}

interface LaserInteraction {
  kind: 'laser';
}

interface ResizeInteraction {
  kind: 'resize';
  source: AnyElement[];
  ids: Set<string>;
  sourceBounds: Box;
  frameCenter: Point;
  frameAngle: number;
  handle: ResizeHandle;
}

interface RotateInteraction {
  kind: 'rotate';
  source: AnyElement[];
  ids: Set<string>;
  pivot: Point;
  startPointerAngle: number;
  startSelectionAngle: number;
}

interface ConnectorInteraction {
  kind: 'connector';
  source: AnyElement[];
  elementId: string;
  control: { kind: 'vertex'; index: number } | { kind: 'segment'; index: number };
}

type Interaction =
  | PanInteraction
  | MoveInteraction
  | MarqueeInteraction
  | DrawInteraction
  | EraseInteraction
  | LaserInteraction
  | ResizeInteraction
  | RotateInteraction
  | ConnectorInteraction;

const shapeTools = new Set<Tool>(['rectangle', 'ellipse', 'diamond', 'arrow', 'line', 'freedraw']);

const toolShortcuts: Partial<Record<string, Tool>> = {
  v: 'select',
  h: 'hand',
  r: 'rectangle',
  o: 'ellipse',
  d: 'diamond',
  a: 'arrow',
  l: 'line',
  p: 'freedraw',
  k: 'laser',
  t: 'text',
  n: 'sticky',
  e: 'eraser',
};

function isDocumentChangingShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  const modifier = event.metaKey || event.ctrlKey;
  return (
    (modifier && ['a', 'd', 'g', 'z'].includes(key)) ||
    (modifier && (event.key === '[' || event.key === ']')) ||
    event.key === 'Delete' ||
    event.key === 'Backspace' ||
    event.key.startsWith('Arrow') ||
    (!modifier && !event.altKey && (key === 'm' || Boolean(toolShortcuts[key])))
  );
}

const CONSTRAINED_DRAW_ANGLE = Math.PI / 4;

const TOOL_FEEDBACK: Partial<Record<Tool, { label: string; hint: string }>> = {
  rectangle: { label: 'Rectangle', hint: 'Drag to draw · Shift for square' },
  ellipse: { label: 'Ellipse', hint: 'Drag to draw · Shift for circle' },
  diamond: { label: 'Diamond', hint: 'Drag to draw · Shift to constrain' },
  arrow: { label: 'Arrow', hint: 'Drag to connect · Shift snaps angle' },
  line: { label: 'Line', hint: 'Drag to draw · Shift snaps angle' },
  freedraw: { label: 'Draw', hint: 'Draw freely · select the stroke to recognize it' },
  laser: { label: 'Laser', hint: 'Press and wave · the trail fades automatically' },
  text: { label: 'Text', hint: 'Click anywhere and type' },
  sticky: { label: 'Note', hint: 'Click anywhere and type' },
  eraser: { label: 'Eraser', hint: 'Drag across objects · one undo restores the gesture' },
};

function localPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function normalizedBox(start: Point, end: Point): Box {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function supportsInlineText(element: AnyElement): boolean {
  return (
    element.type === 'text' ||
    element.type === 'sticky' ||
    ['rectangle', 'ellipse', 'diamond', 'shape', 'icon', 'line', 'arrow'].includes(element.type)
  );
}

export function CanvasBoard(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const objectClipboardRef = useRef<ScrawlClipboardPayload>({ elements: [], assets: {} });
  const lastPointerScreenRef = useRef<Point | null>(null);
  const laserTrailRef = useRef<LaserPoint[]>([]);
  const spacePressedRef = useRef(false);
  const [draft, setDraft] = useState<AnyElement | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [hoveredHandle, setHoveredHandle] = useState<TransformHandleId | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState<Interaction['kind'] | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [renderRevision, setRenderRevision] = useState(0);

  const document = useEditor((state) => state.document);
  const view = useEditor((state) => state.view);
  const actions = useEditor((state) => state.actions);
  const page = getActivePage(document);
  const elements = page.elements;
  const camera = view.camera;
  const canvasColor = document.settings.canvasColor ?? CANVAS_COLORS[document.settings.theme];

  const visibleElements = useMemo(() => {
    const layerOrder = new Map(page.layers.map((layer, index) => [layer.id, index]));
    const visibleLayers = new Set(
      page.layers.filter((layer) => layer.visible).map((layer) => layer.id),
    );
    return elements
      .filter((element) => visibleLayers.has(element.layerId))
      .toSorted((left, right) => {
        const layerDifference =
          (layerOrder.get(left.layerId) ?? 0) - (layerOrder.get(right.layerId) ?? 0);
        return layerDifference || left.order - right.order;
      });
  }, [elements, page.layers]);

  const findElementFrom = useCallback(
    (candidates: AnyElement[], point: Point, excludedIds?: Set<string>): AnyElement | null => {
      const lockedLayers = new Set(
        page.layers.filter((layer) => layer.locked).map((layer) => layer.id),
      );
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const element = candidates[index]!;
        if (excludedIds?.has(element.id)) continue;
        if (element.locked || lockedLayers.has(element.layerId)) continue;
        if (rendererFor(element).hitTest(element, point, 7 / camera.zoom)) return element;
      }
      return null;
    },
    [camera.zoom, page.layers],
  );

  const findElement = useCallback(
    (point: Point): AnyElement | null => findElementFrom(visibleElements, point),
    [findElementFrom, visibleElements],
  );

  const trackInteraction = (interaction: Interaction | null): void => {
    interactionRef.current = interaction;
    setActiveInteraction(interaction?.kind ?? null);
  };

  const findTransformHandle = useCallback(
    (point: Point): TransformHandleId | null => {
      if (view.tool !== 'select' || view.editingId || view.selectedIds.length === 0) return null;
      const selected = elements.filter((element) => view.selectedIds.includes(element.id));
      if (selected.length === 0 || selected.every((element) => element.locked)) return null;
      const tolerance = (RESIZE_HANDLE_SIZE + 5) / 2 / camera.zoom;
      for (const handle of getSelectionHandles(elements, view.selectedIds, camera.zoom)) {
        if (Math.hypot(point.x - handle.x, point.y - handle.y) <= tolerance) {
          return handle.id;
        }
      }
      return null;
    },
    [camera.zoom, elements, view.editingId, view.selectedIds, view.tool],
  );

  const findConnectorControl = useCallback(
    (point: Point): { element: AnyElement; control: ConnectorInteraction['control'] } | null => {
      if (view.tool !== 'select' || view.editingId || view.selectedIds.length !== 1) return null;
      const element = elements.find((candidate) => candidate.id === view.selectedIds[0]);
      if (!element || !isLinear(element) || element.locked) return null;
      const handles = getConnectorHandles(element, 20 / camera.zoom);
      const vertexIndex = handles.vertices.findIndex(
        (vertex) => Math.hypot(point.x - vertex.x, point.y - vertex.y) <= 8 / camera.zoom,
      );
      if (vertexIndex >= 0) {
        return { element, control: { kind: 'vertex', index: vertexIndex } };
      }
      const midpoint = handles.midpoints.find(
        (handle) =>
          Math.hypot(point.x - handle.point.x, point.y - handle.point.y) <= 7 / camera.zoom,
      );
      if (!midpoint) return null;
      return { element, control: { kind: 'segment', index: midpoint.index } };
    },
    [camera.zoom, elements, view.editingId, view.selectedIds, view.tool],
  );

  const copySelection = useCallback(
    (clipboard?: DataTransfer): boolean => {
      const ids = new Set(view.selectedIds);
      const selected = elements.filter((element) => ids.has(element.id));
      if (selected.length === 0) return false;
      const serialized = serializeClipboardElements(selected, document.assets);
      const parsed = parseClipboardContent(serialized);
      if (parsed.kind === 'scrawl') objectClipboardRef.current = structuredClone(parsed.payload);
      if (clipboard) {
        clipboard.setData('text/plain', serialized);
      } else if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(serialized).catch(() => undefined);
      }
      return true;
    },
    [document.assets, elements, view.selectedIds],
  );

  const pointerTarget = useCallback((): Point => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const screen =
      lastPointerScreenRef.current ??
      (rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 });
    return screenToWorld(camera, screen.x, screen.y);
  }, [camera]);

  const insertPlainText = useCallback(
    (text: string, target: Point): boolean => {
      if (!text) return false;
      if (text.length > MAX_ELEMENT_TEXT_LENGTH) {
        window.alert('Pasted text is too long for one canvas text object.');
        return true;
      }
      const fontSize = document.settings.defaults.fontSize;
      const size = measureTextSize(
        text,
        fontSize,
        document.settings.mode,
        document.settings.defaults.fontFamily,
      );
      const width = Math.max(24, size.width);
      const height = Math.max(fontSize * LINE_HEIGHT, size.height);
      actions.addElement(
        createElement('text', {
          x: target.x - width / 2,
          y: target.y - height / 2,
          width,
          height,
          text,
          layerId: view.activeLayerId,
          order: maxOrder(elements) + 1,
          renderStyle: document.settings.mode,
          ...document.settings.defaults,
        }),
      );
      return true;
    },
    [actions, document.settings, elements, view.activeLayerId],
  );

  const insertImageFiles = useCallback(
    async (files: File[], target: Point): Promise<void> => {
      const validationError = imageInsertionError(document, files);
      if (validationError) {
        window.alert(validationError);
        return;
      }
      try {
        const prepared = await Promise.all(files.map(prepareImageFile));
        const startOrder = maxOrder(elements) + 1;
        const cascade = 24 / camera.zoom;
        actions.addImages(
          prepared.map((image, index) => ({
            asset: image.asset,
            element: createElement('image', {
              x: target.x - image.width / 2 + index * cascade,
              y: target.y - image.height / 2 + index * cascade,
              width: image.width,
              height: image.height,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              assetId: image.asset.id,
              layerId: view.activeLayerId,
              order: startOrder + index,
            }),
          })),
        );
      } catch (error) {
        window.alert(imageInsertionFailureMessage(error));
      }
    },
    [actions, camera.zoom, document, elements, view.activeLayerId],
  );

  const pasteClipboardData = useCallback(
    (data: DataTransfer): boolean => {
      const target = pointerTarget();
      const files = [...data.files];
      if (files.length > 0) {
        void insertImageFiles(files, target);
        return true;
      }
      const text = data.getData('text/plain');
      const parsed = text ? parseClipboardContent(text) : { kind: 'text' as const };
      if (parsed.kind === 'scrawl') {
        actions.pasteElements(parsed.payload.elements, target, parsed.payload.assets);
        return true;
      }
      if (parsed.kind === 'invalid-scrawl') {
        window.alert('This Scrawl clipboard content is incomplete or invalid.');
        return true;
      }
      if (
        objectClipboardRef.current.elements.length > 0 &&
        (!text || text.includes('"type":"scrawl/clipboard"'))
      ) {
        actions.pasteElements(
          objectClipboardRef.current.elements,
          target,
          objectClipboardRef.current.assets,
        );
        return true;
      }
      return insertPlainText(text, target);
    },
    [actions, insertImageFiles, insertPlainText, pointerTarget],
  );

  useEffect(() => {
    const onCopy = (event: ClipboardEvent): void => {
      if (interactionRef.current) return;
      if (isEditableTarget(event.target) || !event.clipboardData) return;
      if (!copySelection(event.clipboardData)) return;
      event.preventDefault();
    };
    const onCut = (event: ClipboardEvent): void => {
      if (interactionRef.current) return;
      if (isEditableTarget(event.target) || !event.clipboardData) return;
      if (!copySelection(event.clipboardData)) return;
      event.preventDefault();
      actions.deleteSelected();
    };
    const onPaste = (event: ClipboardEvent): void => {
      if (interactionRef.current) return;
      if (isEditableTarget(event.target) || !event.clipboardData) return;
      if (!pasteClipboardData(event.clipboardData)) return;
      event.preventDefault();
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', onPaste);
    };
  }, [actions, copySelection, pasteClipboardData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        setRenderRevision((revision) => revision + 1);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        const rect = canvas.getBoundingClientRect();
        const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const anchor = screenToWorld(camera, screen.x, screen.y);
        const zoom = Math.min(4, Math.max(0.2, camera.zoom * Math.exp(-event.deltaY * 0.002)));
        actions.setCamera({
          zoom,
          x: screen.x - anchor.x * zoom,
          y: screen.y - anchor.y * zoom,
        });
        return;
      }
      actions.setCamera({ ...camera, x: camera.x - event.deltaX, y: camera.y - event.deltaY });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [actions, camera]);

  useEffect(() => {
    setAssetReadyCallback(() => setRenderRevision((revision) => revision + 1));
    return () => setAssetReadyCallback(null);
  }, []);

  useEffect(() => {
    const redrawForLoadedFonts = (): void => {
      setRenderRevision((revision) => revision + 1);
    };

    void window.document.fonts.ready.then(redrawForLoadedFonts);
    window.document.fonts.addEventListener('loadingdone', redrawForLoadedFonts);
    return () => window.document.fonts.removeEventListener('loadingdone', redrawForLoadedFonts);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    renderScene({
      canvas,
      elements: draft ? [...visibleElements, draft] : visibleElements,
      camera,
      theme: document.settings.theme,
      canvasColor,
      sketchStyle: document.settings.sketchStyle,
      selectedIds: view.selectedIds,
      editingId: view.editingId,
      marquee,
      guides,
      gridOn: document.settings.grid,
      dpr,
      resolveAsset: (assetId) => document.assets[assetId]?.data ?? null,
    });
    drawLaserTrail(canvas, camera, laserTrailRef.current, Date.now(), dpr);
  }, [
    camera,
    canvasColor,
    document.assets,
    document.settings.grid,
    document.settings.theme,
    draft,
    guides,
    marquee,
    renderRevision,
    document.settings.sketchStyle,
    view.selectedIds,
    view.editingId,
    visibleElements,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (laserTrailRef.current.length === 0) return;
      laserTrailRef.current = trimLaserTrail(laserTrailRef.current, Date.now());
      setRenderRevision((revision) => revision + 1);
    }, 50);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (interactionRef.current && event.key !== 'Escape' && isDocumentChangingShortcut(event)) {
        event.preventDefault();
        return;
      }
      if (event.code === 'Space' && !modifier && !event.altKey) {
        event.preventDefault();
        spacePressedRef.current = true;
        setSpacePressed(true);
        return;
      }
      if (modifier && key === 'a') {
        event.preventDefault();
        actions.selectAll();
        return;
      }
      if (modifier && key === 'd') {
        event.preventDefault();
        actions.duplicateSelected();
        return;
      }
      if (modifier && key === 'g') {
        event.preventDefault();
        if (event.shiftKey) actions.ungroupSelected();
        else actions.groupSelected();
        return;
      }
      if (modifier && (event.key === '[' || event.key === ']')) {
        event.preventDefault();
        if (event.key === ']') actions.reorderSelected(event.shiftKey ? 'front' : 'forward');
        else actions.reorderSelected(event.shiftKey ? 'back' : 'backward');
        return;
      }
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        actions.deleteSelected();
        return;
      }
      if (event.key === 'Escape') {
        if (view.openPanel) {
          actions.setOpenPanel(null);
          return;
        }
        actions.cancelTransaction();
        actions.select([]);
        actions.setTool('select');
        trackInteraction(null);
        setDraft(null);
        setGuides([]);
        setMarquee(null);
        return;
      }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        actions.nudgeSelected(
          event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0,
          event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0,
        );
        return;
      }
      if (modifier || event.altKey) return;
      if (key === 'm') {
        event.preventDefault();
        actions.toggleRenderMode();
        return;
      }
      const tool = toolShortcuts[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        actions.setTool(tool);
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return;
      spacePressedRef.current = false;
      setSpacePressed(false);
    };
    const onBlur = (): void => {
      spacePressedRef.current = false;
      setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [actions, view.openPanel]);

  const createDraft = (tool: Tool, start: Point): AnyElement | null => {
    if (!shapeTools.has(tool)) return null;
    const type = tool as ElementType;
    return createElement(type, {
      x: start.x,
      y: start.y,
      layerId: view.activeLayerId,
      width: 0,
      height: 0,
      order: maxOrder(elements) + 1,
      renderStyle: document.settings.mode,
      ...document.settings.defaults,
      ...(type === 'line' || type === 'arrow'
        ? {
            points: [
              { x: 0, y: 0 },
              { x: 0, y: 0 },
            ],
          }
        : {}),
      ...(type === 'freedraw' ? { points: [{ x: 0, y: 0 }] } : {}),
    });
  };

  const updateDraft = (
    interaction: DrawInteraction,
    point: Point,
    constrain: boolean,
  ): AnyElement => {
    const { startWorld, element } = interaction;
    if (element.type === 'line' || element.type === 'arrow') {
      const rawDelta = { x: point.x - startWorld.x, y: point.y - startWorld.y };
      const length = Math.hypot(rawDelta.x, rawDelta.y);
      const angle = constrain
        ? Math.round(Math.atan2(rawDelta.y, rawDelta.x) / CONSTRAINED_DRAW_ANGLE) *
          CONSTRAINED_DRAW_ANGLE
        : Math.atan2(rawDelta.y, rawDelta.x);
      const delta = constrain
        ? { x: Math.cos(angle) * length, y: Math.sin(angle) * length }
        : rawDelta;
      const next = {
        ...element,
        points: [{ x: 0, y: 0 }, delta],
        width: Math.abs(delta.x),
        height: Math.abs(delta.y),
      };
      interaction.element = next;
      return next;
    }
    if (element.type === 'freedraw') {
      const previous = element.points.at(-1)!;
      const nextPoint = { x: point.x - startWorld.x, y: point.y - startWorld.y };
      if (Math.hypot(nextPoint.x - previous.x, nextPoint.y - previous.y) < 1.5 / camera.zoom) {
        return element;
      }
      const next = { ...element, points: [...element.points, nextPoint] };
      interaction.element = next;
      return next;
    }
    let end = point;
    if (constrain) {
      const delta = { x: point.x - startWorld.x, y: point.y - startWorld.y };
      const size = Math.max(Math.abs(delta.x), Math.abs(delta.y));
      end = {
        x: startWorld.x + (delta.x < 0 ? -size : size),
        y: startWorld.y + (delta.y < 0 ? -size : size),
      };
    }
    const box = normalizedBox(startWorld, end);
    const next = { ...element, ...box };
    interaction.element = next;
    return next;
  };

  const eraseAtPoint = (interaction: EraseInteraction, point: Point): void => {
    const hit = findElementFrom(interaction.candidates, point, interaction.erasedIds);
    if (!hit) return;
    interaction.erasedIds.add(hit.id);
    actions.previewElements(
      interaction.source.filter((element) => !interaction.erasedIds.has(element.id)),
    );
  };

  const beginTextEditing = (type: 'text' | 'sticky', point: Point): void => {
    const placement = document.settings.snapToGrid ? snapPointToGrid(point) : point;
    const element = createElement(type, {
      x: placement.x,
      y: placement.y,
      layerId: view.activeLayerId,
      width: 180,
      height: type === 'sticky' ? 140 : 42,
      text: '',
      order: maxOrder(elements) + 1,
      renderStyle: document.settings.mode,
      ...document.settings.defaults,
    });
    actions.beginTransaction();
    actions.previewElements([...elements, element]);
    actions.setTool('select');
    actions.select([element.id]);
    actions.setEditingId(element.id);
  };

  const insertLibraryItemAtPoint = (transfer: DataTransfer, point: Point): boolean => {
    const value = readCanvasLibraryTransfer(transfer);
    if (!value) return false;
    if (value.kind === 'shape') {
      const item = findLibraryItem(value.id);
      if (!item) return false;
      actions.addElement(
        instantiateLibraryItem(item, {
          center: point,
          layerId: view.activeLayerId,
          order: maxOrder(elements) + 1,
          renderStyle: document.settings.mode,
          defaults: document.settings.defaults,
        }),
      );
    } else {
      const icon = getIconDef(value.id);
      if (!icon) return false;
      actions.addElement(
        createElement('icon', {
          x: point.x - 42,
          y: point.y - 42,
          width: 84,
          height: 84,
          iconId: icon.id,
          layerId: view.activeLayerId,
          order: maxOrder(elements) + 1,
          renderStyle: document.settings.mode,
          ...document.settings.defaults,
        }),
      );
    }
    actions.setOpenPanel(null);
    return true;
  };

  const acceptsDrop = (transfer: DataTransfer): boolean => {
    const types = [...transfer.types];
    return (
      types.includes(SCRAWL_LIBRARY_TRANSFER_TYPE) ||
      types.includes('Files') ||
      types.includes('text/plain')
    );
  };

  const onDrop = (event: React.DragEvent<HTMLCanvasElement>): void => {
    event.preventDefault();
    setDropActive(false);
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    lastPointerScreenRef.current = screen;
    const world = screenToWorld(camera, screen.x, screen.y);
    const files = [...event.dataTransfer.files];
    if (files.length > 0) {
      void insertImageFiles(files, world);
      return;
    }
    if (insertLibraryItemAtPoint(event.dataTransfer, world)) return;
    insertPlainText(event.dataTransfer.getData('text/plain'), world);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0 && event.button !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const screen = localPoint(event);
    lastPointerScreenRef.current = screen;
    const world = screenToWorld(camera, screen.x, screen.y);
    setHoveredElementId(null);

    if (event.button === 1 || view.tool === 'hand' || spacePressedRef.current) {
      trackInteraction({ kind: 'pan', startScreen: screen, camera });
      return;
    }

    if (view.tool === 'laser') {
      laserTrailRef.current.push({ ...world, startsStroke: true, timestamp: Date.now() });
      trackInteraction({ kind: 'laser' });
      setRenderRevision((revision) => revision + 1);
      return;
    }

    const connectorControl = findConnectorControl(world);
    if (connectorControl) {
      actions.beginTransaction();
      let source = elements;
      let control = connectorControl.control;
      if (
        control.kind === 'segment' &&
        isLinear(connectorControl.element) &&
        connectorControl.element.routing !== 'elbow'
      ) {
        const connector = insertConnectorWaypoint(connectorControl.element, control.index, world);
        source = elements.map((element) =>
          element.id === connectorControl.element.id ? connector : element,
        );
        control = { kind: 'vertex', index: control.index + 1 };
        actions.previewElements(source);
      }
      trackInteraction({
        kind: 'connector',
        source,
        elementId: connectorControl.element.id,
        control,
      });
      return;
    }

    const transformHandle = findTransformHandle(world);
    if (transformHandle) {
      const outline = getSelectionOutline(elements, view.selectedIds, camera.zoom);
      if (!outline) return;
      const ids = new Set(view.selectedIds);
      actions.beginTransaction();
      trackInteraction(
        transformHandle === 'rotate'
          ? {
              kind: 'rotate',
              source: elements,
              ids,
              pivot: outline.center,
              startPointerAngle: Math.atan2(world.y - outline.center.y, world.x - outline.center.x),
              startSelectionAngle: outline.angle,
            }
          : {
              kind: 'resize',
              source: elements,
              ids,
              sourceBounds: outline.box,
              frameCenter: outline.center,
              frameAngle: outline.angle,
              handle: transformHandle,
            },
      );
      setHoveredHandle(transformHandle);
      return;
    }

    if (view.tool === 'eraser') {
      const interaction: EraseInteraction = {
        kind: 'erase',
        source: elements,
        candidates: visibleElements,
        erasedIds: new Set(),
        lastWorld: world,
      };
      actions.beginTransaction();
      actions.select([]);
      trackInteraction(interaction);
      eraseAtPoint(interaction, world);
      return;
    }

    const hit = findElement(world);

    if (view.tool === 'text' || view.tool === 'sticky') {
      beginTextEditing(view.tool, world);
      return;
    }

    if (shapeTools.has(view.tool)) {
      const start =
        document.settings.snapToGrid && view.tool !== 'freedraw' ? snapPointToGrid(world) : world;
      const element = createDraft(view.tool, start);
      if (!element) return;
      trackInteraction({ kind: 'draw', startWorld: start, element });
      setDraft(element);
      return;
    }

    if (hit) {
      const groupedIds = expandGroupedSelection(elements, hit.id);
      const groupIsSelected = groupedIds.every((id) => view.selectedIds.includes(id));
      let ids = groupIsSelected ? view.selectedIds : groupedIds;
      if (event.shiftKey) {
        const grouped = new Set(groupedIds);
        ids = groupIsSelected
          ? view.selectedIds.filter((id) => !grouped.has(id))
          : [...new Set([...view.selectedIds, ...groupedIds])];
      }
      actions.select(ids);
      if (ids.includes(hit.id)) {
        const sourceBounds = getSelectionBounds(elements, ids);
        if (!sourceBounds) return;
        actions.beginTransaction();
        trackInteraction({
          kind: 'move',
          startWorld: world,
          source: elements,
          ids: new Set(ids),
          sourceBounds,
        });
      }
      return;
    }

    if (!event.shiftKey) actions.select([]);
    trackInteraction({ kind: 'marquee', startWorld: world, currentWorld: world });
    setMarquee({ x: world.x, y: world.y, width: 0, height: 0 });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const interaction = interactionRef.current;
    const screen = localPoint(event);
    lastPointerScreenRef.current = screen;
    const world = screenToWorld(camera, screen.x, screen.y);
    if (!interaction) {
      const handle = findTransformHandle(world);
      setHoveredHandle(handle);
      setHoveredElementId(handle ? null : (findElement(world)?.id ?? null));
      return;
    }

    if (interaction.kind === 'pan') {
      actions.setCamera({
        ...interaction.camera,
        x: interaction.camera.x + screen.x - interaction.startScreen.x,
        y: interaction.camera.y + screen.y - interaction.startScreen.y,
      });
      return;
    }
    if (interaction.kind === 'laser') {
      const previous = laserTrailRef.current.at(-1);
      if (!previous || Math.hypot(world.x - previous.x, world.y - previous.y) >= 1 / camera.zoom) {
        laserTrailRef.current.push({ ...world, startsStroke: false, timestamp: Date.now() });
        setRenderRevision((revision) => revision + 1);
      }
      return;
    }
    if (interaction.kind === 'draw') {
      const point =
        document.settings.snapToGrid && interaction.element.type !== 'freedraw'
          ? snapPointToGrid(world)
          : world;
      setDraft(updateDraft(interaction, point, event.shiftKey));
      return;
    }
    if (interaction.kind === 'erase') {
      for (const point of eraserSegmentPoints(interaction.lastWorld, world, 4 / camera.zoom)) {
        eraseAtPoint(interaction, point);
      }
      interaction.lastWorld = world;
      return;
    }
    if (interaction.kind === 'marquee') {
      interaction.currentWorld = world;
      setMarquee(normalizedBox(interaction.startWorld, world));
      return;
    }
    if (interaction.kind === 'resize') {
      const stationary = visibleElements.filter((element) => !interaction.ids.has(element.id));
      let pointer = world;
      if (document.settings.snapToGrid) {
        pointer = snapPointToGrid(world);
        setGuides([]);
      } else if (!event.altKey) {
        const horizontal = interaction.handle.includes('e') || interaction.handle.includes('w');
        const vertical = interaction.handle.includes('n') || interaction.handle.includes('s');
        const snapped = snapPointToElements(world, stationary, 6 / camera.zoom, {
          x: horizontal,
          y: vertical,
        });
        pointer = snapped.point;
        setGuides(snapped.guides);
      } else {
        setGuides([]);
      }
      const localPointer = rotatePoint(
        pointer,
        interaction.frameCenter,
        -normalizeAngle(interaction.frameAngle),
      );
      const targetBounds = resizeBoxFromHandle(
        interaction.sourceBounds,
        interaction.handle,
        localPointer,
        {
          keepAspectRatio: event.shiftKey,
          minimumSize: 12 / camera.zoom,
        },
      );
      const resized = resizeElementsInFrame(
        interaction.source,
        interaction.ids,
        interaction.sourceBounds,
        targetBounds,
        interaction.frameCenter,
        interaction.frameAngle,
      );
      actions.previewElements(updateBoundConnectors(resized, interaction.ids));
      return;
    }
    if (interaction.kind === 'rotate') {
      const pointerAngle = Math.atan2(world.y - interaction.pivot.y, world.x - interaction.pivot.x);
      const rawDelta = normalizeAngle(pointerAngle - interaction.startPointerAngle);
      const delta = event.shiftKey
        ? normalizeAngle(
            snapRotationAngle(interaction.startSelectionAngle + rawDelta) -
              interaction.startSelectionAngle,
          )
        : rawDelta;
      const rotated = rotateElements(interaction.source, interaction.ids, interaction.pivot, delta);
      setGuides([]);
      actions.previewElements(updateBoundConnectors(rotated, interaction.ids));
      return;
    }
    if (interaction.kind === 'connector') {
      const connector = interaction.source.find((element) => element.id === interaction.elementId);
      if (!connector || !isLinear(connector)) return;
      const pointer = document.settings.snapToGrid ? snapPointToGrid(world) : world;
      const moved =
        interaction.control.kind === 'vertex'
          ? moveConnectorVertex(connector, interaction.control.index, pointer)
          : moveConnectorSegment(connector, interaction.control.index, pointer);
      const lastIndex = moved.points.length - 1;
      const rebound =
        interaction.control.kind === 'vertex' && interaction.control.index === 0
          ? bindConnectorEndpoint(moved, interaction.source, 'start', pointer, 10 / camera.zoom)
          : interaction.control.kind === 'vertex' && interaction.control.index === lastIndex
            ? bindConnectorEndpoint(moved, interaction.source, 'end', pointer, 10 / camera.zoom)
            : moved;
      const next = interaction.source.map((element) =>
        element.id === interaction.elementId ? rebound : element,
      );
      actions.previewElements(updateBoundConnectors(next, new Set([interaction.elementId])));
      return;
    }

    const requestedDelta = {
      x: world.x - interaction.startWorld.x,
      y: world.y - interaction.startWorld.y,
    };
    let delta = requestedDelta;
    if (document.settings.snapToGrid) {
      delta = snapSelectionMoveToGrid(interaction.sourceBounds, requestedDelta);
      setGuides([]);
    } else if (!event.altKey) {
      const stationary = visibleElements.filter((element) => !interaction.ids.has(element.id));
      const snapped = snapSelectionMove(
        interaction.sourceBounds,
        requestedDelta,
        stationary,
        6 / camera.zoom,
      );
      delta = snapped.delta;
      setGuides(snapped.guides);
    } else {
      setGuides([]);
    }
    const moved = interaction.source.map((element) => {
      if (!interaction.ids.has(element.id)) return element;
      return {
        ...element,
        x: element.x + delta.x,
        y: element.y + delta.y,
        version: element.version + 1,
      };
    });
    actions.previewElements(updateBoundConnectors(moved, interaction.ids));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const interaction = interactionRef.current;
    trackInteraction(null);
    setGuides([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!interaction) return;

    if (
      interaction.kind === 'move' ||
      interaction.kind === 'resize' ||
      interaction.kind === 'rotate' ||
      interaction.kind === 'connector' ||
      interaction.kind === 'erase'
    ) {
      actions.commitTransaction();
    }
    if (interaction.kind === 'draw') {
      const element = interaction.element;
      const useful =
        element.type === 'freedraw'
          ? element.points.length > 1
          : element.type === 'line' || element.type === 'arrow'
            ? Math.hypot(element.points[1]!.x, element.points[1]!.y) > 3
            : element.width > 3 && element.height > 3;
      if (useful) {
        const next =
          element.type === 'line' || element.type === 'arrow'
            ? bindConnectorEndpoints(element, elements, 10 / camera.zoom)
            : element;
        actions.addElement(
          next,
          element.type === 'freedraw' ? { selectAfterInsert: false } : undefined,
        );
      }
      setDraft(null);
    }
    if (interaction.kind === 'marquee') {
      const box = normalizedBox(interaction.startWorld, interaction.currentWorld);
      const ids = visibleElements
        .filter((element) => boxesIntersect(getElementBounds(element), box))
        .map((element) => element.id);
      actions.select(ids);
      setMarquee(null);
    }
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const world = screenToWorld(camera, event.clientX - rect.left, event.clientY - rect.top);
    const element =
      findElement(world) ??
      visibleElements
        .toReversed()
        .find(
          (candidate) =>
            supportsInlineText(candidate) && boxContainsPoint(getElementBounds(candidate), world),
        );
    if (!element) {
      if (view.tool === 'select') beginTextEditing('text', world);
      return;
    }
    if (!supportsInlineText(element)) return;
    actions.beginTransaction();
    actions.setTool('select');
    actions.select([element.id]);
    actions.setEditingId(element.id);
  };

  const fitScene = (): void => {
    const canvas = canvasRef.current;
    const bounds = getSceneBounds(visibleElements);
    if (!canvas || !bounds) {
      actions.setCamera({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const zoom = Math.min(
      1.5,
      Math.max(
        0.2,
        Math.min(
          (rect.width - 160) / Math.max(bounds.width, 1),
          (rect.height - 160) / Math.max(bounds.height, 1),
        ),
      ),
    );
    actions.setCamera({
      zoom,
      x: rect.width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: rect.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    });
  };

  return (
    <div
      className="canvas-wrap"
      data-theme={document.settings.theme}
      style={{ backgroundColor: canvasColor }}
    >
      <canvas
        aria-describedby="canvas-keyboard-help"
        aria-keyshortcuts="V H R O D A L P K T N E M Space Delete ArrowLeft ArrowRight ArrowUp ArrowDown"
        aria-label="Drawing canvas"
        className="canvas-board"
        data-drop-active={dropActive ? 'true' : undefined}
        data-hover-element={hoveredElementId ? 'true' : undefined}
        data-interaction={activeInteraction ?? undefined}
        data-space-pressed={spacePressed ? 'true' : undefined}
        data-tool={view.tool}
        data-transform-handle={hoveredHandle ?? undefined}
        onDragEnter={(event) => {
          if (!acceptsDrop(event.dataTransfer)) return;
          event.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDragOver={(event) => {
          if (!acceptsDrop(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDropActive(true);
        }}
        onDrop={onDrop}
        onDoubleClick={handleDoubleClick}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerLeave={() => {
          if (!interactionRef.current) {
            setHoveredHandle(null);
            setHoveredElementId(null);
            setGuides([]);
          }
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        ref={canvasRef}
        tabIndex={0}
      />
      <p className="sr-only" id="canvas-keyboard-help">
        Choose a drawing tool with its letter shortcut. Command or Control A selects all objects.
        Hold Space and drag to pan. Double-click empty canvas to create text. Arrow keys move the
        selection; hold Shift for ten canvas units. Hold Shift while drawing to constrain shapes and
        lines. K activates the fading laser pointer. M toggles precise and sketch rendering. Delete
        removes the selection. Drag the round handle to rotate; hold Shift for fifteen-degree
        increments. Paste and dropped content is placed at the pointer. Command or Control Z undoes
        the last change.
      </p>
      <div aria-live="polite" className="sr-only">
        {view.selectedIds.length === 0
          ? 'No objects selected.'
          : `${view.selectedIds.length} object${view.selectedIds.length === 1 ? '' : 's'} selected.`}
      </div>
      {view.editingId ? <TextOverlay key={`text:${view.editingId}`} /> : null}
      <ContextualRadialMenu canvasRef={canvasRef} key={`menu:${view.selectedIds.join(':')}`} />
      {TOOL_FEEDBACK[view.tool] ? (
        <div aria-live="polite" className="tool-feedback" role="status">
          <strong>{TOOL_FEEDBACK[view.tool]!.label}</strong>
          <span>{TOOL_FEEDBACK[view.tool]!.hint}</span>
        </div>
      ) : null}
      <div className="zoom-control" aria-label="Zoom controls">
        <button
          aria-label="Zoom out"
          onClick={() => actions.setCamera({ ...camera, zoom: Math.max(0.2, camera.zoom / 1.15) })}
          type="button"
        >
          −
        </button>
        <button className="zoom-value" onClick={fitScene} title="Fit drawing" type="button">
          {Math.round(camera.zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => actions.setCamera({ ...camera, zoom: Math.min(4, camera.zoom * 1.15) })}
          type="button"
        >
          +
        </button>
      </div>
      {elements.length === 0 && !draft ? (
        <div className="empty-hint" aria-hidden="true">
          <span>Start anywhere</span>
          <p>Choose a shape or press R, O, A, T.</p>
        </div>
      ) : null}
    </div>
  );
}
