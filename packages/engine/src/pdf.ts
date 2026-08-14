import { PDFDocument } from 'pdf-lib';

export type PdfPaperSize = 'a4' | 'letter';
export type PdfOrientation = 'portrait' | 'landscape';
export type PdfScaling = 'fit' | 'actual';
export type PdfMargin = 'none' | 'normal' | 'wide';

export interface PdfPageRaster {
  png: Uint8Array;
  width: number;
  height: number;
}

export interface PdfExportOptions {
  paperSize: PdfPaperSize;
  orientation: PdfOrientation;
  scaling: PdfScaling;
  margin: PdfMargin;
  title?: string;
}

export interface PdfPlacement {
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const PAPER_POINTS: Record<PdfPaperSize, readonly [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const MARGIN_POINTS: Record<PdfMargin, number> = {
  none: 0,
  normal: 36,
  wide: 72,
};

export function pdfPageSize(
  paperSize: PdfPaperSize,
  orientation: PdfOrientation,
): readonly [number, number] {
  const [width, height] = PAPER_POINTS[paperSize];
  return orientation === 'portrait' ? [width, height] : [height, width];
}

export function calculatePdfPlacement(
  contentWidth: number,
  contentHeight: number,
  options: Omit<PdfExportOptions, 'title'>,
): PdfPlacement {
  const [pageWidth, pageHeight] = pdfPageSize(options.paperSize, options.orientation);
  const margin = MARGIN_POINTS[options.margin];
  const availableWidth = Math.max(1, pageWidth - margin * 2);
  const availableHeight = Math.max(1, pageHeight - margin * 2);
  const sourceWidth = Math.max(1, contentWidth) * 0.75;
  const sourceHeight = Math.max(1, contentHeight) * 0.75;
  const scale =
    options.scaling === 'fit'
      ? Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight)
      : 1;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    pageWidth,
    pageHeight,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}

export async function createPdfDocument(
  pages: readonly PdfPageRaster[],
  options: PdfExportOptions,
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('A PDF needs at least one page');
  const document = await PDFDocument.create();
  if (options.title?.trim()) document.setTitle(options.title.trim());
  for (const source of pages) {
    const placement = calculatePdfPlacement(source.width, source.height, options);
    const page = document.addPage([placement.pageWidth, placement.pageHeight]);
    const image = await document.embedPng(source.png);
    page.drawImage(image, {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    });
  }
  return document.save();
}
