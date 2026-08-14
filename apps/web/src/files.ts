export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadText(name: string, data: string, type: string): void {
  downloadBlob(name, new Blob([data], { type }));
}

export function safeFileName(title: string): string {
  return (
    title
      .trim()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  );
}
