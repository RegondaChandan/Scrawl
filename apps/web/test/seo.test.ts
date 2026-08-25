import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const readWebFile = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('search discovery files', () => {
  it('publishes indexable homepage metadata and structured data', () => {
    const homepage = readWebFile('../index.html');
    const structuredDataMatch = homepage.match(
      /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/,
    );

    expect(homepage).toContain('<meta name="robots" content="index, follow" />');
    expect(homepage).toContain('<link rel="canonical" href="https://scrawl.design/" />');
    expect(homepage).toContain('<meta property="og:url" content="https://scrawl.design/" />');
    expect(homepage).toContain(
      '<meta property="og:image" content="https://scrawl.design/scrawl-social-card.png" />',
    );
    expect(homepage).toContain('<meta name="twitter:card" content="summary_large_image" />');

    expect(structuredDataMatch).not.toBeNull();
    const structuredData = JSON.parse(structuredDataMatch?.[1] ?? '{}') as {
      '@context'?: string;
      '@graph'?: { '@type'?: string }[];
    };
    expect(structuredData['@context']).toBe('https://schema.org');
    expect(structuredData['@graph']?.map((entry) => entry['@type'])).toEqual([
      'Organization',
      'WebSite',
      'WebApplication',
    ]);
  });

  it('allows crawling and advertises the sitemap', () => {
    const robots = readWebFile('../public/robots.txt');

    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://scrawl.design/sitemap.xml');
    expect(robots).not.toContain('<!doctype html>');
  });

  it('lists the canonical homepage in a valid sitemap document', () => {
    const sitemap = readWebFile('../public/sitemap.xml');

    expect(sitemap).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap).toContain('<loc>https://scrawl.design/</loc>');
  });

  it('ships a landscape social sharing image at the declared dimensions', () => {
    const socialCard = readFileSync(new URL('../public/scrawl-social-card.png', import.meta.url));

    expect(socialCard.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(socialCard.readUInt32BE(16)).toBe(1200);
    expect(socialCard.readUInt32BE(20)).toBe(630);
  });
});
