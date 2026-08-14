import { describe, expect, it } from 'vitest';
import {
  DocumentValidationError,
  MAX_DOCUMENT_ASSETS,
  MAX_DOCUMENT_EMBEDDED_IMAGE_BYTES,
  MAX_DOCUMENT_PAGES,
  MAX_ELEMENTS_PER_PAGE,
  MAX_ELEMENT_TEXT_LENGTH,
  MAX_EMBEDDED_IMAGE_BYTES,
  MAX_POINTS_PER_ELEMENT,
  SCHEMA_VERSION,
  createDocument,
  createElement,
  parseDocument,
  serializeDocument,
} from '../src';

describe('Scrawl documents', () => {
  it('creates a valid document with one page and layer', () => {
    const document = createDocument('Architecture');
    expect(parseDocument(document)).toEqual(document);
    expect(document.version).toBe(SCHEMA_VERSION);
  });

  it('round-trips a document with elements', () => {
    const document = createDocument();
    document.pages[0]!.elements.push(
      createElement('rectangle', { x: 40, y: 80, width: 160, height: 90, order: 1 }),
    );
    expect(parseDocument(JSON.parse(serializeDocument(document)))).toEqual(document);
  });

  it('round-trips bundled font choices', () => {
    const document = createDocument();
    const fonts = ['space-grotesk', 'caveat', 'kalam', 'ibm-plex-mono'] as const;
    document.settings.defaults.fontFamily = 'space-grotesk';
    document.pages[0]!.elements.push(
      ...fonts.map((fontFamily, index) =>
        createElement('text', {
          x: 20,
          y: 20 + index * 40,
          text: fontFamily,
          fontFamily,
          order: index,
        }),
      ),
    );

    expect(parseDocument(JSON.parse(serializeDocument(document)))).toEqual(document);
  });

  it('migrates the previous multi-page format', () => {
    const element = createElement('ellipse', { x: 10, y: 20, width: 80, height: 60 });
    const legacyElement = Object.fromEntries(
      Object.entries(element).filter(([key]) => key !== 'layerId'),
    );
    const migrated = parseDocument({
      type: 'scrawl',
      version: 2,
      activePageId: 'page-1',
      pages: [{ id: 'page-1', name: 'Page 1', elements: [legacyElement] }],
      mode: 'rough',
    });
    expect(migrated.pages[0]!.elements[0]!.layerId).toBe('default');
    expect(migrated.settings.mode).toBe('rough');
  });

  it('rejects malformed elements', () => {
    const document = createDocument();
    document.pages[0]!.elements.push({ type: 'rectangle', x: 1, y: 2 } as never);
    expect(() => parseDocument(document)).toThrow(DocumentValidationError);
  });

  it('validates optional and type-specific element fields', () => {
    const invalidStyle = createDocument();
    invalidStyle.pages[0]!.elements.push({
      ...createElement('rectangle', { x: 0, y: 0 }),
      fillStyle: 'gradient',
    } as never);
    expect(() => parseDocument(invalidStyle)).toThrow('fillStyle is not supported');

    const invalidGroups = createDocument();
    invalidGroups.pages[0]!.elements.push({
      ...createElement('rectangle', { x: 0, y: 0 }),
      groupIds: 'group-1',
    } as never);
    expect(() => parseDocument(invalidGroups)).toThrow('groupIds must be an array');

    const invalidRouting = createDocument();
    invalidRouting.pages[0]!.elements.push({
      ...createElement('arrow', { x: 0, y: 0 }),
      routing: 'curved',
    } as never);
    expect(() => parseDocument(invalidRouting)).toThrow('routing is not supported');

    const invalidAlignment = createDocument();
    invalidAlignment.pages[0]!.elements.push({
      ...createElement('text', { x: 0, y: 0 }),
      textAlign: 'justify',
    } as never);
    expect(() => parseDocument(invalidAlignment)).toThrow('textAlign is not supported');
  });

  it('returns canonical elements without unknown input properties', () => {
    const document = createDocument();
    document.pages[0]!.elements.push({
      ...createElement('rectangle', {
        x: 0,
        y: 0,
        label: 'Service',
        groupIds: ['group-1'],
        locked: true,
      }),
      unrecognized: { retained: false },
    } as never);

    const parsed = parseDocument(document);
    expect(parsed.pages[0]!.elements[0]).toMatchObject({
      label: 'Service',
      groupIds: ['group-1'],
      locked: true,
    });
    expect(parsed.pages[0]!.elements[0]).not.toHaveProperty('unrecognized');
  });

  it('rejects missing binding and image asset references', () => {
    const connector = createDocument();
    connector.pages[0]!.elements.push(
      createElement('arrow', {
        x: 0,
        y: 0,
        startBinding: { elementId: 'missing-shape' },
      }),
    );
    expect(() => parseDocument(connector)).toThrow('missing binding target');

    const image = createDocument();
    image.pages[0]!.elements.push(
      createElement('image', {
        x: 0,
        y: 0,
        assetId: 'missing-asset',
        naturalWidth: 100,
        naturalHeight: 80,
      }),
    );
    expect(() => parseDocument(image)).toThrow('missing asset');
  });

  it('rejects documents that exceed structural and text budgets', () => {
    const pages = createDocument();
    pages.pages = Array.from({ length: MAX_DOCUMENT_PAGES + 1 }, () => pages.pages[0]!);
    expect(() => parseDocument(pages)).toThrow('more than 100 pages');

    const elements = createDocument();
    const rectangle = createElement('rectangle', { x: 0, y: 0 });
    elements.pages[0]!.elements = Array.from(
      { length: MAX_ELEMENTS_PER_PAGE + 1 },
      () => rectangle,
    );
    expect(() => parseDocument(elements)).toThrow('too many elements');

    const points = createDocument();
    points.pages[0]!.elements.push(
      createElement('freedraw', {
        x: 0,
        y: 0,
        points: Array.from({ length: MAX_POINTS_PER_ELEMENT + 1 }, () => ({ x: 0, y: 0 })),
      }),
    );
    expect(() => parseDocument(points)).toThrow('too many points');

    const text = createDocument();
    text.pages[0]!.elements.push(
      createElement('text', {
        x: 0,
        y: 0,
        text: 'a'.repeat(MAX_ELEMENT_TEXT_LENGTH + 1),
      }),
    );
    expect(() => parseDocument(text)).toThrow('text is too long');
  });

  it('rejects excessive asset counts and aggregate embedded image size', () => {
    const tooMany = createDocument();
    tooMany.assets = Object.fromEntries(
      Array.from({ length: MAX_DOCUMENT_ASSETS + 1 }, (_, index) => {
        const id = `asset-${index}`;
        return [id, { id, mimeType: 'image/png', size: 0 }];
      }),
    );
    expect(() => parseDocument(tooMany)).toThrow('too many assets');

    const tooLarge = createDocument();
    const assetCount = Math.floor(MAX_DOCUMENT_EMBEDDED_IMAGE_BYTES / MAX_EMBEDDED_IMAGE_BYTES) + 1;
    tooLarge.assets = Object.fromEntries(
      Array.from({ length: assetCount }, (_, index) => {
        const id = `asset-${index}`;
        return [id, { id, mimeType: 'image/png', size: MAX_EMBEDDED_IMAGE_BYTES }];
      }),
    );
    expect(() => parseDocument(tooLarge)).toThrow('total size limit');
  });

  it('moves legacy image data out of the element and into the asset map', () => {
    const image = createElement('image', {
      id: 'image-1',
      x: 10,
      y: 20,
      width: 80,
      height: 60,
      naturalWidth: 800,
      naturalHeight: 600,
    });
    const legacyImage = Object.fromEntries(
      Object.entries(image).filter(([key]) => key !== 'assetId' && key !== 'layerId'),
    );
    const migrated = parseDocument({
      type: 'scrawl',
      version: 2,
      pages: [
        {
          id: 'page-1',
          name: 'Page 1',
          elements: [{ ...legacyImage, src: 'data:image/png;base64,c2NyYXds' }],
        },
      ],
      activePageId: 'page-1',
    });
    const migratedImage = migrated.pages[0]!.elements[0];

    expect(migratedImage?.type).toBe('image');
    if (migratedImage?.type === 'image') {
      expect(migratedImage.assetId).toBe('legacy-image-1');
      expect('src' in migratedImage).toBe(false);
    }
    expect(migrated.assets['legacy-image-1']?.data).toBe('data:image/png;base64,c2NyYXds');
  });

  it('rejects remote and unsupported embedded image sources', () => {
    const remote = createDocument();
    remote.assets['asset-1'] = {
      id: 'asset-1',
      mimeType: 'image/png',
      size: 100,
      data: 'https://example.com/tracking.png',
    };
    expect(() => parseDocument(remote)).toThrow('must contain embedded image data');

    const svg = createDocument();
    svg.assets['asset-1'] = {
      id: 'asset-1',
      mimeType: 'image/svg+xml',
      size: 100,
      data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    };
    expect(() => parseDocument(svg)).toThrow('unsupported image type');
  });

  it('validates embedded image data instead of trusting asset metadata', () => {
    const malformed = createDocument();
    malformed.assets['asset-1'] = {
      id: 'asset-1',
      mimeType: 'image/png',
      size: 1,
      data: 'data:image/png;base64,not-valid!',
    };
    expect(() => parseDocument(malformed)).toThrow('invalid base64 image data');

    const oversized = createDocument();
    const encodedLength = Math.ceil((MAX_EMBEDDED_IMAGE_BYTES + 1) / 3) * 4;
    oversized.assets['asset-1'] = {
      id: 'asset-1',
      mimeType: 'image/png',
      size: 1,
      data: `data:image/png;base64,${'A'.repeat(encodedLength)}`,
    };
    expect(() => parseDocument(oversized)).toThrow('exceeds the embedded image limit');
  });
});
