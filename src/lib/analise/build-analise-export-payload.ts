import type { Transaction } from "@/types";
import type { Loan } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import type { MonthlyComparisonRow } from "@/components/dashboard/monthly-comparison-chart";
import type { AnaliseNormalizadaSnapshot } from "@/lib/analise/build-analise-normalizada-snapshot";
import { ANALISE_SNAPSHOT_VERSION } from "@/lib/analise/build-analise-normalizada-snapshot";
import { montarSubtituloParcelaContrato } from "@/lib/contracheque/canonicalizar-contrato";
import { normalizarInstituicaoLogica } from "@/lib/anexos/consolidacao-logica-emprestimos";

export const ANALISE_EXPORT_PAYLOAD_VERSION = 1 as const;

export type AnaliseExportContratoRow = {
  codigo_folha: string;
  instituicao: string;
  descricao_padronizada: string;
  familia_produto: string;
  valor_parcela: number | null;
  parcela_atual: number | null;
  parcela_total: number | null;
  faixa_parcelas: string;
  total_pago: number;
  saldo_estimado: number | null;
  status: string;
  risco: string;
  primeira_competencia: string;
  ultima_competencia: string;
  qtd_competencias: number;
  variantes_ocr: number;
  textos_ocr_brutos: string;
};

export type AnaliseExportResumoMensalRow = {
  competencia: string;
  ganhos: number;
  descontos: number;
  emprestimos: number;
  liquido: number;
  pct_emprestimo_ganhos: number | null;
  pct_desconto_ganhos: number | null;
  contratos_simultaneos: number;
};

export type AnaliseExportSerieEmprestimosRow = {
  competencia: string;
  total_emprestimos: number;
  total_exc_ir_amazon: number;
  outros_nao_emprestimo: number;
};

export type AnaliseExportGraficoAnoRow = {
  ano: number;
  total_emprestimos: number;
};

export type AnaliseExportAlertaRow = {
  id: string;
  nivel: string;
  titulo: string;
  detalhe: string;
};

export type AnaliseExportEvidenciaRow = {
  id: string;
  loan_id: string | null;
  tipo: string;
  titulo: string | null;
  created_at: string;
};

export type AnaliseExportPayload = {
  version: typeof ANALISE_EXPORT_PAYLOAD_VERSION;
  snapshotVersion: typeof ANALISE_SNAPSHOT_VERSION;
  exportedAt: string;
  periodoOverview: string;
  meta: {
    competenciasProcessadas: number;
    nContratosCanonico: number;
    nContratosPainelEmprestimos: number;
  };
  contratos: AnaliseExportContratoRow[];
  resumoMensalContracheque: AnaliseExportResumoMensalRow[];
  serieEmprestimosMensal: AnaliseExportSerieEmprestimosRow[];
  graficos: {
    emprestimosPorAno: AnaliseExportGraficoAnoRow[];
    comprometimentoMensalPct: Array<{ competencia: string; pct_emprestimo_ganhos: number }>;
    instituicoesRecorrentes: Array<{ instituicao: string; aparicoes: number; valor_total: number }>;
  };
  alertas: AnaliseExportAlertaRow[];
  pendencias: string[];
  evidencias: AnaliseExportEvidenciaRow[];
  overviewTransacoes: Array<{
    descricao: string;
    valor: number;
    data: string;
    tipo: string;
    categoria: string;
  }>;
};

function familiaProdutoExport(descricao: string): string {
  const u = descricao.toUpperCase();
  if (/\bCART|RCC|RMC\b/.test(u)) return "cartao";
  if (/\bSAQUE|CREDCESTA|CRED\s*CESTA|MILICRED/i.test(u)) return "saque_credcesta";
  if (/\bEMPREST|\bEMP\b|BB\s*[- ]?\s*EMP/i.test(u)) return "emprestimo";
  return "outros";
}

function csvEscapeCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function formatarNumeroCsvBr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

export function linhasParaCsv(headers: string[], rows: (string | number | null)[][]): string {
  const head = headers.map(csvEscapeCell).join(";");
  const body = rows.map((r) => r.map((c) => csvEscapeCell(c)).join(";"));
  return [head, ...body].join("\n");
}

export function buildAnaliseExportPayload(input: {
  snapshot: AnaliseNormalizadaSnapshot;
  periodoOverview: string;
  overviewRows?: MonthlyComparisonRow[];
  transactions?: Transaction[];
  loanEvidencias?: LoanEvidence[];
  loans?: Loan[];
}): AnaliseExportPayload {
  const { snapshot, periodoOverview, transactions = [], loanEvidencias = [] } = input;
  const res = snapshot.resultadoContracheque;
  const padroes = snapshot.padroesParaGraficos;

  const contratos: AnaliseExportContratoRow[] = snapshot.linhasContratos.map((linha) => {
    const c = linha.contrato;
    const faixa =
      c.parcelaInicialDetectada != null &&
      c.parcelaFinalDetectada != null &&
      c.totalParcelas
        ? `${String(c.parcelaInicialDetectada).padStart(2, "0")}-${String(c.parcelaFinalDetectada).padStart(2, "0")}/${c.totalParcelas}`
        : c.tipoContrato === "recorrente_01_01"
          ? "01/01"
          : montarSubtituloParcelaContrato(c) ?? "";
    return {
      codigo_folha: c.codigo || "",
      instituicao: c.instituicaoDetectada ?? normalizarInstituicaoLogica(c),
      descricao_padronizada: linha.titulo,
      familia_produto: familiaProdutoExport(c.descricao),
      valor_parcela: c.valorParcela,
      parcela_atual: c.parcelaFinalDetectada ?? c.parcelaInicialDetectada,
      parcela_total: c.totalParcelas,
      faixa_parcelas: faixa,
      total_pago: c.totalPago,
      saldo_estimado: c.saldoEstimado,
      status: c.status,
      risco: c.risco,
      primeira_competencia: c.primeiraAparicao,
      ultima_competencia: c.ultimaAparicao,
      qtd_competencias: c.quantidadeAparicoes,
      variantes_ocr: linha.origensOCRBruta.length,
      textos_ocr_brutos: linha.origensOCRBruta.join(" | "),
    };
  });

  const resumoMensalContracheque: AnaliseExportResumoMensalRow[] =
    padroes?.porMes.map((m) => ({
      competencia: m.competencia,
      ganhos: m.ganhos,
      descontos: m.descontos,
      emprestimos: m.emprestimos,
      liquido: m.liquido,
      pct_emprestimo_ganhos: m.pctEmprestimoGanhos,
      pct_desconto_ganhos: m.pctDescontoGanhos,
      contratos_simultaneos: m.contratosSimultaneos,
    })) ?? [];

  const serieEmprestimosMensal: AnaliseExportSerieEmprestimosRow[] =
    snapshot.emprestimosAnalise.serieMensalTotal.map((s) => ({
      competencia: s.key,
      total_emprestimos: s.total,
      total_exc_ir_amazon: s.totalExcIrAmazon,
      outros_nao_emprestimo: s.outrosNaoEmprestimo,
    }));

  const alertas: AnaliseExportAlertaRow[] =
    res?.alertas.map((a) => ({
      id: a.id,
      nivel: a.nivel,
      titulo: a.titulo,
      detalhe: a.detalhe,
    })) ?? [];

  const evidencias: AnaliseExportEvidenciaRow[] = loanEvidencias.map((e) => ({
    id: e.id,
    loan_id: e.loan_id,
    tipo: e.tipo_evidencia,
    titulo: e.nome_arquivo ?? null,
    created_at: e.created_at,
  }));

  return {
    version: ANALISE_EXPORT_PAYLOAD_VERSION,
    snapshotVersion: ANALISE_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    periodoOverview,
    meta: {
      competenciasProcessadas: snapshot.emprestimosAnalise.competenciasProcessadas,
      nContratosCanonico: snapshot.contratosCanonico.length,
      nContratosPainelEmprestimos: snapshot.emprestimosAnalise.kpis.nContratosDistintos,
    },
    contratos,
    resumoMensalContracheque,
    serieEmprestimosMensal,
    graficos: {
      emprestimosPorAno:
        padroes?.evolucaoAnualEmprestimos.map((a) => ({
          ano: a.ano,
          total_emprestimos: a.total,
        })) ?? [],
      comprometimentoMensalPct:
        padroes?.porMes
          .filter((m) => m.pctEmprestimoGanhos != null)
          .map((m) => ({
            competencia: m.competencia,
            pct_emprestimo_ganhos: m.pctEmprestimoGanhos ?? 0,
          })) ?? [],
      instituicoesRecorrentes:
        padroes?.instituicoesMaisRecorrentes.map((i) => ({
          instituicao: i.nome,
          aparicoes: i.aparicoes,
          valor_total: i.valorTotalSomado,
        })) ?? [],
    },
    alertas,
    pendencias: snapshot.emprestimosAnalise.pendencias,
    evidencias,
    overviewTransacoes: transactions.map((t) => ({
      descricao: t.description,
      valor: t.amount,
      data: String(t.date),
      tipo: t.type,
      categoria: t.category,
    })),
  };
}
