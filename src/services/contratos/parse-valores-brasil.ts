/** Parse de valores monetários e percentuais em formatos comuns em documentos BR (OCR incluso). */

export function parseValorRealBr(s: string): number | undefined {
  const t = s.replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!t) return undefined;
  const m = t.match(/^(\d{1,3}(?:\.\d{3})*,\d{2})$/);
  if (m) return roundMoney(parseFloat(m[1].replace(/\./g, "").replace(",", ".")));
  const m2 = t.match(/^(\d+),(\d{2})$/);
  if (m2) return roundMoney(parseFloat(`${m2[1]}.${m2[2]}`));
  const m3 = t.match(/^(\d+)(?:\.(\d{2}))?$/);
  if (m3 && !t.includes(",")) {
    const n = parseFloat(m3[0]);
    return Number.isFinite(n) ? roundMoney(n) : undefined;
  }
  return undefined;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Primeiro valor com «R$» explícito (evita confundir «2,59%» com dinheiro quando o OCR cola mal). */
export function primeiroValorReaisComRSNoTrecho(trecho: string): number | undefined {
  const re = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
  let m: RegExpExecArray | null;
  let first: number | undefined;
  while ((m = re.exec(trecho)) !== null) {
    const end = m.index + m[0].length;
    if (/^\s*%/.test(trecho.slice(end, end + 4))) continue;
    const v = parseValorRealBr(m[1]!);
    if (v != null && v > 0) {
      if (first === undefined) first = v;
    }
  }
  return first;
}

/** Primeiro valor BRL «útil» no trecho (último match não-nulo, típico em linhas etiquetadas). */
export function primeiroValorRealNoTrecho(trecho: string): number | undefined {
  const re = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})|(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
  let best: number | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trecho)) !== null) {
    const end = m.index + m[0].length;
    if (/^\s*%/.test(trecho.slice(end, end + 4))) continue;
    const raw = m[1] ?? m[2];
    if (raw) {
      const v = parseValorRealBr(raw);
      if (v != null && v > 0) best = v;
    }
  }
  return best;
}

export function parsePercentualBr(s: string): number | undefined {
  const t = s.replace(/\s/g, "").replace(/a\.?m\.?|a\.?a\.?/gi, "");
  const m = t.match(/(\d{1,2}(?:,\d{1,6})?)\s*%/);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}
