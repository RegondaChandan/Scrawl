import type { AnyElement, ScrawlDocument } from '@scrawl/schema';

export interface StoredDocumentSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface StoredDocument extends StoredDocumentSummary {
  document: ScrawlDocument;
}

export interface DocumentRepository {
  save: (document: ScrawlDocument) => Promise<StoredDocumentSummary>;
  load: (id: string) => Promise<ScrawlDocument | null>;
  loadRecovery: (id: string) => Promise<ScrawlDocument | null>;
  latest: () => Promise<ScrawlDocument | null>;
  list: () => Promise<StoredDocumentSummary[]>;
  remove: (id: string) => Promise<void>;
}

export interface StoredTemplate {
  id: string;
  name: string;
  elements: AnyElement[];
  createdAt: number;
  updatedAt: number;
}

export interface TemplateRepository {
  save: (name: string, elements: AnyElement[], id?: string) => Promise<StoredTemplate>;
  list: () => Promise<StoredTemplate[]>;
  remove: (id: string) => Promise<void>;
}
