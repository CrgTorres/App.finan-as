/**
 * Valores em formato brasileiro / EU (vírgula decimal, ponto milhar ou só vírgula).
 */
export function parseMoneyBR(input: unknown): number {
  const raw = String(input ?? "").trim();

  if (!raw) return 0;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/^R\$/i, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const value = Number(normalized);

  return Number.isFinite(value) ? value : 0;
}

/** Padrões claros de valor BR dentro da célula (vírgula decimal). */
function looksLikeBrazilianMoneyCell(s: string): boolean {
  const t = String(s ?? "")
    .trim()
    .replace(/\s/g, "");
  if (!t) return false;
  if (/^-?R\$/i.test(t)) return true;
  if (/,\d{1,4}$/.test(t)) return true;
  return /\d\.\d{3},\d/.test(t);
}

/**
 * Extrai número de uma célula já isolada pelo CSV (sem juntar colunas).
 * `;` em quase todos os extratos BR → sempre interpreta valores como BR quando fizer sentido.
 */
export function parseMoneyCsvCell(raw: string, delimiter: string): number {
  const t = String(raw ?? "").trim();
  if (!t) return 0;

  if (delimiter === ";" || looksLikeBrazilianMoneyCell(t)) {
    return parseMoneyBR(t);
  }

  const noCurr = t.replace(/^R\$/i, "").replace(/\s/g, "");

  const usThousandsDot = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;
  if (usThousandsDot.test(noCurr) || /^-?\d+\.\d+$/.test(noCurr)) {
    const n = Number(noCurr.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  if (/^-?\d+$/.test(noCurr)) {
    const n = Number(noCurr);
    return Number.isFinite(n) ? n : 0;
  }

  return parseMoneyBR(t);
}
