import { createContext } from 'react';
import type { EditorStore } from '@scrawl/editor';

export const EditorStoreContext = createContext<EditorStore | null>(null);
