import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('TC-A11Y-001: the default workspace has no serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  const releaseBlockingViolations = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );

  expect(releaseBlockingViolations).toEqual([]);
});

test('TC-A11Y-002: keyboard mode switching is stationary and works without a selection', async ({
  page,
}) => {
  await page.goto('/');
  const radialSwitch = page.getByRole('button', { name: 'Use Radial editing controls' });
  await radialSwitch.focus();
  const radialPosition = await radialSwitch.boundingBox();
  await radialSwitch.press('Enter');

  const panelSwitch = page.getByRole('button', { name: 'Use Panel editing controls' });
  await expect(panelSwitch).toBeFocused();
  expect(await panelSwitch.boundingBox()).toEqual(radialPosition);
  await panelSwitch.press('Enter');
  await expect(radialSwitch).toBeFocused();
});

test('TC-A11Y-003: the property-mode switch remains available on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto('/');

  const radialSwitch = page.getByRole('button', { name: 'Use Radial editing controls' });
  await expect(radialSwitch).toBeVisible();
  await radialSwitch.press('Enter');
  await expect(page.getByRole('button', { name: 'Use Panel editing controls' })).toBeVisible();
});
