/**
 * Shared "async asset became drawable" repaint hook.
 *
 * The board registers a single repaint callback via `setIconReadyCallback`
 * (kept under its historical name in icons.ts); both the icon rasterizer and
 * the bitmap image cache notify through here, so late-decoding assets of any
 * kind trigger the same repaint without extra wiring in the app.
 */

let onReady: (() => void) | null = null;

export function setAssetReadyCallback(cb: (() => void) | null): void {
  onReady = cb;
}

export function notifyAssetReady(): void {
  onReady?.();
}
