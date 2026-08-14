import {
  DocumentValidationError,
  parseDocument,
  serializeDocument,
  type ScrawlDocument,
} from '@scrawl/schema';

export const SCRAWL_FILE_TYPE = 'application/vnd.scrawl+json';
export const MAX_SCRAWL_FILE_BYTES = 50 * 1024 * 1024;

export function readDocumentFile(contents: string): ScrawlDocument {
  if (
    contents.length > MAX_SCRAWL_FILE_BYTES ||
    new TextEncoder().encode(contents).byteLength > MAX_SCRAWL_FILE_BYTES
  ) {
    throw new DocumentValidationError('The Scrawl file exceeds the 50 MB open-file limit.');
  }
  return parseDocument(JSON.parse(contents) as unknown);
}

export function createDocumentBlob(document: ScrawlDocument): Blob {
  return new Blob([serializeDocument(document)], { type: SCRAWL_FILE_TYPE });
}
