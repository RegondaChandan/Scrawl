import { createDocument, createId, parseDocument, type AnyElement } from '@scrawl/schema';
import type { StoredTemplate, TemplateRepository } from './types';

const DATABASE_VERSION = 1;
const TEMPLATE_STORE = 'templates';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
  });
}

function validatedElements(elements: AnyElement[]): AnyElement[] {
  if (elements.some((element) => element.type === 'image')) {
    throw new Error('Local templates cannot contain embedded images');
  }
  const document = createDocument('Template validation');
  document.pages[0]!.elements = structuredClone(elements);
  return parseDocument(document).pages[0]!.elements;
}

function templateRecord(
  name: string,
  elements: AnyElement[],
  id = createId(),
  createdAt = Date.now(),
): StoredTemplate {
  const nextName = name.trim();
  if (!nextName) throw new Error('A template needs a name');
  if (elements.length === 0) throw new Error('A template needs at least one element');
  return {
    id,
    name: nextName,
    elements: validatedElements(elements),
    createdAt,
    updatedAt: Date.now(),
  };
}

export class MemoryTemplateRepository implements TemplateRepository {
  private readonly templates = new Map<string, StoredTemplate>();

  async save(name: string, elements: AnyElement[], id?: string): Promise<StoredTemplate> {
    const previous = id ? this.templates.get(id) : undefined;
    const template = templateRecord(name, elements, id, previous?.createdAt);
    this.templates.set(template.id, structuredClone(template));
    return structuredClone(template);
  }

  async list(): Promise<StoredTemplate[]> {
    return [...this.templates.values()]
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
      .map((template) => structuredClone(template));
  }

  async remove(id: string): Promise<void> {
    this.templates.delete(id);
  }
}

export class IndexedDbTemplateRepository implements TemplateRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly databaseName = 'scrawl-templates',
    private readonly indexedDb: IDBFactory = globalThis.indexedDB,
  ) {}

  async save(name: string, elements: AnyElement[], id?: string): Promise<StoredTemplate> {
    const database = await this.open();
    let previous: StoredTemplate | undefined;
    if (id) {
      const read = database.transaction(TEMPLATE_STORE, 'readonly');
      previous = (await requestResult(read.objectStore(TEMPLATE_STORE).get(id))) as
        StoredTemplate | undefined;
      await transactionDone(read);
    }
    const template = templateRecord(name, elements, id, previous?.createdAt);
    const transaction = database.transaction(TEMPLATE_STORE, 'readwrite');
    transaction.objectStore(TEMPLATE_STORE).put(template);
    await transactionDone(transaction);
    return structuredClone(template);
  }

  async list(): Promise<StoredTemplate[]> {
    const database = await this.open();
    const transaction = database.transaction(TEMPLATE_STORE, 'readonly');
    const templates = (await requestResult(
      transaction.objectStore(TEMPLATE_STORE).getAll(),
    )) as StoredTemplate[];
    await transactionDone(transaction);
    return templates
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
      .map((template) => ({ ...template, elements: validatedElements(template.elements) }));
  }

  async remove(id: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(TEMPLATE_STORE, 'readwrite');
    transaction.objectStore(TEMPLATE_STORE).delete(id);
    await transactionDone(transaction);
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = null;
  }

  private open(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = this.indexedDb.open(this.databaseName, DATABASE_VERSION);
      request.addEventListener(
        'upgradeneeded',
        () => {
          if (!request.result.objectStoreNames.contains(TEMPLATE_STORE)) {
            const store = request.result.createObjectStore(TEMPLATE_STORE, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt');
          }
        },
        { once: true },
      );
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
      request.addEventListener(
        'blocked',
        () => reject(new Error('Scrawl template storage upgrade was blocked')),
        { once: true },
      );
    });
    return this.databasePromise;
  }
}
