/**
 * Remove texto de rodapé do PDF Nubank e fragmentos que o pdf.js cola na descrição do movimento.
 */

const RE_CORTE_RODAPE = [
  /\bTem alguma d[uú]vida\b/i,
  /\bCaso a solu[cç][aã]o fornecida\b/i,
  /\bOuvidoria\b/i,
  /\bnubank\.com\.br\b/i,
  /\bExtrato gerado dia\b/i,
  /\bAtendimento 24h\b/i,
  /\bcapitais e regi[oõ]es metropolitanas\b/i,
  /\bdemais localidades\b/i,
] as const;

/** Página "3 de 8" colada ao fim da linha. */
const RE_PAGINA = /\s+\d+\s+de\s+\d+\s*$/i;

export function limparDescricaoMovimentoNubank(texto: string): string {
  let s = texto.normalize("NFC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return s;

  for (const re of RE_CORTE_RODAPE) {
    const m = re.exec(s);
    if (m?.index !== undefined && m.index > 16) {
      s = s.slice(0, m.index).trim();
    }
  }

  s = s
    .replace(/\bNU_\d+(?:_[A-Z0-9]+)+(?:\s*\([^)]*\))?/gi, " ")
    .replace(/\b4020\s*[-]?\s*0185\b/gi, " ")
    .replace(/\b0800\s*[-]?\s*\d{3}\s*[-]?\s*\d{4}\b/g, " ")
    .replace(/\b0800\s*[-]?\s*\d{3}\s*[-]?\s*\d{3,4}\b/g, " ")
    .replace(RE_PAGINA, "")
    .replace(/\s*-\s*•+[\d.•\-–*]+/gi, " ")
    .replace(/\s*-\s*\*{1,3}\.?\d[\d.*•\-–]+\*{0,3}/gi, " ")
    .replace(/\(\d{3,4}\)\s*Ag[eê]ncia:\s*\d+\s*Conta:\s*[\d.\-–]+/gi, " ")
    .replace(/\bAg[eê]ncia:\s*\d+\s*Conta:\s*[\d.\-–]+/gi, " ")
    .replace(/\bBco\b/gi, " ")
    .replace(/\(\d{3}\)\s*(?=[A-Za-zÀ-ú])/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*-\s*/g, " — ")
    .replace(/^\s*-\s*/g, "")
    .replace(/\s*-\s*$/g, "")
    .trim();

  return s;
}
