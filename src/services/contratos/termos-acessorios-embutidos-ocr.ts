import type { ContratoExtraido } from "@/types/contrato-extraido";

export const ALERTA_SEGURO_SERVICO_EMBUTIDO =
  "Possível seguro ou serviço embutido no contrato.";

export const ALERTA_VENDA_CASADA_SEM_RECUSA =
  "Possível venda casada — conferir autorização expressa.";

/** Termos monitorados no OCR do contrato / CCB. */
export const TERMOS_ACESSORIOS_EMBUTIDOS_OCR: { id: string; re: RegExp }[] = [
  { id: "seguro", re: /\bseguro\b/i },
  { id: "protecao_financeira", re: /prote[cç][aã]o\s+financeira/i },
  { id: "prestamista", re: /\bprestamista\b/i },
  { id: "peculio", re: /pec[uú]lio/i },
  { id: "assistencia", re: /assist[eê]ncia/i },
  { id: "clube", re: /\bclube\b/i },
  { id: "cesta", re: /\bcesta\b/i },
  { id: "tarifa", re: /\btarifas?\b/i },
  { id: "servico", re: /\bservi[cç]os?\b/i },
  { id: "capitalizacao", re: /capitaliza[cç][aã]o/i },
];

const RE_VALOR_BRL = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:,\d{2})?)/i;

const RE_OPCIONALIDADE_RECUSA =
  /opcional|facultativ[oa]|n[aã]o\s+obrigat[oó]ri[oa]|pode\s+ser\s+contratad[oa]\s+separadamente|à\s+parte|a\s+parte|recusar|recusa|sem\s+seguro|n[aã]o\s+desejo|n[aã]o\s+contratar|desist[eê]ncia|autoriza[cç][aã]o\s+expressa|manifesta[cç][aã]o\s+de\s+vontade|contrata[cç][aã]o\s+facultativa/i;

const RE_VENDA_CASADA_EXPLICITA =
  /venda\s+casada|condicionad[oa]\s+ao\s+seguro|somente\s+com\s+seguro|mediante\s+contrata[cç][aã]o\s+do\s+seguro|incluso\s+no\s+financiamento\s+do\s+seguro/i;

export type TermoAcessorioEmbutidoDetectado = {
  termo: string;
  rotulo: string;
};

const ROTULO_TERMO: Record<string, string> = {
  seguro: "seguro",
  protecao_financeira: "proteção financeira",
  prestamista: "prestamista",
  peculio: "pecúlio",
  assistencia: "assistência",
  clube: "clube",
  cesta: "cesta",
  tarifa: "tarifa",
  servico: "serviço",
  capitalizacao: "capitalização",
};

export function normalizarTextoOcrContrato(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

export function detectarTermosAcessoriosEmbutidosOcr(texto: string): TermoAcessorioEmbutidoDetectado[] {
  const t = normalizarTextoOcrContrato(texto);
  const vistos = new Set<string>();
  const out: TermoAcessorioEmbutidoDetectado[] = [];

  for (const { id, re } of TERMOS_ACESSORIOS_EMBUTIDOS_OCR) {
    if (!re.test(t) || vistos.has(id)) continue;
    vistos.add(id);
    out.push({ termo: id, rotulo: ROTULO_TERMO[id] ?? id });
  }

  return out;
}

export function textoMencionaTermosAcessoriosEmbutidos(texto: string): boolean {
  return detectarTermosAcessoriosEmbutidosOcr(texto).length > 0;
}

/** Compatível com detecção legada (prestamista, MIP, etc.). */
export function textoMencionaSeguroPrestamista(texto: string): boolean {
  const t = normalizarTextoOcrContrato(texto);
  if (textoMencionaTermosAcessoriosEmbutidos(t)) {
    const ids = new Set(detectarTermosAcessoriosEmbutidosOcr(t).map((x) => x.termo));
    if (
      ids.has("seguro") ||
      ids.has("prestamista") ||
      ids.has("protecao_financeira")
    ) {
      return true;
    }
  }
  return /seguro\s+prestamista|seguro\s+de\s+vida\s*(?:do\s+)?(?:mutu[aá]rio|tomador)?|seguro\s+habitacional|\bmip\b|\bdfi\b|seguro\s+em\s+grupo/i.test(
    t,
  );
}

export function textoMencionaOpcaoRecusaAcessorio(texto: string): boolean {
  return RE_OPCIONALIDADE_RECUSA.test(normalizarTextoOcrContrato(texto));
}

export function textoMencionaVendaCasadaExplicita(texto: string): boolean {
  return RE_VENDA_CASADA_EXPLICITA.test(normalizarTextoOcrContrato(texto));
}

function parseValorBrlTrecho(s: string): number | null {
  const m = s.match(RE_VALOR_BRL);
  if (!m?.[1]) return null;
  const raw = m[1].replace(/\./g, "").replace(",", ".");
  const v = Number(raw);
  return Number.isFinite(v) && v >= 1 ? v : null;
}

/** Valor em R$ até `janela` caracteres após a primeira ocorrência do termo. */
export function valorMonetarioProximoAoTermoNoTexto(
  texto: string,
  reTermo: RegExp,
  janela = 140,
): number | null {
  const t = normalizarTextoOcrContrato(texto);
  const m = reTermo.exec(t);
  if (!m || m.index == null) return null;
  const trecho = t.slice(m.index, m.index + janela);
  return parseValorBrlTrecho(trecho);
}

export function haValorCobradoProximoAosTermosNoOcr(
  texto: string,
  termos: TermoAcessorioEmbutidoDetectado[],
): boolean {
  for (const { termo } of termos) {
    const def = TERMOS_ACESSORIOS_EMBUTIDOS_OCR.find((x) => x.id === termo);
    if (!def) continue;
    const v = valorMonetarioProximoAoTermoNoTexto(texto, def.re);
    if (v != null && v >= 1) return true;
  }
  return false;
}

export function haValoresCobradosAcessoriosJuntoEmprestimo(
  e: ContratoExtraido,
  texto: string,
  termos: TermoAcessorioEmbutidoDetectado[],
): boolean {
  if (e.seguro != null && e.seguro > 0) return true;
  if (e.tarifas != null && e.tarifas > 0) return true;

  const solicitado = e.valorSolicitado ?? 0;
  const financiado = e.valorFinanciado ?? 0;
  const iof = e.iof ?? 0;
  const delta = financiado > 0 && solicitado > 0 ? financiado - solicitado : 0;
  const residualAposIof = delta > 0 ? Math.max(0, delta - iof) : 0;
  if (residualAposIof >= 50) return true;

  return haValorCobradoProximoAosTermosNoOcr(texto, termos);
}
