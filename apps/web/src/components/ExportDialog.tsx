import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  exportSVG,
  exportToCanvas,
  getSceneBounds,
  preloadIcons,
  preloadImages,
} from '@scrawl/engine';
import type { PdfMargin, PdfOrientation, PdfPaperSize, PdfScaling } from '@scrawl/engine/pdf';
import { CANVAS_COLORS, type AnyElement, type ScrawlPage } from '@scrawl/schema';
import { downloadBlob, safeFileName } from '../files';
import { useEditor } from '../use-editor';
import { Icon } from './Icon';
import { Modal } from './Modal';

type PageScope = 'current' | 'all';

const MAX_PDF_PAGE_PIXELS = 24_000_000;
const MAX_PDF_TOTAL_PIXELS = 48_000_000;

function visibleElements(page: ScrawlPage): AnyElement[] {
  const layerOrder = new Map(page.layers.map((layer, index) => [layer.id, index]));
  const visibleLayers = new Set(
    page.layers.filter((layer) => layer.visible).map((layer) => layer.id),
  );
  return page.elements
    .filter((element) => visibleLayers.has(element.layerId))
    .toSorted((left, right) => {
      const layerDifference =
        (layerOrder.get(left.layerId) ?? 0) - (layerOrder.get(right.layerId) ?? 0);
      return layerDifference || left.order - right.order;
    });
}

function rasterScale(elements: AnyElement[], pixelBudget: number): number {
  const bounds = getSceneBounds(elements);
  if (!bounds) return 2;
  const width = Math.max(64, bounds.width + 48);
  const height = Math.max(64, bounds.height + 48);
  const dimensionScale = Math.min(6000 / width, 6000 / height);
  const areaScale = Math.sqrt(pixelBudget / (width * height));
  const scale = Math.min(2, dimensionScale, areaScale);
  if (scale < 0.01) throw new Error('A page is too large to export safely.');
  return scale;
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The browser could not create a page image.');
  return new Uint8Array(await blob.arrayBuffer());
}

const PRINT_MARGINS: Record<PdfMargin, string> = {
  none: '0',
  normal: '12mm',
  wide: '24mm',
};

export function ExportDialog(): React.JSX.Element | null {
  const open = useEditor((state) => state.view.openPanel === 'export');
  const document = useEditor((state) => state.document);
  const actions = useEditor((state) => state.actions);
  const [pageScope, setPageScope] = useState<PageScope>('all');
  const [paperSize, setPaperSize] = useState<PdfPaperSize>('a4');
  const [orientation, setOrientation] = useState<PdfOrientation>('landscape');
  const [scaling, setScaling] = useState<PdfScaling>('fit');
  const [margin, setMargin] = useState<PdfMargin>('normal');
  const [background, setBackground] = useState(true);
  const [grid, setGrid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  if (!open) return null;

  const pages =
    pageScope === 'all'
      ? document.pages
      : document.pages.filter((page) => page.id === document.activePageId);
  const pageElements = pages.map((page) => ({ page, elements: visibleElements(page) }));
  const resolveAsset = (assetId: string): string | null => document.assets[assetId]?.data ?? null;
  const canvasColor = document.settings.canvasColor ?? CANVAS_COLORS[document.settings.theme];
  const close = (): void => actions.setOpenPanel(null);

  const preloadPageAssets = async (): Promise<void> => {
    const elements = pageElements.flatMap((entry) => entry.elements);
    await Promise.all([
      preloadIcons(
        elements.filter((element) => element.type === 'icon').map((element) => element.iconId),
      ),
      preloadImages(
        elements.filter((element) => element.type === 'image').map((element) => element.assetId),
        resolveAsset,
      ),
    ]);
  };

  const downloadPdf = async (): Promise<void> => {
    setBusy(true);
    setStatus('Preparing PDF…');
    try {
      await preloadPageAssets();
      const rasters = [];
      const pagePixelBudget = Math.min(
        MAX_PDF_PAGE_PIXELS,
        MAX_PDF_TOTAL_PIXELS / Math.max(1, pageElements.length),
      );
      for (const entry of pageElements) {
        const scale = rasterScale(entry.elements, pagePixelBudget);
        const canvas = exportToCanvas(entry.elements, {
          scale,
          theme: document.settings.theme,
          canvasColor,
          sketchStyle: document.settings.sketchStyle,
          background,
          grid,
          resolveAsset,
        });
        rasters.push({
          png: await canvasPng(canvas),
          width: canvas.width / scale,
          height: canvas.height / scale,
        });
        canvas.width = 1;
        canvas.height = 1;
      }
      const { createPdfDocument } = await import('@scrawl/engine/pdf');
      const bytes = await createPdfDocument(rasters, {
        paperSize,
        orientation,
        scaling,
        margin,
        title: document.title,
      });
      downloadBlob(
        `${safeFileName(document.title)}.pdf`,
        new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      );
      setStatus(`Saved ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} as PDF.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The PDF could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const print = (): void => {
    setStatus('Opening the browser print dialog…');
    window.print();
  };

  const printStyle = `@media print { @page { size: ${paperSize === 'a4' ? 'A4' : 'Letter'} ${orientation}; margin: ${PRINT_MARGINS[margin]}; } }`;

  return (
    <>
      <Modal className="export-dialog" labelledBy="export-dialog-title" onClose={close}>
        <header className="modal-header">
          <div>
            <span className="modal-eyebrow">Portable output</span>
            <h2 id="export-dialog-title">PDF and print</h2>
            <p>Export locally without uploading your document.</p>
          </div>
          <button aria-label="Close PDF and print dialog" onClick={close} type="button">
            <Icon name="x" size={17} />
          </button>
        </header>

        <div className="export-options">
          <label>
            <span>Pages</span>
            <select
              autoFocus
              onChange={(event) => setPageScope(event.currentTarget.value as PageScope)}
              value={pageScope}
            >
              <option value="all">All pages ({document.pages.length})</option>
              <option value="current">Current page</option>
            </select>
          </label>
          <label>
            <span>Paper</span>
            <select
              onChange={(event) => setPaperSize(event.currentTarget.value as PdfPaperSize)}
              value={paperSize}
            >
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
            </select>
          </label>
          <label>
            <span>Orientation</span>
            <select
              onChange={(event) => setOrientation(event.currentTarget.value as PdfOrientation)}
              value={orientation}
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <label>
            <span>Scale</span>
            <select
              onChange={(event) => setScaling(event.currentTarget.value as PdfScaling)}
              value={scaling}
            >
              <option value="fit">Fit to page</option>
              <option value="actual">Actual size</option>
            </select>
          </label>
          <label>
            <span>Margins</span>
            <select
              onChange={(event) => setMargin(event.currentTarget.value as PdfMargin)}
              value={margin}
            >
              <option value="none">None</option>
              <option value="normal">Normal</option>
              <option value="wide">Wide</option>
            </select>
          </label>
        </div>

        <fieldset className="export-toggles">
          <legend>Appearance</legend>
          <label>
            <input
              checked={background}
              onChange={(event) => setBackground(event.currentTarget.checked)}
              type="checkbox"
            />
            Canvas background
          </label>
          <label>
            <input
              checked={grid}
              onChange={(event) => setGrid(event.currentTarget.checked)}
              type="checkbox"
            />
            Dot grid
          </label>
        </fieldset>

        <div className="export-note">
          <strong>Download PDF</strong> creates a high-resolution portable file.{' '}
          <strong>Print / Save as PDF</strong> uses vector pages through the browser print dialog.
        </div>

        <p aria-live="polite" className="export-status">
          {status}
        </p>

        <footer className="modal-actions export-actions">
          <button className="secondary-button" disabled={busy} onClick={print} type="button">
            Print / Save as PDF
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void downloadPdf()}
            type="button"
          >
            {busy ? 'Preparing…' : 'Download PDF'}
          </button>
        </footer>
      </Modal>

      {createPortal(
        <>
          <style>{printStyle}</style>
          <div className="print-output" data-scaling={scaling}>
            {pageElements.map(({ page, elements }) => (
              <div className="print-sheet" key={page.id}>
                <div
                  dangerouslySetInnerHTML={{
                    __html: exportSVG(elements, {
                      theme: document.settings.theme,
                      canvasColor,
                      sketchStyle: document.settings.sketchStyle,
                      background,
                      grid,
                      resolveAsset,
                    }),
                  }}
                />
              </div>
            ))}
          </div>
        </>,
        globalThis.document.body,
      )}
    </>
  );
}
