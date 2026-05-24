/**
 * Leitura unificada de **contracheque**, **ficha financeira** e documentos similares (SEAD).
 *
 * Suporta: PDF com texto selecionável, PDF escaneado (OCR por página no canvas),
 * PNG/JPG/WebP/GIF/BMP/TIFF e variações com MIME vazio (drag no Windows).
 */

import { colapsarContinuacaoFichaPmTexto, contarMarcadoresContinuacaoFichaPm } from "@/lib/anexos/sead-ficha-parse";

const PDFJS_WORKER_SRC = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/** Worker do PDF.js deve ser servido pelo próprio Next para evitar bloqueio/falha de CDN no navegador. */
export function setPdfJsWorkerFromPackage(pdfjsLib: typeof import("pdfjs-dist")) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
}

/** PDF criptografado: senha ausente ou incorreta (mensagens amigáveis para a UI). */
export class PdfPasswordError extends Error {
  readonly kind: "required" | "incorrect";

  constructor(kind: "required" | "incorrect", message: string) {
    super(message);
    this.name = "PdfPasswordError";
    this.kind = kind;
  }
}

function isPasswordException(e: unknown): e is { name: string; message: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { name?: string }).name === "PasswordException"
  );
}

async function loadPdfDocument(
  pdfjsLib: typeof import("pdfjs-dist"),
  buffer: ArrayBuffer,
  password?: string
) {
  const loadingTask = pdfjsLib.getDocument(
    password !== undefined
      ? { data: buffer, password }
      : { data: buffer }
  );
  try {
    return await loadingTask.promise;
  } catch (e: unknown) {
    if (isPasswordException(e)) {
      if (e.message === "No password given") {
        throw new PdfPasswordError(
          "required",
          "Este PDF está protegido por senha. Informe a senha para continuar."
        );
      }
      if (e.message === "Incorrect Password") {
        throw new PdfPasswordError(
          "incorrect",
          "Senha incorreta. Verifique e tente novamente."
        );
      }
      throw new PdfPasswordError(
        "required",
        "Não foi possível abrir o PDF. Se estiver protegido por senha, informe-a abaixo."
      );
    }
    throw e;
  }
}

/** Limite de páginas para OCR por canvas no navegador (memória / tempo). Camada de texto não tem este teto. */
export const MAX_SCANNED_PDF_OCR_PAGES = 48;

/** PDF longo com camada de texto SEAD utilizável — evita OCR de 75+ páginas no browser. */
function textLayerSufficientForLargePdf(text: string, numPages: number): boolean {
  if (numPages <= MAX_SCANNED_PDF_OCR_PAGES) return false;
  const trimmed = text.trim();
  if (trimmed.length < numPages * 60) return false;
  if (!needsPdfCanvasOcrFallback(trimmed)) return true;
  return scoreContrachequeFichaLikeness(trimmed) >= 42;
}

const PDF_OCR_SCALE = 2.5;

/** Indícios de contracheque / ficha financeira no texto (camada PDF útil vs. lixo). */
const SEAD_CONTRACHEQUE_FICHA_HINT =
  /CONTRACHEQUE|FICHA\s+FINANCEIRA|TOTAL\s+DE\s+GANHOS|TOTAL\s+DE\s*DESCONTOS|SECRETARIA\s+DE\s+ESTADO\s+DA\s+ADMINISTRA|\bSEAD\b|SOLDO|IMPOSTO\s+DE\s+RENDA/i;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
};

export type ContrachequeFichaReadProgress =
  | { kind: "pdf_text_layer"; phase: "start" | "done" }
  | { kind: "pdf_text_layer_page"; page: number; totalPages: number }
  | { kind: "pdf_segmentar"; phase: "start" | "done" }
  | { kind: "pdf_ocr"; page: number; totalPages: number }
  | { kind: "image_ocr"; status: string; progress: number }
  | { kind: "image_ocr_deep"; pass: number; totalPasses: number; status: string; progress: number };

export type PdfTextLayerExtractResult = {
  text: string;
  numPages: number;
};

function extensionMime(name: string): string | undefined {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] : undefined;
}

/** Garante MIME de imagem reconhecível pelo Tesseract (drag/captura com `application/octet-stream`). */
export async function normalizeRasterFileForOcr(file: File): Promise<File> {
  const fromName = extensionMime(file.name);
  const effective =
    file.type?.startsWith("image/") && file.type !== "application/octet-stream"
      ? file.type
      : fromName;

  if (!effective?.startsWith("image/")) {
    throw new Error(
      "Formato não suportado para OCR de imagem. Use PNG, JPG, WebP, GIF, BMP, TIFF ou PDF."
    );
  }

  if (file.type === effective) return file;

  const buf = await file.arrayBuffer();
  return new File([buf], file.name || "documento", { type: effective });
}

function scoreContrachequeFichaLikeness(text: string): number {
  const s = text.replace(/\s+/g, " ").trim();
  if (!s) return 0;
  let score = 0;
  if (SEAD_CONTRACHEQUE_FICHA_HINT.test(text)) score += 45;
  const money = (text.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) ?? []).length;
  score += Math.min(money * 4, 70);
  const dates = (text.match(/\b(?:DATA\s+)?[01]?\d\s*[/\-.]\s*20\d{2}\b/gi) ?? []).length;
  score += dates * 12;
  score += Math.min(s.length / 100, 35);
  return score;
}

/**
 * Camada de texto inútil ou suspeita → usar OCR (PDF escaneado ou texto quebrado por glyph).
 */
export function needsPdfCanvasOcrFallback(textLayer: string): boolean {
  const s = textLayer.trim();
  if (!s) return true;
  if (s.length < 220) return true;

  const alnum = (s.match(/[a-zà-ÿ0-9]/gi) ?? []).length;
  if (alnum / s.length < 0.28) return true;

  const lines = s.split("\n").filter((l) => l.trim().length > 2);
  if (lines.length < 10 && s.length > 500) return true;

  const hinted = SEAD_CONTRACHEQUE_FICHA_HINT.test(s);
  const money = (s.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) ?? []).length;
  if (!hinted && s.length < 1400) return true;
  if (hinted && money < 4 && s.length < 700) return true;

  return false;
}

function pickBetterSeadDocumentText(a: string, b: string): string {
  const sa = scoreContrachequeFichaLikeness(a);
  const sb = scoreContrachequeFichaLikeness(b);
  if (sb > sa) return b;
  if (sa > sb) return a;
  return b.trim().length >= a.trim().length ? b : a;
}

/**
 * OCR falhou em capturar o bloco típico de contracheque (poucos valores, sem totais de desconto).
 * Comum em: PNG baixa resolução, screenshot UI escuro, ou tabela com colunas finas.
 */
function ocrSeadTextLooksIncomplete(text: string): boolean {
  const s = text.replace(/\s+/g, " ");
  const money = (s.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) ?? []).length;
  const hasTotDisc = /total\s+de\s*descontos/i.test(s);
  const hasTotGanhos = /total\s+de\s*ganhos/i.test(s);
  if (hasTotDisc && money >= 6) return false;
  if (s.length > 2_800 && money >= 14) return false;
  if (money <= 4 && !hasTotDisc) return true;
  if (!hasTotDisc && !hasTotGanhos && money <= 10 && s.length < 2_000) return true;
  if (money <= 2) return true;
  return false;
}

function loadImageForOcr(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem para OCR."));
    img.src = src;
  });
}

/**
 * Aumenta resolução se necessário, converte para tons de cinzento, inverte fundos escuros
 * (screenshots do app) e estica contraste — melhora muito o Tesseract em PNG «só SOLDO».
 */
async function preprocessRasterForSeadOcr(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageForOcr(url);
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error("Imagem sem dimensões válidas.");

    let scale = 1;
    if (w0 < 1_350) scale = Math.min(2.75, 1_350 / w0);
    const cw = Math.round(w0 * scale);
    const ch = Math.round(h0 * scale);

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cw, ch);

    const id = ctx.getImageData(0, 0, cw, ch);
    const d = id.data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = y;
      sum += y;
    }
    const mean = sum / (d.length / 4);
    if (mean < 110) {
      for (let i = 0; i < d.length; i += 4) {
        const v = 255 - d[i];
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }

    let mn = 255;
    let mx = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (mx > mn + 12) {
      const r = 255 / (mx - mn);
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.round((d[i] - mn) * r);
        const t = v < 0 ? 0 : v > 255 ? 255 : v;
        d[i] = d[i + 1] = d[i + 2] = t;
      }
    }

    ctx.putImageData(id, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Extrai texto do PDF com agrupamento por coordenada Y (linhas estáveis para tabelas SEAD).
 */
export async function extractPdfTextLayerGrouped(
  file: File,
  options?: {
    password?: string;
    onProgress?: (page: number, totalPages: number) => void;
  },
): Promise<PdfTextLayerExtractResult> {
  const pdfjsLib = await import("pdfjs-dist");
  setPdfJsWorkerFromPackage(pdfjsLib);
  const buffer = await file.arrayBuffer();
  const pdf = await loadPdfDocument(pdfjsLib, buffer, options?.password);
  const numPages = pdf.numPages;
  let text = "";
  try {
    for (let i = 1; i <= numPages; i++) {
      options?.onProgress?.(i, numPages);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items as Array<{
        str?: string;
        hasEOL?: boolean;
        transform?: number[];
      }>;

      const lineMap = new Map<number, string[]>();
      for (const item of items) {
        if (!item.str) continue;
        const y = item.transform ? Math.round(item.transform[5] / 2) * 2 : 0;
        if (!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y)!.push(item.str);
      }
      const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
      for (const y of sortedYs) {
        text += lineMap.get(y)!.join(" ").trim() + "\n";
      }
      text += "\n";
      if (i % 2 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    return { text, numPages };
  } finally {
    await pdf.destroy();
  }
}

/**
 * PDF só com imagens (ou fluxo forçado): renderiza páginas no canvas e OCR com Tesseract.
 */
export async function extractPdfPagesCanvasOcr(
  file: File,
  options?: {
    maxPages?: number;
    scale?: number;
    password?: string;
    onProgress?: (p: { page: number; total: number }) => void;
  }
): Promise<string> {
  const maxPages = options?.maxPages ?? MAX_SCANNED_PDF_OCR_PAGES;
  const scale = options?.scale ?? PDF_OCR_SCALE;

  const pdfjsLib = await import("pdfjs-dist");
  setPdfJsWorkerFromPackage(pdfjsLib);
  const buffer = await file.arrayBuffer();
  const pdf = await loadPdfDocument(pdfjsLib, buffer, options?.password);

  const totalDocPages = pdf.numPages;
  const pagesToProcess = Math.min(totalDocPages, maxPages);

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por+eng");
  let text = "";
  try {
    for (let i = 1; i <= pagesToProcess; i++) {
      options?.onProgress?.({ page: i, total: pagesToProcess });
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/png");
      const { data } = await worker.recognize(dataUrl);
      text += `${data.text}\n\n`;
    }
  } finally {
    await worker.terminate();
    await pdf.destroy();
  }
  return text;
}

/**
 * OCR «profundo» em imagem: varre vários modos de segmentação no original + pré-processado
 * e escolhe o texto com melhor pontuação SEAD (para releitura forçada pelo utilizador).
 */
async function extractRasterTextDeepOcr(
  file: File,
  options?: {
    onProgress?: (p: { status: string; progress: number }) => void;
    onDeepPass?: (pass: number, total: number) => void;
  }
): Promise<string> {
  const normalized = await normalizeRasterFileForOcr(file);
  const blobUrl = URL.createObjectURL(normalized);
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("por+eng", undefined, {
    logger: (m: { status: string; progress: number }) => {
      options?.onProgress?.({
        status: m.status,
        progress: typeof m.progress === "number" ? m.progress : 0,
      });
    },
  });

  let preprocessed: string | null = null;
  try {
    preprocessed = await preprocessRasterForSeadOcr(normalized);
  } catch {
    preprocessed = null;
  }

  const candidates: string[] = [];
  const psmModes = [PSM.AUTO, PSM.SINGLE_BLOCK, PSM.SINGLE_COLUMN, PSM.SPARSE_TEXT] as const;
  const totalPasses = psmModes.length * (preprocessed ? 2 : 1);
  let passDone = 0;
  const bump = () => {
    passDone++;
    options?.onDeepPass?.(passDone, totalPasses);
  };

  try {
    for (const psm of psmModes) {
      await worker.setParameters({
        user_defined_dpi: "300",
        tessedit_pageseg_mode: psm,
      });
      const { data } = await worker.recognize(blobUrl);
      candidates.push(data.text);
      bump();
      if (preprocessed) {
        const { data: d2 } = await worker.recognize(preprocessed);
        candidates.push(d2.text);
        bump();
      }
    }
  } finally {
    await worker.terminate();
    URL.revokeObjectURL(blobUrl);
  }

  let best = candidates[0] ?? "";
  let bestScore = -1;
  for (const c of candidates) {
    const sc = scoreContrachequeFichaLikeness(c);
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  return best;
}

/**
 * OCR em imagens (print, foto, screenshot). Usa várias passagens quando o 1.º resultado
 * não tem o «formato mínimo» de contracheque SEAD (muitos PNG no lote só devolvem SOLDO).
 */
export async function extractRasterTextWithTesseract(
  file: File,
  options?: {
    onProgress?: (p: { status: string; progress: number }) => void;
    /** Releitura manual: ignora atalhos e aplica vários modos PSM + pré-processamento. */
    forceDeepOcr?: boolean;
    onDeepPass?: (pass: number, total: number) => void;
  }
): Promise<string> {
  if (options?.forceDeepOcr) {
    return extractRasterTextDeepOcr(file, options);
  }

  const normalized = await normalizeRasterFileForOcr(file);
  const blobUrl = URL.createObjectURL(normalized);
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("por+eng", undefined, {
    logger: (m: { status: string; progress: number }) => {
      options?.onProgress?.({
        status: m.status,
        progress: typeof m.progress === "number" ? m.progress : 0,
      });
    },
  });

  try {
    await worker.setParameters({
      user_defined_dpi: "300",
      tessedit_pageseg_mode: PSM.AUTO,
    });
    const { data: d1 } = await worker.recognize(blobUrl);
    let text = d1.text;
    URL.revokeObjectURL(blobUrl);

    if (!ocrSeadTextLooksIncomplete(text)) {
      return text;
    }

    let preprocessed: string;
    try {
      preprocessed = await preprocessRasterForSeadOcr(normalized);
    } catch {
      return text;
    }

    await worker.setParameters({
      user_defined_dpi: "300",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    const { data: d2 } = await worker.recognize(preprocessed);
    text = pickBetterSeadDocumentText(text, d2.text);

    if (!ocrSeadTextLooksIncomplete(text)) {
      return text;
    }

    await worker.setParameters({
      user_defined_dpi: "300",
      tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
    });
    const { data: d3 } = await worker.recognize(preprocessed);
    text = pickBetterSeadDocumentText(text, d3.text);

    if (!ocrSeadTextLooksIncomplete(text)) {
      return text;
    }

    await worker.setParameters({
      user_defined_dpi: "300",
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });
    const { data: d4 } = await worker.recognize(preprocessed);
    return pickBetterSeadDocumentText(text, d4.text);
  } finally {
    await worker.terminate();
  }
}

function isPdfFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return file.type === "application/pdf" || n.endsWith(".pdf");
}

const RASTER_EXT = /\.(jpe?g|jfif|png|webp|gif|bmp|tiff?|heic|heif)$/i;

function isRasterImageFile(file: File): boolean {
  if (file.type.startsWith("image/") && file.type !== "application/octet-stream") return true;
  return RASTER_EXT.test(file.name);
}

function isOctetStreamButRasterName(file: File): boolean {
  return (!file.type || file.type === "application/octet-stream") && RASTER_EXT.test(file.name);
}

function isTxtFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".txt") || file.type === "text/plain";
}

export type ContrachequeReadMetadata = {
  /** Marcadores `- MES/ANO(CONTINUA…)` no texto bruto (antes da união). */
  continuacoesMarcadorPdf: number;
};

/** Ficha PM: unifica bloco que continua na página seguinte (`- MES/ANO(CONTINUA…)`). */
async function finalizarTextoComContinuacao(
  text: string,
  options?: {
    onReadMetadata?: (m: ContrachequeReadMetadata) => void;
    onProgress?: (p: ContrachequeFichaReadProgress) => void;
  },
): Promise<string> {
  options?.onProgress?.({ kind: "pdf_segmentar", phase: "start" });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const continuacoesMarcadorPdf = contarMarcadoresContinuacaoFichaPm(text);
  options?.onReadMetadata?.({ continuacoesMarcadorPdf });
  let out = text;
  if (/\(\s*CONTINUA/i.test(text)) {
    out = colapsarContinuacaoFichaPmTexto(text).text;
  }
  options?.onProgress?.({ kind: "pdf_segmentar", phase: "done" });
  return out;
}

/**
 * PDF (texto e/ou OCR), imagens ou TXT — contracheque mensal, ficha financeira retroativa, etc.
 */
export async function readContrachequeFichaDocumentText(
  file: File,
  options?: {
    onProgress?: (p: ContrachequeFichaReadProgress) => void;
    /**
     * Releitura explícita: imagens usam OCR profundo; PDF combina camada de texto + OCR em resolução maior.
     */
    forceDeepOcr?: boolean;
    /** Chamado com contagem de `(CONTINUA…)` no texto bruto, antes da união automática. */
    onReadMetadata?: (m: ContrachequeReadMetadata) => void;
    /**
     * Senhas a experimentar em PDF protegido (ordem: sem senha, depois cada candidata).
     * Ex.: variáveis em `.env.local`, localStorage da importação, primeiros dígitos do CPF (Daycoval).
     */
    pdfPasswordCandidates?: string[];
    /** PDF longo: releitura usou só camada de texto (OCR omitido no browser). */
    onLargePdfUsesTextLayerOnly?: (info: {
      numPages: number;
      limit: number;
      forceDeepOcr: boolean;
    }) => void;
  }
): Promise<string> {
  if (isTxtFile(file)) {
    return finalizarTextoComContinuacao(await file.text(), {
      onReadMetadata: options?.onReadMetadata,
      onProgress: options?.onProgress,
    });
  }

  if (isPdfFile(file)) {
    const deep = options?.forceDeepOcr === true;
    const extras = (options?.pdfPasswordCandidates ?? []).map((s) => s.trim()).filter(Boolean);
    const tryPasswords: (string | undefined)[] = [undefined, ...extras];
    let lastPdfPwd: PdfPasswordError | undefined;

    for (const pw of tryPasswords) {
      try {
        options?.onProgress?.({ kind: "pdf_text_layer", phase: "start" });
        const layerRes = await extractPdfTextLayerGrouped(file, {
          ...(pw !== undefined ? { password: pw } : {}),
          onProgress: (page, totalPages) =>
            options?.onProgress?.({ kind: "pdf_text_layer_page", page, totalPages }),
        });
        const tLayer = layerRes.text;
        const numPages = layerRes.numPages;
        options?.onProgress?.({ kind: "pdf_text_layer", phase: "done" });

        const wantOcr = deep || needsPdfCanvasOcrFallback(tLayer);
        if (!wantOcr) {
          return finalizarTextoComContinuacao(tLayer, {
            onReadMetadata: options?.onReadMetadata,
            onProgress: options?.onProgress,
          });
        }

        if (textLayerSufficientForLargePdf(tLayer, numPages)) {
          options?.onLargePdfUsesTextLayerOnly?.({
            numPages,
            limit: MAX_SCANNED_PDF_OCR_PAGES,
            forceDeepOcr: deep,
          });
          return finalizarTextoComContinuacao(tLayer, {
            onReadMetadata: options?.onReadMetadata,
            onProgress: options?.onProgress,
          });
        }

        if (numPages > MAX_SCANNED_PDF_OCR_PAGES && !tLayer.trim()) {
          throw new Error(
            `PDF com ${numPages} páginas sem camada de texto legível. OCR no navegador limita-se a ${MAX_SCANNED_PDF_OCR_PAGES} páginas — divida o arquivo ou exporte trechos.`,
          );
        }

        const tOcr = await extractPdfPagesCanvasOcr(file, {
          password: pw,
          scale: deep ? Math.max(PDF_OCR_SCALE, 3) : PDF_OCR_SCALE,
          maxPages: numPages > MAX_SCANNED_PDF_OCR_PAGES ? MAX_SCANNED_PDF_OCR_PAGES : undefined,
          onProgress: ({ page, total }) =>
            options?.onProgress?.({ kind: "pdf_ocr", page, totalPages: total }),
        });

        if (numPages > MAX_SCANNED_PDF_OCR_PAGES && tLayer.trim()) {
          options?.onLargePdfUsesTextLayerOnly?.({
            numPages,
            limit: MAX_SCANNED_PDF_OCR_PAGES,
            forceDeepOcr: deep,
          });
        }

        if (!tLayer.trim()) {
          return finalizarTextoComContinuacao(tOcr, {
            onReadMetadata: options?.onReadMetadata,
            onProgress: options?.onProgress,
          });
        }
        return finalizarTextoComContinuacao(pickBetterSeadDocumentText(tLayer, tOcr), {
          onReadMetadata: options?.onReadMetadata,
          onProgress: options?.onProgress,
        });
      } catch (e) {
        if (e instanceof PdfPasswordError) {
          lastPdfPwd = e;
          continue;
        }
        throw e;
      }
    }

    throw (
      lastPdfPwd ??
      new PdfPasswordError("required", "PDF protegido: nenhuma senha candidata funcionou.")
    );
  }

  if (isRasterImageFile(file) || isOctetStreamButRasterName(file)) {
    const rasterText = await extractRasterTextWithTesseract(file, {
      forceDeepOcr: options?.forceDeepOcr,
      onProgress: (x) =>
        options?.onProgress?.({
          kind: "image_ocr",
          status: x.status,
          progress: x.progress,
        }),
      onDeepPass: (pass, total) =>
        options?.onProgress?.({
          kind: "image_ocr_deep",
          pass,
          totalPasses: total,
          status: "OCR reforçado",
          progress: total > 0 ? pass / total : 0,
        }),
    });
    return finalizarTextoComContinuacao(rasterText, {
      onReadMetadata: options?.onReadMetadata,
      onProgress: options?.onProgress,
    });
  }

  return finalizarTextoComContinuacao(await file.text(), {
    onReadMetadata: options?.onReadMetadata,
    onProgress: options?.onProgress,
  });
}
