const RE_DATA_LINHA =
  /\b\d{2}\/\d{2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{2}-\d{2}-\d{4}\b/;
const RE_VALOR_LINHA =
  /\bR\$\s*[\d.,]+\b|[+\-]?[\d]{1,3}(?:[\.,]\d{3})*[.,]\d{2}\b/;

/** Amostras em blocos (parágrafos) para pré-visualização no fluxo layout desconhecido. */
export function amostrarBlocosExtrato(texto: string, maxBlocks = 5): string[] {
  const trimmed = texto.replace(/\u00a0/g, " ").normalize("NFC");
  const partes = trimmed
    .split(/\n\s*\n+/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s.length >= 12);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const p of partes) {
    const key = p.slice(0, 280);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.length > 220 ? `${p.slice(0, 217)}…` : p);
    if (out.length >= maxBlocks) return out;
  }

  /** Fallback: linhas com data ou formato monetário próximo ao BR */
  const lines = trimmed.split(/\n/).map((l) => l.trim()).filter((l) => l.length >= 8);
  for (const ln of lines) {
    if (!RE_DATA_LINHA.test(ln) && !RE_VALOR_LINHA.test(ln)) continue;
    const n = ln.replace(/\s+/g, " ");
    const key = n.slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n.length > 220 ? `${n.slice(0, 217)}…` : n);
    if (out.length >= maxBlocks) break;
  }

  return out;
}
