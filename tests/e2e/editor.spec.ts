import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { dragOnCanvas, drawingCanvas, latestDocument } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
});

test('TC-E2E-001: text editing, undo, redo, autosave, and reload preserve the document', async ({
  page,
}) => {
  const canvas = await drawingCanvas(page);

  await page.keyboard.press('t');
  await canvas.click({ position: { x: 280, y: 220 } });
  const editor = page.getByLabel('Edit text');
  await expect(editor).toBeFocused();
  await editor.fill('Release ready');
  await expect(editor).toHaveValue('Release ready');
  await canvas.click({ position: { x: 760, y: 520 } });
  await expect(editor).toBeHidden();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Redo' }).click();

  await expect
    .poll(async () => (await latestDocument(page))?.pages[0]?.elements[0]?.text)
    .toBe('Release ready');

  await page.reload();
  await expect(page.getByLabel('Document title')).toHaveValue('Untitled');
  await expect
    .poll(async () => (await latestDocument(page))?.pages[0]?.elements[0]?.text)
    .toBe('Release ready');
});

test('TC-E2E-002: grid snapping covers shapes, free text, and connector creation', async ({
  page,
}) => {
  const canvas = await drawingCanvas(page);
  await page.getByLabel('Snap to grid').check();
  await canvas.click({ position: { x: 760, y: 520 } });

  await page.keyboard.press('r');
  await dragOnCanvas(page, canvas, { x: 113, y: 127 }, { x: 187, y: 193 });

  await page.keyboard.press('t');
  await canvas.click({ position: { x: 251, y: 269 } });
  await page.getByLabel('Edit text').fill('Grid label');
  await canvas.click({ position: { x: 760, y: 520 } });

  await page.keyboard.press('a');
  await dragOnCanvas(page, canvas, { x: 331, y: 109 }, { x: 389, y: 171 });

  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(3);
  const elements = (await latestDocument(page))!.pages[0]!.elements;
  expect(elements.find((element) => element.type === 'rectangle')).toMatchObject({
    x: 120,
    y: 120,
    width: 60,
    height: 80,
  });
  expect(elements.find((element) => element.type === 'text')).toMatchObject({
    x: 260,
    y: 260,
    text: 'Grid label',
  });
  expect(elements.find((element) => element.type === 'arrow')).toMatchObject({
    x: 340,
    y: 100,
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 80 },
    ],
  });
});

test('TC-E2E-003: editable Scrawl export reopens a complete multi-page document', async ({
  page,
}, testInfo) => {
  const canvas = await drawingCanvas(page);
  const title = page.getByLabel('Document title');
  await title.fill('Release Candidate');
  await title.press('Enter');

  await page.keyboard.press('t');
  await canvas.click({ position: { x: 240, y: 180 } });
  await page.getByLabel('Edit text').fill('Page one');
  await canvas.click({ position: { x: 760, y: 520 } });
  await page.getByRole('button', { name: 'Add page' }).click();
  await page.keyboard.press('r');
  await dragOnCanvas(page, canvas, { x: 340, y: 200 }, { x: 460, y: 280 });

  await page.getByRole('button', { name: 'Download or export' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Scrawl file/ }).click();
  const download = await downloadPromise;
  const savedPath = testInfo.outputPath('release-candidate.scrawl');
  await download.saveAs(savedPath);

  const exported = JSON.parse(await readFile(savedPath, 'utf8')) as {
    title: string;
    pages: Array<{ elements: unknown[] }>;
  };
  expect(exported.title).toBe('Release Candidate');
  expect(exported.pages).toHaveLength(2);
  expect(exported.pages.map((entry) => entry.elements.length)).toEqual([1, 1]);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByLabel('Document title')).toHaveValue('Untitled');
  await page.getByLabel('Open Scrawl or draw.io file').setInputFiles(savedPath);

  await expect(page.getByLabel('Document title')).toHaveValue('Release Candidate');
  await expect(page.getByRole('navigation', { name: 'Document pages' })).toContainText('Page 2');
  await expect
    .poll(async () => (await latestDocument(page))?.pages.map((entry) => entry.elements.length))
    .toEqual([1, 1]);
});

test('TC-E2E-004: a malformed import cannot replace the current document', async ({ page }) => {
  const title = page.getByLabel('Document title');
  await title.fill('Keep this document');
  await title.press('Enter');

  await page.getByLabel('Open Scrawl or draw.io file').setInputFiles({
    name: 'broken.scrawl',
    mimeType: 'application/vnd.scrawl+json',
    buffer: Buffer.from('{"version":1,"pages":[]}'),
  });

  await expect(page.getByRole('heading', { name: 'Unable to open file' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('The current document was not changed.');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(title).toHaveValue('Keep this document');
});
