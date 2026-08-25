import { describe, expect, it } from 'vitest';
import { createElement } from '@scrawl/schema';
import { exportSVG } from '../src';

describe('SVG export', () => {
  it('escapes user text and emits a valid document root', () => {
    const text = createElement('text', {
      x: 20,
      y: 30,
      width: 180,
      height: 40,
      text: 'Load & <validate>',
      fontSize: 20,
    });

    const svg = exportSVG([text]);

    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('Load &amp; &lt;validate&gt;');
    expect(svg).not.toContain('Load & <validate>');
    expect(svg).toMatch(/<\/svg>$/);
  });

  it('resolves local image assets without storing a network URL on the element', () => {
    const image = createElement('image', {
      x: 0,
      y: 0,
      width: 64,
      height: 48,
      assetId: 'asset-1',
      naturalWidth: 640,
      naturalHeight: 480,
    });

    const svg = exportSVG([image], {
      resolveAsset: (assetId) => (assetId === 'asset-1' ? 'data:image/svg+xml,<svg>&</svg>' : null),
    });

    expect(svg).toContain('data:image/svg+xml,&lt;svg&gt;&amp;&lt;/svg&gt;');
    expect(svg).not.toContain('asset-1');
  });

  it('preserves element rotation in exported vectors', () => {
    const rectangle = createElement('rectangle', {
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      angle: Math.PI / 4,
    });

    expect(exportSVG([rectangle])).toContain('rotate(45.0000 40.00 20.00)');
  });

  it('can include the local dot grid in exported vectors', () => {
    expect(exportSVG([], { grid: true })).toContain('id="scrawl-grid"');
  });

  it('uses a custom canvas color for the background and connector label chips', () => {
    const line = createElement('line', {
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      label: 'Traffic',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });

    const svg = exportSVG([line], { canvasColor: '#fff9db' });
    expect(svg.match(/fill="#fff9db"/g)).toHaveLength(2);
  });

  it('keeps strokes readable when the canvas color and UI theme have opposite brightness', () => {
    const rectangle = createElement('rectangle', {
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      strokeColor: '#2b2a26',
    });

    expect(exportSVG([rectangle], { theme: 'dark', canvasColor: '#ffffff' })).toContain(
      'stroke="#2b2a26"',
    );
    expect(exportSVG([rectangle], { theme: 'light', canvasColor: '#141319' })).toContain(
      'stroke="#eceae2"',
    );
  });

  it('rejects unsafe color values at the SVG boundary', () => {
    const rectangle = createElement('rectangle', {
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      strokeColor: '#fff" onload="alert(1)',
      backgroundColor: 'url(https://example.com/tracker)',
    });

    const svg = exportSVG([rectangle]);

    expect(svg).not.toContain('onload');
    expect(svg).not.toContain('example.com');
    expect(svg).toContain('stroke="#2b2a26"');
    expect(svg).toContain('fill="none"');
    expect(exportSVG([], { canvasColor: 'url(https://example.com/tracker)' })).not.toContain(
      'example.com',
    );
  });
});
