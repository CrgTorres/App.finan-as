/**
 * Compara contrato novo com contrato anterior do mesmo banco (evidências, loans ou extrações).
 */

import { normalizarNomeBanco } from "@/lib/auditoria/normalizar-banco";
import { normSlugRubricaLoanMatch } from "@/lib/anexos/emprestimos-cruzamento-loans";
import type { Loan } from "@/types/contracheque";
import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { LoanEvidence } from "@/types/loan-evidence";

export const ALERTA_PARCELA_REDUZIDA_CUSTO_TOTAL =
  "Parcela reduzida com aumento expressivo do custo total.";

const EPS_PARCELA = 0.06;

export type MetricasContratoComparavel = {
  banco: string;
  bancoNormalizado: string;
  parcela: number;
  parcelas: number;
  totalPago: number;
  dataReferencia: string | null;
  rotulo: string;
  origem: "extraido" | "loan" | "evidencia";
};

export type ComparacaoContratoAnteriorMesmoBanco = {
  parcela_nova: number;
  parcela_anterior: number;
  prazo_novo: number;
  prazo_anterior: number;
  total_pago_novo: number;
  total_pago_anterior: number;
  banco: string;
  rotulo_contrato_anterior: string;
};

export type ResultadoComparacaoContratoAnterior = {
  aplicavel: boolean;
  detectado: boolean;
  comparacao: ComparacaoContratoAnteriorMesmoBanco | null;
  alerta: {
    codigo: "parcela_reduzida_custo_total_expressivo";
    titulo: string;
    mensagem: string;
    severidade: "atencao" | "alto";
  } | null;
};

export type ContratosAnterioresCandidatos = {
  evidencias?: LoanEvidence[];
  extraidos?: ContratoExtraido[];
  loans?: Loan[];
  /** Não comparar com o próprio documento (ex.: evidência em edição). */
  excluirEvidenciaId?: string;
};

function arredondar2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function totalPagoDeExtraido(e: ContratoExtraido, parcela: number, parcelas: number): number {
  if (e.valorTotalPago != null && e.valorTotalPago > 0) return e.valorTotalPago;
  if (parcela > 0 && parcelas > 0) return arredondar2(parcela * parcelas);
  return 0;
}

function dataReferenciaExtraido(e: ContratoExtraido): string | null {
  return e.dataContratacao ?? e.dataAssinatura ?? e.dataDocumento ?? e.primeiroVencimento ?? null;
}

export function metricasComparacaoDeExtraido(
  e: ContratoExtraido,
  rotulo = "Contrato",
  origem: MetricasContratoComparavel["origem"] = "extraido",
): MetricasContratoComparavel | null {
  const parcela = e.parcela ?? 0;
  const parcelas = e.parcelas != null ? Math.round(e.parcelas) : 0;
  if (parcela <= 0 || parcelas <= 0) return null;

  const bancoRaw = e.banco?.trim() || "Não identificado";
  const totalPago = totalPagoDeExtraido(e, parcela, parcelas);
  if (totalPago <= 0) return null;

  return {
    banco: bancoRaw,
    bancoNormalizado: normalizarNomeBanco(bancoRaw),
    parcela,
    parcelas,
    totalPago,
    dataReferencia: dataReferenciaExtraido(e),
    rotulo,
    origem,
  };
}

export function metricasComparacaoDeLoan(loan: Loan): MetricasContratoComparavel | null {
  const parcela = Number(loan.installment_amount);
  const parcelas = loan.total_installments;
  if (!Number.isFinite(parcela) || parcela <= 0 || parcelas <= 0) return null;

  const bancoRaw = loan.institution_name?.trim() || loan.description?.trim() || "Não identificado";
  const totalPago =
    loan.total_pago_detectado != null && loan.total_pago_detectado > 0
      ? loan.total_pago_detectado
      : arredondar2(parcela * parcelas);

  return {
    banco: bancoRaw,
    bancoNormalizado: normalizarNomeBanco(bancoRaw),
    parcela,
    parcelas,
    totalPago,
    dataReferencia: loan.start_date ?? loan.primeira_aparicao ?? null,
    rotulo: loan.description?.slice(0, 80) || "Empréstimo cadastrado",
    origem: "loan",
  };
}

export function bancosCompatíveisMesmoInstituicao(a: string, b: string): boolean {
  const na = normalizarNomeBanco(a);
  const nb = normalizarNomeBanco(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const sa = normSlugRubricaLoanMatch(na);
  const sb = normSlugRubricaLoanMatch(nb);
  return sa.length >= 6 && sb.length >= 6 && (sa.includes(sb) || sb.includes(sa));
}

function pareceMesmoContrato(a: MetricasContratoComparavel, b: MetricasContratoComparavel): boolean {
  if (Math.abs(a.parcela - b.parcela) > EPS_PARCELA) return false;
  if (a.parcelas !== b.parcelas) return false;
  if (Math.abs(a.totalPago - b.totalPago) <= Math.max(2, a.totalPago * 0.01)) return true;
  return false;
}

function timestampData(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function reunirMetricasContratosAnteriores(
  fontes: ContratosAnterioresCandidatos,
): MetricasContratoComparavel[] {
  const out: MetricasContratoComparavel[] = [];

  for (const e of fontes.extraidos ?? []) {
    const m = metricasComparacaoDeExtraido(e, "Contrato anterior");
    if (m) out.push(m);
  }

  for (const loan of fontes.loans ?? []) {
    const m = metricasComparacaoDeLoan(loan);
    if (m) out.push(m);
  }

  for (const ev of fontes.evidencias ?? []) {
    if (fontes.excluirEvidenciaId && ev.id === fontes.excluirEvidenciaId) continue;
    const ex = ev.contrato_extraido;
    if (!ex) continue;
    const m = metricasComparacaoDeExtraido(
      ex,
      ev.nome_arquivo?.slice(0, 60) || "Evidência anterior",
      "evidencia",
    );
    if (m) out.push(m);
  }

  return out;
}

function satisfazRegraParcelaReduzidaCustoTotal(
  novo: MetricasContratoComparavel,
  anterior: MetricasContratoComparavel,
): boolean {
  if (!bancosCompatíveisMesmoInstituicao(novo.banco, anterior.banco)) return false;
  if (pareceMesmoContrato(novo, anterior)) return false;

  const parcelaMenor = novo.parcela < anterior.parcela - EPS_PARCELA;
  const prazoMaior = novo.parcelas > anterior.parcelas;
  const totalMaior = novo.totalPago > anterior.totalPago + 0.01;

  return parcelaMenor && prazoMaior && totalMaior;
}

function escolherMelhorAnterior(
  novo: MetricasContratoComparavel,
  candidatos: MetricasContratoComparavel[],
): MetricasContratoComparavel | null {
  const elegiveis = candidatos
    .filter((c) => satisfazRegraParcelaReduzidaCustoTotal(novo, c))
    .sort((a, b) => {
      const da = timestampData(a.dataReferencia);
      const db = timestampData(b.dataReferencia);
      if (db !== da) return db - da;
      return b.parcela - a.parcela;
    });

  return elegiveis[0] ?? null;
}

/**
 * Compara contrato novo com anteriores do mesmo banco.
 */
export function detectarParcelaReduzidaCustoTotalVsContratoAnterior(
  extraidoNovo: ContratoExtraido,
  fontes?: ContratosAnterioresCandidatos,
): ResultadoComparacaoContratoAnterior {
  const novo = metricasComparacaoDeExtraido(extraidoNovo, "Contrato atual");
  if (!novo) {
    return { aplicavel: false, detectado: false, comparacao: null, alerta: null };
  }

  const candidatos = reunirMetricasContratosAnteriores(fontes ?? {});
  if (candidatos.length === 0) {
    return { aplicavel: true, detectado: false, comparacao: null, alerta: null };
  }

  const anterior = escolherMelhorAnterior(novo, candidatos);
  if (!anterior) {
    return { aplicavel: true, detectado: false, comparacao: null, alerta: null };
  }

  const comparacao: ComparacaoContratoAnteriorMesmoBanco = {
    parcela_nova: novo.parcela,
    parcela_anterior: anterior.parcela,
    prazo_novo: novo.parcelas,
    prazo_anterior: anterior.parcelas,
    total_pago_novo: novo.totalPago,
    total_pago_anterior: anterior.totalPago,
    banco: novo.bancoNormalizado,
    rotulo_contrato_anterior: anterior.rotulo,
  };

  const aumentoTotalPct =
    anterior.totalPago > 0
      ? arredondar2(((novo.totalPago - anterior.totalPago) / anterior.totalPago) * 100)
      : 0;

  const severidade: "atencao" | "alto" =
    aumentoTotalPct >= 25 || novo.parcelas - anterior.parcelas >= 12 ? "alto" : "atencao";

  return {
    aplicavel: true,
    detectado: true,
    comparacao,
    alerta: {
      codigo: "parcela_reduzida_custo_total_expressivo",
      titulo: ALERTA_PARCELA_REDUZIDA_CUSTO_TOTAL,
      mensagem: `${ALERTA_PARCELA_REDUZIDA_CUSTO_TOTAL} ${novo.bancoNormalizado}: parcela ${fmtBrl(novo.parcela)} (antes ${fmtBrl(anterior.parcela)}), prazo ${novo.parcelas} meses (antes ${anterior.parcelas}), total ${fmtBrl(novo.totalPago)} (antes ${fmtBrl(anterior.totalPago)}). Ref.: ${anterior.rotulo}.`,
      severidade,
    },
  };
}
