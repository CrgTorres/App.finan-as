/**
 * Sanitização de rubricas/modalidades OCR (contracheque e ConsigFácil).
 */

const RE_PREFIXO_OCR_PARCELA = /^[lI|oO]+(?=\d{2,3}[\/|]\d{2,3})/;
const RE_PREFIXO_OCR_ANTES_PARCELA = /\s+[lI|oO]+(?=\d{2,3}[\/|]\d{2,3})/gi;
/** Corrige prefixos OCR antes de parcela (ex.: loo2/120 → 002/120). */
export function corrigirPrefixoOcrParcela(texto: string): string {
  return texto
    .replace(RE_PREFIXO_OCR_ANTES_PARCELA, " ")
    .replace(/\b([lI|oO]+)(\d{2,3}[\/|]\d{2,3})\b/gi, (_m, _pfx, parcela) => parcela)
    .replace(/(\d)([lI|oO]+)(?=\d{2,3}[\/|]\d{2,3})/gi, "$1");
}

export function sanitizarModalidadeRubrica(texto: string | null | undefined): string {
  if (!texto?.trim()) return "";
  let s = texto.normalize("NFC").trim();
  s = corrigirPrefixoOcrParcela(s);

  s = s.replace(/\b(\d{1,3})([\/|])(\d{2,3})\b/g, (_m, a, sep, b) => {
    const atual = a.replace(RE_PREFIXO_OCR_PARCELA, "").padStart(3, "0");
    const total = b.replace(RE_PREFIXO_OCR_PARCELA, "").padStart(3, "0");
    return `${atual}${sep}${total}`;
  });

  return s.replace(/\s+/g, " ").trim();
}
