import { parseDocument, type ScrawlDocument } from '@scrawl/schema';
import type { DocumentRepository, StoredDocument, StoredDocumentSummary } from './types';

const DATABASE_VERSION = 1;
const DOCUMENT_STORE = 'documents';
const RECOVERY_STORE = 'recovery';

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

export class IndexedDbDocumentRepository implements DocumentRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly databaseName = 'scrawl',
    private readonly indexedDb: IDBFactory = globalThis.indexedDB,
  ) {}

  async save(document: ScrawlDocument): Promise<StoredDocumentSummary> {
    const validated = parseDocument(structuredClone(document));
    const database = await this.open();
    const transaction = database.transaction([DOCUMENT_STORE, RECOVERY_STORE], 'readwrite');
    const documents = transaction.objectStore(DOCUMENT_STORE);
    const recovery = transaction.objectStore(RECOVERY_STORE);
    const previous = (await requestResult(documents.get(validated.id))) as
      StoredDocument | undefined;
    if (previous) recovery.put(previous);
    const stored: StoredDocument = {
      id: validated.id,
      title: validated.title,
      updatedAt: Date.now(),
      document: validated,
    };
    documents.put(stored);
    await transactionDone(transaction);
    return { id: stored.id, title: stored.title, updatedAt: stored.updatedAt };
  }

  async load(id: string): Promise<ScrawlDocument | null> {
    return this.read(DOCUMENT_STORE, id);
  }

  async loadRecovery(id: string): Promise<ScrawlDocument | null> {
    return this.read(RECOVERY_STORE, id);
  }

  async latest(): Promise<ScrawlDocument | null> {
    const database = await this.open();
    const transaction = database.transaction(DOCUMENT_STORE, 'readonly');
    const index = transaction.objectStore(DOCUMENT_STORE).index('updatedAt');
    const stored = (await requestResult(index.openCursor(null, 'prev')))?.value as
      StoredDocument | undefined;
    await transactionDone(transaction);
    return stored ? parseDocument(structuredClone(stored.document)) : null;
  }

  async list(): Promise<StoredDocumentSummary[]> {
    const database = await this.open();
    const transaction = database.transaction(DOCUMENT_STORE, 'readonly');
    const stored = (await requestResult(
      transaction.objectStore(DOCUMENT_STORE).getAll(),
    )) as StoredDocument[];
    await transactionDone(transaction);
    return stored
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  }

  async remove(id: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction([DOCUMENT_STORE, RECOVERY_STORE], 'readwrite');
    transaction.objectStore(DOCUMENT_STORE).delete(id);
    transaction.objectStore(RECOVERY_STORE).delete(id);
    await transactionDone(transaction);
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = null;
  }

  private async read(storeName: string, id: string): Promise<ScrawlDocument | null> {
    const database = await this.open();
    const transaction = database.transaction(storeName, 'readonly');
    const stored = (await requestResult(transaction.objectStore(storeName).get(id))) as
      StoredDocument | undefined;
    await transactionDone(transaction);
    return stored ? parseDocument(structuredClone(stored.document)) : null;
  }

  private open(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = this.indexedDb.open(this.databaseName, DATABASE_VERSION);
      request.addEventListener(
        'upgradeneeded',
        () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
            const store = database.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt');
          }
          if (!database.objectStoreNames.contains(RECOVERY_STORE)) {
            database.createObjectStore(RECOVERY_STORE, { keyPath: 'id' });
          }
        },
        { once: true },
      );
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
      request.addEventListener(
        'blocked',
        () => reject(new Error('Scrawl storage upgrade was blocked')),
        {
          once: true,
        },
      );
    });
    return this.databasePromise;
  }
}
