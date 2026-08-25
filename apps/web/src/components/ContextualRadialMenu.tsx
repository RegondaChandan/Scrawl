import { useEffect, useMemo, useState, type RefObject } from 'react';
import {
  IconBoxMultiple,
  IconBrush,
  IconCopy,
  IconLayersSubtract,
  IconLock,
  IconPaint,
  IconPencil,
  IconScribble,
  IconTarget,
  IconTypography,
} from '@tabler/icons-react';
import {
  BACKGROUND_COLORS,
  FONT_STACKS,
  STROKE_COLORS,
  type AnyElement,
  type FontKey,
} from '@scrawl/schema';
import { recognizeFreedraw } from '@scrawl/editor';
import { getSelectionBounds, worldToScreen } from '@scrawl/engine';
import { useSelectionProperties } from '../use-selection-properties';
import { useEditor } from '../use-editor';
import { useUiPreferences } from '../ui-preferences';

type RadialCategory = 'style' | 'stroke' | 'fill' | 'text' | 'arrange';

interface ContextualRadialMenuProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

const FONT_OPTIONS: Array<{ value: FontKey | 'auto'; label: string }> = [
  { value: 'auto', label: 'Automatic' },
  { value: 'clean', label: 'Clean' },
  { value: 'hand', label: 'Handwritten' },
  { value: 'marker', label: 'Marker' },
  { value: 'mono', label: 'Monospace' },
  { value: 'space-grotesk', label: 'Space Grotesk' },
  { value: 'caveat', label: 'Caveat' },
  { value: 'kalam', label: 'Kalam' },
  { value: 'ibm-plex-mono', label: 'IBM Plex Mono' },
];

const CATEGORY_ICONS = {
  style: IconBrush,
  stroke: IconPencil,
  fill: IconPaint,
  text: IconTypography,
  arrange: IconLayersSubtract,
} satisfies Record<RadialCategory, typeof IconBrush>;

const CATEGORIES: Array<{ id: RadialCategory; label: string }> = [
  { id: 'style', label: 'Style' },
  { id: 'stroke', label: 'Stroke' },
  { id: 'fill', label: 'Fill' },
  { id: 'text', label: 'Text' },
  { id: 'arrange', label: 'Arrange' },
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function ContextualRadialMenu({
  canvasRef,
}: ContextualRadialMenuProps): React.JSX.Element | null {
  const [activeCategory, setActiveCategory] = useState<RadialCategory>('style');
  const [recognitionMessage, setRecognitionMessage] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const view = useEditor((state) => state.view);
  const { propertyEditorMode } = useUiPreferences();
  const {
    actions,
    applyFontFamily,
    applyFontSize,
    applyRenderStyle,
    applyStyle,
    defaults,
    document,
    page,
    representative,
    selected,
    textTargets,
    typographyRepresentative,
    value,
  } = useSelectionProperties();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = (): void => {
      const rect = canvas.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  const position = useMemo(() => {
    const bounds = getSelectionBounds(page.elements, view.selectedIds);
    if (!bounds || canvasSize.width === 0 || canvasSize.height === 0) return null;
    const topLeft = worldToScreen(view.camera, bounds.x, bounds.y);
    const bottomRight = worldToScreen(
      view.camera,
      bounds.x + bounds.width,
      bounds.y + bounds.height,
    );
    const selectionCenterX = (topLeft.x + bottomRight.x) / 2;
    const menuHalfWidth = Math.min(250, Math.max(150, canvasSize.width / 2 - 18));
    const left = clamp(selectionCenterX, menuHalfWidth + 14, canvasSize.width - menuHalfWidth - 14);
    const placeAbove = topLeft.y >= 176;
    const top = placeAbove
      ? Math.max(12, topLeft.y - 148)
      : Math.min(canvasSize.height - 154, bottomRight.y + 18);
    return {
      left,
      placement: placeAbove ? 'above' : 'below',
      top,
    } as const;
  }, [canvasSize, page.elements, view.camera, view.selectedIds]);

  if (
    propertyEditorMode !== 'radial' ||
    selected.length === 0 ||
    view.tool !== 'select' ||
    view.editingId ||
    !position
  ) {
    return null;
  }

  const currentRenderStyle = representative?.renderStyle ?? document.settings.mode;
  const currentFont = typographyRepresentative?.fontFamily ?? defaults.fontFamily ?? 'auto';

  const renderOptions = (): React.JSX.Element => {
    switch (activeCategory) {
      case 'style':
        return (
          <div className="radial-options-content radial-style-options">
            <div aria-label="Rendering style" className="radial-option-segment" role="group">
              <button
                data-active={currentRenderStyle === 'crisp' || undefined}
                onClick={() => applyRenderStyle('crisp')}
                type="button"
              >
                <IconTarget aria-hidden="true" size={18} stroke={1.8} />
                Precise
              </button>
              <button
                data-active={currentRenderStyle === 'rough' || undefined}
                onClick={() => applyRenderStyle('rough')}
                type="button"
              >
                <IconScribble aria-hidden="true" size={19} stroke={1.8} />
                Sketch
              </button>
            </div>
            {currentRenderStyle === 'rough' ? (
              <div aria-label="Sketch texture" className="radial-option-segment" role="group">
                {(['pencil', 'marker'] as const).map((texture) => (
                  <button
                    data-active={document.settings.sketchStyle === texture || undefined}
                    key={texture}
                    onClick={() => actions.updateSettings({ sketchStyle: texture })}
                    type="button"
                  >
                    {texture === 'pencil' ? 'Pencil' : 'Marker'}
                  </button>
                ))}
              </div>
            ) : null}
            {selected.length === 1 &&
            representative?.type === 'freedraw' &&
            !representative.locked ? (
              <>
                <button
                  className="radial-recognition-button"
                  onClick={() => {
                    const recognized = recognizeFreedraw(representative);
                    if (!recognized) {
                      setRecognitionMessage('Try a cleaner outline.');
                      return;
                    }
                    actions.updateElements([representative.id], () => recognized);
                    setRecognitionMessage(
                      `Converted to ${recognized.type === 'shape' ? recognized.shapeKind : recognized.type}.`,
                    );
                  }}
                  type="button"
                >
                  {recognitionMessage || 'Recognize stroke'}
                </button>
              </>
            ) : null}
          </div>
        );
      case 'stroke':
        return (
          <div aria-label="Stroke options" className="radial-options-content" role="group">
            <div className="radial-color-row">
              {STROKE_COLORS.map((color) => (
                <button
                  aria-label={`Stroke ${color}`}
                  className="color-swatch radial-swatch"
                  data-active={value('strokeColor') === color || undefined}
                  key={color}
                  onClick={() => applyStyle('strokeColor', color)}
                  style={{ '--swatch': color } as React.CSSProperties}
                  type="button"
                />
              ))}
            </div>
            <label>
              <span>Width</span>
              <select
                onChange={(event) => applyStyle('strokeWidth', Number(event.currentTarget.value))}
                value={value('strokeWidth')}
              >
                <option value="1">Fine</option>
                <option value="2">Regular</option>
                <option value="4">Bold</option>
              </select>
            </label>
            <label>
              <span>Line</span>
              <select
                onChange={(event) =>
                  applyStyle('strokeStyle', event.currentTarget.value as AnyElement['strokeStyle'])
                }
                value={value('strokeStyle')}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dash</option>
                <option value="dotted">Dot</option>
              </select>
            </label>
          </div>
        );
      case 'fill':
        return (
          <div aria-label="Fill colors" className="radial-color-row" role="group">
            {BACKGROUND_COLORS.map((color) => (
              <button
                aria-label={`Fill ${color}`}
                className="color-swatch radial-swatch"
                data-active={value('backgroundColor') === color || undefined}
                data-transparent={color === 'transparent' || undefined}
                key={color}
                onClick={() => applyStyle('backgroundColor', color)}
                style={{ '--swatch': color } as React.CSSProperties}
                type="button"
              />
            ))}
          </div>
        );
      case 'text':
        return (
          <div aria-label="Text options" className="radial-options-content radial-text-options">
            <label>
              <span>Font</span>
              <select
                onChange={(event) => applyFontFamily(event.currentTarget.value as FontKey | 'auto')}
                value={currentFont}
              >
                {FONT_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    style={
                      option.value === 'auto'
                        ? undefined
                        : { fontFamily: FONT_STACKS[option.value] }
                    }
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Size</span>
              <input
                aria-label="Font size"
                max="96"
                min="8"
                onChange={(event) => applyFontSize(Number(event.currentTarget.value))}
                type="number"
                value={textTargets[0]?.fontSize ?? defaults.fontSize}
              />
            </label>
          </div>
        );
      case 'arrange': {
        const grouped = selected.some((element) => element.groupIds?.length);
        return (
          <div aria-label="Arrange options" className="radial-arrange-options" role="group">
            <button onClick={actions.duplicateSelected} type="button">
              <IconCopy aria-hidden="true" size={17} stroke={1.8} />
              Duplicate
            </button>
            <button
              onClick={grouped ? actions.ungroupSelected : actions.groupSelected}
              type="button"
            >
              <IconBoxMultiple aria-hidden="true" size={17} stroke={1.8} />
              {grouped ? 'Ungroup' : 'Group'}
            </button>
            <button onClick={actions.toggleLockSelected} type="button">
              <IconLock aria-hidden="true" size={17} stroke={1.8} />
              {selected.every((element) => element.locked) ? 'Unlock' : 'Lock'}
            </button>
          </div>
        );
      }
    }
  };

  return (
    <div
      aria-label="Selected object controls"
      className="radial-menu"
      data-placement={position.placement}
      onPointerDown={(event) => event.stopPropagation()}
      role="toolbar"
      style={{ left: position.left, top: position.top }}
    >
      <div className="radial-options">{renderOptions()}</div>
      <div className="radial-categories">
        {CATEGORIES.map((category) => {
          const CategoryIcon = CATEGORY_ICONS[category.id];
          return (
            <button
              aria-expanded={activeCategory === category.id}
              aria-label={`${category.label} options`}
              className="radial-category"
              data-active={activeCategory === category.id || undefined}
              data-category={category.id}
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              onMouseEnter={() => setActiveCategory(category.id)}
              title={category.label}
              type="button"
            >
              <CategoryIcon aria-hidden="true" size={21} stroke={1.75} />
              <span>{category.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
