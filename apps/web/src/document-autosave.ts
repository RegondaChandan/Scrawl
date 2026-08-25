import type { ScrawlDocument } from '@scrawl/schema';
import type { EditorStore } from '@scrawl/editor';

interface AutosaveRepository {
  latest: () => Promise<ScrawlDocument | null>;
  save: (document: ScrawlDocument) => Promise<unknown>;
}

export function subscribeToDocumentAutosave(
  store: EditorStore,
  save: (document: ScrawlDocument) => Promise<unknown>,
  delay = 400,
): () => void {
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (document: ScrawlDocument): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void save(document).catch((error: unknown) => {
        console.error('Unable to save the local document', error);
      });
    }, delay);
  };

  const unsubscribe = store.subscribe((state, previous) => {
    const transactionStarted =
      previous.history.checkpoint === null && state.history.checkpoint !== null;
    if (transactionStarted) {
      // Save the last committed snapshot, never the in-progress preview.
      schedule(previous.document);
      return;
    }
    if (state.history.checkpoint) return;

    const transactionFinished = previous.history.checkpoint !== null;
    const transactionCanceled =
      transactionFinished && state.document === previous.history.checkpoint;
    if ((state.document !== previous.document || transactionFinished) && !transactionCanceled) {
      schedule(state.document);
    }
  });

  return () => {
    unsubscribe();
    if (saveTimer) clearTimeout(saveTimer);
  };
}

export function initializeDocumentAutosave(
  store: EditorStore,
  repository: AutosaveRepository,
  delay = 400,
): () => void {
  let active = true;
  const initialDocument = store.getState().document;
  const unsubscribe = subscribeToDocumentAutosave(
    store,
    (document) => repository.save(document),
    delay,
  );

  void repository
    .latest()
    .then(async (latest) => {
      if (!active) return;
      if (latest && store.getState().document === initialDocument) {
        store.getState().actions.loadDocument(latest);
        return;
      }
      await repository.save(store.getState().document);
    })
    .catch((error: unknown) => {
      console.error('Unable to open local document storage', error);
    });

  return () => {
    active = false;
    unsubscribe();
  };
}
