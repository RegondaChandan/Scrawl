import { describe, expect, it } from 'vitest';
import { canvasThemeForColor } from '../src';

describe('canvas color theme', () => {
  it('derives drawing contrast from the canvas instead of the interface theme', () => {
    expect(canvasThemeForColor('#ffffff', 'dark')).toBe('light');
    expect(canvasThemeForColor('#141319', 'light')).toBe('dark');
    expect(canvasThemeForColor('invalid', 'dark')).toBe('dark');
  });
});
