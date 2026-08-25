import { describe, expect, it } from 'vitest';
import { createElement } from '@scrawl/schema';
import { getRoughDrawables } from '../src';

describe('sketch textures', () => {
  it('produces distinct stable drawables for pencil and marker presets', () => {
    const element = createElement('rectangle', {
      id: 'texture-sample',
      x: 0,
      y: 0,
      width: 140,
      height: 90,
      backgroundColor: '#fbd9ce',
      renderStyle: 'rough',
      seed: 42,
    });

    const pencil = JSON.stringify(getRoughDrawables(element, 'light', 'pencil'));
    expect(JSON.stringify(getRoughDrawables(element, 'light', 'pencil'))).toBe(pencil);

    const marker = JSON.stringify(getRoughDrawables(element, 'light', 'marker'));
    expect(marker).not.toBe(pencil);
    expect(JSON.stringify(getRoughDrawables(element, 'light', 'marker'))).toBe(marker);
  });
});
