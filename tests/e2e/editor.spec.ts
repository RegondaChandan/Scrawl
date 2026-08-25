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

test('TC-E2E-007: unfinished text stays local and Escape commits it once', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const canvas = await drawingCanvas(page);

  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(0);

  const title = page.getByLabel('Document title');
  await title.fill('Local draft');
  await title.press('Enter');
  await page.keyboard.press('t');
  await canvas.click({ position: { x: 280, y: 220 } });

  const editor = page.getByLabel('Edit text');
  await editor.fill('Not saved while typing');
  await page.waitForTimeout(700);

  const storedWhileEditing = await latestDocument(page);
  expect(storedWhileEditing?.title).toBe('Local draft');
  expect(storedWhileEditing?.pages[0]?.elements).toHaveLength(0);

  await editor.press('Escape');
  await expect(editor).toBeHidden();
  await expect
    .poll(async () => {
      const stored = await latestDocument(page);
      return {
        title: stored?.title,
        text: stored?.pages[0]?.elements[0]?.text,
      };
    })
    .toEqual({ title: 'Local draft', text: 'Not saved while typing' });

  expect(consoleErrors.filter((message) => message.includes('same key'))).toEqual([]);
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

test('TC-E2E-006: freehand drawing stays active until the user exits the tool', async ({
  page,
}) => {
  const canvas = await drawingCanvas(page);
  const drawTool = page.getByRole('button', { name: 'Draw (P)' });
  const selectTool = page.getByRole('button', { name: 'Select (V)' });

  await drawTool.click();
  await dragOnCanvas(page, canvas, { x: 220, y: 180 }, { x: 320, y: 240 });
  await dragOnCanvas(page, canvas, { x: 340, y: 260 }, { x: 430, y: 190 });

  await expect(drawTool).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('No objects selected.')).toBeAttached();
  await expect
    .poll(async () => (await latestDocument(page))?.pages[0]?.elements.map(({ type }) => type))
    .toEqual(['freedraw', 'freedraw']);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(1);
  await expect(drawTool).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('v');
  await expect(selectTool).toHaveAttribute('aria-pressed', 'true');

  await drawTool.click();
  await page.keyboard.press('Escape');
  await expect(selectTool).toHaveAttribute('aria-pressed', 'true');

  await drawTool.click();
  await selectTool.click();
  await expect(selectTool).toHaveAttribute('aria-pressed', 'true');
});

test('TC-E2E-013: expressive tools switch texture and keep laser gestures transient', async ({
  page,
}) => {
  const canvas = await drawingCanvas(page);

  await page.keyboard.press('r');
  await dragOnCanvas(page, canvas, { x: 260, y: 180 }, { x: 380, y: 260 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');

  await expect
    .poll(async () => {
      const stored = await latestDocument(page);
      return {
        mode: stored?.settings.mode,
        renderStyle: stored?.pages[0]?.elements[0]?.renderStyle,
      };
    })
    .toEqual({ mode: 'rough', renderStyle: 'rough' });

  await page.getByRole('button', { name: 'Marker', exact: true }).click();
  await expect.poll(async () => (await latestDocument(page))?.settings.sketchStyle).toBe('marker');

  await page.keyboard.press('k');
  await expect(page.getByRole('button', { name: 'Laser pointer (K)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('status')).toContainText('Laser');
  await dragOnCanvas(page, canvas, { x: 440, y: 220 }, { x: 590, y: 310 });
  await page.waitForTimeout(1_000);

  expect((await latestDocument(page))?.pages[0]?.elements).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => {
      const stored = await latestDocument(page);
      return {
        count: stored?.pages[0]?.elements.length,
        mode: stored?.settings.mode,
        renderStyle: stored?.pages[0]?.elements[0]?.renderStyle,
        sketchStyle: stored?.settings.sketchStyle,
      };
    })
    .toEqual({ count: 1, mode: 'rough', renderStyle: 'rough', sketchStyle: 'pencil' });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => {
      const stored = await latestDocument(page);
      return {
        count: stored?.pages[0]?.elements.length,
        mode: stored?.settings.mode,
        renderStyle: stored?.pages[0]?.elements[0]?.renderStyle,
      };
    })
    .toEqual({ count: 1, mode: 'crisp', renderStyle: 'crisp' });
});

test('TC-E2E-014: canvas background colors are live, undoable, and persisted', async ({ page }) => {
  await drawingCanvas(page);
  const canvasWrap = page.locator('.canvas-wrap');

  await page.getByRole('button', { name: 'Canvas background #fff9db' }).click();
  await expect(canvasWrap).toHaveCSS('background-color', 'rgb(255, 249, 219)');
  await expect.poll(async () => (await latestDocument(page))?.settings.canvasColor).toBe('#fff9db');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(canvasWrap).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect.poll(async () => (await latestDocument(page))?.settings.canvasColor).toBeUndefined();

  await page.getByLabel('Custom canvas background color').fill('#dbeafe');
  await expect(canvasWrap).toHaveCSS('background-color', 'rgb(219, 234, 254)');
  await expect.poll(async () => (await latestDocument(page))?.settings.canvasColor).toBe('#dbeafe');

  await page.reload();
  await expect(page.locator('.canvas-wrap')).toHaveCSS('background-color', 'rgb(219, 234, 254)');

  await page.getByRole('button', { name: 'Use Radial editing controls' }).click();
  await page.getByRole('button', { name: 'Change canvas background' }).click();
  await page.getByRole('button', { name: 'Canvas background #ebfbee' }).click();
  await expect(page.locator('.canvas-wrap')).toHaveCSS('background-color', 'rgb(235, 251, 238)');
  await expect.poll(async () => (await latestDocument(page))?.settings.canvasColor).toBe('#ebfbee');
});

test('TC-E2E-008: Space-drag pans temporarily and double-click creates text', async ({ page }) => {
  const canvas = await drawingCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The drawing canvas has no visible bounds');

  await page.keyboard.down('Space');
  await expect(canvas).toHaveCSS('cursor', 'grab');
  await page.mouse.move(box.x + 560, box.y + 380);
  await page.mouse.down();
  await page.mouse.move(box.x + 660, box.y + 430, { steps: 6 });
  await expect(canvas).toHaveCSS('cursor', 'grabbing');
  await page.mouse.up();
  await page.keyboard.up('Space');

  await canvas.dblclick({ position: { x: 320, y: 240 } });
  const editor = page.getByLabel('Edit text');
  await expect(editor).toBeFocused();
  await editor.fill('Created by double-click');
  await editor.press('Escape');

  await expect
    .poll(async () => {
      const element = (await latestDocument(page))?.pages[0]?.elements[0];
      return element
        ? { type: element.type, text: element.text, x: element.x, y: element.y }
        : null;
    })
    .toEqual({ type: 'text', text: 'Created by double-click', x: 220, y: 190 });
  await expect(page.getByRole('button', { name: 'Select (V)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('TC-E2E-009: Shift constrains drawing and an erase stroke is one undo step', async ({
  page,
}) => {
  const canvas = await drawingCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The drawing canvas has no visible bounds');

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 220, box.y + 150);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 300, box.y + 190, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await page.keyboard.press('l');
  await page.mouse.move(box.x + 380, box.y + 170);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 480, box.y + 200, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');

  for (const x of [220, 340, 460]) {
    await page.keyboard.press('r');
    await dragOnCanvas(page, canvas, { x, y: 360 }, { x: x + 60, y: 420 });
  }

  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(5);
  const constrained = (await latestDocument(page))!.pages[0]!.elements;
  const square = constrained.find((element) => element.type === 'rectangle' && element.y < 200)!;
  const line = constrained.find((element) => element.type === 'line')!;
  expect(square.width).toBeCloseTo(square.height, 5);
  expect(line.points?.[1]?.y).toBeCloseTo(0, 5);

  await page.keyboard.press('e');
  await expect(canvas).toHaveCSS('cursor', 'cell');
  await page.mouse.move(box.x + 200, box.y + 390);
  await page.mouse.down();
  await page.mouse.move(box.x + 540, box.y + 390, { steps: 30 });
  await page.mouse.up();

  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(5);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(2);
});

test('TC-E2E-015: document shortcuts cannot interrupt an active pointer transaction', async ({
  page,
}) => {
  const canvas = await drawingCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The drawing canvas has no visible bounds');

  await page.keyboard.press('r');
  await dragOnCanvas(page, canvas, { x: 240, y: 180 }, { x: 360, y: 260 });
  await page.mouse.move(box.x + 300, box.y + 220);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 300, { steps: 4 });
  await page.keyboard.press('m');
  await page.keyboard.press('Delete');
  await page.mouse.move(box.x + 460, box.y + 320, { steps: 4 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const stored = await latestDocument(page);
      const element = stored?.pages[0]?.elements[0];
      return {
        count: stored?.pages[0]?.elements.length,
        mode: stored?.settings.mode,
        renderStyle: element?.renderStyle,
      };
    })
    .toEqual({ count: 1, mode: 'crisp', renderStyle: 'crisp' });

  await page.getByRole('button', { name: 'Undo' }).click();
  const restored = (await latestDocument(page))?.pages[0]?.elements[0];
  expect(restored).toMatchObject({ x: 240, y: 180 });
});

test('TC-E2E-016: Inspector render changes remeasure text and undo in one step', async ({
  page,
}) => {
  const canvas = await drawingCanvas(page);
  await page.keyboard.press('t');
  await canvas.click({ position: { x: 320, y: 240 } });
  const editor = page.getByLabel('Edit text');
  await editor.fill('Mode-aware text');
  await editor.press('Escape');

  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(1);
  const before = (await latestDocument(page))!.pages[0]!.elements[0]!;
  await page.getByRole('button', { name: 'Sketch', exact: true }).click();
  await expect
    .poll(async () => {
      const stored = await latestDocument(page);
      const text = stored?.pages[0]?.elements[0];
      return {
        mode: stored?.settings.mode,
        renderStyle: text?.renderStyle,
        widthChanged: text ? text.width !== before.width : false,
      };
    })
    .toEqual({ mode: 'crisp', renderStyle: 'rough', widthChanged: true });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => {
      const stored = await latestDocument(page);
      const text = stored?.pages[0]?.elements[0];
      return {
        mode: stored?.settings.mode,
        renderStyle: text?.renderStyle,
        width: text?.width,
      };
    })
    .toEqual({ mode: 'crisp', renderStyle: 'crisp', width: before.width });
});

test('TC-E2E-010: native text and object paste use the canvas pointer', async ({ page }) => {
  const canvas = await drawingCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The drawing canvas has no visible bounds');

  await page.mouse.move(box.x + 600, box.y + 400);
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[aria-label="Drawing canvas"]')!;
    const transfer = new DataTransfer();
    transfer.setData('text/plain', 'Pasted at pointer');
    canvas.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
    );
  });

  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(1);
  const text = (await latestDocument(page))!.pages[0]!.elements[0]!;
  expect(text.type).toBe('text');
  expect(text.text).toBe('Pasted at pointer');
  expect(text.x + text.width / 2).toBeCloseTo(600, 5);
  expect(text.y + text.height / 2).toBeCloseTo(400, 5);

  await page.keyboard.press('r');
  await dragOnCanvas(page, canvas, { x: 180, y: 140 }, { x: 300, y: 220 });
  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(2);
  const serialized = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[aria-label="Drawing canvas"]')!;
    const transfer = new DataTransfer();
    canvas.dispatchEvent(
      new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: transfer }),
    );
    return transfer.getData('text/plain');
  });
  expect(serialized).toContain('"type":"scrawl/clipboard"');

  await page.mouse.move(box.x + 700, box.y + 450);
  await page.evaluate((clipboardText) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[aria-label="Drawing canvas"]')!;
    const transfer = new DataTransfer();
    transfer.setData('text/plain', clipboardText);
    canvas.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
    );
  }, serialized);

  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(3);
  const rectangles = (await latestDocument(page))!.pages[0]!.elements.filter(
    (element) => element.type === 'rectangle',
  );
  const pasted = rectangles.find((element) => element.x > 500)!;
  expect(pasted.x + pasted.width / 2).toBeCloseTo(700, 5);
  expect(pasted.y + pasted.height / 2).toBeCloseTo(450, 5);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(2);
});

test('TC-E2E-011: pasted and dropped images use one asset-aware undo step', async ({ page }) => {
  const canvas = await drawingCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The drawing canvas has no visible bounds');

  await page.mouse.move(box.x + 520, box.y + 330);
  await page.evaluate(() => {
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'pixel.png', { type: 'image/png' }));
    const canvas = document.querySelector<HTMLCanvasElement>('[aria-label="Drawing canvas"]')!;
    canvas.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
    );
  });

  await expect
    .poll(async () => {
      const document = await latestDocument(page);
      const image = document?.pages[0]?.elements[0];
      return {
        assets: Object.keys(document?.assets ?? {}).length,
        type: image?.type,
        naturalWidth: image?.naturalWidth,
        naturalHeight: image?.naturalHeight,
      };
    })
    .toEqual({ assets: 1, type: 'image', naturalWidth: 1, naturalHeight: 1 });

  const image = (await latestDocument(page))!.pages[0]!.elements[0]!;
  expect(image.x + image.width / 2).toBeCloseTo(520, 5);
  expect(image.y + image.height / 2).toBeCloseTo(330, 5);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(async () => {
      const document = await latestDocument(page);
      return {
        assets: Object.keys(document?.assets ?? {}).length,
        elements: document?.pages[0]?.elements.length,
      };
    })
    .toEqual({ assets: 0, elements: 0 });

  await page.evaluate(
    ({ clientX, clientY }) => {
      const base64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
      const canvas = document.querySelector<HTMLCanvasElement>('[aria-label="Drawing canvas"]')!;
      canvas.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          dataTransfer: transfer,
        }),
      );
    },
    { clientX: box.x + 680, clientY: box.y + 430 },
  );

  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(1);
  const dropped = (await latestDocument(page))!.pages[0]!.elements[0]!;
  expect(dropped.type).toBe('image');
  expect(dropped.x + dropped.width / 2).toBeCloseTo(680, 5);
  expect(dropped.y + dropped.height / 2).toBeCloseTo(430, 5);
});

test('TC-E2E-012: library shapes and cloud icons drag to the drop point', async ({ page }) => {
  const canvas = await drawingCanvas(page);

  await page.getByRole('button', { name: 'Shape library' }).click();
  await page.getByRole('button', { name: 'Process', exact: true }).dragTo(canvas, {
    targetPosition: { x: 560, y: 300 },
  });

  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(1);
  const shape = (await latestDocument(page))!.pages[0]!.elements[0]!;
  expect(shape.type).toBe('rectangle');
  expect(shape.x + shape.width / 2).toBeCloseTo(560, 5);
  expect(shape.y + shape.height / 2).toBeCloseTo(300, 5);

  await page.getByRole('button', { name: 'Shape library' }).click();
  await page.getByRole('tab', { name: 'Icons' }).click();
  await page.getByRole('button', { name: 'EC2', exact: true }).dragTo(canvas, {
    targetPosition: { x: 700, y: 420 },
  });

  await expect.poll(async () => (await latestDocument(page))?.pages[0]?.elements.length).toBe(2);
  const icon = (await latestDocument(page))!.pages[0]!.elements.find(
    (element) => element.type === 'icon',
  )!;
  expect(icon.iconId).toBe('aws:ec2');
  expect(icon.x + icon.width / 2).toBeCloseTo(700, 5);
  expect(icon.y + icon.height / 2).toBeCloseTo(420, 5);
});
