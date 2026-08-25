import { expect, test } from '@playwright/test';

test('TC-SEO-001: production preview serves crawl and sharing assets', async ({
  page,
  request,
}) => {
  const robotsResponse = await request.get('/robots.txt');
  expect(robotsResponse.ok()).toBe(true);
  expect(robotsResponse.headers()['content-type']).toContain('text/plain');
  const robots = await robotsResponse.text();
  expect(robots).toContain('Sitemap: https://scrawl.design/sitemap.xml');
  expect(robots).not.toContain('<!doctype html>');

  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.ok()).toBe(true);
  expect(sitemapResponse.headers()['content-type']).toMatch(/(?:application|text)\/xml/);
  expect(await sitemapResponse.text()).toContain('<loc>https://scrawl.design/</loc>');

  const socialCardResponse = await request.get('/scrawl-social-card.png');
  expect(socialCardResponse.ok()).toBe(true);
  expect(socialCardResponse.headers()['content-type']).toContain('image/png');

  await page.goto('/');
  await expect(page).toHaveTitle('Scrawl — Free Local-First Visual Canvas');
  await expect(page.getByRole('heading', { level: 1, name: 'Scrawl' })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://scrawl.design/',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://scrawl.design/scrawl-social-card.png',
  );
});
