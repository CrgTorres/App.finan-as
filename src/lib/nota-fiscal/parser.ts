import { categorize } from "@/lib/import/categorizer";
import type { Category } from "@/types";

export interface InvoiceData {
  description: string;   // razão social / nome do estabelecimento
  amount: number;        // valor total
  date: string;          // YYYY-MM-DD
  category: Category;
  cnpj: string;
  /** Chave NF-e (XML) — salva em source_ref para auditoria. */
  chaveNFe?: string;
  rawText: string;       // texto bruto para debug/revisão
}

// ── helpers ─────────────────────────────────────────────────────────

function parseAmount(s: string): number {
  const clean = s.replace(/[R$\s]/g, "");
  if (clean.includes(",") && clean.includes("."))
    return parseFloat(clean.replace(/\./g, "").replace(",", "."));
  if (clean.includes(","))
    return parseFloat(clean.replace(",", "."));
  return parseFloat(clean) || 0;
}

function parseDate(raw: string): string {
  // ISO datetime from XML: 2024-01-15T14:30:00-04:00
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Brazilian: DD/MM/YYYY or DD-MM-YYYY
  const br = raw.match(/(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return new Date().toISOString().slice(0, 10);
}

function getXmlText(doc: Document, ...tags: string[]): string {
  for (const tag of tags) {
    const el = doc.querySelector(tag) ?? doc.getElementsByTagName(tag)[0];
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return "";
}

// ── NF-e / NFC-e XML parser ─────────────────────────────────────────
//
// Suporta NF-e e NFC-e emitidos pelo portal fiscal BR.
// O namespace é http://www.portalfiscal.inf.br/nfe mas o DOMParser
// via querySelector não precisa do namespace quando usamos nomes simples.

export function parseInvoiceXML(xmlText: string): InvoiceData {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xmlText, "text/xml");
  } catch {
    return parseInvoiceText(xmlText); // fallback para texto
  }

  // Detecta erros de parse do XML
  const parseErr = doc.querySelector("parsererror");
  if (parseErr) return parseInvoiceText(xmlText);

  // ── empresa emitente ──────────────────────────────────────────────
  const description =
    getXmlText(doc, "xNome", "xFant") ||
    getXmlText(doc, "emit xNome") ||
    "Nota Fiscal";

  // ── CNPJ ─────────────────────────────────────────────────────────
  const cnpjRaw = getXmlText(doc, "CNPJ");
  const cnpj = cnpjRaw
    ? cnpjRaw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
    : "";

  // ── data de emissão ───────────────────────────────────────────────
  const dateRaw = getXmlText(doc, "dhEmi", "dEmi", "dhSaiEnt");
  const date = dateRaw ? parseDate(dateRaw) : new Date().toISOString().slice(0, 10);

  // ── valor total ───────────────────────────────────────────────────
  // vNF = valor total da nota; vProd = total dos produtos (antes impostos)
  const vNF   = parseFloat(getXmlText(doc, "vNF")   || "0");
  const vProd = parseFloat(getXmlText(doc, "vProd") || "0");
  const amount = vNF > 0 ? vNF : vProd > 0 ? vProd : 0;

  let chaveNFeRaw = getXmlText(doc, "chNFe");
  if (!chaveNFeRaw) {
    const m = xmlText.match(/<chNFe[^>]*>([\d\s]+)<\/chNFe>/i);
    chaveNFeRaw = m?.[1]?.trim() ?? "";
  }
  const digits = chaveNFeRaw.replace(/\D/g, "");
  const chaveNFe = digits.length === 44 ? digits : undefined;

  return {
    description,
    amount,
    date,
    cnpj,
    chaveNFe,
    category: categorize(description),
    rawText: xmlText.slice(0, 2000), // mostra primeiros 2k do XML no debug
  };
}

// ── Text parser (imagem / PDF) ───────────────────────────────────────

function extractAmount(text: string): number {
  const patterns = [
    /(?:valor\s*total|total\s*do\s*documento|total\s*nf|total\s*nota)\s*[:\-]?\s*r?\$?\s*([\d.,]+)/i,
    /(?:total\s*a\s*pagar|total\s*cobrado|total\s*geral)\s*[:\-]?\s*r?\$?\s*([\d.,]+)/i,
    /(?:^|\n|\s)total\s*[:\-]?\s*r?\$?\s*([\d.,]+)/im,
    /r\$\s*([\d.,]+)\s*(?:total|fim|final)/i,
    /(?:vl\.?\s*total|valor\s*liq(?:uido)?)\s*[:\-]?\s*r?\$?\s*([\d.,]+)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const v = parseAmount(m[1]);
      if (v > 0) return v;
    }
  }

  // Fallback: maior valor monetário do documento
  const allValues = [...text.matchAll(/r?\$\s*([\d.,]{4,})/gi)]
    .map((m) => parseAmount(m[1]))
    .filter((v) => v > 0 && v < 1_000_000);

  return allValues.length ? Math.max(...allValues) : 0;
}

function extractDate(text: string): string {
  const labeled = text.match(
    /(?:emiss[aã]o|emitido\s*em|data\s*(?:de\s*)?emiss[aã]o|data)[:\s]+(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})/i
  );
  if (labeled) return parseDate(labeled[1]);
  const any = text.match(/(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})/);
  if (any) return parseDate(any[1]);
  return new Date().toISOString().slice(0, 10);
}

function extractCNPJ(text: string): string {
  // Valida comprimento total sem máscara = 14 dígitos
  const matches = [...text.matchAll(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g)];
  for (const m of matches) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length === 14) return m[0];
  }
  return "";
}

function extractDescription(text: string): string {
  const patterns = [
    /(?:raz[aã]o\s*social|nome\s*empresarial|estabelecimento|emitente)[:\s]+([^\n\r]{3,60})/i,
    /(?:^|\n)([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ0-9 &.,'\-]{5,50})(?:\s*CNPJ|\s*CPF|\s*\n)/m,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }

  const firstLine = text
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 5 && l.length <= 60 && /[a-zA-ZÀ-ÿ]/.test(l));

  return firstLine ?? "Nota Fiscal";
}

export function parseInvoiceText(rawText: string): InvoiceData {
  const description = extractDescription(rawText);
  const amount      = extractAmount(rawText);
  const date        = extractDate(rawText);
  const cnpj        = extractCNPJ(rawText);
  const category    = categorize(description);
  return { description, amount, date, category, cnpj, chaveNFe: undefined, rawText };
}
