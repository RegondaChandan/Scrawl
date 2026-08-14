import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createElement } from '@scrawl/schema';
import { IndexedDbTemplateRepository, MemoryTemplateRepository } from '../src';

const repositories = [
  ['memory', () => new MemoryTemplateRepository()],
  [
    'indexeddb',
    () => new IndexedDbTemplateRepository(`scrawl-templates-test-${crypto.randomUUID()}`),
  ],
] as const;

describe.each(repositories)('%s template repository', (_name, createRepository) => {
  it('saves, lists, updates, and removes local templates', async () => {
    const repository = createRepository();
    const elements = [
      createElement('rectangle', { x: 20, y: 30, width: 120, height: 80, label: 'Reusable' }),
    ];

    const saved = await repository.save('System block', elements);
    const updated = await repository.save('Service block', elements, saved.id);

    expect(updated.createdAt).toBe(saved.createdAt);
    expect(await repository.list()).toMatchObject([{ id: saved.id, name: 'Service block' }]);
    await repository.remove(saved.id);
    expect(await repository.list()).toEqual([]);
  });

  it('rejects empty template content', async () => {
    const repository = createRepository();
    await expect(repository.save('Empty', [])).rejects.toThrow('at least one element');
  });

  it('rejects image elements because template assets are not stored', async () => {
    const repository = createRepository();
    const image = createElement('image', {
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      naturalWidth: 100,
      naturalHeight: 80,
      assetId: 'asset',
    });

    await expect(repository.save('Image', [image])).rejects.toThrow('embedded images');
  });
});
