import { useEffect, useMemo, useRef, useState } from 'react';
import { SHAPE_LIBRARY } from '@scrawl/engine';
import { BUILT_IN_TEMPLATES } from '@scrawl/editor';
import { useEditor } from '../use-editor';
import { useLibraryInsertion } from '../use-library-insertion';
import { useUiPreferences } from '../ui-preferences';
import { Icon } from './Icon';

interface CommandItem {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  run: () => void;
}

function commandMatches(command: CommandItem, query: string): boolean {
  const searchable = `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((term) => searchable.includes(term));
}

export function CommandPalette(): React.JSX.Element | null {
  const open = useEditor((state) => state.view.openPanel === 'commands');
  const document = useEditor((state) => state.document);
  const actions = useEditor((state) => state.actions);
  const history = useEditor((state) => state.history);
  const { propertyEditorMode, setPropertyEditorMode } = useUiPreferences();
  const { insertShape, insertTemplate } = useLibraryInsertion();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        actions.setOpenPanel(open ? null : 'commands');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, open]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : null;
    return () => previousFocus.current?.focus();
  }, [open]);

  const commands = useMemo<CommandItem[]>(
    () => [
      ...SHAPE_LIBRARY.flatMap((pack) =>
        pack.items.map((item) => ({
          id: `shape-${item.id}`,
          label: `Insert ${item.label}`,
          group: pack.name,
          ...(item.keywords ? { keywords: item.keywords.join(' ') } : {}),
          run: () => insertShape(item),
        })),
      ),
      ...BUILT_IN_TEMPLATES.map((template) => ({
        id: `template-${template.id}`,
        label: `Insert ${template.name}`,
        group: 'Templates',
        keywords: template.description,
        run: () => insertTemplate(template),
      })),
      {
        id: 'open-shapes',
        label: 'Open shape library',
        group: 'View',
        run: () => actions.setOpenPanel('shapes'),
      },
      {
        id: 'open-templates',
        label: 'Open templates',
        group: 'View',
        run: () => actions.setOpenPanel('templates'),
      },
      {
        id: 'open-export',
        label: 'Export PDF or print',
        group: 'Document',
        keywords: 'download paper a4 letter',
        run: () => actions.setOpenPanel('export'),
      },
      {
        id: 'add-page',
        label: 'Add page',
        group: 'Document',
        run: () => actions.addPage(),
      },
      {
        id: 'select-all',
        label: 'Select all objects',
        group: 'Edit',
        keywords: 'command control a',
        run: actions.selectAll,
      },
      ...(history.past.length > 0
        ? [{ id: 'undo', label: 'Undo', group: 'Edit', run: actions.undo }]
        : []),
      ...(history.future.length > 0
        ? [{ id: 'redo', label: 'Redo', group: 'Edit', run: actions.redo }]
        : []),
      {
        id: 'toggle-grid',
        label: document.settings.grid ? 'Hide dot grid' : 'Show dot grid',
        group: 'View',
        keywords: 'canvas dots',
        run: () => actions.updateSettings({ grid: !document.settings.grid }),
      },
      {
        id: 'toggle-property-editor',
        label:
          propertyEditorMode === 'panel'
            ? 'Use Radial editing controls'
            : 'Use Panel editing controls',
        group: 'Interface',
        keywords: 'properties inspector sidebar contextual halo legacy',
        run: () => setPropertyEditorMode(propertyEditorMode === 'panel' ? 'radial' : 'panel'),
      },
      {
        id: 'toggle-theme',
        label: document.settings.theme === 'dark' ? 'Use light theme' : 'Use dark theme',
        group: 'View',
        run: () =>
          actions.updateSettings({ theme: document.settings.theme === 'dark' ? 'light' : 'dark' }),
      },
    ],
    [
      actions,
      document.settings.grid,
      document.settings.theme,
      history.future.length,
      history.past.length,
      insertShape,
      insertTemplate,
      propertyEditorMode,
      setPropertyEditorMode,
    ],
  );

  const results = commands.filter((command) => commandMatches(command, query)).slice(0, 12);

  if (!open) return null;

  const close = (): void => {
    setQuery('');
    setActiveIndex(0);
    actions.setOpenPanel(null);
  };
  const run = (command: CommandItem | undefined): void => {
    if (!command) return;
    command.run();
    if (!['open-shapes', 'open-templates', 'open-export'].includes(command.id)) close();
  };

  return (
    <div
      className="command-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        aria-label="Command menu"
        aria-modal="true"
        className="command-palette"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
          }
          if (event.key !== 'Tab') return;
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('input, button')];
          const first = focusable[0];
          const last = focusable.at(-1);
          if (event.shiftKey && globalThis.document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && globalThis.document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        role="dialog"
      >
        <label className="command-search">
          <Icon name="search" />
          <span className="sr-only">Search commands and shapes</span>
          <input
            aria-activedescendant={
              results[activeIndex] ? `command-${results[activeIndex].id}` : undefined
            }
            aria-controls="command-results"
            aria-expanded="true"
            autoFocus
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                run(results[activeIndex]);
              }
            }}
            placeholder="Search commands, shapes, and templates"
            role="combobox"
            type="search"
            value={query}
          />
          <kbd>Esc</kbd>
        </label>
        <div
          aria-label="Command results"
          className="command-results"
          id="command-results"
          role="listbox"
        >
          {results.map((command, index) => (
            <button
              aria-selected={index === activeIndex}
              data-active={index === activeIndex || undefined}
              id={`command-${command.id}`}
              key={command.id}
              onClick={() => run(command)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              <span>{command.label}</span>
              <small>{command.group}</small>
            </button>
          ))}
          {results.length === 0 ? <p>No matching commands.</p> : null}
        </div>
        <footer>
          <span>↑↓ Navigate</span>
          <span>↵ Run</span>
          <span>⌘K Open</span>
        </footer>
      </section>
    </div>
  );
}
