import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDocument, createElement, type ScrawlDocument } from '@scrawl/schema';
import { IndexedDbDocumentRepository, MemoryDocumentRepository } from '../src';

const repositories = [
  ['memory', () => new MemoryDocumentRepository()],
  ['indexeddb', () => new IndexedDbDocumentRepository(`scrawl-test-${crypto.randomUUID()}`)],
] as const;

describe.each(repositories)('%s repository', (_name, createRepository) => {
  it('saves, lists, loads, and removes documents', async () => {
    const repository = createRepository();
    const document = createDocument('Architecture');

    await repository.save(document);

    expect(await repository.list()).toHaveLength(1);
    expect((await repository.latest())?.title).toBe('Architecture');
    expect(await repository.load(document.id)).toEqual(document);

    await repository.remove(document.id);
    expect(await repository.load(document.id)).toBeNull();
  });

  it('keeps the previous valid save as a recovery copy', async () => {
    const repository = createRepository();
    const document = createDocument('Recovery');
    await repository.save(document);

    document.pages[0]!.elements.push(
      createElement('rectangle', { x: 10, y: 20, width: 100, height: 60 }),
    );
    await repository.save(document);

    expect((await repository.load(document.id))?.pages[0]?.elements).toHaveLength(1);
    expect((await repository.loadRecovery(document.id))?.pages[0]?.elements).toHaveLength(0);
  });

  it('rejects an invalid save without changing the current or recovery documents', async () => {
    const repository = createRepository();
    const document = createDocument('Protected');
    await repository.save(document);
    document.pages[0]!.elements.push(
      createElement('rectangle', { x: 10, y: 20, width: 100, height: 60 }),
    );
    await repository.save(document);
    const invalid = { ...structuredClone(document), pages: [] } as unknown as ScrawlDocument;

    await expect(repository.save(invalid)).rejects.toThrow();

    expect((await repository.load(document.id))?.pages[0]?.elements).toHaveLength(1);
    expect((await repository.loadRecovery(document.id))?.pages[0]?.elements).toHaveLength(0);
  });
});
