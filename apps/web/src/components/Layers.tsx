import { useState } from 'react';
import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconDots,
  IconEye,
  IconEyeOff,
  IconLayersLinked,
  IconLock,
  IconLockOpen,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { getActivePage } from '@scrawl/editor';
import { useEditor } from '../use-editor';

export function Layers(): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [menuLayerId, setMenuLayerId] = useState<string | null>(null);
  const document = useEditor((state) => state.document);
  const activeLayerId = useEditor((state) => state.view.activeLayerId);
  const selectedIds = useEditor((state) => state.view.selectedIds);
  const actions = useEditor((state) => state.actions);
  const page = getActivePage(document);
  const layers = page.layers;
  const selected = page.elements.filter((element) => selectedIds.includes(element.id));
  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0]!;

  return (
    <section className="inspector-section layers-section" aria-label="Layers">
      <div className="layer-summary-row">
        <button
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} layers`}
          className="layer-disclosure"
          onClick={() => {
            if (expanded) setMenuLayerId(null);
            setExpanded(!expanded);
          }}
          type="button"
        >
          <IconLayersLinked aria-hidden="true" size={16} stroke={1.7} />
          <span>
            <b>Layers</b>
            <small>{activeLayer.name}</small>
          </span>
          <i>{layers.length}</i>
          {expanded ? (
            <IconChevronDown aria-hidden="true" size={14} />
          ) : (
            <IconChevronRight aria-hidden="true" size={14} />
          )}
        </button>
        <button
          aria-label="Add layer"
          className="add-layer-button"
          onClick={() => {
            actions.addLayer();
            setExpanded(true);
          }}
          title="Add layer"
          type="button"
        >
          <IconPlus aria-hidden="true" size={15} />
        </button>
      </div>
      {expanded ? (
        <div className="layer-list">
          {layers.toReversed().map((layer) => {
            const index = layers.findIndex((candidate) => candidate.id === layer.id);
            const active = layer.id === activeLayerId;
            const canMoveSelection = selected.some((element) => element.layerId !== layer.id);
            const menuOpen = menuLayerId === layer.id;
            return (
              <div
                className="layer-row"
                data-active={active || undefined}
                data-has-menu={layers.length > 1 || canMoveSelection || undefined}
                key={layer.id}
              >
                <button
                  aria-label={`Use ${layer.name}`}
                  className="layer-active-button"
                  disabled={!layer.visible || layer.locked}
                  onClick={() => actions.setActiveLayer(layer.id)}
                  title={active ? 'Active layer' : 'Draw on this layer'}
                  type="button"
                >
                  <span aria-hidden="true" className="layer-status-dot" />
                </button>
                <input
                  aria-label={`Rename ${layer.name}`}
                  defaultValue={layer.name}
                  key={layer.name}
                  maxLength={40}
                  onBlur={(event) => actions.renameLayer(layer.id, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                <button
                  aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                  className="layer-icon-button"
                  onClick={() => actions.updateLayer(layer.id, { visible: !layer.visible })}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  type="button"
                >
                  {layer.visible ? (
                    <IconEye aria-hidden="true" size={14} />
                  ) : (
                    <IconEyeOff aria-hidden="true" size={14} />
                  )}
                </button>
                <button
                  aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
                  className="layer-icon-button"
                  onClick={() => actions.updateLayer(layer.id, { locked: !layer.locked })}
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  type="button"
                >
                  {layer.locked ? (
                    <IconLock aria-hidden="true" size={13} />
                  ) : (
                    <IconLockOpen aria-hidden="true" size={13} />
                  )}
                </button>
                {layers.length > 1 || canMoveSelection ? (
                  <button
                    aria-expanded={menuOpen}
                    aria-label={`Manage ${layer.name}`}
                    className="layer-icon-button layer-manage-button"
                    onClick={() => setMenuLayerId(menuOpen ? null : layer.id)}
                    title="Layer actions"
                    type="button"
                  >
                    <IconDots aria-hidden="true" size={15} />
                  </button>
                ) : null}
                {menuOpen ? (
                  <div className="layer-expanded-actions">
                    {canMoveSelection ? (
                      <button
                        className="layer-move-button"
                        disabled={!layer.visible || layer.locked}
                        onClick={() => {
                          actions.moveSelectedToLayer(layer.id);
                          setMenuLayerId(null);
                        }}
                        type="button"
                      >
                        Move here
                      </button>
                    ) : null}
                    <button
                      aria-label={`Move ${layer.name} up`}
                      disabled={index === layers.length - 1}
                      onClick={() => actions.reorderLayer(layer.id, 1)}
                      title="Move layer up"
                      type="button"
                    >
                      <IconChevronUp aria-hidden="true" size={14} />
                    </button>
                    <button
                      aria-label={`Move ${layer.name} down`}
                      disabled={index === 0}
                      onClick={() => actions.reorderLayer(layer.id, -1)}
                      title="Move layer down"
                      type="button"
                    >
                      <IconChevronDown aria-hidden="true" size={14} />
                    </button>
                    <button
                      aria-label={`Delete ${layer.name}`}
                      className="layer-delete-button"
                      disabled={layers.length === 1}
                      onClick={() => {
                        actions.removeLayer(layer.id);
                        setMenuLayerId(null);
                      }}
                      title="Delete layer"
                      type="button"
                    >
                      <IconTrash aria-hidden="true" size={13} />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
