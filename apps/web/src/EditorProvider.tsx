import { useEffect, useState, type PropsWithChildren } from 'react';
import { createEditorStore } from '@scrawl/editor';
import { IndexedDbDocumentRepository } from '@scrawl/storage';
import { EditorStoreContext } from './editor-store-context';

export function EditorProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [store] = useState(createEditorStore);
  const [repository] = useState(() => new IndexedDbDocumentRepository());

  useEffect(() => {
    let active = true;
    let restoring = true;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const initialDocument = store.getState().document;
    const unsubscribe = store.subscribe((state, previous) => {
      if (restoring || state.document === previous.document) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        void repository.save(store.getState().document).catch((error: unknown) => {
          console.error('Unable to save the local document', error);
        });
      }, 400);
    });

    void repository
      .latest()
      .then(async (latest) => {
        if (!active) return;
        if (latest && store.getState().document === initialDocument) {
          store.getState().actions.loadDocument(latest);
        } else {
          await repository.save(store.getState().document);
        }
        restoring = false;
      })
      .catch((error: unknown) => {
        restoring = false;
        console.error('Unable to open local document storage', error);
      });

    return () => {
      active = false;
      unsubscribe();
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [repository, store]);

  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}
