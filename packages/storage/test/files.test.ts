import { describe, expect, it } from 'vitest';
import { DocumentValidationError, createDocument } from '@scrawl/schema';
import {
  createDocumentBlob,
  MAX_SCRAWL_FILE_BYTES,
  readDocumentFile,
  SCRAWL_FILE_TYPE,
} from '../src';

describe('Scrawl files', () => {
  it('round-trips a document through the portable file format', async () => {
    const document = createDocument('Portable diagram');
    const blob = createDocumentBlob(document);

    expect(blob.type).toBe(SCRAWL_FILE_TYPE);
    expect(readDocumentFile(await blob.text())).toEqual(document);
  });

  it('rejects invalid JSON and malformed documents', () => {
    expect(() => readDocumentFile('{')).toThrow(SyntaxError);
    expect(() => readDocumentFile('{"type":"scrawl"}')).toThrow(DocumentValidationError);
  });

  it('rejects oversized files inside the reader', () => {
    expect(() => readDocumentFile(' '.repeat(MAX_SCRAWL_FILE_BYTES + 1))).toThrow(
      '50 MB open-file limit',
    );
  });
});
