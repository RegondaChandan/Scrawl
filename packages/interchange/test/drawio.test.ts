import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DrawioImportError, MAX_DRAWIO_TOTAL_CELLS, importDrawio } from '../src';

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('draw.io import', () => {
  it('imports common multi-page shapes, text, layers, and bound connectors', async () => {
    const fixture = await readFile(
      fileURLToPath(new URL('./fixtures/common.drawio', import.meta.url)),
      'utf8',
    );

    const result = importDrawio(fixture, { title: 'Common diagram' });
    const [flow, architecture] = result.document.pages;
    const start = flow?.elements.find((element) => element.label === 'Start');
    const decision = flow?.elements.find((element) => element.label === 'Ready?');
    const caption = flow?.elements.find((element) => element.type === 'text');
    const connector = flow?.elements.find((element) => element.type === 'arrow');

    expect(result.document.title).toBe('Common diagram');
    expect(result.document.pages.map((page) => page.name)).toEqual(['Flow', 'Architecture']);
    expect(flow?.layers).toMatchObject([{ name: 'Main', visible: true, locked: false }]);
    expect(start).toMatchObject({ type: 'shape', shapeKind: 'terminator' });
    expect(decision).toMatchObject({ type: 'diamond' });
    expect(caption).toMatchObject({
      text: 'Release\nChecklist',
      fontSize: 20,
      textAlign: 'left',
      strokeColor: '#8046b5',
    });
    expect(connector).toMatchObject({
      label: 'Yes',
      routing: 'elbow',
      strokeStyle: 'dashed',
      startBinding: { elementId: start?.id },
      endBinding: { elementId: decision?.id },
    });
    expect(connector && 'points' in connector ? connector.points.length : 0).toBeGreaterThan(2);
    expect(architecture?.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'shape', shapeKind: 'server', label: 'API' }),
        expect.objectContaining({ type: 'rectangle', label: 'Vendor shape' }),
      ]),
    );
    expect(result.report).toMatchObject({
      importedPages: 2,
      importedElements: 6,
      skippedElements: 0,
      approximatedElements: 1,
    });
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unsupported-shape' })]),
    );
  });

  it('decodes compressed diagram pages', () => {
    const model = `
      <mxGraphModel>
        <root>
          <mxCell id="0" />
          <mxCell id="1" parent="0" />
          <mxCell id="2" value="Compressed" style="ellipse;" vertex="1" parent="1">
            <mxGeometry x="10" y="20" width="100" height="80" as="geometry" />
          </mxCell>
        </root>
      </mxGraphModel>`;
    const compressed = base64(deflateSync(strToU8(encodeURIComponent(model))));
    const source = `<mxfile><diagram name="Compressed page">${compressed}</diagram></mxfile>`;

    const result = importDrawio(source);

    expect(result.document.pages[0]).toMatchObject({
      name: 'Compressed page',
      elements: [expect.objectContaining({ type: 'ellipse', label: 'Compressed' })],
    });
  });

  it('blocks external image loading and creates an editable placeholder', () => {
    const source = `
      <mxGraphModel>
        <root>
          <mxCell id="0" />
          <mxCell id="1" parent="0" />
          <mxCell id="image" value="Logo" style="shape=image;image=https://example.com/private.png;" vertex="1" parent="1">
            <mxGeometry x="0" y="0" width="160" height="90" as="geometry" />
          </mxCell>
        </root>
      </mxGraphModel>`;

    const result = importDrawio(source);

    expect(result.document.assets).toEqual({});
    expect(result.document.pages[0]?.elements[0]).toMatchObject({
      type: 'rectangle',
      label: 'Logo',
    });
    expect(result.report.issues).toMatchObject([{ code: 'external-image-blocked' }]);
  });

  it('rejects entity declarations and malformed documents', () => {
    expect(() =>
      importDrawio('<!DOCTYPE mxfile [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><mxfile />'),
    ).toThrow(DrawioImportError);
    expect(() => importDrawio('<mxfile><diagram></mxfile>')).toThrow(DrawioImportError);
    expect(() => importDrawio('<not-a-diagram />')).toThrow('not a supported draw.io document');
  });

  it('rejects decompression bombs before accepting oversized page output', () => {
    const oversized = `<mxGraphModel><root>${' '.repeat(5 * 1024 * 1024)}</root></mxGraphModel>`;
    const compressed = base64(deflateSync(strToU8(encodeURIComponent(oversized))));
    const source = `<mxfile><diagram name="Oversized">${compressed}</diagram></mxfile>`;

    expect(() => importDrawio(source)).toThrow('decompressed draw.io page exceeds');
  });

  it('rejects excessive XML nesting and clamps extreme object geometry', () => {
    const nested = `${'<node>'.repeat(129)}${'</node>'.repeat(129)}`;
    expect(() => importDrawio(nested)).toThrow('nested too deeply');

    const source = `
      <mxGraphModel>
        <root>
          <mxCell id="0" />
          <mxCell id="1" parent="0" />
          <mxCell id="large" value="Large" vertex="1" parent="1">
            <mxGeometry x="999999999" y="-999999999" width="999999999" height="999999999" as="geometry" />
          </mxCell>
        </root>
      </mxGraphModel>`;

    const result = importDrawio(source);
    expect(result.document.pages[0]?.elements[0]).toMatchObject({
      x: 1_000_000,
      y: -1_000_000,
      width: 100_000,
      height: 100_000,
    });
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'geometry-clamped' })]),
    );
  });

  it('rejects excessively deep parent chains', () => {
    const cells = Array.from(
      { length: 130 },
      (_, index) =>
        `<mxCell id="${index + 2}" parent="${index + 1}" vertex="1"><mxGeometry as="geometry" /></mxCell>`,
    ).join('');
    const source = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;

    expect(() => importDrawio(source)).toThrow('excessively deep parent chain');
  });

  it('rejects cell counts that only exceed the limit across multiple pages', () => {
    const cellsPerPage = 1_000;
    const cells = Array.from(
      { length: cellsPerPage },
      (_, index) =>
        `<mxCell id="${index + 2}" parent="1" vertex="1"><mxGeometry as="geometry" /></mxCell>`,
    ).join('');
    const model = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
    const compressed = base64(deflateSync(strToU8(encodeURIComponent(model))));
    const cellsWithRoots = cellsPerPage + 2;
    const pageCount = Math.floor(MAX_DRAWIO_TOTAL_CELLS / cellsWithRoots) + 1;
    const diagrams = Array.from(
      { length: pageCount },
      (_, index) => `<diagram name="Page ${index + 1}">${compressed}</diagram>`,
    ).join('');

    expect(() => importDrawio(`<mxfile>${diagrams}</mxfile>`)).toThrow('too many cells in total');
  });
});
