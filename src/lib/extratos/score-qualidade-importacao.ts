/**
 * Avaliação 0–100 da qualidade da leitura de um extrato importado + alertas.
 */

import { VALOR_TRANSACAO_MAXIMO_BR } from "@/lib/extratos/extrato-parser-core";

export type NivelQualidadeImportacao = "excelente" | "bom" | "atenção" | "ruim";

export type AlertaQualidadeImportacao =
  | "valor_suspeito"
  | "layout_desconhecido"
  | "nenhuma_transacao_detectada"
  | "divergencia_resumo"
  | "descricao_incompleta";

export type ResultadoScoreQualidadeImportacao = {
  score: number;
  nivel: NivelQualidadeImportacao;
  alertas: AlertaQualidadeImportacao[];
};

export type LancamentoParaScoreExtrato = {
  amount: number;
  type: "receita" | "despesa";
  description: string;
};

export type EntradaScoreQualidadeImportacao = {
  parserId: string;
  transacoes: readonly LancamentoParaScoreExtrato[];
  /** PDF/CSV texto bruto — para conferir linhas de resumo quando existirem. */
  textoExtratoBruto?: string | null;
  /** Utilizador passou pelo fluxo layout novo antes de aplicar apenas o PDF genérico. */
  layoutForcadoGenerico?: boolean;
};

const PONTOS_TRANSACOES_DETECTADAS = 20;

const PONTOS_SEM_VALOR_SUSPEITO = 15;

const PONTOS_BATIDA_RESUMO = 15;

const TOLERANCIA_RESUMO = 0.12;

/** Converte dígitos brasileiros (milhar `.`, decimal `,`) em número. */
function parseValorResumoExtrato(fragmento: string): number | null {
  const s = fragmento.replace(/\s/g, "").trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Tenta obter totais “Entradas / Saídas” ou Total créditos/débitos comuns em extratos PT-BR. */
export function tentarExtrairTotaisResumoExtrato(
  textoRaw: string | null | undefined
): { entradaResumo?: number; saidaResumo?: number } | null {
  if (!textoRaw?.trim()) return null;

  const t = textoRaw.slice(0, 240_000);
  let entradaResumo: number | undefined;
  let saidaResumo: number | undefined;

  const mEntrada =
    /\bentrada[s]?\s*(?:\:|\()?[^\d\-]*(?:R\$)?\s*(-?[\d]{1,3}(?:[\.\u00a0 ]\d{3})*,\d{2})/gi.exec(t);
  if (mEntrada?.[1]) {
    const v = parseValorResumoExtrato(mEntrada[1]);
    if (v !== null && v !== 0) entradaResumo = Math.abs(v);
  }

  const mSaida =
    /\bsa[ií]das?\s*(?:\:|\()?[^\d\-]*(?:R\$)?\s*(-?[\d]{1,3}(?:[\.\u00a0 ]\d{3})*,\d{2})/gi.exec(t);
  if (mSaida?.[1]) {
    const v = parseValorResumoExtrato(mSaida[1]);
    if (v !== null && v !== 0) saidaResumo = Math.abs(v);
  }

  /** Fallback Mercado Pago / similares */
  if (entradaResumo === undefined) {
    const e2 = /\bentradas?\s*:\s*(?:R\$)?\s*(-?[\d\.,]+)/i.exec(t);
    const v = e2?.[1] ? parseValorResumoExtrato(e2[1]) : null;
    if (v !== null && v !== 0) entradaResumo = Math.abs(v);
  }
  if (saidaResumo === undefined) {
    const s2 = /\bsa[ií]das?\s*:\s*(?:R\$)?\s*(-?[\d\.,]+)/i.exec(t);
    const v = s2?.[1] ? parseValorResumoExtrato(s2[1]) : null;
    if (v !== null && v !== 0) saidaResumo = Math.abs(v);
  }

  if (entradaResumo === undefined && saidaResumo === undefined) return null;
  return { entradaResumo, saidaResumo };
}

function pontuacaoPorParser(parserId: string): { banco: number; especifico: number } {
  if (parserId.startsWith("bank_profile:")) return { banco: 30, especifico: 20 };
  switch (parserId) {
    case "mercado_pago":
    case "nubank":
    case "bradesco_celular":
    case "ofx":
      return { banco: 30, especifico: 20 };
    case "csv_generico":
      return { banco: 10, especifico: 10 };
    case "pdf_tabela_generico":
      return { banco: 0, especifico: 0 };
    case "extrato_fallback_xml":
      return { banco: 10, especifico: 10 };
    default:
      return { banco: 12, especifico: 12 };
  }
}

function totaisCalculadosDosLancamentos(
  lancs: readonly LancamentoParaScoreExtrato[]
): { receitas: number; despesas: number } {
  let receitas = 0;
  let despesas = 0;
  for (const r of lancs) {
    const a = Math.abs(Number(r.amount)) || 0;
    if (r.type === "receita") receitas += a;
    else despesas += a;
  }
  return { receitas, despesas };
}

function proporcionalmenteProximo(a: number, b: number, tol: number): boolean {
  const m = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / m <= tol;
}

function nivelDeScore(score: number): NivelQualidadeImportacao {
  if (score >= 90) return "excelente";
  if (score >= 72) return "bom";
  if (score >= 45) return "atenção";
  return "ruim";
}

/** Rótulo em PT para a UI (“Excelente”). */
export function nivelQualidadeImportacaoParaTituloPt(nivel: NivelQualidadeImportacao): string {
  switch (nivel) {
    case "excelente":
      return "Excelente";
    case "bom":
      return "Bom";
    case "atenção":
      return "Atenção";
    case "ruim":
      return "Ruim";
    default:
      return nivel;
  }
}

/** Alertas de domínio (constantes estáveis para analytics / i18n). */
export function avaliarQualidadeImportacaoExtrato(
  entrada: EntradaScoreQualidadeImportacao
): ResultadoScoreQualidadeImportacao {
  const alertas: AlertaQualidadeImportacao[] = [];
  const { parserId } = entrada;
  const txs = entrada.transacoes ?? [];

  if (entrada.layoutForcadoGenerico) {
    alertas.push("layout_desconhecido");
  }

  if (txs.length === 0) {
    alertas.push("nenhuma_transacao_detectada");
    return { score: 0, nivel: "ruim", alertas };
  }

  let score = 0;
  const { banco: ptsBanco, especifico: ptsEspec } = pontuacaoPorParser(parserId);
  score += ptsBanco;
  score += ptsEspec;

  score += PONTOS_TRANSACOES_DETECTADAS;

  let algumSuspeito = false;
  for (const tx of txs) {
    const v = Math.abs(Number(tx.amount)) || 0;
    if (v > VALOR_TRANSACAO_MAXIMO_BR || v > 1_000_000) algumSuspeito = true;
  }
  if (algumSuspeito) {
    alertas.push("valor_suspeito");
  } else {
    score += PONTOS_SEM_VALOR_SUSPEITO;
  }

  let descricaoCurta = 0;
  for (const tx of txs) {
    const d = (tx.description ?? "").normalize("NFC").trim();
    if (d.length < 4 || /^\d+$/u.test(d)) descricaoCurta++;
  }
  const ratioRuim =
    txs.length > 0 ? descricaoCurta / txs.length : 0;
  if (ratioRuim >= 0.18) alertas.push("descricao_incompleta");

  const resumo = tentarExtrairTotaisResumoExtrato(entrada.textoExtratoBruto);
  const { receitas: sumRec, despesas: sumDes } = totaisCalculadosDosLancamentos(txs);

  let bateResumo = false;
  if (resumo?.entradaResumo !== undefined && resumo?.saidaResumo !== undefined) {
    bateResumo =
      proporcionalmenteProximo(sumRec, resumo.entradaResumo!, TOLERANCIA_RESUMO) &&
      proporcionalmenteProximo(sumDes, resumo.saidaResumo!, TOLERANCIA_RESUMO);
    if (!bateResumo) alertas.push("divergencia_resumo");
  } else if (resumo?.entradaResumo !== undefined) {
    bateResumo = proporcionalmenteProximo(sumRec, resumo.entradaResumo, TOLERANCIA_RESUMO);
    if (!bateResumo) alertas.push("divergencia_resumo");
  } else if (resumo?.saidaResumo !== undefined) {
    bateResumo = proporcionalmenteProximo(sumDes, resumo.saidaResumo, TOLERANCIA_RESUMO);
    if (!bateResumo) alertas.push("divergencia_resumo");
  }

  if (bateResumo) score += PONTOS_BATIDA_RESUMO;

  /** Penalização leve se muitas descrições pobres mas ainda leu linhas */
  if (ratioRuim >= 0.18) score = Math.max(0, score - 12);

  if (entrada.layoutForcadoGenerico) score = Math.max(0, score - 8);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const nivel = nivelDeScore(score);

  return { score, nivel, alertas };
}
