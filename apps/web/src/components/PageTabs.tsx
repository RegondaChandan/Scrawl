import { useState } from 'react';
import { useEditor } from '../use-editor';
import { Icon } from './Icon';

export function PageTabs(): React.JSX.Element {
  const pages = useEditor((state) => state.document.pages);
  const activePageId = useEditor((state) => state.document.activePageId);
  const actions = useEditor((state) => state.actions);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);

  const beginRename = (pageId: string, name: string): void => {
    setEditingPageId(pageId);
    setDraftName(name);
  };

  const finishRename = (commit: boolean): void => {
    if (commit && editingPageId) actions.renamePage(editingPageId, draftName);
    setEditingPageId(null);
  };

  return (
    <nav className="page-tabs" aria-label="Document pages">
      {pages.map((page, index) => {
        const active = page.id === activePageId;
        return (
          <div
            className="page-tab-shell"
            data-active={active || undefined}
            draggable={editingPageId !== page.id}
            key={page.id}
            onDragEnd={() => setDraggedPageId(null)}
            onDragOver={(event) => {
              if (draggedPageId) event.preventDefault();
            }}
            onDragStart={(event) => {
              setDraggedPageId(page.id);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', page.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = draggedPageId || event.dataTransfer.getData('text/plain');
              if (sourceId) actions.reorderPage(sourceId, index);
              setDraggedPageId(null);
            }}
          >
            {editingPageId === page.id ? (
              <input
                aria-label={`Rename ${page.name}`}
                className="page-name-input"
                maxLength={60}
                onBlur={() => finishRename(true)}
                onChange={(event) => setDraftName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    finishRename(false);
                  }
                }}
                ref={(input) => {
                  if (input && document.activeElement !== input) {
                    input.focus();
                    input.select();
                  }
                }}
                value={draftName}
              />
            ) : (
              <button
                aria-current={active ? 'page' : undefined}
                aria-label={`${page.name}, page ${index + 1}`}
                className="page-tab"
                onClick={() => actions.setActivePage(page.id)}
                onDoubleClick={() => beginRename(page.id, page.name)}
                onKeyDown={(event) => {
                  if (event.key === 'F2') {
                    event.preventDefault();
                    beginRename(page.id, page.name);
                  } else if (event.altKey && event.shiftKey && event.key.startsWith('Arrow')) {
                    event.preventDefault();
                    actions.reorderPage(page.id, index + (event.key === 'ArrowLeft' ? -1 : 1));
                  }
                }}
                title="Double-click or press F2 to rename; drag to reorder"
                type="button"
              >
                {page.name}
              </button>
            )}
            <div className="page-tab-actions">
              <button
                aria-label={`Duplicate ${page.name}`}
                onClick={() => actions.duplicatePage(page.id)}
                title="Duplicate page"
                type="button"
              >
                <Icon name="copy" size={13} />
              </button>
              <button
                aria-label={`Delete ${page.name}`}
                disabled={pages.length === 1}
                onClick={() => {
                  if (
                    page.elements.length === 0 ||
                    window.confirm(`Delete “${page.name}” and everything on it?`)
                  ) {
                    actions.removePage(page.id);
                  }
                }}
                title={pages.length === 1 ? 'A document needs one page' : 'Delete page'}
                type="button"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          </div>
        );
      })}
      <button
        aria-label="Add page"
        className="add-page-button"
        onClick={() => actions.addPage()}
        title="Add page"
        type="button"
      >
        <Icon name="plus" size={17} />
      </button>
    </nav>
  );
}
