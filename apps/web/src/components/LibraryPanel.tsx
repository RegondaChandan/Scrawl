import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CLOUD_ICONS,
  CLOUD_PROVIDERS,
  iconDataUri,
  SHAPE_LIBRARY,
  shapePath,
  type IconDef,
  type LibraryItem,
} from '@scrawl/engine';
import { BUILT_IN_TEMPLATES, getActivePage } from '@scrawl/editor';
import { IndexedDbTemplateRepository, type StoredTemplate } from '@scrawl/storage';
import { writeCanvasLibraryTransfer } from '../canvas-transfer';
import { useEditor } from '../use-editor';
import { useLibraryInsertion } from '../use-library-insertion';
import { Icon } from './Icon';

function ShapePreview({ item }: { item: LibraryItem }): React.JSX.Element {
  const common = { fill: 'var(--library-fill)', stroke: 'currentColor', strokeWidth: 2 };
  return (
    <svg aria-hidden="true" className="library-shape-preview" viewBox="0 0 80 52">
      {item.type === 'rectangle' ? (
        <rect height="48" rx="3" width="76" x="2" y="2" {...common} />
      ) : item.type === 'ellipse' ? (
        <ellipse cx="40" cy="26" rx="38" ry="24" {...common} />
      ) : item.type === 'diamond' ? (
        <path d="M 40 2 L 78 26 L 40 50 L 2 26 Z" {...common} />
      ) : (
        <path d={shapePath(item.shapeKind!, 76, 48)} transform="translate(2 2)" {...common} />
      )}
    </svg>
  );
}

function matchesShape(item: LibraryItem, query: string, packName: string): boolean {
  if (!query) return true;
  const text = [item.label, packName, ...(item.keywords ?? [])].join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => text.includes(term));
}

function matchesIcon(icon: IconDef, query: string): boolean {
  if (!query) return true;
  const text = [icon.name, icon.provider, icon.category, ...icon.keywords].join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => text.includes(term));
}

export function LibraryPanel(): React.JSX.Element | null {
  const openPanel = useEditor((state) => state.view.openPanel);
  const document = useEditor((state) => state.document);
  const actions = useEditor((state) => state.actions);
  const { insertIcon, insertShape, insertTemplate } = useLibraryInsertion();
  const [repository] = useState(() => new IndexedDbTemplateRepository());
  const [query, setQuery] = useState('');
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [status, setStatus] = useState('');
  const previousFocus = useRef<HTMLElement | null>(null);
  const visible = openPanel === 'shapes' || openPanel === 'icons' || openPanel === 'templates';
  const activePage = getActivePage(document);

  const loadTemplates = useCallback((): void => {
    void repository
      .list()
      .then(setTemplates)
      .catch(() => setStatus('Local templates could not be opened.'));
  }, [repository]);

  useEffect(() => {
    if (visible) loadTemplates();
  }, [loadTemplates, visible]);

  useEffect(() => {
    if (!visible) return;
    previousFocus.current =
      globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : null;
    return () => previousFocus.current?.focus();
  }, [visible]);

  useEffect(() => () => repository.close(), [repository]);

  const filteredPacks = useMemo(
    () =>
      SHAPE_LIBRARY.map((pack) => ({
        ...pack,
        items: pack.items.filter((item) => matchesShape(item, query, pack.name)),
      })).filter((pack) => pack.items.length > 0),
    [query],
  );
  const filteredIconProviders = useMemo(
    () =>
      CLOUD_PROVIDERS.map((provider) => ({
        ...provider,
        icons: CLOUD_ICONS.filter(
          (icon) => icon.provider === provider.id && matchesIcon(icon, query),
        ),
      })).filter((provider) => provider.icons.length > 0),
    [query],
  );

  if (!visible) return null;

  const saveTemplate = (): void => {
    const elements = activePage.elements.filter((element) => element.type !== 'image');
    if (elements.length === 0) {
      setStatus('Add at least one reusable object first.');
      return;
    }
    void repository
      .save(templateName || activePage.name, elements)
      .then(() => {
        setTemplateName('');
        setStatus(
          elements.length === activePage.elements.length
            ? 'Template saved on this device.'
            : 'Template saved without embedded images.',
        );
        loadTemplates();
      })
      .catch(() => setStatus('The template could not be saved.'));
  };

  return (
    <aside
      aria-label="Reusable content"
      className="library-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') actions.setOpenPanel(null);
      }}
    >
      <div className="library-panel-header">
        <div aria-label="Library sections" className="library-panel-tabs" role="tablist">
          <button
            aria-selected={openPanel === 'shapes'}
            onClick={() => actions.setOpenPanel('shapes')}
            role="tab"
            type="button"
          >
            Shapes
          </button>
          <button
            aria-selected={openPanel === 'icons'}
            onClick={() => actions.setOpenPanel('icons')}
            role="tab"
            type="button"
          >
            Icons
          </button>
          <button
            aria-selected={openPanel === 'templates'}
            onClick={() => actions.setOpenPanel('templates')}
            role="tab"
            type="button"
          >
            Templates
          </button>
        </div>
        <button
          aria-label="Close reusable content"
          className="panel-close-button"
          onClick={() => actions.setOpenPanel(null)}
          type="button"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {openPanel === 'shapes' || openPanel === 'icons' ? (
        <>
          <label className="library-search">
            <Icon name="search" size={16} />
            <span className="sr-only">
              {openPanel === 'icons' ? 'Search cloud icons' : 'Search shapes'}
            </span>
            <input
              autoFocus
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={openPanel === 'icons' ? 'Search cloud icons' : 'Search shapes'}
              type="search"
              value={query}
            />
          </label>
          {openPanel === 'shapes' ? (
            <div className="library-scroll">
              {filteredPacks.map((pack) => (
                <section className="library-pack" key={pack.id}>
                  <h2>{pack.name}</h2>
                  <div className="library-shape-grid">
                    {pack.items.map((item) => (
                      <button
                        draggable
                        key={item.id}
                        onClick={() => insertShape(item)}
                        onDragStart={(event) =>
                          writeCanvasLibraryTransfer(event.dataTransfer, {
                            kind: 'shape',
                            id: item.id,
                          })
                        }
                        title="Click to insert in the center, or drag onto the canvas"
                        type="button"
                      >
                        <ShapePreview item={item} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {filteredPacks.length === 0 ? (
                <p className="library-empty">No shapes match “{query}”.</p>
              ) : null}
            </div>
          ) : (
            <div className="library-scroll">
              {filteredIconProviders.map((provider) => (
                <section className="library-pack" key={provider.id}>
                  <h2>{provider.name}</h2>
                  <div className="library-shape-grid library-icon-grid">
                    {provider.icons.map((icon) => (
                      <button
                        draggable
                        key={icon.id}
                        onClick={() => insertIcon(icon)}
                        onDragStart={(event) =>
                          writeCanvasLibraryTransfer(event.dataTransfer, {
                            kind: 'icon',
                            id: icon.id,
                          })
                        }
                        title="Click to insert in the center, or drag onto the canvas"
                        type="button"
                      >
                        <img alt="" draggable="false" src={iconDataUri(icon.id)} />
                        <span>{icon.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {filteredIconProviders.length === 0 ? (
                <p className="library-empty">No cloud icons match “{query}”.</p>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <div className="library-scroll template-list">
          <section>
            <h2>Starter templates</h2>
            {BUILT_IN_TEMPLATES.map((template) => (
              <button
                className="template-card"
                key={template.id}
                onClick={() => insertTemplate(template)}
                type="button"
              >
                <Icon name="template" />
                <span>
                  <strong>{template.name}</strong>
                  <small>{template.description}</small>
                </span>
              </button>
            ))}
          </section>
          <section>
            <h2>Saved on this device</h2>
            {templates.length === 0 ? (
              <p className="library-empty">Your saved page templates will appear here.</p>
            ) : (
              templates.map((template) => (
                <div className="template-card custom-template-card" key={template.id}>
                  <button
                    onClick={() => insertTemplate({ elements: template.elements }, true)}
                    type="button"
                  >
                    <Icon name="template" />
                    <span>
                      <strong>{template.name}</strong>
                      <small>{template.elements.length} objects</small>
                    </span>
                  </button>
                  <button
                    aria-label={`Delete ${template.name} template`}
                    className="delete-template-button"
                    onClick={() => {
                      if (!window.confirm(`Delete the “${template.name}” template?`)) return;
                      void repository.remove(template.id).then(loadTemplates);
                    }}
                    type="button"
                  >
                    <Icon name="x" size={15} />
                  </button>
                </div>
              ))
            )}
          </section>
          <form
            className="save-template-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveTemplate();
            }}
          >
            <label htmlFor="template-name">Save current page</label>
            <div>
              <input
                id="template-name"
                maxLength={60}
                onChange={(event) => setTemplateName(event.currentTarget.value)}
                placeholder={activePage.name}
                value={templateName}
              />
              <button type="submit">Save</button>
            </div>
            <small aria-live="polite">{status}</small>
          </form>
        </div>
      )}
    </aside>
  );
}
