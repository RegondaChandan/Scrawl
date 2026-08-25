import { expect, type Locator, type Page } from '@playwright/test';

interface StoredElement {
  type: string;
  renderStyle?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  assetId?: string;
  iconId?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  points?: Array<{ x: number; y: number }>;
}

interface StoredDocument {
  id: string;
  title: string;
  activePageId: string;
  assets: Record<string, { id: string; mimeType: string; size: number; name?: string }>;
  settings: { mode: string; sketchStyle: string; canvasColor?: string };
  pages: Array<{
    id: string;
    name: string;
    elements: StoredElement[];
  }>;
}

export async function latestDocument(page: Page): Promise<StoredDocument | null> {
  return page.evaluate(
    () =>
      new Promise<StoredDocument | null>((resolve, reject) => {
        const request = indexedDB.open('scrawl');
        request.addEventListener('error', () => reject(request.error), { once: true });
        request.addEventListener(
          'success',
          () => {
            const database = request.result;
            if (!database.objectStoreNames.contains('documents')) {
              database.close();
              resolve(null);
              return;
            }
            const transaction = database.transaction('documents', 'readonly');
            const cursor = transaction
              .objectStore('documents')
              .index('updatedAt')
              .openCursor(null, 'prev');
            cursor.addEventListener(
              'success',
              () => {
                const document = (cursor.result?.value as { document?: StoredDocument } | undefined)
                  ?.document;
                database.close();
                resolve(document ?? null);
              },
              { once: true },
            );
            cursor.addEventListener('error', () => reject(cursor.error), { once: true });
          },
          { once: true },
        );
      }),
  );
}

export async function drawingCanvas(page: Page): Promise<Locator> {
  const canvas = page.getByLabel('Drawing canvas');
  await expect(canvas).toBeVisible();
  return canvas;
}

export async function dragOnCanvas(
  page: Page,
  canvas: Locator,
  start: { x: number; y: number },
  end: { x: number; y: number },
): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The drawing canvas has no visible bounds');
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 6 });
  await page.mouse.up();
}
