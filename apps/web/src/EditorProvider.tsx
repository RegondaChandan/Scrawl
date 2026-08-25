import { useEffect, useState, type PropsWithChildren } from 'react';
import { createEditorStore } from '@scrawl/editor';
import { IndexedDbDocumentRepository } from '@scrawl/storage';
import { initializeDocumentAutosave } from './document-autosave';
import { EditorStoreContext } from './editor-store-context';

export function EditorProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [store] = useState(createEditorStore);
  const [repository] = useState(() => new IndexedDbDocumentRepository());

  useEffect(() => {
    return initializeDocumentAutosave(store, repository);
  }, [repository, store]);

  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}
