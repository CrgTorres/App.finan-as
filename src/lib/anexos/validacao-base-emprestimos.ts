/**
 * Validação da base de empréstimos inferidos — preparação para análise (financeira/jurídica),
 * sem alterar parsers, classificações nem dados brutos. Apenas leitura de estruturas já existentes.
 */

import type { ItemContrachequeAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import {
  itemIndicaPossivelEmprestimoConsignado,
  type EmprestimoContratoAnalise,
} from "@/lib/anexos/analise-financeira-contracheque-padroes";
import type { ConsolidacaoLogicaEmprestimosResultado } from "@/lib/anexos/consolidacao-logica-emprestimos";
import { contarContratosSemTipoEvidencia } from "@/lib/anexos/evidencias-emprestimos";
import type { Loan, Payslip } from "@/types/contracheque";
import type { Transaction } from "@/types";
import { transactionIsExtratoImport } from "@/lib/utils/transaction-source";
import type { LoanEvidence } from "@/types/loan-evidence";

export type StatusBaseEmprestimos =
  | "incompleta"
  | "em revisão"
  | "consistente para análise financeira"
  | "consistente para análise jurídica preliminar";

export type StatusItemChecklistBase = "ok" | "parcial" | "pendente";

export type ItemChecklistFinalBase = {
  id: string;
  label: string;
  status: StatusItemChecklistBase;
  detalhe?: string;
};

export type PainelQualidadeBaseEmprestimos = {
  totalRubricasEmprestimoDetectadas: number;
  totalContratosInferidos: number;
  totalContratosConsolidados: number;
  contratosComBaixaConfianca: number;
  contratosComPossivelDuplicidade: number;
  /**
   * Pares de linhas inferidas com hipótese analítica de refin (possível + provável).
   * Não implica fusão nem confirmação — ver também triagem «É refinanciamento».
   */
  contratosComPossivelRefinanciamento: number;
  suspeitasRefinanciamentoPossivel: number;
  suspeitasRefinanciamentoProvavel: number;
  /** Contagem da triagem «É refinanciamento»; atualizada em merge com snapshot de pendências. */
  refinanciamentosConfirmadosTriagem: number;
  contratosComMesesFaltantes: number;
  contratosComParcelaForaDeSequencia: number;
  contratosSemTotalDeParcelas: number;
  /** Contratos inferidos sem evidência anexada deste tipo na tabela `loan_evidences` (ou sem loan correspondente). */
  contratosSemContratoFormalAnexado: number;
  contratosSemExtratoBancarioCorrespondenteVerificado: number;
  contratosSemAutorizacaoDeDescontoRastreada: number;
};

export type ValidacaoBaseEmprestimosResultado = {
  painel: PainelQualidadeBaseEmprestimos;
  checklistFinal: ItemChecklistFinalBase[];
  statusBase: StatusBaseEmprestimos;
  /** Texto curto explicando o status (sem conclusão jurídica). */
  resumoStatus: string;
};

const RE_PARCELA_FORA_SEQUENCIA =
  /quebra|sequ(ê|e)ncia|at[ií]pica|incoerente|parcelas?\s+em\s+relac?/i;

function observacoesIndicamParcelaForaSequencia(c: EmprestimoContratoAnalise): boolean {
  return c.observacoes.some((o) => RE_PARCELA_FORA_SEQUENCIA.test(o));
}

function contarCompetenciasPayslips(rows: Payslip[]): number {
  const s = new Set<string>();
  for (const p of rows) {
    s.add(`${p.year}-${String(p.month).padStart(2, "0")}`);
  }
  return s.size;
}

function checklistItem(
  id: string,
  label: string,
  status: StatusItemChecklistBase,
  detalhe?: string,
): ItemChecklistFinalBase {
  return detalhe ? { id, label, status, detalhe } : { id, label, status };
}

function resolverStatusBase(args: {
  painel: PainelQualidadeBaseEmprestimos;
  checklist: ItemChecklistFinalBase[];
  temAlgumaFolha: boolean;
  temRubricasEmprestimo: boolean;
  temExtratoDisponivel: boolean;
}): { status: StatusBaseEmprestimos; resumo: string } {
  const { painel, checklist, temAlgumaFolha, temRubricasEmprestimo, temExtratoDisponivel } = args;

  if (!temAlgumaFolha || !temRubricasEmprestimo) {
    return {
      status: "incompleta",
      resumo:
        "Importe ficha financeira e/ou contracheques e garanta rubricas classificadas como empréstimo para consolidar a base.",
    };
  }

  const gapsPainel =
    painel.contratosComMesesFaltantes +
    painel.contratosComParcelaForaDeSequencia +
    painel.contratosComBaixaConfianca +
    painel.contratosComPossivelDuplicidade +
    painel.contratosSemTotalDeParcelas;

  const parcelasOk = checklist.find((c) => c.id === "parcelas_conferidas")?.status === "ok";
  const duplicOk = checklist.find((c) => c.id === "duplicidades_revisadas")?.status === "ok";
  const fichaSt = checklist.find((c) => c.id === "ficha_financeira")?.status;
  const mensalSt = checklist.find((c) => c.id === "contracheques_mensais")?.status;

  if (
    gapsPainel > 0 ||
    painel.contratosComPossivelRefinanciamento > 0 ||
    !parcelasOk ||
    !duplicOk ||
    fichaSt === "pendente" ||
    mensalSt === "pendente"
  ) {
    return {
      status: "em revisão",
      resumo:
        "Há lacunas na folha, sinais de inconsistência, duplicidade possível ou conferências pendentes. Nada aqui conclui matéria jurídica.",
    };
  }

  if (!temExtratoDisponivel || mensalSt !== "ok") {
    return {
      status: "consistente para análise financeira",
      resumo:
        "Leitura financeira das rubricas inferidas está alinhada. Importe/registe extratos bancários e complete meses de contracheque para elevar o nível de suporte documental — sem conclusão jurídica.",
    };
  }

  return {
    status: "consistente para análise jurídica preliminar",
    resumo:
      "Folha, rubricas e movimentação de extrato disponíveis para primeira triagem com profissional. Contratos físicos, autorizações, quitações e decisões continuam em checklist como pendências típicas — sem juízo automático sobre abuso ou cobrança.",
  };
}

export function gerarValidacaoBaseEmprestimos(
  itensAnalise: ItemContrachequeAnalise[],
  emprestimosPorContrato: EmprestimoContratoAnalise[],
  consolidacao: ConsolidacaoLogicaEmprestimosResultado,
  payslips: Payslip[],
  transactions: Transaction[] = [],
  evidencias: LoanEvidence[] = [],
  loans: Loan[] = [],
): ValidacaoBaseEmprestimosResultado {
  const totalRubricasEmprestimoDetectadas =
    itensAnalise.length > 0
      ? itensAnalise.filter((it) => itemIndicaPossivelEmprestimoConsignado(it)).length
      : emprestimosPorContrato.reduce((s, c) => s + c.quantidadeAparicoes, 0);

  const nInf = emprestimosPorContrato.length;
  const grupos = consolidacao.grupos;

  const suspeitas = consolidacao.suspeitasRefinanciamento ?? [];
  const suspeitasRefinanciamentoPossivel = suspeitas.filter((s) => s.nivel === "possivel").length;
  const suspeitasRefinanciamentoProvavel = suspeitas.filter((s) => s.nivel === "provavel").length;
  const contratosComPossivelRefinanciamento = suspeitas.length;

  const contratosComBaixaConfianca = grupos.filter(
    (g) => g.nivelConfianca === "baixo" || g.scoreConfianca < 55,
  ).length;

  const contratosComPossivelDuplicidade = grupos.filter(
    (g) => g.tipoConsolidacao === "possivel_mesmo_contrato",
  ).length;

  const contratosComMesesFaltantes = emprestimosPorContrato.filter(
    (c) => c.mesesFaltantesProvaveis.length > 0,
  ).length;

  const contratosComParcelaForaDeSequencia = emprestimosPorContrato.filter(
    observacoesIndicamParcelaForaSequencia,
  ).length;

  const contratosSemTotalDeParcelas = emprestimosPorContrato.filter(
    (c) => c.tipoContrato === "parcelado" && (c.totalParcelas == null || c.totalParcelas < 2),
  ).length;

  const temExtratoDisponivel =
    transactions.some((t) => transactionIsExtratoImport(t)) ||
    evidencias.some((e) => e.tipo_evidencia === "extrato_bancario");

  const contratosSemContratoFormalAnexado = contarContratosSemTipoEvidencia(
    emprestimosPorContrato,
    loans,
    evidencias,
    "contrato_formal",
  );
  const contratosSemExtratoBancarioCorrespondenteVerificado = contarContratosSemTipoEvidencia(
    emprestimosPorContrato,
    loans,
    evidencias,
    "extrato_bancario",
  );
  const contratosSemAutorizacaoDeDescontoRastreada = contarContratosSemTipoEvidencia(
    emprestimosPorContrato,
    loans,
    evidencias,
    "autorizacao_desconto",
  );

  const semComprovanteQuitacao = contarContratosSemTipoEvidencia(
    emprestimosPorContrato,
    loans,
    evidencias,
    "comprovante_quitacao",
  );
  const semDecisaoJudicial = contarContratosSemTipoEvidencia(
    emprestimosPorContrato,
    loans,
    evidencias,
    "decisao_judicial",
  );
  const semEvidenciaTaxaSeguro = contarContratosSemTipoEvidencia(
    emprestimosPorContrato,
    loans,
    evidencias,
    "taxa_seguro",
  );

  const algumaEvidenciaTaxaSeguroGlobal = evidencias.some((e) => e.tipo_evidencia === "taxa_seguro");

  const painel: PainelQualidadeBaseEmprestimos = {
    totalRubricasEmprestimoDetectadas,
    totalContratosInferidos: nInf,
    totalContratosConsolidados: grupos.length,
    contratosComBaixaConfianca,
    contratosComPossivelDuplicidade,
    contratosComPossivelRefinanciamento,
    suspeitasRefinanciamentoPossivel,
    suspeitasRefinanciamentoProvavel,
    refinanciamentosConfirmadosTriagem: 0,
    contratosComMesesFaltantes,
    contratosComParcelaForaDeSequencia,
    contratosSemTotalDeParcelas,
    contratosSemContratoFormalAnexado,
    contratosSemExtratoBancarioCorrespondenteVerificado,
    contratosSemAutorizacaoDeDescontoRastreada,
  };

  const fichas = payslips.filter((p) => p.document_kind === "ficha_financeira").length;
  const mensais = payslips.filter(
    (p) => !p.document_kind || p.document_kind === "contracheque_mensal",
  ).length;
  const comps = contarCompetenciasPayslips(payslips);

  const checklistFinal: ItemChecklistFinalBase[] = [
    checklistItem(
      "ficha_financeira",
      "Ficha financeira completa importada?",
      fichas >= 1 ? (comps >= 6 ? "ok" : "parcial") : "pendente",
      fichas >= 1
        ? `${fichas} ficha(s); ${comps} competências distintas na base de folhas.`
        : "Nenhuma ficha financeira etiquetada como tal.",
    ),
    checklistItem(
      "contracheques_mensais",
      "Contracheques mensais completos?",
      mensais >= 3 ? "ok" : mensais >= 1 ? "parcial" : "pendente",
      `${mensais} anexo(s) de contracheque/mensal (ou sem tipo); ${comps} competência(s).`,
    ),
    checklistItem(
      "contratos_anexados",
      "Contratos anexados?",
      nInf === 0
        ? "ok"
        : contratosSemContratoFormalAnexado === 0
          ? "ok"
          : contratosSemContratoFormalAnexado === nInf
            ? "pendente"
            : "parcial",
      nInf === 0
        ? "Sem contratos inferidos."
        : `${nInf - contratosSemContratoFormalAnexado}/${nInf} com evidência «contrato formal» em loan_evidences.`,
    ),
    checklistItem(
      "extratos_bancarios",
      "Extratos bancários anexados?",
      nInf === 0
        ? "ok"
        : contratosSemExtratoBancarioCorrespondenteVerificado === 0
          ? "ok"
          : contratosSemExtratoBancarioCorrespondenteVerificado < nInf ||
              transactions.some((t) => transactionIsExtratoImport(t))
            ? "parcial"
            : "pendente",
      nInf === 0
        ? "Sem contratos inferidos."
        : `${nInf - contratosSemExtratoBancarioCorrespondenteVerificado}/${nInf} com evidência «extrato bancário»; transações de extrato: ${transactions.some((t) => transactionIsExtratoImport(t)) ? "sim" : "não"}.`,
    ),
    checklistItem(
      "comprovantes_quitacao",
      "Comprovantes de quitação anexados?",
      nInf === 0
        ? "ok"
        : semComprovanteQuitacao === 0
          ? "ok"
          : semComprovanteQuitacao === nInf
            ? "pendente"
            : "parcial",
      nInf === 0
        ? "—"
      : `${nInf - semComprovanteQuitacao}/${nInf} com evidência de quitação.`,
    ),
    checklistItem(
      "decisoes_judiciais",
      "Decisões judiciais anexadas?",
      nInf === 0
        ? "ok"
        : semDecisaoJudicial === 0
          ? "ok"
          : semDecisaoJudicial === nInf
            ? "pendente"
            : "parcial",
      nInf === 0
        ? "—"
      : `${nInf - semDecisaoJudicial}/${nInf} com evidência «decisão judicial».`,
    ),
    checklistItem(
      "taxas_seguros",
      "Taxas/seguros identificados?",
      (() => {
        const heuristicaDesc = emprestimosPorContrato.some((c) =>
          /segur|tarifa|tac|iof|cet|custo|tir/i.test(c.descricao),
        );
        if (nInf === 0) return "ok";
        if (semEvidenciaTaxaSeguro === 0) return "ok";
        if (algumaEvidenciaTaxaSeguroGlobal || heuristicaDesc) return "parcial";
        return "pendente";
      })(),
      `${algumaEvidenciaTaxaSeguroGlobal ? "Há anexo «taxa/seguro». " : ""}Heurística em texto de rubrica como complemento.`,
    ),
    checklistItem(
      "margem_consignavel",
      "Margem consignável demonstrada?",
      fichas >= 1 || mensais >= 1 ? "parcial" : "pendente",
      "Use ficha/contracheque importados; não há cálculo automático de margem livre aqui.",
    ),
    checklistItem(
      "parcelas_conferidas",
      "Parcelas conferidas?",
      contratosComMesesFaltantes + contratosComParcelaForaDeSequencia + contratosSemTotalDeParcelas === 0
        ? "ok"
        : "pendente",
      "Conferir sequência e totais nas rubricas inferidas.",
    ),
    checklistItem(
      "duplicidades_revisadas",
      "Duplicidades revisadas?",
      contratosComPossivelDuplicidade === 0 && contratosComBaixaConfianca === 0 ? "ok" : "pendente",
      "Inclui grupos consolidados com tipo «possível mesmo contrato» ou confiança baixa.",
    ),
    checklistItem(
      "autorizacao_desconto",
      "Autorização de desconto (evidência) reunida?",
      nInf === 0
        ? "ok"
        : contratosSemAutorizacaoDeDescontoRastreada === 0
          ? "ok"
          : contratosSemAutorizacaoDeDescontoRastreada === nInf
            ? "pendente"
            : "parcial",
      nInf === 0
        ? "—"
        : `${nInf - contratosSemAutorizacaoDeDescontoRastreada}/${nInf} com evidência de autorização.`,
    ),
  ];

  const { status, resumo } = resolverStatusBase({
    painel,
    checklist: checklistFinal,
    temAlgumaFolha: payslips.length > 0,
    temRubricasEmprestimo: totalRubricasEmprestimoDetectadas > 0,
    temExtratoDisponivel,
  });

  return {
    painel,
    checklistFinal,
    statusBase: status,
    resumoStatus: resumo,
  };
}

export const validacaoBaseEmprestimos = {
  gerar: gerarValidacaoBaseEmprestimos,
};
