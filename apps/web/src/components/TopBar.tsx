import { useEffect, useRef, useState } from 'react';
import { exportSVG, exportToCanvas, preloadIcons, preloadImages } from '@scrawl/engine';
import { type DrawioImportResult } from '@scrawl/interchange';
import { MAX_DRAWIO_FILE_BYTES } from '@scrawl/interchange/limits';
import {
  CANVAS_COLORS,
  createDocument,
  createElement,
  maxOrder,
  serializeDocument,
} from '@scrawl/schema';
import { MAX_SCRAWL_FILE_BYTES, readDocumentFile } from '@scrawl/storage';
import { downloadBlob, downloadText, safeFileName } from '../files';
import {
  imageInsertionError,
  imageInsertionFailureMessage,
  prepareImageFile,
} from '../image-files';
import { useEditor } from '../use-editor';
import { Icon } from './Icon';
import { ImportDialog, type ImportDialogState } from './ImportDialog';

export function TopBar(): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const firstDownloadOptionRef = useRef<HTMLButtonElement>(null);
  const [importDialog, setImportDialog] = useState<ImportDialogState | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const document = useEditor((state) => state.document);
  const view = useEditor((state) => state.view);
  const actions = useEditor((state) => state.actions);
  const history = useEditor((state) => state.history);
  const activePage = document.pages.find((page) => page.id === document.activePageId)!;
  const layerOrder = new Map(activePage.layers.map((layer, index) => [layer.id, index]));
  const visibleLayerIds = new Set(
    activePage.layers.filter((layer) => layer.visible).map((layer) => layer.id),
  );
  const orderedElements = activePage.elements
    .filter((element) => visibleLayerIds.has(element.layerId))
    .toSorted((left, right) => {
      const layerDifference =
        (layerOrder.get(left.layerId) ?? 0) - (layerOrder.get(right.layerId) ?? 0);
      return layerDifference || left.order - right.order;
    });
  const isDark = document.settings.theme === 'dark';
  const canvasColor = document.settings.canvasColor ?? CANVAS_COLORS[document.settings.theme];

  useEffect(() => {
    if (!downloadMenuOpen) return;

    const closeOnOutsidePress = (event: PointerEvent): void => {
      if (event.target instanceof Node && !downloadMenuRef.current?.contains(event.target)) {
        setDownloadMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setDownloadMenuOpen(false);
      downloadButtonRef.current?.focus();
    };

    window.document.addEventListener('pointerdown', closeOnOutsidePress);
    window.document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.document.removeEventListener('pointerdown', closeOnOutsidePress);
      window.document.removeEventListener('keydown', closeOnEscape);
    };
  }, [downloadMenuOpen]);

  const saveDocument = (): void => {
    downloadText(
      `${safeFileName(document.title)}.scrawl`,
      serializeDocument(document),
      'application/vnd.scrawl+json',
    );
  };

  const saveSvg = (): void => {
    downloadText(
      `${safeFileName(document.title)}.svg`,
      exportSVG(orderedElements, {
        theme: document.settings.theme,
        canvasColor,
        sketchStyle: document.settings.sketchStyle,
        resolveAsset: (assetId) => document.assets[assetId]?.data ?? null,
      }),
      'image/svg+xml',
    );
  };

  const savePng = async (): Promise<void> => {
    const resolveAsset = (assetId: string): string | null => document.assets[assetId]?.data ?? null;
    await Promise.all([
      preloadIcons(
        orderedElements
          .filter((element) => element.type === 'icon')
          .map((element) => element.iconId),
      ),
      preloadImages(
        orderedElements
          .filter((element) => element.type === 'image')
          .map((element) => element.assetId),
        resolveAsset,
      ),
    ]);
    const canvas = exportToCanvas(orderedElements, {
      scale: 2,
      theme: document.settings.theme,
      canvasColor,
      sketchStyle: document.settings.sketchStyle,
      resolveAsset,
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) downloadBlob(`${safeFileName(document.title)}.png`, blob);
  };

  const insertImage = async (file: File): Promise<void> => {
    const validationError = imageInsertionError(document, [file]);
    if (validationError) {
      window.alert(validationError);
      return;
    }
    try {
      const prepared = await prepareImageFile(file);
      const canvasCenter = {
        x: window.innerWidth / 2,
        y: Math.max(0, window.innerHeight - 58) / 2,
      };
      const element = createElement('image', {
        x: (canvasCenter.x - view.camera.x) / view.camera.zoom - prepared.width / 2,
        y: (canvasCenter.y - view.camera.y) / view.camera.zoom - prepared.height / 2,
        width: prepared.width,
        height: prepared.height,
        naturalWidth: prepared.naturalWidth,
        naturalHeight: prepared.naturalHeight,
        assetId: prepared.asset.id,
        layerId: view.activeLayerId,
        order: maxOrder(activePage.elements) + 1,
      });
      actions.addImage(prepared.asset, element);
    } catch (error) {
      window.alert(imageInsertionFailureMessage(error));
    }
  };

  const openFile = async (file: File): Promise<void> => {
    const extension = file.name.split('.').at(-1)?.toLowerCase();
    try {
      if (extension === 'drawio' || extension === 'xml') {
        if (file.size > MAX_DRAWIO_FILE_BYTES) {
          throw new Error('The draw.io file exceeds the 20 MB import limit.');
        }
        const title = file.name.replace(/\.(?:drawio|xml)$/i, '') || 'Imported diagram';
        const { importDrawio } = await import('@scrawl/interchange');
        const result = importDrawio(await file.text(), { title });
        setImportDialog({ kind: 'drawio', fileName: file.name, result });
        return;
      }
      if (file.size > MAX_SCRAWL_FILE_BYTES) {
        throw new Error('The Scrawl file exceeds the 50 MB open-file limit.');
      }
      actions.loadDocument(readDocumentFile(await file.text()));
    } catch (error) {
      setImportDialog({
        kind: 'error',
        fileName: file.name,
        message:
          error instanceof Error
            ? error.message
            : 'This file is not a supported Scrawl or draw.io document.',
      });
    }
  };

  const finishDrawioImport = (result: DrawioImportResult): void => {
    actions.loadDocument(result.document);
    setImportDialog(null);
  };

  return (
    <>
      <header className="top-bar">
        <h1 className="brand" aria-label="Scrawl">
          <img
            alt=""
            className="brand-mark"
            draggable="false"
            height="38"
            src="/scrawl-logo-192.png"
            width="38"
          />
          <span className="brand-name">Scrawl</span>
        </h1>

        <label className="title-field">
          <span className="sr-only">Document title</span>
          <input
            defaultValue={document.title}
            key={document.id}
            maxLength={100}
            onBlur={(event) => actions.setTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>

        <div className="top-actions">
          <button
            aria-label="Open command menu"
            className="command-button"
            onClick={() => actions.setOpenPanel('commands')}
            title="Command menu · ⌘K"
            type="button"
          >
            <Icon name="search" size={16} />
            <span>Commands</span>
            <kbd>⌘K</kbd>
          </button>
          <button
            aria-label="Undo"
            className="icon-button"
            disabled={history.past.length === 0}
            onClick={actions.undo}
            title="Undo · ⌘Z"
            type="button"
          >
            <Icon name="undo" />
          </button>
          <button
            aria-label="Redo"
            className="icon-button"
            disabled={history.future.length === 0}
            onClick={actions.redo}
            title="Redo · ⇧⌘Z"
            type="button"
          >
            <Icon name="redo" />
          </button>
          <span className="top-divider" />
          <button
            className="text-button"
            onClick={() => {
              if (activePage.elements.length === 0 || window.confirm('Start a new document?')) {
                actions.loadDocument(createDocument());
              }
            }}
            type="button"
          >
            New
          </button>
          <button
            className="text-button"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            Open
          </button>
          <input
            accept=".scrawl,.drawio,.xml,application/json,application/vnd.scrawl+json,application/xml,text/xml"
            aria-label="Open Scrawl or draw.io file"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              void openFile(file);
              event.currentTarget.value = '';
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="text-button"
            onClick={() => imageInputRef.current?.click()}
            type="button"
          >
            Image
          </button>
          <input
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Insert image file"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void insertImage(file);
              event.currentTarget.value = '';
            }}
            ref={imageInputRef}
            type="file"
          />
          <div className="download-menu" ref={downloadMenuRef}>
            <button
              aria-controls="download-options"
              aria-expanded={downloadMenuOpen}
              aria-label="Download or export"
              className="primary-button download-trigger"
              onClick={() => setDownloadMenuOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                setDownloadMenuOpen(true);
                window.requestAnimationFrame(() => firstDownloadOptionRef.current?.focus());
              }}
              ref={downloadButtonRef}
              title="Download or export"
              type="button"
            >
              <Icon name="download" size={17} />
              <span>Download</span>
              <span aria-hidden="true" className="download-caret">
                ⌄
              </span>
            </button>
            {downloadMenuOpen ? (
              <div aria-label="Download options" className="download-options" id="download-options">
                <button
                  className="download-option"
                  onClick={() => {
                    setDownloadMenuOpen(false);
                    saveDocument();
                  }}
                  ref={firstDownloadOptionRef}
                  type="button"
                >
                  <span className="download-format">SC</span>
                  <span className="download-copy">
                    <strong>Scrawl file</strong>
                    <small>Editable project</small>
                  </span>
                  <span className="download-extension">.scrawl</span>
                </button>
                <button
                  className="download-option"
                  onClick={() => {
                    setDownloadMenuOpen(false);
                    saveSvg();
                  }}
                  type="button"
                >
                  <span className="download-format">SV</span>
                  <span className="download-copy">
                    <strong>SVG image</strong>
                    <small>Current page, scalable</small>
                  </span>
                  <span className="download-extension">.svg</span>
                </button>
                <button
                  className="download-option"
                  onClick={() => {
                    setDownloadMenuOpen(false);
                    void savePng();
                  }}
                  type="button"
                >
                  <span className="download-format">PN</span>
                  <span className="download-copy">
                    <strong>PNG image</strong>
                    <small>Current page, high resolution</small>
                  </span>
                  <span className="download-extension">.png</span>
                </button>
                <button
                  className="download-option"
                  onClick={() => {
                    setDownloadMenuOpen(false);
                    actions.setOpenPanel('export');
                  }}
                  type="button"
                >
                  <span className="download-format">PD</span>
                  <span className="download-copy">
                    <strong>PDF document</strong>
                    <small>One page or the whole document</small>
                  </span>
                  <span className="download-extension">.pdf</span>
                </button>
              </div>
            ) : null}
          </div>
          <button
            aria-label={isDark ? 'Use light theme' : 'Use dark theme'}
            className="icon-button"
            onClick={() => actions.updateSettings({ theme: isDark ? 'light' : 'dark' })}
            type="button"
          >
            <Icon name={isDark ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>
      {importDialog ? (
        <ImportDialog
          onClose={() => setImportDialog(null)}
          onImport={finishDrawioImport}
          state={importDialog}
        />
      ) : null}
    </>
  );
}
