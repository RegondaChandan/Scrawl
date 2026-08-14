import { CanvasBoard } from './CanvasBoard';
import { CommandPalette } from './components/CommandPalette';
import { ExportDialog } from './components/ExportDialog';
import { Inspector } from './components/Inspector';
import { LibraryPanel } from './components/LibraryPanel';
import { PageTabs } from './components/PageTabs';
import { PropertyEditorModeSwitch } from './components/PropertyEditorModeSwitch';
import { ToolRail } from './components/ToolRail';
import { TopBar } from './components/TopBar';
import { useEditor } from './use-editor';
import { useUiPreferences } from './ui-preferences';

export function App(): React.JSX.Element {
  const theme = useEditor((state) => state.document.settings.theme);
  const { propertyEditorMode } = useUiPreferences();

  return (
    <main className="app-shell" data-theme={theme}>
      <TopBar />
      <div className="workspace">
        <ToolRail />
        <CanvasBoard />
        <LibraryPanel />
        {propertyEditorMode === 'panel' ? <Inspector /> : null}
        <PropertyEditorModeSwitch />
        <PageTabs />
      </div>
      <CommandPalette />
      <ExportDialog />
    </main>
  );
}
