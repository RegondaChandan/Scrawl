import { IconLayoutSidebarRight, IconSparkles } from '@tabler/icons-react';
import { useUiPreferences } from '../ui-preferences';

export function PropertyEditorModeSwitch(): React.JSX.Element {
  const { propertyEditorMode, setPropertyEditorMode } = useUiPreferences();
  const panelIsOpen = propertyEditorMode === 'panel';
  const label = panelIsOpen ? 'Radial' : 'Panel';
  const ModeIcon = panelIsOpen ? IconSparkles : IconLayoutSidebarRight;

  return (
    <button
      aria-label={`Use ${label} editing controls`}
      className="inspector-mode-button radial-mode-switch"
      onClick={() => setPropertyEditorMode(panelIsOpen ? 'radial' : 'panel')}
      title={`Use ${label} editing controls`}
      type="button"
    >
      <ModeIcon aria-hidden="true" size={15} stroke={1.8} />
      {label}
    </button>
  );
}
