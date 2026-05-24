/**
 * Extrai par atual/total de rubricas de contracheque (ex.: 053/072, 003/048).
 * Destinado a trechos de linha já segmentados pelo OCR — evite passar parágrafos
 * inteiros para reduzir coincidências acidentais.
 */

export type ParcelaExtraida = {
  atual: number;
  total: number;
  /** Trecho correspondido no texto (normalizado com trim). */
  texto: string;
};

/** Formato preferido na UI de contracheque (ex.: 003/048). */
export function formatarParcelaDisplay(atual: number, total: number): string {
  return `${String(atual).padStart(3, "0")}/${String(total).padStart(3, "0")}`;
}

const PARCELA_RE = /(\d{1,3})\s*\/\s*(\d{1,3})/g;

export function extrairParcela(texto: string): ParcelaExtraida | null {
  if (texto == null || typeof texto !== "string") return null;
  const s = texto.trim();
  if (!s) return null;

  for (const m of s.matchAll(PARCELA_RE)) {
    const atual = Number.parseInt(m[1]!, 10);
    const total = Number.parseInt(m[2]!, 10);
    if (!Number.isFinite(atual) || !Number.isFinite(total)) continue;
    if (atual < 1 || total < 1) continue;
    if (atual > total) continue;
    if (total > 200) continue;
    return { atual, total, texto: m[0]!.trim() };
  }

  return null;
}
