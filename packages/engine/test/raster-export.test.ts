import { describe, expect, it } from 'vitest';
import { MAX_RASTER_EXPORT_DIMENSION, MAX_RASTER_EXPORT_PIXELS, safeRasterScale } from '../src';

describe('raster export limits', () => {
  it('preserves the requested scale for ordinary documents', () => {
    expect(safeRasterScale(1200, 800, 2)).toBe(2);
  });

  it('bounds both dimensions and pixel area for extreme documents', () => {
    const scale = safeRasterScale(100_000_000, 50_000_000, 2);
    const width = Math.floor(100_000_000 * scale);
    const height = Math.floor(50_000_000 * scale);

    expect(scale).toBeLessThan(0.001);
    expect(width).toBeLessThanOrEqual(MAX_RASTER_EXPORT_DIMENSION);
    expect(height).toBeLessThanOrEqual(MAX_RASTER_EXPORT_DIMENSION);
    expect(width * height).toBeLessThanOrEqual(MAX_RASTER_EXPORT_PIXELS);
  });
});
