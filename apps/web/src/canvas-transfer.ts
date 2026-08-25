export const SCRAWL_LIBRARY_TRANSFER_TYPE = 'application/x-scrawl-library-item';

export type CanvasLibraryTransfer = { kind: 'shape'; id: string } | { kind: 'icon'; id: string };

export function writeCanvasLibraryTransfer(
  transfer: DataTransfer,
  value: CanvasLibraryTransfer,
): void {
  transfer.effectAllowed = 'copy';
  transfer.setData(SCRAWL_LIBRARY_TRANSFER_TYPE, JSON.stringify(value));
}

export function readCanvasLibraryTransfer(transfer: DataTransfer): CanvasLibraryTransfer | null {
  try {
    const value = transfer.getData(SCRAWL_LIBRARY_TRANSFER_TYPE);
    if (!value || value.length > 512) return null;
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if ((record.kind !== 'shape' && record.kind !== 'icon') || typeof record.id !== 'string') {
      return null;
    }
    const id = record.id.trim();
    if (!id || id.length > 256) return null;
    return { kind: record.kind, id };
  } catch {
    return null;
  }
}
