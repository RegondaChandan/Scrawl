import { getActivePage } from '@scrawl/editor';
import { useEditor } from '../use-editor';

export function Layers(): React.JSX.Element {
  const document = useEditor((state) => state.document);
  const activeLayerId = useEditor((state) => state.view.activeLayerId);
  const selectedIds = useEditor((state) => state.view.selectedIds);
  const actions = useEditor((state) => state.actions);
  const page = getActivePage(document);
  const layers = page.layers;
  const selected = page.elements.filter((element) => selectedIds.includes(element.id));

  return (
    <section className="inspector-section layers-section" aria-label="Layers">
      <div className="section-heading-row">
        <label>Layers</label>
        <button onClick={() => actions.addLayer()} type="button">
          Add layer
        </button>
      </div>
      <div className="layer-list">
        {layers.toReversed().map((layer) => {
          const index = layers.findIndex((candidate) => candidate.id === layer.id);
          const active = layer.id === activeLayerId;
          return (
            <div className="layer-row" data-active={active || undefined} key={layer.id}>
              <button
                aria-label={`Use ${layer.name}`}
                className="layer-active-button"
                disabled={!layer.visible || layer.locked}
                onClick={() => actions.setActiveLayer(layer.id)}
                title={active ? 'Active layer' : 'Draw on this layer'}
                type="button"
              >
                {active ? '●' : '○'}
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
              <div className="layer-actions">
                <button
                  aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                  onClick={() => actions.updateLayer(layer.id, { visible: !layer.visible })}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  type="button"
                >
                  {layer.visible ? 'Eye' : 'Off'}
                </button>
                <button
                  aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
                  onClick={() => actions.updateLayer(layer.id, { locked: !layer.locked })}
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  type="button"
                >
                  {layer.locked ? 'Locked' : 'Open'}
                </button>
              </div>
              <div className="layer-actions layer-order-actions">
                <button
                  aria-label={`Move ${layer.name} up`}
                  disabled={index === layers.length - 1}
                  onClick={() => actions.reorderLayer(layer.id, 1)}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${layer.name} down`}
                  disabled={index === 0}
                  onClick={() => actions.reorderLayer(layer.id, -1)}
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label={`Delete ${layer.name}`}
                  disabled={layers.length === 1}
                  onClick={() => actions.removeLayer(layer.id)}
                  type="button"
                >
                  ×
                </button>
              </div>
              {selected.some((element) => element.layerId !== layer.id) ? (
                <button
                  className="layer-move-button"
                  disabled={!layer.visible || layer.locked}
                  onClick={() => actions.moveSelectedToLayer(layer.id)}
                  type="button"
                >
                  Move selection here
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
