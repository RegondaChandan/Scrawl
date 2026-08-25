import { useEffect, useRef, useState } from 'react';
import { getActivePage } from '@scrawl/editor';
import {
  getElementCenter,
  measureTextSize,
  normalizeAngle,
  polylineMidpoint,
  worldToScreen,
} from '@scrawl/engine';
import {
  LABEL_FONT_SIZE,
  LINE_HEIGHT,
  canvasThemeForColor,
  isLabelable,
  resolveFont,
  themedColor,
  type AnyElement,
} from '@scrawl/schema';
import { useEditor } from './use-editor';

interface OverlayGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  textAlign: React.CSSProperties['textAlign'];
  color: string;
  padding: number;
}

const FREE_TEXT_EDITOR_EXTRA_WIDTH = 12;
const FREE_TEXT_EDITOR_EXTRA_HEIGHT = 4;

function editableValue(element: AnyElement): string {
  return element.type === 'text' || element.type === 'sticky'
    ? element.text
    : (element.label ?? '');
}

function geometryFor(element: AnyElement): OverlayGeometry | null {
  const fontFamily = resolveFont(element.fontFamily, element.renderStyle);
  if (element.type === 'text') {
    return {
      x: element.x,
      y: element.y,
      width: Math.max(80, element.width),
      height: Math.max(element.height, element.fontSize * LINE_HEIGHT),
      fontSize: element.fontSize,
      fontFamily,
      textAlign: element.textAlign,
      color: element.strokeColor,
      padding: 0,
    };
  }
  if (element.type === 'sticky') {
    return {
      x: element.x + 14,
      y: element.y + 14,
      width: Math.max(40, element.width - 28),
      height: Math.max(40, element.height - 28),
      fontSize: element.fontSize,
      fontFamily,
      textAlign: 'left',
      color: '#2b2a26',
      padding: 0,
    };
  }
  if (!isLabelable(element)) return null;
  if (element.type === 'line' || element.type === 'arrow') {
    const midpoint = polylineMidpoint(element.points);
    return {
      x: element.x + midpoint.x - 90,
      y: element.y + midpoint.y - 28,
      width: 180,
      height: 56,
      fontSize: LABEL_FONT_SIZE,
      fontFamily,
      textAlign: 'center',
      color: element.strokeColor,
      padding: 5,
    };
  }
  if (element.type === 'icon') {
    return {
      x: element.x - 24,
      y: element.y + element.height + 3,
      width: Math.max(108, element.width + 48),
      height: 56,
      fontSize: LABEL_FONT_SIZE - 2,
      fontFamily,
      textAlign: 'center',
      color: element.strokeColor,
      padding: 4,
    };
  }
  return {
    x: element.x + 7,
    y: element.y + Math.max(0, element.height / 2 - 36),
    width: Math.max(40, element.width - 14),
    height: Math.min(Math.max(44, element.height), 72),
    fontSize: LABEL_FONT_SIZE,
    fontFamily,
    textAlign: 'center',
    color: element.strokeColor,
    padding: 5,
  };
}

export function TextOverlay(): React.JSX.Element | null {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const finishedRef = useRef(false);
  const document = useEditor((state) => state.document);
  const editingId = useEditor((state) => state.view.editingId);
  const camera = useEditor((state) => state.view.camera);
  const actions = useEditor((state) => state.actions);
  const elements = getActivePage(document).elements;
  const element = elements.find((candidate) => candidate.id === editingId);
  const canvasTheme = canvasThemeForColor(document.settings.canvasColor, document.settings.theme);
  const [value, setValue] = useState(() => (element ? editableValue(element) : ''));

  useEffect(() => {
    let focusFrame = 0;
    const mountFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      });
    });
    return () => {
      window.cancelAnimationFrame(mountFrame);
      window.cancelAnimationFrame(focusFrame);
    };
  }, []);

  if (!element) return null;
  let geometry = geometryFor(element);
  if (!geometry) return null;
  if (element.type === 'text' && value !== element.text) {
    const size = measureTextSize(
      value || ' ',
      element.fontSize,
      element.renderStyle,
      element.fontFamily,
    );
    geometry = {
      ...geometry,
      width: Math.max(80, size.width),
      height: Math.max(element.fontSize * LINE_HEIGHT, size.height),
    };
  }
  const topLeft = worldToScreen(camera, geometry.x, geometry.y);
  const isFreeText = element.type === 'text';
  const center = isFreeText
    ? { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 }
    : getElementCenter(element);

  const commitValue = (): void => {
    actions.previewElements(
      elements.map((candidate) => {
        if (candidate.id !== element.id) return candidate;
        if (candidate.type === 'text') {
          const size = measureTextSize(
            value || ' ',
            candidate.fontSize,
            candidate.renderStyle,
            candidate.fontFamily,
          );
          return {
            ...candidate,
            text: value,
            width: Math.max(24, size.width),
            height: Math.max(candidate.fontSize * LINE_HEIGHT, size.height),
            version: candidate.version + 1,
          };
        }
        if (candidate.type === 'sticky') {
          return { ...candidate, text: value, version: candidate.version + 1 };
        }
        return { ...candidate, label: value, version: candidate.version + 1 };
      }),
    );
  };

  const finish = (): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if ((element.type === 'text' || element.type === 'sticky') && value.trim() === '') {
      actions.previewElements(elements.filter((candidate) => candidate.id !== element.id));
      actions.select([]);
    } else {
      commitValue();
    }
    actions.commitTransaction();
    actions.setEditingId(null);
  };

  return (
    <textarea
      aria-label={element.type === 'text' || element.type === 'sticky' ? 'Edit text' : 'Edit label'}
      className="text-overlay"
      onBlur={finish}
      onChange={(event) => setValue(event.currentTarget.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          finish();
        } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          finish();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      ref={textareaRef}
      spellCheck
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width: geometry.width * camera.zoom + (isFreeText ? FREE_TEXT_EDITOR_EXTRA_WIDTH : 0),
        height: geometry.height * camera.zoom + (isFreeText ? FREE_TEXT_EDITOR_EXTRA_HEIGHT : 0),
        padding: geometry.padding * camera.zoom,
        color: themedColor(geometry.color, canvasTheme),
        fontFamily: geometry.fontFamily,
        fontSize: geometry.fontSize * camera.zoom,
        lineHeight: LINE_HEIGHT,
        textAlign: geometry.textAlign,
        transform: `rotate(${normalizeAngle(element.angle)}rad)`,
        transformOrigin: `${(center.x - geometry.x) * camera.zoom}px ${(center.y - geometry.y) * camera.zoom}px`,
      }}
      value={value}
      wrap={isFreeText ? 'off' : 'soft'}
    />
  );
}
