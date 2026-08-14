import { notifyAssetReady } from './ready';

export type AssetSourceResolver = (assetId: string) => string | null;

interface CachedImage {
  source: string;
  image: HTMLImageElement | null;
  loading: Promise<void> | null;
}

const imageCache = new Map<string, CachedImage>();

function loadImage(assetId: string, source: string): CachedImage {
  if (typeof Image === 'undefined') return { source, image: null, loading: null };

  const image = new Image();
  const entry: CachedImage = { source, image: null, loading: null };
  entry.loading = new Promise<void>((resolve) => {
    image.onload = () => {
      entry.image = image;
      entry.loading = null;
      notifyAssetReady();
      resolve();
    };
    image.onerror = () => {
      entry.loading = null;
      resolve();
    };
  });
  image.src = source;
  imageCache.set(assetId, entry);
  return entry;
}

export function getImageForAsset(
  assetId: string,
  resolveSource: AssetSourceResolver | undefined,
): HTMLImageElement | null {
  const source = resolveSource?.(assetId);
  if (!source) return null;

  const cached = imageCache.get(assetId);
  if (cached?.source === source) return cached.image;
  return loadImage(assetId, source).image;
}

export async function preloadImages(
  assetIds: string[],
  resolveSource: AssetSourceResolver,
): Promise<void> {
  const pending = assetIds.map((assetId) => {
    getImageForAsset(assetId, resolveSource);
    return imageCache.get(assetId)?.loading;
  });
  await Promise.all(pending);
}

export function clearImageCache(assetId?: string): void {
  if (assetId) imageCache.delete(assetId);
  else imageCache.clear();
}
