import { CANVAS_BACKGROUND_COLORS, CANVAS_COLORS } from '@scrawl/schema';
import { useEditor } from '../use-editor';

function colorInputValue(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
}

export function CanvasColorPicker(): React.JSX.Element {
  const document = useEditor((state) => state.document);
  const actions = useEditor((state) => state.actions);
  const canvasColor = document.settings.canvasColor ?? CANVAS_COLORS[document.settings.theme];

  return (
    <div aria-label="Canvas background color" className="canvas-color-row" role="group">
      {CANVAS_BACKGROUND_COLORS.map((color) => (
        <button
          aria-label={`Canvas background ${color}`}
          className="color-swatch"
          data-active={canvasColor.toLowerCase() === color || undefined}
          key={color}
          onClick={() => actions.updateSettings({ canvasColor: color })}
          style={{ '--swatch': color } as React.CSSProperties}
          type="button"
        />
      ))}
      <label
        className="color-swatch custom-canvas-color"
        data-active={
          !CANVAS_BACKGROUND_COLORS.some((color) => color === canvasColor.toLowerCase()) ||
          undefined
        }
        style={{ '--swatch': canvasColor } as React.CSSProperties}
        title="Choose a custom canvas color"
      >
        <span aria-hidden="true">+</span>
        <input
          aria-label="Custom canvas background color"
          onChange={(event) => actions.updateSettings({ canvasColor: event.currentTarget.value })}
          type="color"
          value={colorInputValue(canvasColor)}
        />
      </label>
    </div>
  );
}
