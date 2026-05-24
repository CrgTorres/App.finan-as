import type { Payslip } from "@/types/contracheque";
import type {
  AnaliseFinanceiraContrachequeResultado,
  ItemContrachequeAnalise,
} from "@/lib/anexos/analise-financeira-contracheque-padroes";
import type { EmprestimosAnaliseFromPayslips } from "@/lib/anexos/emprestimos-analise-from-payslips";
import {
  buildEmprestimosAnaliseFromFolhaPreparada,
  prepararFolhaParaAnaliseGrafico,
} from "@/lib/anexos/emprestimos-analise-from-payslips";
import { filtrarPayslipsAnaliseSemAdiantamentoParcial130 } from "@/lib/anexos/decimo-terceiro-coerencia";
import {
  converterPayslipsParaItensAnalise,
  gerarAnaliseFinanceiraContracheque,
} from "@/lib/anexos/analise-financeira-contracheque-padroes";
import {
  deduplicarContratosParaApresentacao,
  type ContratoLinhaApresentacao,
} from "@/lib/contracheque/canonicalizar-contrato";
import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import type { PadroesConsumoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { ajustarPadroesComContratosCanonicos } from "@/lib/analise/ajustar-padroes-contratos-canonicos";

export const ANALISE_SNAPSHOT_VERSION = 1 as const;

export type AnaliseNormalizadaSnapshot = {
  version: typeof ANALISE_SNAPSHOT_VERSION;
  payslipsFolha: Payslip[];
  itensContracheque: ItemContrachequeAnalise[];
  emprestimosAnalise: EmprestimosAnaliseFromPayslips;
  resultadoContracheque: AnaliseFinanceiraContrachequeResultado | null;
  contratosCanonico: EmprestimoContratoAnalise[];
  linhasContratos: ContratoLinhaApresentacao[];
  padroesParaGraficos: PadroesConsumoAnalise | null;
};

/** Pipeline único: folha merged → empréstimos → análise → contratos canônicos → padrões para gráficos. */
export function buildAnaliseNormalizadaSnapshot(payslips: Payslip[]): AnaliseNormalizadaSnapshot {
  const payslipsFiltrados = filtrarPayslipsAnaliseSemAdiantamentoParcial130(payslips);
  const payslipsFolha = prepararFolhaParaAnaliseGrafico(payslips);
  const emprestimosAnalise = buildEmprestimosAnaliseFromFolhaPreparada(payslipsFolha, {
    nAdiantamentosParciaisIgnorados: payslips.length - payslipsFiltrados.length,
    payslipsFiltrados,
  });

  const itens = converterPayslipsParaItensAnalise(payslipsFolha);
  const resultadoContracheque =
    itens.length > 0 ? gerarAnaliseFinanceiraContracheque(itens) : null;

  const linhasContratos = deduplicarContratosParaApresentacao(
    resultadoContracheque?.emprestimosPorContrato ?? [],
  );
  const contratosCanonico = linhasContratos.map((l) => l.contrato);

  const padroesParaGraficos = resultadoContracheque
    ? ajustarPadroesComContratosCanonicos(
        resultadoContracheque.padroesConsumo,
        contratosCanonico,
      )
    : null;

  return {
    version: ANALISE_SNAPSHOT_VERSION,
    payslipsFolha,
    itensContracheque: itens,
    emprestimosAnalise,
    resultadoContracheque,
    contratosCanonico,
    linhasContratos,
    padroesParaGraficos,
  };
}
