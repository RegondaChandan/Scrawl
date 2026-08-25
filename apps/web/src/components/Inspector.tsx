import { useState } from 'react';
import {
  BACKGROUND_COLORS,
  FONT_STACKS,
  STROKE_COLORS,
  hasPoints,
  type AnyElement,
  type FontKey,
} from '@scrawl/schema';
import { recognizeFreedraw, type Alignment } from '@scrawl/editor';
import { normalizeAngle } from '@scrawl/engine';
import { useSelectionProperties } from '../use-selection-properties';
import { CanvasColorPicker } from './CanvasColorPicker';
import { Layers } from './Layers';

const ALIGNMENT_LABELS: Record<Alignment, string> = {
  left: 'L',
  center: 'C',
  right: 'R',
  top: 'T',
  middle: 'M',
  bottom: 'B',
};

const SCRAWL_FONT_OPTIONS: Array<{ value: FontKey; label: string }> = [
  { value: 'clean', label: 'Clean' },
  { value: 'hand', label: 'Handwritten' },
  { value: 'marker', label: 'Marker' },
  { value: 'mono', label: 'Monospace' },
];

const ADDITIONAL_FONT_OPTIONS: Array<{ value: FontKey; label: string }> = [
  { value: 'space-grotesk', label: 'Space Grotesk' },
  { value: 'caveat', label: 'Caveat' },
  { value: 'kalam', label: 'Kalam' },
  { value: 'ibm-plex-mono', label: 'IBM Plex Mono' },
];

interface RotationFieldProps {
  angle: number;
  onCommit: (degrees: number) => void;
}

function RotationField({ angle, onCommit }: RotationFieldProps): React.JSX.Element {
  const degrees = Math.round((normalizeAngle(angle) * 180) / Math.PI);
  const [value, setValue] = useState(String(degrees));

  const commit = (): void => {
    const next = Number(value);
    if (!Number.isFinite(next)) {
      setValue(String(degrees));
      return;
    }
    const clamped = Math.min(180, Math.max(-180, next));
    setValue(String(clamped));
    onCommit(clamped);
  };

  return (
    <div className="number-with-unit">
      <input
        id="selection-rotation"
        max="180"
        min="-180"
        onBlur={commit}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setValue(String(degrees));
            event.currentTarget.blur();
          }
        }}
        step="1"
        type="number"
        value={value}
      />
      <span aria-hidden="true">°</span>
    </div>
  );
}

export function Inspector(): React.JSX.Element {
  const [recognitionMessage, setRecognitionMessage] = useState('');
  const {
    actions,
    alignedTextTargets,
    applyFontFamily,
    applyFontSize,
    applyRenderStyle,
    applyRotation,
    applyRouting,
    applyStyle: apply,
    applyTextAlignment,
    defaults,
    document,
    representative,
    selected,
    selectedConnectors,
    textTargets,
    typographyRepresentative,
    typographyTargets,
    value,
  } = useSelectionProperties();
  const currentRenderStyle = representative?.renderStyle ?? document.settings.mode;

  const recognizeSelection = (): void => {
    if (!representative || representative.type !== 'freedraw') return;
    const recognized = recognizeFreedraw(representative);
    if (!recognized) {
      setRecognitionMessage('Try a cleaner outline or straighter stroke.');
      return;
    }
    actions.updateElements([representative.id], () => recognized);
    setRecognitionMessage(
      `Converted to ${recognized.type === 'shape' ? recognized.shapeKind : recognized.type}.`,
    );
  };

  return (
    <aside className="inspector" aria-label="Style inspector">
      <div className="inspector-heading">
        <div className="inspector-heading-copy">
          <span>{selected.length > 0 ? 'Selection' : 'Next shape'}</span>
          {selected.length > 0 ? <b>{selected.length}</b> : null}
        </div>
      </div>

      <section className="inspector-section">
        <div className="inspector-label-row">
          <label>Rendering</label>
          <kbd title="Toggle precise and sketch rendering">M</kbd>
        </div>
        <div className="segment-control">
          {(['crisp', 'rough'] as const).map((mode) => (
            <button
              data-active={currentRenderStyle === mode || undefined}
              key={mode}
              onClick={() => applyRenderStyle(mode)}
              type="button"
            >
              {mode === 'crisp' ? 'Precise' : 'Sketch'}
            </button>
          ))}
        </div>
        {currentRenderStyle === 'rough' ? (
          <div aria-label="Sketch texture" className="segment-control texture-control" role="group">
            {(['pencil', 'marker'] as const).map((texture) => (
              <button
                data-active={document.settings.sketchStyle === texture || undefined}
                key={texture}
                onClick={() => actions.updateSettings({ sketchStyle: texture })}
                title={texture === 'pencil' ? 'Calm, lighter strokes' : 'Bolder, organic strokes'}
                type="button"
              >
                {texture === 'pencil' ? 'Pencil' : 'Marker'}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {selected.length === 1 && representative?.type === 'freedraw' && !representative.locked ? (
        <section className="inspector-section recognition-section">
          <label>Shape recognition</label>
          <button className="recognition-button" onClick={recognizeSelection} type="button">
            Recognize stroke
          </button>
          {recognitionMessage ? <p role="status">{recognitionMessage}</p> : null}
        </section>
      ) : null}

      <section className="inspector-section">
        <label>Stroke</label>
        <div className="color-row">
          {STROKE_COLORS.map((color) => (
            <button
              aria-label={`Stroke ${color}`}
              className="color-swatch"
              data-active={value('strokeColor') === color || undefined}
              key={color}
              onClick={() => apply('strokeColor', color)}
              style={{ '--swatch': color } as React.CSSProperties}
              type="button"
            />
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <label>Fill</label>
        <div className="color-row">
          {BACKGROUND_COLORS.map((color) => (
            <button
              aria-label={`Fill ${color}`}
              className="color-swatch"
              data-active={value('backgroundColor') === color || undefined}
              data-transparent={color === 'transparent' || undefined}
              key={color}
              onClick={() => apply('backgroundColor', color)}
              style={{ '--swatch': color } as React.CSSProperties}
              type="button"
            />
          ))}
        </div>
      </section>

      <section className="inspector-section inspector-grid">
        <label>
          Width
          <select
            onChange={(event) => apply('strokeWidth', Number(event.currentTarget.value))}
            value={value('strokeWidth')}
          >
            <option value="1">Fine</option>
            <option value="2">Regular</option>
            <option value="4">Bold</option>
          </select>
        </label>
        <label>
          Line
          <select
            onChange={(event) =>
              apply('strokeStyle', event.currentTarget.value as AnyElement['strokeStyle'])
            }
            value={value('strokeStyle')}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dash</option>
            <option value="dotted">Dot</option>
          </select>
        </label>
      </section>

      {selected.length === 0 || typographyTargets.length > 0 ? (
        <section className="inspector-section typography-section">
          <label>Typography</label>
          <div className="typography-grid">
            <label>
              Font
              <select
                aria-label="Font family"
                onChange={(event) => applyFontFamily(event.currentTarget.value as FontKey | 'auto')}
                value={typographyRepresentative?.fontFamily ?? defaults.fontFamily ?? 'auto'}
              >
                <option value="auto">Automatic</option>
                <optgroup label="Scrawl styles">
                  {SCRAWL_FONT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      style={{ fontFamily: FONT_STACKS[option.value] }}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Additional fonts">
                  {ADDITIONAL_FONT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      style={{ fontFamily: FONT_STACKS[option.value] }}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            {selected.length === 0 || textTargets.length > 0 ? (
              <label>
                Size
                <input
                  aria-label="Font size"
                  max="96"
                  min="8"
                  onChange={(event) => applyFontSize(Number(event.currentTarget.value))}
                  type="number"
                  value={textTargets[0]?.fontSize ?? defaults.fontSize}
                />
              </label>
            ) : null}
          </div>
          {alignedTextTargets.length > 0 ? (
            <div className="segment-control text-alignment" aria-label="Text alignment">
              {(['left', 'center', 'right'] as const).map((alignment) => (
                <button
                  aria-label={`Align text ${alignment}`}
                  aria-pressed={alignedTextTargets.every(
                    (element) => element.textAlign === alignment,
                  )}
                  data-active={
                    alignedTextTargets.every((element) => element.textAlign === alignment) ||
                    undefined
                  }
                  key={alignment}
                  onClick={() => applyTextAlignment(alignment)}
                  type="button"
                >
                  {alignment === 'left' ? 'Left' : alignment === 'center' ? 'Center' : 'Right'}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {selected.length === 1 &&
      representative &&
      !representative.locked &&
      !hasPoints(representative) ? (
        <section className="inspector-section transform-section">
          <label htmlFor="selection-rotation">Rotation</label>
          <RotationField
            angle={representative.angle}
            key={`${representative.id}-${Math.round(representative.angle * 1000)}`}
            onCommit={applyRotation}
          />
        </section>
      ) : null}

      {selected.length > 0 ? (
        <section className="inspector-section arrange-section">
          <label>Arrange</label>
          <div className="arrange-row arrange-row-wide">
            <button onClick={actions.duplicateSelected} type="button">
              Duplicate
            </button>
            <button
              onClick={
                selected.some((element) => element.groupIds?.length)
                  ? actions.ungroupSelected
                  : actions.groupSelected
              }
              type="button"
            >
              {selected.some((element) => element.groupIds?.length) ? 'Ungroup' : 'Group'}
            </button>
            <button onClick={actions.toggleLockSelected} type="button">
              {selected.every((element) => element.locked) ? 'Unlock' : 'Lock'}
            </button>
          </div>
          <div className="arrange-row" aria-label="Align selection">
            {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((alignment) => (
              <button
                aria-label={`Align ${alignment}`}
                disabled={selected.length < 2}
                key={alignment}
                onClick={() => actions.alignSelected(alignment)}
                title={`Align ${alignment}`}
                type="button"
              >
                {ALIGNMENT_LABELS[alignment]}
              </button>
            ))}
          </div>
          <div className="arrange-row arrange-row-order">
            <button onClick={() => actions.reorderSelected('back')} type="button">
              Back
            </button>
            <button onClick={() => actions.reorderSelected('backward')} type="button">
              −1
            </button>
            <button onClick={() => actions.reorderSelected('forward')} type="button">
              +1
            </button>
            <button onClick={() => actions.reorderSelected('front')} type="button">
              Front
            </button>
          </div>
          <div className="arrange-row arrange-row-wide">
            <button
              disabled={selected.length < 3}
              onClick={() => actions.distributeSelected('horizontal')}
              type="button"
            >
              Space X
            </button>
            <button
              disabled={selected.length < 3}
              onClick={() => actions.distributeSelected('vertical')}
              type="button"
            >
              Space Y
            </button>
          </div>
        </section>
      ) : null}

      {selectedConnectors.length > 0 ? (
        <section className="inspector-section">
          <label>Connector</label>
          <div className="segment-control">
            <button
              data-active={
                selectedConnectors.every((element) => element.routing !== 'elbow') || undefined
              }
              onClick={() => applyRouting('straight')}
              type="button"
            >
              Straight
            </button>
            <button
              data-active={
                selectedConnectors.every((element) => element.routing === 'elbow') || undefined
              }
              onClick={() => applyRouting('elbow')}
              type="button"
            >
              Elbow
            </button>
          </div>
        </section>
      ) : null}

      <section className="inspector-section canvas-color-section">
        <label>Canvas background</label>
        <CanvasColorPicker />
      </section>

      <Layers />

      <section className="inspector-section switch-list">
        <label>
          <span>Dot grid</span>
          <input
            checked={document.settings.grid}
            onChange={(event) => actions.updateSettings({ grid: event.currentTarget.checked })}
            type="checkbox"
          />
        </label>
        <label>
          <span>Snap to grid</span>
          <input
            checked={document.settings.snapToGrid}
            onChange={(event) =>
              actions.updateSettings({ snapToGrid: event.currentTarget.checked })
            }
            type="checkbox"
          />
        </label>
      </section>
    </aside>
  );
}
