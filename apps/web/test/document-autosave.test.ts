import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore, getActivePage } from '@scrawl/editor';
import { createElement, type ScrawlDocument } from '@scrawl/schema';
import { initializeDocumentAutosave, subscribeToDocumentAutosave } from '../src/document-autosave';

describe('document autosave', () => {
  afterEach(() => vi.useRealTimers());

  it('saves the last committed snapshot while a transaction preview is active', async () => {
    vi.useFakeTimers();
    const store = createEditorStore();
    const saved: ScrawlDocument[] = [];
    const unsubscribe = subscribeToDocumentAutosave(
      store,
      async (document) => {
        saved.push(document);
      },
      20,
    );
    const actions = store.getState().actions;
    actions.setTitle('Committed title');
    actions.beginTransaction();
    actions.previewElements([createElement('rectangle', { x: 10, y: 10, width: 100, height: 60 })]);

    await vi.advanceTimersByTimeAsync(20);

    expect(saved).toHaveLength(1);
    expect(saved[0]?.title).toBe('Committed title');
    expect(getActivePage(saved[0]!).elements).toHaveLength(0);
    unsubscribe();
  });

  it('saves the completed document after a transaction commits', async () => {
    vi.useFakeTimers();
    const store = createEditorStore();
    const saved: ScrawlDocument[] = [];
    const unsubscribe = subscribeToDocumentAutosave(
      store,
      async (document) => {
        saved.push(document);
      },
      20,
    );
    const actions = store.getState().actions;
    actions.beginTransaction();
    actions.previewElements([createElement('rectangle', { x: 10, y: 10, width: 100, height: 60 })]);
    actions.commitTransaction();

    await vi.advanceTimersByTimeAsync(20);

    expect(getActivePage(saved.at(-1)!).elements).toHaveLength(1);
    unsubscribe();
  });

  it('captures edits made while the initial repository save is still pending', async () => {
    vi.useFakeTimers();
    const store = createEditorStore();
    const savedTitles: string[] = [];
    let finishInitialSave = (): void => undefined;
    const initialSave = new Promise<void>((resolve) => {
      finishInitialSave = resolve;
    });
    const repository = {
      latest: async () => null,
      save: vi.fn(async (document: ScrawlDocument) => {
        savedTitles.push(document.title);
        if (savedTitles.length === 1) await initialSave;
      }),
    };
    const cleanup = initializeDocumentAutosave(store, repository, 20);
    await Promise.resolve();
    await Promise.resolve();

    store.getState().actions.setTitle('Edited during startup');
    await vi.advanceTimersByTimeAsync(20);
    finishInitialSave();
    await Promise.resolve();

    expect(savedTitles).toContain('Edited during startup');
    cleanup();
  });
});
