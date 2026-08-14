import {
  hasPoints,
  hasText,
  isLabelable,
  isLinear,
  LINE_HEIGHT,
  type AnyElement,
  type ElementDefaults,
  type FontKey,
  type TextAlign,
} from '@scrawl/schema';
import { getActivePage, rotateElements } from '@scrawl/editor';
import {
  getElementCenter,
  measureTextSize,
  normalizeAngle,
  routeConnector,
  updateBoundConnectors,
} from '@scrawl/engine';
import { useEditor } from './use-editor';

export type StyleKey =
  'strokeColor' | 'backgroundColor' | 'strokeWidth' | 'strokeStyle' | 'opacity';

export function useSelectionProperties() {
  const document = useEditor((state) => state.document);
  const selectedIds = useEditor((state) => state.view.selectedIds);
  const actions = useEditor((state) => state.actions);
  const page = getActivePage(document);
  const selected = page.elements.filter((element) => selectedIds.includes(element.id));
  const selectedConnectors = selected.filter(isLinear);
  const typographyTargets = selected.filter((element) => hasText(element) || isLabelable(element));
  const textTargets = selected.filter(hasText);
  const alignedTextTargets = selected.filter(
    (element): element is Extract<AnyElement, { type: 'text' }> => element.type === 'text',
  );
  const representative = selected[0];
  const typographyRepresentative = typographyTargets[0];
  const defaults = document.settings.defaults;

  const value = <K extends StyleKey>(key: K): AnyElement[K] | ElementDefaults[K] =>
    representative?.[key] ?? defaults[key];

  const applyStyle = <K extends StyleKey>(key: K, nextValue: AnyElement[K]): void => {
    if (selected.length > 0) {
      actions.updateElements(selectedIds, (element) => ({
        ...element,
        [key]: nextValue,
        version: element.version + 1,
      }));
      return;
    }
    actions.updateSettings({ defaults: { ...defaults, [key]: nextValue } });
  };

  const applyRenderStyle = (mode: 'crisp' | 'rough'): void => {
    actions.updateSettings({ mode });
    if (selected.length === 0) return;
    actions.updateElements(selectedIds, (element) => ({
      ...element,
      renderStyle: mode,
      version: element.version + 1,
    }));
  };

  const applyRouting = (routing: 'straight' | 'elbow'): void => {
    const byId = new Map(page.elements.map((element) => [element.id, element] as const));
    actions.updateElements(
      selectedConnectors.map((element) => element.id),
      (element) => {
        if (!isLinear(element)) return element;
        const first = element.points[0]!;
        const last = element.points.at(-1)!;
        const start = { x: element.x + first.x, y: element.y + first.y };
        const end = { x: element.x + last.x, y: element.y + last.y };
        return routeConnector(
          {
            ...element,
            x: start.x,
            y: start.y,
            points: [
              { x: 0, y: 0 },
              { x: end.x - start.x, y: end.y - start.y },
            ],
            routing,
            fixedPoints: false,
            version: element.version + 1,
          },
          byId,
        );
      },
    );
  };

  const applyFontFamily = (fontFamily: FontKey | 'auto'): void => {
    if (selected.length > 0) {
      const ids = typographyTargets.map((element) => element.id);
      actions.updateElements(ids, (element) => {
        const next = { ...element, version: element.version + 1 };
        if (fontFamily === 'auto') delete next.fontFamily;
        else next.fontFamily = fontFamily;
        if (next.type === 'text') {
          const measured = measureTextSize(
            next.text || ' ',
            next.fontSize,
            next.renderStyle,
            next.fontFamily,
          );
          next.width = Math.max(24, measured.width);
          next.height = Math.max(next.fontSize * LINE_HEIGHT, measured.height);
        }
        return next;
      });
      return;
    }
    const nextDefaults = { ...defaults };
    if (fontFamily === 'auto') delete nextDefaults.fontFamily;
    else nextDefaults.fontFamily = fontFamily;
    actions.updateSettings({ defaults: nextDefaults });
  };

  const applyFontSize = (fontSize: number): void => {
    const size = Math.min(96, Math.max(8, fontSize));
    if (selected.length > 0) {
      actions.updateElements(
        textTargets.map((element) => element.id),
        (element) => {
          if (!hasText(element)) return element;
          if (element.type === 'text') {
            const measured = measureTextSize(
              element.text || ' ',
              size,
              element.renderStyle,
              element.fontFamily,
            );
            return {
              ...element,
              fontSize: size,
              width: Math.max(24, measured.width),
              height: Math.max(size * LINE_HEIGHT, measured.height),
              version: element.version + 1,
            };
          }
          return { ...element, fontSize: size, version: element.version + 1 };
        },
      );
      return;
    }
    actions.updateSettings({ defaults: { ...defaults, fontSize: size } });
  };

  const applyTextAlignment = (textAlign: TextAlign): void => {
    actions.updateElements(
      alignedTextTargets.map((element) => element.id),
      (element) =>
        element.type === 'text' ? { ...element, textAlign, version: element.version + 1 } : element,
    );
  };

  const applyRotation = (degrees: number): void => {
    if (!representative || selected.length !== 1 || hasPoints(representative)) return;
    const target = normalizeAngle((degrees * Math.PI) / 180);
    const ids = new Set([representative.id]);
    const rotated = rotateElements(
      page.elements,
      ids,
      getElementCenter(representative),
      target - normalizeAngle(representative.angle),
    );
    actions.beginTransaction();
    actions.previewElements(updateBoundConnectors(rotated, ids));
    actions.commitTransaction();
  };

  return {
    actions,
    alignedTextTargets,
    applyFontFamily,
    applyFontSize,
    applyRenderStyle,
    applyRotation,
    applyRouting,
    applyStyle,
    applyTextAlignment,
    defaults,
    document,
    page,
    representative,
    selected,
    selectedConnectors,
    selectedIds,
    textTargets,
    typographyRepresentative,
    typographyTargets,
    value,
  };
}
