/**
 * Detecta possível refinanciamento sucessivo: contrato novo vs anterior (mesmo banco) + sinais no OCR.
 */

import type { ContratoExtraido } from "@/types/contrato-extraido";
import {
  bancosCompatíveisMesmoInstituicao,
  metricasComparacaoDeExtraido,
  reunirMetricasContratosAnteriores,
  type ContratosAnterioresCandidatos,
  type MetricasContratoComparavel,
} from "@/services/contratos/comparar-contrato-anterior-mesmo-banco";

export const ALERTA_REFINANCIAMENTO_SUCESSIVO =
  "Possível refinanciamento sucessivo identificado.";

const EPS_PARCELA = 0.06;
const MESES_MAX_PROXIMIDADE = 36;
const MESES_MIN_PROXIMIDADE = 0;

const RE_QUITACAO_SALDO =
  /quita[cç][aã]o\s+(de\s+)?saldo|liquida[cç][aã]o\s+(de\s+)?(contrato|d[ií]vida|opera[cç][aã]o)\s+anterior|saldo\s+devedor|refinanciamento\s+(de\s+)?d[ií]vida|substitui[cç][aã]o\s+de\s+contrato|portabilidade\s+com\s+quita/i;

const RE_LIBERACAO_TROCO =
  /\btroco\b|valor\s+l[ií]quido\s+(liberado|creditado|ao\s+(cliente|mutu[aá]rio))|cr[eé]dito\s+remanescente|recursos\s+liberados|libera[cç][aã]o\s+de\s+troco|troco\s+ao\s+mutu[aá]rio/i;

export type SinalRefinanciamentoSucessivo =
  | "mesmo_banco"
  | "contrato_proximo"
  | "quitacao_saldo_devedor"
  | "liberacao_troco"
  | "aumento_prazo"
  | "parcelas_semelhantes";

export type ComparacaoRefinanciamentoSucessivo = {
  banco: string;
  rotulo_contrato_anterior: string;
  parcela_nova: number;
  parcela_anterior: number;
  prazo_novo: number;
  prazo_anterior: number;
  total_pago_novo: number;
  total_pago_anterior: number;
  meses_entre_contratos: number | null;
};

export type ResultadoRefinanciamentoSucessivo = {
  aplicavel: boolean;
  detectado: boolean;
  sinais: SinalRefinanciamentoSucessivo[];
  comparacao: ComparacaoRefinanciamentoSucessivo | null;
  alerta: {
    codigo: "refinanciamento_sucessivo_identificado";
    titulo: string;
    mensagem: string;
    severidade: "atencao" | "alto";
  } | null;
};

type MetricasEnriquecidas = MetricasContratoComparavel & {
  valorFinanciado: number;
  valorSolicitado: number;
  iof: number;
  refinanciamento: boolean;
};

function arredondar2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function timestampData(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function mesesEntreDatas(isoNovo: string | null, isoAnt: string | null): number | null {
  const tn = timestampData(isoNovo);
  const ta = timestampData(isoAnt);
  if (tn <= 0 || ta <= 0) return null;
  const diffMs = tn - ta;
  if (diffMs < 0) return null;
  return arredondar2(diffMs / (1000 * 60 * 60 * 24 * 30.44));
}

function enriquecerMetricas(
  m: MetricasContratoComparavel,
  e: ContratoExtraido,
): MetricasEnriquecidas {
  return {
    ...m,
    valorFinanciado: e.valorFinanciado ?? 0,
    valorSolicitado: e.valorSolicitado ?? 0,
    iof: e.iof ?? 0,
    refinanciamento: e.refinanciamento === true,
  };
}

function metricasEnriquecidasDeExtraido(
  e: ContratoExtraido,
  rotulo: string,
): MetricasEnriquecidas | null {
  const base = metricasComparacaoDeExtraido(e, rotulo);
  if (!base) return null;
  return enriquecerMetricas(base, e);
}

function pareceMesmoContrato(a: MetricasContratoComparavel, b: MetricasContratoComparavel): boolean {
  if (Math.abs(a.parcela - b.parcela) > EPS_PARCELA) return false;
  if (a.parcelas !== b.parcelas) return false;
  if (Math.abs(a.totalPago - b.totalPago) <= Math.max(2, a.totalPago * 0.01)) return true;
  return false;
}

function textoIndicaQuitacaoSaldo(texto: string, novo: ContratoExtraido): boolean {
  if (novo.refinanciamento === true) return true;
  return RE_QUITACAO_SALDO.test(texto);
}

function textoIndicaLiberacaoTroco(texto: string, novo: ContratoExtraido): boolean {
  if (RE_LIBERACAO_TROCO.test(texto)) return true;
  const solicitado = novo.valorSolicitado ?? 0;
  const financiado = novo.valorFinanciado ?? 0;
  const iof = novo.iof ?? 0;
  if (solicitado <= 0 || financiado <= solicitado) return false;
  const residual = financiado - solicitado - iof;
  return residual >= 80;
}

function parcelasSemelhantes(novo: MetricasContratoComparavel, anterior: MetricasContratoComparavel): boolean {
  if (anterior.parcela <= 0) return false;
  const diff = Math.abs(novo.parcela - anterior.parcela);
  if (diff <= Math.max(2, EPS_PARCELA)) return true;
  const ratio = diff / anterior.parcela;
  return ratio <= 0.1;
}

function contratosProximosNoTempo(
  novo: MetricasContratoComparavel,
  anterior: MetricasContratoComparavel,
): boolean {
  const meses = mesesEntreDatas(novo.dataReferencia, anterior.dataReferencia);
  if (meses == null) return false;
  return meses >= MESES_MIN_PROXIMIDADE && meses <= MESES_MAX_PROXIMIDADE;
}

function avaliarParRefinanciamento(
  extraidoNovo: ContratoExtraido,
  novo: MetricasEnriquecidas,
  anterior: MetricasEnriquecidas,
  textoNovo: string,
): { sinais: SinalRefinanciamentoSucessivo[]; meses: number | null } {
  const sinais: SinalRefinanciamentoSucessivo[] = [];

  if (!bancosCompatíveisMesmoInstituicao(novo.banco, anterior.banco)) {
    return { sinais, meses: null };
  }
  if (pareceMesmoContrato(novo, anterior)) {
    return { sinais, meses: null };
  }

  sinais.push("mesmo_banco");

  const meses = mesesEntreDatas(novo.dataReferencia, anterior.dataReferencia);
  if (contratosProximosNoTempo(novo, anterior)) {
    sinais.push("contrato_proximo");
  }

  if (
    textoIndicaQuitacaoSaldo(textoNovo, extraidoNovo) ||
    novo.refinanciamento ||
    anterior.refinanciamento
  ) {
    sinais.push("quitacao_saldo_devedor");
  }

  if (textoIndicaLiberacaoTroco(textoNovo, extraidoNovo)) {
    sinais.push("liberacao_troco");
  }

  if (novo.parcelas > anterior.parcelas) {
    sinais.push("aumento_prazo");
  }

  if (parcelasSemelhantes(novo, anterior)) {
    sinais.push("parcelas_semelhantes");
  }

  return { sinais, meses };
}

function atendeCriterioRefinanciamento(sinais: SinalRefinanciamentoSucessivo[]): boolean {
  const set = new Set(sinais);
  if (!set.has("mesmo_banco")) return false;

  const secundarios: SinalRefinanciamentoSucessivo[] = [
    "contrato_proximo",
    "quitacao_saldo_devedor",
    "liberacao_troco",
    "aumento_prazo",
    "parcelas_semelhantes",
  ];
  const qtdSecundarios = secundarios.filter((s) => set.has(s)).length;

  if (set.has("contrato_proximo") && qtdSecundarios >= 3) return true;

  if (
    set.has("quitacao_saldo_devedor") &&
    set.has("aumento_prazo") &&
    (set.has("parcelas_semelhantes") || set.has("liberacao_troco"))
  ) {
    return true;
  }

  if (qtdSecundarios >= 4) return true;

  return false;
}

function rotulosSinais(sinais: SinalRefinanciamentoSucessivo[]): string {
  const map: Record<SinalRefinanciamentoSucessivo, string> = {
    mesmo_banco: "mesmo banco",
    contrato_proximo: "contratos próximos no tempo",
    quitacao_saldo_devedor: "quitação de saldo",
    liberacao_troco: "liberação de troco",
    aumento_prazo: "aumento de prazo",
    parcelas_semelhantes: "parcelas semelhantes",
  };
  return sinais.map((s) => map[s]).join(", ");
}

/**
 * Compara contrato novo com anteriores do mesmo banco e sinais de refinanciamento no OCR.
 */
export function detectarRefinanciamentoSucessivo(
  extraidoNovo: ContratoExtraido,
  fontes?: ContratosAnterioresCandidatos,
  textoBruto?: string,
): ResultadoRefinanciamentoSucessivo {
  const texto = (textoBruto ?? extraidoNovo.textoExtraido ?? "").replace(/\s+/g, " ");
  const novo = metricasEnriquecidasDeExtraido(extraidoNovo, "Contrato atual");
  if (!novo) {
    return { aplicavel: false, detectado: false, sinais: [], comparacao: null, alerta: null };
  }

  const candidatosBase = reunirMetricasContratosAnteriores(fontes ?? {});
  if (candidatosBase.length === 0 && !textoIndicaQuitacaoSaldo(texto, extraidoNovo)) {
    return { aplicavel: true, detectado: false, sinais: [], comparacao: null, alerta: null };
  }

  let melhor: {
    anterior: MetricasEnriquecidas;
    sinais: SinalRefinanciamentoSucessivo[];
    meses: number | null;
  } | null = null;

  for (const ev of fontes?.evidencias ?? []) {
    if (fontes?.excluirEvidenciaId && ev.id === fontes.excluirEvidenciaId) continue;
    const ex = ev.contrato_extraido;
    if (!ex) continue;
    const antBase = metricasComparacaoDeExtraido(
      ex,
      ev.nome_arquivo?.slice(0, 60) || "Evidência",
    );
    if (!antBase) continue;
    const ant: MetricasEnriquecidas = {
      ...enriquecerMetricas(antBase, ex),
      dataReferencia: antBase.dataReferencia ?? ev.data_documento ?? ev.created_at ?? null,
    };
    const { sinais, meses } = avaliarParRefinanciamento(extraidoNovo, novo, ant, texto);
    if (!atendeCriterioRefinanciamento(sinais)) continue;
    if (!melhor || sinais.length > melhor.sinais.length) {
      melhor = { anterior: ant, sinais, meses };
    }
  }

  for (const ex of fontes?.extraidos ?? []) {
    const ant = metricasEnriquecidasDeExtraido(ex, "Contrato anterior");
    if (!ant) continue;
    const { sinais, meses } = avaliarParRefinanciamento(extraidoNovo, novo, ant, texto);
    if (!atendeCriterioRefinanciamento(sinais)) continue;
    if (!melhor || sinais.length > melhor.sinais.length) {
      melhor = { anterior: ant, sinais, meses };
    }
  }

  for (const loan of fontes?.loans ?? []) {
    const antBase = metricasComparacaoDeExtraido(
      {
        banco: loan.institution_name ?? loan.description,
        parcela: loan.installment_amount,
        parcelas: loan.total_installments,
        valorTotalPago:
          loan.total_pago_detectado ??
          loan.installment_amount * loan.total_installments,
        dataContratacao: loan.start_date ?? undefined,
      },
      loan.description?.slice(0, 60) || "Cadastro",
    );
    if (!antBase) continue;
    const ant = enriquecerMetricas(antBase, {
      banco: loan.institution_name ?? loan.description,
      parcela: loan.installment_amount,
      parcelas: loan.total_installments,
    });
    const { sinais, meses } = avaliarParRefinanciamento(extraidoNovo, novo, ant, texto);
    if (!atendeCriterioRefinanciamento(sinais)) continue;
    if (!melhor || sinais.length > melhor.sinais.length) {
      melhor = { anterior: ant, sinais, meses };
    }
  }

  if (!melhor) {
    const sinaisSolo: SinalRefinanciamentoSucessivo[] = [];
    if (textoIndicaQuitacaoSaldo(texto, extraidoNovo) && extraidoNovo.refinanciamento) {
      sinaisSolo.push("quitacao_saldo_devedor");
    }
    return {
      aplicavel: true,
      detectado: false,
      sinais: sinaisSolo,
      comparacao: null,
      alerta: null,
    };
  }

  const { anterior, sinais, meses } = melhor;
  const comparacao: ComparacaoRefinanciamentoSucessivo = {
    banco: novo.bancoNormalizado,
    rotulo_contrato_anterior: anterior.rotulo,
    parcela_nova: novo.parcela,
    parcela_anterior: anterior.parcela,
    prazo_novo: novo.parcelas,
    prazo_anterior: anterior.parcelas,
    total_pago_novo: novo.totalPago,
    total_pago_anterior: anterior.totalPago,
    meses_entre_contratos: meses,
  };

  const severidade: "atencao" | "alto" =
    sinais.length >= 5 || (sinais.includes("aumento_prazo") && sinais.includes("quitacao_saldo_devedor"))
      ? "alto"
      : "atencao";

  return {
    aplicavel: true,
    detectado: true,
    sinais,
    comparacao,
    alerta: {
      codigo: "refinanciamento_sucessivo_identificado",
      titulo: ALERTA_REFINANCIAMENTO_SUCESSIVO,
      mensagem: `${ALERTA_REFINANCIAMENTO_SUCESSIVO} ${novo.bancoNormalizado} — ${rotulosSinais(sinais)}. Parcela ${fmtBrl(novo.parcela)} (antes ${fmtBrl(anterior.parcela)}), prazo ${novo.parcelas}× (antes ${anterior.parcelas}×). Ref.: ${anterior.rotulo}.`,
      severidade,
    },
  };
}
