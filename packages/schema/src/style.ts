export type StyleMode = 'crisp' | 'rough';
export type Theme = 'light' | 'dark';
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type TextAlign = 'left' | 'center' | 'right';
export const FONT_KEYS = [
  'hand',
  'marker',
  'clean',
  'mono',
  'space-grotesk',
  'caveat',
  'kalam',
  'ibm-plex-mono',
] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export interface ElementDefaults {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  fontSize: number;
  fontFamily?: FontKey;
}

export const CRISP_FONT = `'Avenir Next', 'Gill Sans', 'Trebuchet MS', sans-serif`;
export const ROUGH_FONT = `'Bradley Hand', 'Segoe Print', cursive`;
export const LINE_HEIGHT = 1.35;
export const LABEL_FONT_SIZE = 16;

export const FONT_STACKS: Record<FontKey, string> = {
  hand: ROUGH_FONT,
  marker: `'Chalkboard SE', 'Bradley Hand', cursive`,
  clean: CRISP_FONT,
  mono: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`,
  'space-grotesk': `'Space Grotesk', 'Avenir Next', 'Gill Sans', sans-serif`,
  caveat: `'Caveat', 'Bradley Hand', 'Segoe Print', cursive`,
  kalam: `'Kalam', 'Chalkboard SE', 'Bradley Hand', cursive`,
  'ibm-plex-mono': `'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace`,
};

const FONT_KEY_SET: ReadonlySet<string> = new Set(FONT_KEYS);

export function isFontKey(value: unknown): value is FontKey {
  return typeof value === 'string' && FONT_KEY_SET.has(value);
}

export const DEFAULT_ELEMENT_DEFAULTS: ElementDefaults = {
  strokeColor: '#2b2a26',
  backgroundColor: 'transparent',
  fillStyle: 'hachure',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1.2,
  opacity: 1,
  fontSize: 24,
};

export const STROKE_COLORS = ['#2b2a26', '#e8663d', '#0e9a93', '#8046b5', '#c8890a', '#2f9463'];

export const BACKGROUND_COLORS = [
  'transparent',
  '#fbd9ce',
  '#c7ede9',
  '#e6d6f5',
  '#f6e7be',
  '#cde9d7',
];

export const STICKY_COLORS = ['#fbe6a2', '#cde9d7', '#c7ede9', '#fbd9ce', '#e6d6f5'];

const DARK_COLORS: Record<string, string> = {
  '#2b2a26': '#eceae2',
  '#e8663d': '#ff8a66',
  '#0e9a93': '#3fd0c6',
  '#8046b5': '#c58cf0',
  '#c8890a': '#e6b24a',
  '#2f9463': '#5fca8f',
  '#fbd9ce': '#4a2a20',
  '#c7ede9': '#183f3b',
  '#e6d6f5': '#3a2748',
  '#f6e7be': '#453a17',
  '#cde9d7': '#1c3f2b',
};

export const CANVAS_COLORS: Record<Theme, string> = {
  light: '#f6f4ee',
  dark: '#141319',
};

export const GRID_COLORS: Record<Theme, string> = {
  light: '#d4cfc1',
  dark: '#28262f',
};

export function fontFor(mode: StyleMode): string {
  return mode === 'crisp' ? CRISP_FONT : ROUGH_FONT;
}

export function resolveFont(fontFamily: FontKey | undefined, mode: StyleMode): string {
  return fontFamily ? FONT_STACKS[fontFamily] : fontFor(mode);
}

export function themedColor(color: string, theme: Theme): string {
  return theme === 'dark' ? (DARK_COLORS[color] ?? color) : color;
}
