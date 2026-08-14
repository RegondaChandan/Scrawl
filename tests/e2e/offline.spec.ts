import { expect, test } from '@playwright/test';

test('TC-E2E-005: the installed application opens without a network connection', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByLabel('Drawing canvas')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
