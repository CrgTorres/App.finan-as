import {
  extractPdfTextLayerGrouped,
  extractPdfPagesCanvasOcr,
  extractRasterTextWithTesseract,
} from "@/lib/reading/contracheque-ficha-document-text";

export interface OcrProgress {
  status: string;
  progress: number; // 0–1
}

/**
 * Extrai texto de uma imagem usando Tesseract.js (mesma pipeline PDF/imagem que contracheque/ficha: MIME normalizado).
 */
export async function extractTextFromImage(
  file: File,
  onProgress: (p: OcrProgress) => void
): Promise<string> {
  return extractRasterTextWithTesseract(file, {
    onProgress: (x) => onProgress({ status: x.status, progress: x.progress }),
  });
}

/**
 * PDF escaneado: primeira página renderizada no canvas + OCR.
 */
export async function extractTextFromScannedPdf(
  pdfFile: File,
  onProgress: (p: OcrProgress) => void
): Promise<string> {
  return extractPdfPagesCanvasOcr(pdfFile, {
    maxPages: 1,
    onProgress: ({ page, total }) => {
      onProgress({
        status: `OCR página ${page}/${total}`,
        progress: page / Math.max(total, 1),
      });
    },
  });
}

/**
 * Extrai texto selecionável do PDF (pdf.js + agrupamento por Y).
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const { text } = await extractPdfTextLayerGrouped(file);
  return text;
}
