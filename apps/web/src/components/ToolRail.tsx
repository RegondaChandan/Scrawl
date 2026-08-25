import type { Tool } from '@scrawl/editor';
import { useEditor } from '../use-editor';
import { Icon, type IconName } from './Icon';

const tools: Array<{ id: Tool; label: string; key: string; icon: IconName }> = [
  { id: 'select', label: 'Select', key: 'V', icon: 'mouse' },
  { id: 'hand', label: 'Pan canvas', key: 'H', icon: 'hand' },
  { id: 'rectangle', label: 'Rectangle', key: 'R', icon: 'rectangle' },
  { id: 'ellipse', label: 'Ellipse', key: 'O', icon: 'ellipse' },
  { id: 'diamond', label: 'Diamond', key: 'D', icon: 'diamond' },
  { id: 'arrow', label: 'Arrow', key: 'A', icon: 'arrow' },
  { id: 'line', label: 'Line', key: 'L', icon: 'line' },
  { id: 'freedraw', label: 'Draw', key: 'P', icon: 'pen' },
  { id: 'laser', label: 'Laser pointer', key: 'K', icon: 'laser' },
  { id: 'text', label: 'Text', key: 'T', icon: 'text' },
  { id: 'sticky', label: 'Note', key: 'N', icon: 'note' },
  { id: 'eraser', label: 'Erase', key: 'E', icon: 'eraser' },
];

export function ToolRail(): React.JSX.Element {
  const tool = useEditor((state) => state.view.tool);
  const openPanel = useEditor((state) => state.view.openPanel);
  const actions = useEditor((state) => state.actions);
  const libraryOpen = openPanel === 'shapes' || openPanel === 'icons' || openPanel === 'templates';

  return (
    <nav aria-label="Canvas tools" className="tool-rail">
      {tools.map((item, index) => (
        <button
          aria-label={`${item.label} (${item.key})`}
          aria-pressed={tool === item.id}
          className="tool-button"
          data-active={tool === item.id || undefined}
          data-tooltip={`${item.label} · ${item.key}`}
          key={item.id}
          onClick={() => actions.setTool(item.id)}
          type="button"
        >
          <Icon name={item.icon} />
          {index < 9 ? <span className="tool-index">{index + 1}</span> : null}
        </button>
      ))}
      <span aria-hidden="true" className="tool-divider" />
      <button
        aria-label="Shape library"
        aria-pressed={libraryOpen}
        className="tool-button"
        data-active={libraryOpen || undefined}
        data-tooltip="Shape library"
        onClick={() => actions.setOpenPanel(libraryOpen ? null : 'shapes')}
        type="button"
      >
        <Icon name="shapes" />
      </button>
    </nav>
  );
}
