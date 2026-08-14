import { useContext } from 'react';
import { useStore } from 'zustand';
import type { EditorStoreState } from '@scrawl/editor';
import { EditorStoreContext } from './editor-store-context';

export function useEditor<T>(selector: (state: EditorStoreState) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error('useEditor must be used inside EditorProvider');
  return useStore(store, selector);
}
