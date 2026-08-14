import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calculatePdfPlacement, createPdfDocument, pdfPageSize } from '../src/pdf';

const ONE_PIXEL_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  ),
  (character) => character.charCodeAt(0),
);

describe('PDF export', () => {
  it('calculates fit and actual-size placement inside the selected paper', () => {
    expect(pdfPageSize('letter', 'landscape')).toEqual([792, 612]);
    const fit = calculatePdfPlacement(1200, 600, {
      paperSize: 'letter',
      orientation: 'landscape',
      scaling: 'fit',
      margin: 'normal',
    });
    const actual = calculatePdfPlacement(1200, 600, {
      paperSize: 'letter',
      orientation: 'landscape',
      scaling: 'actual',
      margin: 'normal',
    });

    expect(fit.width).toBeLessThanOrEqual(720);
    expect(fit.height).toBeLessThanOrEqual(540);
    expect(actual).toMatchObject({ width: 900, height: 450 });
  });

  it('creates a valid multi-page PDF', async () => {
    const bytes = await createPdfDocument(
      [
        { png: ONE_PIXEL_PNG, width: 400, height: 300 },
        { png: ONE_PIXEL_PNG, width: 300, height: 500 },
      ],
      {
        paperSize: 'a4',
        orientation: 'portrait',
        scaling: 'fit',
        margin: 'wide',
        title: 'Architecture',
      },
    );
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(2);
    expect(document.getTitle()).toBe('Architecture');
    expect(document.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
  });
});
