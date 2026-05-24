/** Dispara download de texto/binário no browser. */
export function downloadBlob(content: BlobPart, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(
  text: string,
  filename: string,
  mimeType = "text/plain;charset=utf-8;",
  bom = false,
): void {
  const body = bom ? `\uFEFF${text}` : text;
  downloadBlob(body, filename, mimeType);
}
