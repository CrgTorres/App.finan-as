import type { AlertaPlausibilidadeContrato, ContratoExtraido } from "@/types/contrato-extraido";

/**
 * Metodologia «Financiamento com prestações fixas» da Calculadora do Cidadão (BCB).
 * @see https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaFinanciamentoPrestacoesFixas.do?method=exibirMetodologiaFinanciamentoPrestacoesFixas
 *
 * q0 = p × ((1 − (1+j)^−n) / j), com j = taxa mensal em decimal, n = meses, p = prestação, q0 = valor financiado.
 * Não inclui seguros nem todas as convenções de contratos reais; serve para coerência de ordem de grandeza.
 */

export const URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS =
  "https://www3.bcb.gov.br/CALCIDADAO/publico/exibirFormFinanciamentoPrestacoesFixas.do?method=exibirFormFinanciamentoPrestacoesFixas";

export const URL_METODOLOGIA_FIN_PREST_FIXAS =
  "https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaFinanciamentoPrestacoesFixas.do?method=exibirMetodologiaFinanciamentoPrestacoesFixas";

export function pvFinanciamentoPrestacoesFixas(
  prestacao: number,
  taxaMensalDecimal: number,
  numMeses: number,
): number {
  if (numMeses < 1 || !Number.isFinite(prestacao) || prestacao <= 0) return NaN;
  if (taxaMensalDecimal <= 0) return prestacao * numMeses;
  return (prestacao * (1 - Math.pow(1 + taxaMensalDecimal, -numMeses))) / taxaMensalDecimal;
}

export function prestacaoFinanciamentoPrestacoesFixas(
  valorFinanciado: number,
  taxaMensalDecimal: number,
  numMeses: number,
): number {
  if (numMeses < 1 || !Number.isFinite(valorFinanciado) || valorFinanciado <= 0) return NaN;
  if (taxaMensalDecimal <= 0) return valorFinanciado / numMeses;
  return (valorFinanciado * taxaMensalDecimal) / (1 - Math.pow(1 + taxaMensalDecimal, -numMeses));
}

/**
 * Taxa mensal implícita (decimal) por bissecção, no espírito da aproximação descrita pelo BCB.
 */
export function taxaMensalImplicitaFinanciamentoPrestacoesFixas(
  valorFinanciado: number,
  prestacao: number,
  numMeses: number,
): number | undefined {
  if (
    numMeses < 1 ||
    !Number.isFinite(valorFinanciado) ||
    !Number.isFinite(prestacao) ||
    valorFinanciado <= 0 ||
    prestacao <= 0
  ) {
    return undefined;
  }

  const totalNominal = prestacao * numMeses;
  if (totalNominal + 1e-9 < valorFinanciado) return undefined;

  const f = (j: number) => pvFinanciamentoPrestacoesFixas(prestacao, j, numMeses) - valorFinanciado;

  if (Math.abs(f(0)) < 1e-9) return 0;

  let lo = 1e-14;
  if (f(lo) < 0) return undefined;

  let hi = 0.08;
  let expand = 0;
  while (f(hi) > 0 && hi < 0.45 && expand < 25) {
    hi *= 1.35;
    expand++;
  }
  if (f(hi) > 0) return undefined;

  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    const v = f(mid);
    if (Math.abs(v) < Math.max(1e-9, valorFinanciado * 1e-12)) return mid;
    if (v > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type ResultadoChecagemBcbPrestFixas = {
  valorFinanciadoUsado: number;
  taxaImplicitaMensalPct: number;
  prestacaoEsperadaNaTaxaDeclarada?: number;
  diffDeclaradoPP?: number;
  diffCetMensalPP?: number;
};

export function checarFinanciamentoVsCalculadoraCidadao(input: {
  valorFinanciado: number;
  prestacao: number;
  numMeses: number;
  jurosMensalPct?: number;
  cetMensalPct?: number;
}): ResultadoChecagemBcbPrestFixas | undefined {
  const { valorFinanciado, prestacao, numMeses, jurosMensalPct, cetMensalPct } = input;
  const jImpl = taxaMensalImplicitaFinanciamentoPrestacoesFixas(valorFinanciado, prestacao, numMeses);
  if (jImpl === undefined) return undefined;
  const taxaImplicitaMensalPct = jImpl * 100;

  let prestacaoEsperadaNaTaxaDeclarada: number | undefined;
  let diffDeclaradoPP: number | undefined;
  if (jurosMensalPct != null && jurosMensalPct > 0) {
    const jd = jurosMensalPct / 100;
    prestacaoEsperadaNaTaxaDeclarada = prestacaoFinanciamentoPrestacoesFixas(valorFinanciado, jd, numMeses);
    diffDeclaradoPP = Math.abs(taxaImplicitaMensalPct - jurosMensalPct);
  }

  let diffCetMensalPP: number | undefined;
  if (cetMensalPct != null && cetMensalPct > 0) {
    diffCetMensalPP = Math.abs(taxaImplicitaMensalPct - cetMensalPct);
  }

  return {
    valorFinanciadoUsado: valorFinanciado,
    taxaImplicitaMensalPct,
    prestacaoEsperadaNaTaxaDeclarada,
    diffDeclaradoPP,
    diffCetMensalPP,
  };
}

function fmtPct(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Compara extração do contrato com o modelo oficial de prestações fixas do BCB (juros compostos mensais).
 * Usa valor financiado (E.10) quando existir; senão valor solicitado.
 */
export function alertasCalculadoraCidadaoBcb(e: ContratoExtraido): AlertaPlausibilidadeContrato[] {
  const a: AlertaPlausibilidadeContrato[] = [];
  const q0 = e.valorFinanciado ?? e.valorSolicitado;
  if (q0 == null || e.parcela == null || e.parcelas == null) return a;
  const n = Math.round(e.parcelas);
  if (q0 <= 0 || e.parcela <= 0 || n < 1 || n > 600) return a;

  const chk = checarFinanciamentoVsCalculadoraCidadao({
    valorFinanciado: q0,
    prestacao: e.parcela,
    numMeses: n,
    jurosMensalPct: e.jurosMensal,
    cetMensalPct: e.cetMensal,
  });
  if (!chk) return a;

  const base =
    e.valorFinanciado != null
      ? `valor financiado ${fmtBrl(q0)}`
      : `valor base ${fmtBrl(q0)} (sem E.10; pode enviesar a taxa implícita)`;

  if (chk.diffCetMensalPP != null && e.cetMensal != null && chk.diffCetMensalPP > 0.35) {
    a.push({
      severidade: "aviso",
      codigo: "bcb_implicito_vs_cet",
      mensagem: `Calculadora do Cidadão (BCB — prestações fixas): com ${base}, prestação ${fmtBrl(e.parcela)} e ${n} meses, a taxa mensal implícita é ~${fmtPct(chk.taxaImplicitaMensalPct)}% a.m., distante do CET mensal extraído (${e.cetMensal}% a.m.). Confirme no PDF e no simulador: ${URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS}`,
    });
  }

  if (chk.diffDeclaradoPP != null && e.jurosMensal != null) {
    if (chk.diffDeclaradoPP > 1.0) {
      a.push({
        severidade: "critico",
        codigo: "bcb_implicito_vs_juros_forte",
        mensagem: `Metodologia do BCB (prestações fixas): taxa implícita ~${fmtPct(chk.taxaImplicitaMensalPct)}% a.m. vs juros declarados ${e.jurosMensal}% a.m. (Δ ${fmtPct(chk.diffDeclaradoPP)} p.p.). Indica inconsistência forte ou OCR incorreto. Conferir ${URL_METODOLOGIA_FIN_PREST_FIXAS} e o formulário ${URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS}`,
      });
    } else if (chk.diffDeclaradoPP > 0.4) {
      a.push({
        severidade: "aviso",
        codigo: "bcb_implicito_vs_juros",
        mensagem: `BCB (prestações fixas): taxa implícita ~${fmtPct(chk.taxaImplicitaMensalPct)}% a.m. acima dos juros nominais (${e.jurosMensal}% a.m.). Pode ser normal se o CET (custos efetivos) estiver mais próximo da implícita — validar no simulador: ${URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS}`,
      });
    }
  }

  if (
    chk.prestacaoEsperadaNaTaxaDeclarada != null &&
    e.jurosMensal != null &&
    (e.cetMensal == null || (chk.diffCetMensalPP != null && chk.diffCetMensalPP > 0.25))
  ) {
    const diffP = Math.abs(chk.prestacaoEsperadaNaTaxaDeclarada - e.parcela);
    const tol = Math.max(4.5, e.parcela * 0.028);
    if (diffP > tol) {
      a.push({
        severidade: "aviso",
        codigo: "bcb_prestacao_modelo_simples",
        mensagem: `No modelo do BCB, com ${e.jurosMensal}% a.m. e ${base}, a prestação seria ~${fmtBrl(chk.prestacaoEsperadaNaTaxaDeclarada)} (extraída ${fmtBrl(e.parcela)}). Diferença relevante quando não há CET alinhado à taxa implícita; considerar encargos e preencher o simulador oficial: ${URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS}`,
      });
    }
  }

  return a;
}
