import { useEffect, useRef, useState } from 'react';
import { IconPalette } from '@tabler/icons-react';
import { CanvasColorPicker } from './CanvasColorPicker';

export function CanvasBackgroundControl(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.document.addEventListener('pointerdown', close);
    window.document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.document.removeEventListener('pointerdown', close);
      window.document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="canvas-background-control" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label="Change canvas background"
        className="inspector-mode-button"
        onClick={() => setOpen((value) => !value)}
        title="Change canvas background"
        type="button"
      >
        <IconPalette aria-hidden="true" size={15} stroke={1.8} />
        Canvas
      </button>
      {open ? (
        <div className="canvas-background-popover">
          <span>Canvas background</span>
          <CanvasColorPicker />
        </div>
      ) : null}
    </div>
  );
}
