import {
  createId,
  DocumentValidationError,
  MAX_DOCUMENT_ASSETS,
  MAX_DOCUMENT_EMBEDDED_IMAGE_BYTES,
  MAX_EMBEDDED_IMAGE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
  type ScrawlAsset,
  type ScrawlDocument,
} from '@scrawl/schema';

export interface PreparedImageFile {
  asset: ScrawlAsset;
  naturalWidth: number;
  naturalHeight: number;
  width: number;
  height: number;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('No image data'));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read the image'));
    reader.readAsDataURL(file);
  });
}

function readImageSize(source: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Unable to decode the image'));
    image.src = source;
  });
}

export function imageInsertionError(
  document: ScrawlDocument,
  files: readonly File[],
): string | null {
  if (files.length === 0) return 'No supported images were provided.';
  if (
    files.some(
      (file) => !SUPPORTED_IMAGE_MIME_TYPES.has(file.type) || file.size > MAX_EMBEDDED_IMAGE_BYTES,
    )
  ) {
    return 'Choose PNG, JPEG, WebP, or GIF images smaller than 10 MB each.';
  }
  if (Object.keys(document.assets).length + files.length > MAX_DOCUMENT_ASSETS) {
    return 'This document has reached its image limit.';
  }
  const retainedBytes = Object.values(document.assets).reduce(
    (total, asset) => total + asset.size,
    files.reduce((total, file) => total + file.size, 0),
  );
  if (retainedBytes > MAX_DOCUMENT_EMBEDDED_IMAGE_BYTES) {
    return 'Embedded images in this document cannot exceed 30 MB in total.';
  }
  return null;
}

export function imageInsertionFailureMessage(error: unknown): string {
  if (!(error instanceof DocumentValidationError)) return 'Scrawl could not read this image.';
  if (error.message.includes('too many assets'))
    return 'This document has reached its image limit.';
  if (error.message.includes('total size limit')) {
    return 'Embedded images in this document cannot exceed 30 MB in total.';
  }
  if (
    error.message.includes('image limit') ||
    error.message.includes('unsupported image') ||
    error.message.includes('image data')
  ) {
    return 'Choose PNG, JPEG, WebP, or GIF images smaller than 10 MB each.';
  }
  return 'Scrawl could not add this image.';
}

export async function prepareImageFile(file: File): Promise<PreparedImageFile> {
  const data = await readDataUrl(file);
  const natural = await readImageSize(data);
  const scale = Math.min(1, 420 / natural.width, 300 / natural.height);
  const width = Math.max(24, Math.round(natural.width * scale));
  const height = Math.max(24, Math.round(natural.height * scale));
  const assetId = createId();
  return {
    asset: {
      id: assetId,
      mimeType: file.type,
      size: file.size,
      name: file.name || 'Pasted image',
      data,
    },
    naturalWidth: natural.width,
    naturalHeight: natural.height,
    width,
    height,
  };
}
