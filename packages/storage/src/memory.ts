import { parseDocument, type ScrawlDocument } from '@scrawl/schema';
import type { DocumentRepository, StoredDocument, StoredDocumentSummary } from './types';

export class MemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, StoredDocument>();
  private readonly recovery = new Map<string, StoredDocument>();
  private clock = 0;

  async save(document: ScrawlDocument): Promise<StoredDocumentSummary> {
    const validated = parseDocument(structuredClone(document));
    const previous = this.documents.get(validated.id);
    if (previous) this.recovery.set(validated.id, structuredClone(previous));
    const stored: StoredDocument = {
      id: validated.id,
      title: validated.title,
      updatedAt: ++this.clock,
      document: validated,
    };
    this.documents.set(validated.id, stored);
    return { id: stored.id, title: stored.title, updatedAt: stored.updatedAt };
  }

  async load(id: string): Promise<ScrawlDocument | null> {
    return this.clone(this.documents.get(id));
  }

  async loadRecovery(id: string): Promise<ScrawlDocument | null> {
    return this.clone(this.recovery.get(id));
  }

  async latest(): Promise<ScrawlDocument | null> {
    const stored = [...this.documents.values()].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    )[0];
    return this.clone(stored);
  }

  async list(): Promise<StoredDocumentSummary[]> {
    return [...this.documents.values()]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  }

  async remove(id: string): Promise<void> {
    this.documents.delete(id);
    this.recovery.delete(id);
  }

  private clone(stored: StoredDocument | undefined): ScrawlDocument | null {
    return stored ? structuredClone(stored.document) : null;
  }
}
