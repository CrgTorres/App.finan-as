/**
 * OCR + extração textual para documentos de crédito; reutiliza a pilha pdf.js + tesseract do projeto.
 */

import type { ContrachequeFichaReadProgress } from "@/lib/reading/contracheque-ficha-document-text";
import { readContrachequeFichaDocumentText } from "@/lib/reading/contracheque-ficha-document-text";

export type { ContrachequeFichaReadProgress };

export async function extrairTextoDocumentoFinanceiro(
  file: File,
  options?: {
    onProgress?: (p: ContrachequeFichaReadProgress) => void;
    forceDeepOcr?: boolean;
    pdfPasswordCandidates?: string[];
  },
): Promise<string> {
  return readContrachequeFichaDocumentText(file, {
    onProgress: options?.onProgress,
    forceDeepOcr: options?.forceDeepOcr,
    pdfPasswordCandidates: options?.pdfPasswordCandidates,
  });
}
