import { adicionarMesesIso, formatarIsoPtBr } from "@/lib/contratos/datas-texto-br";
import {
  pvFinanciamentoPrestacoesFixas,
  taxaMensalImplicitaFinanciamentoPrestacoesFixas,
} from "@/services/contratos/bcb-calculadora-cidadao-financiamento";
import type { ContratoExtraido } from "@/types/contrato-extraido";

export type ParcelaCronograma = {
  numero: number;
  vencimentoIso: string;
  vencimentoBr: string;
  valor: number;
};

export type ResumoQuitacaoAntecipada = {
  parcelasRestantes: number;
  valorPresente: number;
  taxaMensalPctUsada: number;
  fonteTaxa: string;
};

export type CronogramaContratoExtraido = {
  dataDocumento?: string;
  dataDocumentoBr?: string;
  primeiroVencimento: string;
  ultimoVencimento: string;
  parcelas: ParcelaCronograma[];
  totalParcelas: number;
  valorParcela: number;
  totalNominal: number;
  parcelasPagasAssumidas: number;
  quitacao: ResumoQuitacaoAntecipada;
  quitacaoAposTodasPagas: number;
  coerenteComDocumento: boolean;
  avisos: string[];
};

function taxaMensalDecimalParaQuitacao(e: ContratoExtraido): { j: number; fonte: string } | null {
  if (e.jurosEfetivoMensal != null && e.jurosEfetivoMensal > 0) {
    return { j: e.jurosEfetivoMensal / 100, fonte: "taxa efetiva (E.4)" };
  }
  if (e.jurosMensal != null && e.jurosMensal > 0) {
    return { j: e.jurosMensal / 100, fonte: "taxa nominal (E.4)" };
  }
  if (e.cetMensal != null && e.cetMensal > 0) {
    return { j: e.cetMensal / 100, fonte: "CET mensal (E.5)" };
  }
  const principal = Math.max(e.valorFinanciado ?? 0, e.valorSolicitado ?? 0);
  if (e.parcela != null && e.parcelas != null && principal > 0) {
    const impl = taxaMensalImplicitaFinanciamentoPrestacoesFixas(principal, e.parcela, e.parcelas);
    if (impl != null) {
      return { j: impl, fonte: "taxa implícita (modelo BCB prestações fixas)" };
    }
  }
  return null;
}

/**
 * Gera cronograma mensal da 1ª à última parcela e estimativa de quitação antecipada (valor presente).
 */
export function gerarCronogramaContratoExtraido(
  e: ContratoExtraido,
  opts?: { parcelasPagas?: number },
): CronogramaContratoExtraido | null {
  const n = e.parcelas != null ? Math.round(e.parcelas) : 0;
  const valor = e.parcela ?? 0;
  const primeiro = e.primeiroVencimento;
  if (n < 1 || valor <= 0 || !primeiro?.match(/^\d{4}-\d{2}-\d{2}/)) return null;

  const pagas = Math.max(0, Math.min(opts?.parcelasPagas ?? 0, n));
  const avisos: string[] = [];

  let ultimo = e.ultimoVencimento;
  if (!ultimo?.match(/^\d{4}-\d{2}-\d{2}/)) {
    ultimo = adicionarMesesIso(primeiro, n - 1);
    avisos.push("Último vencimento calculado a partir do 1º vencimento e do número de parcelas.");
  }

  const ultimoCalc = adicionarMesesIso(primeiro, n - 1);
  const coerenteComDocumento =
    !e.ultimoVencimento || Math.abs(ordIso(ultimo) - ordIso(ultimoCalc)) <= 35;

  if (e.ultimoVencimento && !coerenteComDocumento) {
    avisos.push(
      `Último vencimento no OCR (${formatarIsoPtBr(e.ultimoVencimento)}) difere do esperado (${formatarIsoPtBr(ultimoCalc)}) — confira sec. E.2.`,
    );
  }

  const parcelas: ParcelaCronograma[] = [];
  for (let i = 0; i < n; i++) {
    const iso = i === n - 1 && e.ultimoVencimento ? ultimo : adicionarMesesIso(primeiro, i);
    parcelas.push({
      numero: i + 1,
      vencimentoIso: iso,
      vencimentoBr: formatarIsoPtBr(iso),
      valor: Math.round(valor * 100) / 100,
    });
  }
  if (e.ultimoVencimento && parcelas.length > 0) {
    parcelas[parcelas.length - 1]!.vencimentoIso = ultimo;
    parcelas[parcelas.length - 1]!.vencimentoBr = formatarIsoPtBr(ultimo);
  }

  const restantes = Math.max(0, n - pagas);
  const taxa = taxaMensalDecimalParaQuitacao(e);
  let quitacao: ResumoQuitacaoAntecipada;
  if (taxa && restantes > 0) {
    const vp = pvFinanciamentoPrestacoesFixas(valor, taxa.j, restantes);
    quitacao = {
      parcelasRestantes: restantes,
      valorPresente: Math.round(vp * 100) / 100,
      taxaMensalPctUsada: Math.round(taxa.j * 10000) / 100,
      fonteTaxa: taxa.fonte,
    };
  } else {
    quitacao = {
      parcelasRestantes: restantes,
      valorPresente: Math.round(valor * restantes * 100) / 100,
      taxaMensalPctUsada: 0,
      fonteTaxa: "somatório nominal (sem taxa no documento)",
    };
    if (!taxa) {
      avisos.push("Sem taxa mensal no OCR — quitação antecipada mostrada como parcelas × valor (sem desconto financeiro).");
    }
  }

  return {
    dataDocumento: e.dataDocumento,
    dataDocumentoBr: e.dataDocumento ? formatarIsoPtBr(e.dataDocumento) : undefined,
    primeiroVencimento: primeiro,
    ultimoVencimento: ultimo,
    parcelas,
    totalParcelas: n,
    valorParcela: valor,
    totalNominal: Math.round(valor * n * 100) / 100,
    parcelasPagasAssumidas: pagas,
    quitacao,
    quitacaoAposTodasPagas: 0,
    coerenteComDocumento,
    avisos,
  };
}

function ordIso(iso: string): number {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 0;
  return parseInt(m[1]!, 10) * 10000 + parseInt(m[2]!, 10) * 100 + parseInt(m[3]!, 10);
}
