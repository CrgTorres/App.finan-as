import type {
  BaseConsignacoesGoverno,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import type {
  ConsigfacilAjusteBase,
  ConsigfacilCampoAjustavel,
  ConsigfacilConfirmacao,
  ConsigfacilContrato,
  FonteCanonicaFinanceira,
} from "@/types/consigfacil";
import { confirmacaoVazia } from "@/types/consigfacil";
import type { Loan } from "@/types/contracheque";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import {
  conciliarContratoConsigfacilComBaseConciliada,
  conciliarContratoConsigfacilComLoans,
  type ResultadoConciliacaoConsigfacil,
} from "@/lib/consignacoes-governo/conciliar-consigfacil-emprestimos";
import {
  scoreMatchContrato,
  type FaixaMatch,
  type ResultadoScoreMatch,
} from "@/lib/consignacoes-governo/score-match-contrato";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import {
  mesclarConfirmacaoConsigfacil,
  montarConfirmacaoConsigfacilComContexto,
  montarContextoInstituicaoCorrelacao,
  textoObservacaoCorrelacaoInstituicao,
} from "@/lib/conciliacao/contexto-instituicao-folha-consigfacil";
import {
  classificarAutoridadeTemporalConsigfacil,
  entradaTemporalDeContrato,
  type ResultadoAutoridadeTemporalConsigfacil,
} from "@/lib/consigfacil/autoridade-temporal-consigfacil";
import {
  avaliarDivergenciaContratoCompetencia,
  diffValorRelativo,
  TOLERANCIA_DIVERGENCIA_PARCELA_PCT,
} from "@/lib/consignacoes-governo/divergencia-valor-folha";
import { contratoIgnoraDivergenciaValorPorMargem } from "@/lib/contratos/detectar-contexto-operacional-margem";
import {
  avaliarBloqueioCorrelacaoPorValor,
  criarConfirmacaoSemContinuidadeInstitucional,
  logContinuidadeInstitucional,
  montarEntradaContinuidadeLinhaContrato,
  removerContextoConsigfacil,
  removerContextoConsigfacilPorValor,
} from "@/lib/consigfacil/regras-correlacao-institucional";
import {
  ajusteEhRubricaConsignavel,
  ehRubricaConsignavel,
  ehRubricaElegivelCorrelacaoConsigfacil,
  textoRubricaLinha,
} from "@/lib/conciliacao/regras-natureza-consignavel";
import { entradaPassivoDeLoan } from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";
import {
  avaliarCompatibilidadeEstruturalContratoConsigfacil,
  criarConfirmacaoEstruturaIncompativel,
  logEstruturaIncompativel,
  removerContextoConsigfacilPorEstruturaIncompativel,
} from "@/lib/conciliacao/assinatura-estrutural-contrato";
import type { LoanComTimeline } from "@/lib/conciliacao/timeline-estrutural-contrato";
import { linhaFolhaMesDeBaseConciliada } from "@/lib/contratos/detectar-desconto-fracionado-margem";
import type { ConfigAuditoriaConsigfacil } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import { CONFIG_AUDITORIA_CONSIGFACIL_PADRAO } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import {
  avaliarVinculacaoContextualContrato,
  resolverStatusConciliacaoOperacional,
  competenciaCongeladaParaAnalise,
} from "@/lib/contratos/vinculacao-contextual-contratos";
import type { DebugMatchContrato } from "@/lib/contratos/vinculacao-contextual-contratos";

/**
 * Atualização NÃO-DESTRUTIVA da base financeira com dados oficiais ConsigFácil.
 *
 * Regras (todas obrigatórias):
 *  1. ConsigFácil confirma → marca `confirmado_consigfacil = true`.
 *  2. ConsigFácil diverge → marca `divergencia_consigfacil = true`,
 *     mantém valor original e adiciona linha à `Consigfacil_Ajustes_Base`.
 *  3. Nunca apaga: `Loan` é exposto em pares (`loan` antigo + `confirmacao`)
 *     e a `BaseConciliada` recebe `confirmacao_consigfacil` sem perder
 *     `valor` / `descricao_original`.
 *  4. Histórico completo de ajustes vai em `Consigfacil_Ajustes_Base`.
 *
 * `loansComConfirmacao` substitui o antigo "loansEnriquecidos": agora cada
 * loan vem com objeto de confirmação ao lado — o cadastro ORIGINAL permanece
 * intacto. UI/relatórios decidem qual mostrar.
 */

export type LoanComConfirmacao = Loan & {
  confirmacao_consigfacil: ConsigfacilConfirmacao;
};

export type BaseConciliadaComConfirmacao = BaseConciliadaLinha & {
  confirmacao_consigfacil: ConsigfacilConfirmacao;
};

/**
 * Loan CORRIGIDO automaticamente pelo ConsigFácil quando o score de match
 * for `match_confirmado` (>= 90). Preserva `loan_original_snapshot` e a
 * lista de campos sobrescritos.
 */
export type LoanCorrigidoConsigfacil = Loan & {
  fonte_principal: "consigfacil_oficial";
  /** Snapshot dos valores ANTES da correção — nunca apagamos o original. */
  loan_original_snapshot: Loan;
  /** Lista de campos que foram efetivamente sobrescritos. */
  campos_corrigidos: Array<keyof Loan>;
  /** Score de match no momento da correção. */
  score_match: number;
  /** ConsigFácil que originou a correção. */
  id_consignacao_origem: string;
  /** Carimbo de quando a correção foi aplicada. */
  corrigido_em: string;
};

/** Linha da aba `Match_Contratos`. */
export type LinhaMatchContratoCompleta = {
  id_consignacao: string;
  loan_id: string | null;
  instituicao_oficial: string;
  score: number;
  faixa: FaixaMatch;
  acao_aplicada: "corrigiu" | "sugeriu" | "apenas_anotou" | "ignorou";
  componentes: ResultadoScoreMatch["componentes"];
  rubrica_identificador_forte: boolean;
  motivo_match: string;
  motivo_bloqueio_match: string | null;
  match_debug: DebugMatchContrato;
  autoridade_temporal_consigfacil: import("@/lib/consigfacil/autoridade-temporal-consigfacil").AutoridadeTemporalConsigfacil;
  contrato_migrado_para_consigfacil: boolean;
  tipo_correlacao_temporal: import("@/lib/consigfacil/autoridade-temporal-consigfacil").TipoCorrelacaoTemporal;
  data_implantacao_fonte: string;
  mensagem_autoridade_temporal: string;
  competencia_referencia: string | null;
};

export type ResultadoAtualizacaoBaseComConsigfacil = {
  /** Loans NÃO destrutivos — campos originais intactos + objeto de confirmação. */
  loansComConfirmacao: LoanComConfirmacao[];
  /**
   * Loans com correção AUTOMÁTICA aplicada (score >= 90). Cada entrada
   * mantém o snapshot original em `loan_original_snapshot` e a lista de
   * `campos_corrigidos`. NÃO substitui `loansComConfirmacao` — vive ao
   * lado para que a UI possa decidir o que mostrar.
   */
  loansCorrigidos: LoanCorrigidoConsigfacil[];
  /** BaseConciliada NÃO destrutiva — `valor` / `descricao_original` intactos. */
  baseConciliadaEnriquecida: BaseConciliadaComConfirmacao[];
  /** Linhas da aba `Consigfacil_Ajustes_Base` (confirmações + divergências). */
  ajustes: ConsigfacilAjusteBase[];
  /** Detalhamento por contrato ConsigFácil. */
  resultadosConciliacao: ResultadoConciliacaoConsigfacil[];
  /**
   * Matches detalhados (score + componentes + ação aplicada). Vai para a
   * aba `Match_Contratos` da exportação.
   */
  matches: LinhaMatchContratoCompleta[];
  /** Divergências de valor entre ConsigFácil e folha/extrato (para painel de risco). */
  divergenciasFolhaExtrato: Array<{
    id_consignacao: string;
    instituicao: string;
    competencia: string;
    valor_consigfacil: number;
    valor_observado: number;
    diferenca: number;
    motivo: string;
  }>;
  /** Linhas Power BI por fonte (auditoria). */
  fontesPorContrato: Array<{
    id_consignacao: string;
    loan_id: string | null;
    fonte_principal: FonteCanonicaFinanceira;
    confianca: number;
  }>;
  /**
   * Mapa: id_consignacao → instituicao_oficial (do catálogo) — usado pelo
   * builder de histórico de eventos para garantir nome canônico.
   */
  instituicaoOficialPorIdConsignacao: Map<string, string>;
};

const PRIORIDADE_PARA_CONFIRMAR_LOAN = 0.6;

function diffValor(a: number, b: number): number {
  return diffValorRelativo(a, b);
}

function dentroDaTolerancia(a: number, b: number): boolean {
  return diffValor(a, b) <= TOLERANCIA_DIVERGENCIA_PARCELA_PCT;
}

function statusConsigfacilEhAtivo(c: ConsigfacilContrato): boolean {
  return c.status === "ativo" || c.status === "em_averbacao";
}

function statusLoanEhAtivo(l: Loan): boolean {
  return l.status === "ativo";
}

function compararStatus(c: ConsigfacilContrato, l: Loan): "confirma" | "diverge" {
  const cAtivo = statusConsigfacilEhAtivo(c) ||
    c.status === "refinanciado" ||
    c.status === "substituido";
  const lAtivo = statusLoanEhAtivo(l);
  // ConsigFácil = suspenso vs Loan ativo → diverge.
  // ConsigFácil = quitado vs Loan ativo → diverge.
  if (cAtivo && lAtivo) return "confirma";
  if (!cAtivo && !lAtivo) return "confirma";
  return "diverge";
}

function comparar<T extends string | number | null>(
  campo: ConsigfacilCampoAjustavel,
  alvoId: string,
  alvoTipo: ConsigfacilAjusteBase["alvo_tipo"],
  c: ConsigfacilContrato,
  valorOriginal: T,
  valorOficial: T,
  fonteOriginal: FonteCanonicaFinanceira,
  comparador: (a: T, b: T) => boolean,
  motivoSeDiverge: (orig: T, ofic: T) => string,
  registradoEm: string,
): { ajuste: ConsigfacilAjusteBase; tipo: "confirmado" | "divergencia" } | null {
  // Quando uma das pontas é null/0/"" e a outra tem valor, consideramos NÃO
  // confirmar nem divergir — é só "preencher". A UI mostra apenas oficial,
  // o original fica como `null` no histórico de ajustes (sem ruído de divergência).
  if (valorOriginal == null || valorOriginal === "" || valorOriginal === 0) return null;
  if (valorOficial == null || valorOficial === "" || valorOficial === 0) return null;

  const igual = comparador(valorOriginal, valorOficial);
  const diffPct = (() => {
    if (typeof valorOriginal === "number" && typeof valorOficial === "number") {
      return Math.round(diffValor(valorOriginal, valorOficial) * 1000) / 10;
    }
    return null;
  })();

  const linha: ConsigfacilAjusteBase = {
    alvo_id: alvoId,
    alvo_tipo: alvoTipo,
    id_consignacao: c.id_consignacao,
    campo,
    tipo_ajuste: igual ? "confirmado" : "divergencia",
    valor_original: valorOriginal,
    valor_oficial: valorOficial,
    fonte_original: fonteOriginal,
    fonte_oficial: "consigfacil_oficial",
    diferenca_pct: igual ? null : diffPct,
    motivo_ajuste: igual
      ? `Campo ${campo} confirmado pelo ConsigFácil.`
      : motivoSeDiverge(valorOriginal, valorOficial),
    registrado_em: registradoEm,
  };
  return { ajuste: linha, tipo: linha.tipo_ajuste };
}

function fonteOriginalDoLoan(l: Loan): FonteCanonicaFinanceira {
  if (l.tipo_contrato === "anexo" || l.origem === "anexo") return "contrato_anexado";
  if (l.origem === "ocr") return "ocr";
  if (l.origem === "consigfacil") return "consigfacil_oficial";
  if (l.origem === "manual") return "manual";
  return "inferencia";
}

function aplicarConsigfacilNoLoanComConfirmacao(input: {
  loan: Loan;
  contrato: ConsigfacilContrato;
  registradoEm: string;
}): { loanFinal: LoanComConfirmacao; ajustes: ConsigfacilAjusteBase[] } {
  const { loan, contrato, registradoEm } = input;

  if (
    !ehRubricaElegivelCorrelacaoConsigfacil(loan.description ?? loan.institution_name ?? "", {
      ...entradaPassivoDeLoan(loan, { id_consignacao_consigfacil: contrato.id_consignacao }),
      consigfacil_confirmado: true,
    })
  ) {
    return { loanFinal: { ...loan, confirmacao_consigfacil: confirmacaoVazia }, ajustes: [] };
  }

  const bloqueioEstrutura = avaliarCompatibilidadeEstruturalContratoConsigfacil({
    contrato,
    loan,
    possui_migracao_documentada:
      contrato.possui_documento_migracao ?? contrato.possui_historico_transicao,
    timeline: (loan as LoanComTimeline).timeline_analise ?? null,
  });
  if (bloqueioEstrutura.bloquear_correlacao) {
    logEstruturaIncompativel({
      id_consignacao: contrato.id_consignacao,
      rubrica_observada: loan.description ?? loan.institution_name ?? null,
      motivos: bloqueioEstrutura.motivos,
    });
    return {
      loanFinal: {
        ...loan,
        confirmacao_consigfacil: criarConfirmacaoEstruturaIncompativel(
          loan.institution_name ?? loan.description ?? null,
        ),
      },
      ajustes: [],
    };
  }

  const bloqueio = avaliarBloqueioCorrelacaoPorValor({
    ...montarEntradaContinuidadeLinhaContrato({
      linha: {
        instituicao_original_folha:
          loan.institution_name ?? loan.description ?? null,
        banco_origem: loan.institution_name ?? null,
        competencia: contrato.competencia ?? null,
      },
      contrato,
    }),
    rubricaOriginal: loan.description ?? null,
    descricaoFolha: loan.description ?? null,
    idConsignacao: contrato.id_consignacao,
    codigoInstituicao: contrato.codigo_instituicao,
    textoContrato: contrato.texto_bruto,
    valorObservado: loan.installment_amount,
    valorConsigfacil: contrato.valor_parcela,
  });
  if (bloqueio.bloquear_correlacao_por_valor) {
    const entradaCont = montarEntradaContinuidadeLinhaContrato({
      linha: {
        instituicao_original_folha:
          loan.institution_name ?? loan.description ?? null,
        banco_origem: loan.institution_name ?? null,
        competencia: contrato.competencia ?? null,
      },
      contrato,
    });
    logContinuidadeInstitucional({ ...entradaCont, ...bloqueio.continuidade });
    return {
      loanFinal: {
        ...loan,
        confirmacao_consigfacil: criarConfirmacaoSemContinuidadeInstitucional(
          loan.institution_name ?? loan.description ?? null,
          bloqueio.mensagem_ui,
        ),
      },
      ajustes: [],
    };
  }

  const ajustes: ConsigfacilAjusteBase[] = [];
  const camposConfirmados: ConsigfacilCampoAjustavel[] = [];
  const camposDivergentes: ConsigfacilCampoAjustavel[] = [];
  const fonteOriginal = fonteOriginalDoLoan(loan);

  function processar<T extends string | number | null>(
    campo: ConsigfacilCampoAjustavel,
    orig: T,
    ofic: T,
    comparador: (a: T, b: T) => boolean,
    motivoDiverge: (o: T, of: T) => string,
  ): void {
    const r = comparar(
      campo,
      loan.id,
      "loan",
      contrato,
      orig,
      ofic,
      fonteOriginal,
      comparador,
      motivoDiverge,
      registradoEm,
    );
    if (!r) return;
    ajustes.push(r.ajuste);
    if (r.tipo === "confirmado") camposConfirmados.push(campo);
    else camposDivergentes.push(campo);
  }

  processar(
    "valor_parcela",
    loan.installment_amount,
    contrato.valor_parcela,
    (a, b) => dentroDaTolerancia(a as number, b as number),
    (o, of) =>
      `Parcela diverge: cadastro R$ ${(o as number).toFixed(2)} vs ConsigFácil R$ ${(of as number).toFixed(2)}.`,
  );
  const loanHistorico =
    (loan as { tipo_estrutura?: string }).tipo_estrutura === "historico";
  if (!loanHistorico) {
    processar(
      "parcelas_total",
      loan.total_installments,
      contrato.parcelas_total,
      (a, b) => Math.abs((a as number) - (b as number)) <= 1,
      (o, of) => `Total de parcelas diverge: ${o} cadastrado vs ${of} no ConsigFácil.`,
    );
    processar(
      "parcela_atual",
      loan.paid_installments,
      contrato.parcela_atual,
      (a, b) => Math.abs((a as number) - (b as number)) <= 2,
      (o, of) => `Parcela atual diverge: ${o} cadastrado vs ${of} no ConsigFácil.`,
    );
  }
  processar(
    "instituicao",
    loan.institution_name ?? loan.description,
    contrato.instituicao,
    (a, b) =>
      String(a).toLowerCase().includes(String(b).toLowerCase().split(" ")[0] ?? "") ||
      String(b).toLowerCase().includes(String(a).toLowerCase().split(" ")[0] ?? ""),
    (o, of) => `Instituição diverge: cadastro "${o}" vs ConsigFácil "${of}".`,
  );
  processar(
    "status",
    loan.status,
    statusConsigfacilEhAtivo(contrato) ? "ativo" : contrato.status === "quitado" ? "quitado" : "ativo",
    (a, b) => compararStatus(contrato, loan) === "confirma" && a === b,
    () => `Status diverge: ${loan.status} (cadastro) vs ${contrato.status} (ConsigFácil).`,
  );
  processar(
    "rubrica_code",
    loan.rubrica_code ?? null,
    contrato.codigo_instituicao,
    (a, b) => {
      const sa = (a as string | null)?.replace(/\D+/g, "") ?? "";
      const sb = (b as string | null)?.replace(/\D+/g, "") ?? "";
      return !!sa && !!sb && (sa.includes(sb) || sb.includes(sa));
    },
    (o, of) => `Código diverge: ${o} vs ${of}.`,
  );

  if (contrato.eh_cartao_beneficio) {
    processar(
      "natureza_cartao_beneficio",
      loan.tipo_contrato ?? "emprestimo_comum",
      "cartao_beneficio",
      (a) => String(a).toLowerCase().includes("cart"),
      () =>
        `Cartão Benefício oficial — cadastro interno está marcado como "${loan.tipo_contrato ?? "emprestimo_comum"}".`,
    );
  }

  if (contrato.eh_refinanciamento || contrato.contrato_substituido) {
    processar(
      "refinanciamento",
      loan.status_analise_contracheque ?? "sem_refin",
      contrato.contrato_substituido
        ? `substituido:${contrato.contrato_substituido}`
        : "refinanciado",
      (a) => String(a).includes("refin") || String(a).includes("substitu"),
      () =>
        contrato.contrato_substituido
          ? `Refinanciamento detectado: contrato substituiu ${contrato.contrato_substituido}.`
          : `Refinanciamento detectado pelo ConsigFácil — atualizar cadastro.`,
    );
  }

  const houveDivergencia = camposDivergentes.length > 0;
  const loanFinal: LoanComConfirmacao = {
    ...loan, // VALORES ORIGINAIS PRESERVADOS
    confirmacao_consigfacil: {
      ...confirmacaoVazia,
      confirmado_consigfacil: camposConfirmados.length > 0 && !houveDivergencia,
      divergencia_consigfacil: houveDivergencia,
      id_consignacao_confirmada: contrato.id_consignacao,
      campos_confirmados: camposConfirmados,
      campos_divergentes: camposDivergentes,
      instituicao_oficial_consigfacil:
        resolverInstituicaoOficial(contrato.instituicao)?.nome_oficial ??
        contrato.instituicao,
      banco_atual_consigfacil: contrato.instituicao,
      banco_consolidado:
        resolverInstituicaoOficial(contrato.instituicao)?.nome_oficial ??
        contrato.instituicao,
      contrato_correlato: contrato.id_consignacao,
      mensagem_correlacao: null,
    },
  };
  return { loanFinal, ajustes };
}

/**
 * Aplica a CORREÇÃO efetiva no Loan quando o match é `match_confirmado`
 * (score ≥ 90). Preserva o snapshot original em `loan_original_snapshot`.
 *
 * REGRA: nunca apaga campos. Só sobrescreve.
 */
function aplicarCorrecaoAutomaticaNoLoan(input: {
  loan: Loan;
  contrato: ConsigfacilContrato;
  score: number;
  registradoEm: string;
}): { loanCorrigido: LoanCorrigidoConsigfacil } {
  const { loan, contrato, score, registradoEm } = input;
  const camposCorrigidos: Array<keyof Loan> = [];
  const oficial = resolverInstituicaoOficial(contrato.instituicao);

  const novoInstitutionName = oficial?.nome_oficial ?? contrato.instituicao ?? loan.institution_name ?? null;
  const novoTotalInstallments = contrato.parcelas_total || loan.total_installments;
  const novoPaidInstallments =
    contrato.parcela_atual != null && contrato.parcela_atual > 0
      ? contrato.parcela_atual
      : loan.paid_installments;
  const novoInstallmentAmount = contrato.valor_parcela > 0 ? contrato.valor_parcela : loan.installment_amount;
  const novoStatus: Loan["status"] = contrato.status === "quitado" ? "quitado" : "ativo";
  const novoTipoContrato: Loan["tipo_contrato"] =
    contrato.eh_cartao_beneficio
      ? "cartao"
      : contrato.eh_cartao
        ? "cartao"
        : loan.tipo_contrato ?? "emprestimo_comum";

  if (novoInstitutionName !== loan.institution_name) camposCorrigidos.push("institution_name");
  if (novoTotalInstallments !== loan.total_installments) camposCorrigidos.push("total_installments");
  if (novoPaidInstallments !== loan.paid_installments) camposCorrigidos.push("paid_installments");
  if (Math.abs((novoInstallmentAmount ?? 0) - (loan.installment_amount ?? 0)) > 0.01)
    camposCorrigidos.push("installment_amount");
  if (novoStatus !== loan.status) camposCorrigidos.push("status");
  if (novoTipoContrato !== loan.tipo_contrato) camposCorrigidos.push("tipo_contrato");

  return {
    loanCorrigido: {
      ...loan,
      institution_name: novoInstitutionName ?? loan.institution_name,
      total_installments: novoTotalInstallments,
      paid_installments: novoPaidInstallments,
      installment_amount: novoInstallmentAmount,
      status: novoStatus,
      tipo_contrato: novoTipoContrato,
      // Marca fonte_principal explicitamente
      fonte_principal: "consigfacil_oficial",
      loan_original_snapshot: { ...loan },
      campos_corrigidos: camposCorrigidos,
      score_match: score,
      id_consignacao_origem: contrato.id_consignacao,
      corrigido_em: registradoEm,
    },
  };
}

function aplicarConfirmacaoNaBaseConciliada(input: {
  linhaOriginal: BaseConciliadaLinha;
  contrato: ConsigfacilContrato;
  loanIdMatch: string | null;
  registradoEm: string;
  statusOperacional?: ReturnType<typeof resolverStatusConciliacaoOperacional>;
  scoreMatch?: number | null;
  baseConciliada?: BaseConciliadaLinha[];
}): { linhaFinal: BaseConciliadaComConfirmacao; ajustes: ConsigfacilAjusteBase[] } {
  const { linhaOriginal, contrato, loanIdMatch, registradoEm, statusOperacional, scoreMatch } =
    input;

  const descricaoFolha = textoRubricaLinha(linhaOriginal);
  if (!ehRubricaConsignavel(descricaoFolha)) {
    return {
      linhaFinal: { ...linhaOriginal } as BaseConciliadaComConfirmacao,
      ajustes: [],
    };
  }

  const entradaContinuidade = montarEntradaContinuidadeLinhaContrato({
    linha: linhaOriginal,
    contrato,
  });

  const linhasFolhaMes = (input.baseConciliada ?? [])
    .filter((l) => l.origem === "contracheque")
    .map(linhaFolhaMesDeBaseConciliada);

  const bloqueioEstrutura = avaliarCompatibilidadeEstruturalContratoConsigfacil({
    contrato,
    linha: linhaOriginal,
    possui_migracao_documentada:
      contrato.possui_documento_migracao ?? contrato.possui_historico_transicao,
    competencia: linhaOriginal.competencia,
    linhas_folha_mes: linhasFolhaMes,
  });
  if (bloqueioEstrutura.bloquear_correlacao) {
    logEstruturaIncompativel({
      id_consignacao: contrato.id_consignacao,
      rubrica_observada: descricaoFolha,
      motivos: bloqueioEstrutura.motivos,
    });
    return {
      linhaFinal: removerContextoConsigfacilPorEstruturaIncompativel(
        linhaOriginal,
        bloqueioEstrutura,
      ) as BaseConciliadaComConfirmacao,
      ajustes: [],
    };
  }

  const bloqueioValor = avaliarBloqueioCorrelacaoPorValor({
    ...entradaContinuidade,
    rubricaOriginal:
      linhaOriginal.descricao_original || linhaOriginal.descricao_normalizada,
    descricaoFolha:
      linhaOriginal.descricao_original || linhaOriginal.descricao_normalizada,
    idConsignacao: contrato.id_consignacao,
    codigoInstituicao: contrato.codigo_instituicao,
    textoContrato: contrato.texto_bruto,
    valorObservado: Math.abs(linhaOriginal.valor),
    valorConsigfacil: contrato.valor_parcela,
  });
  if (bloqueioValor.bloquear_correlacao_por_valor) {
    logContinuidadeInstitucional({
      ...entradaContinuidade,
      ...bloqueioValor.continuidade,
    });
    return {
      linhaFinal: removerContextoConsigfacilPorValor(
        linhaOriginal,
        bloqueioValor,
      ) as BaseConciliadaComConfirmacao,
      ajustes: [],
    };
  }

  const ajustes: ConsigfacilAjusteBase[] = [];
  const camposConfirmados: ConsigfacilCampoAjustavel[] = [];
  const camposDivergentes: ConsigfacilCampoAjustavel[] = [];

  // Confirmação não-destrutiva do VALOR observado no extrato/folha vs. ConsigFácil
  const r = comparar(
    "valor_parcela",
    linhaOriginal.id,
    "base_conciliada",
    contrato,
    Math.abs(linhaOriginal.valor),
    contrato.valor_parcela,
    linhaOriginal.origem === "contracheque" ? "contracheque" : "extrato_bancario",
    (a, b) => dentroDaTolerancia(a as number, b as number),
    (o, of) =>
      `Linha ${linhaOriginal.descricao_normalizada || linhaOriginal.id}: R$ ${(o as number).toFixed(2)} (observado) vs R$ ${(of as number).toFixed(2)} (ConsigFácil).`,
    registradoEm,
  );
  const temporalPre = classificarAutoridadeTemporalConsigfacil(
    entradaTemporalDeContrato(contrato, linhaOriginal.competencia, {
      bancoHistorico:
        linhaOriginal.instituicao_original_folha ?? linhaOriginal.banco_origem,
      bancoConsigfacil: contrato.instituicao,
    }),
  );

  if (r) {
    ajustes.push(r.ajuste);
    if (r.tipo === "confirmado") camposConfirmados.push("valor_parcela");
    else if (temporalPre.permite_divergencia_estrutural) {
      camposDivergentes.push("valor_parcela");
    }
  }

  const valorConfirmado =
    camposConfirmados.length > 0 && camposDivergentes.length === 0;
  const ctxInst = montarContextoInstituicaoCorrelacao({
    descricaoFolha,
    bancoOrigemLinha:
      linhaOriginal.instituicao_original_folha ?? linhaOriginal.banco_origem,
    competenciaFolha: linhaOriginal.competencia,
    contrato,
    scoreMatch: scoreMatch ?? null,
    valorConfirmado,
  });
  if (!ctxInst) {
    return {
      linhaFinal: { ...linhaOriginal } as BaseConciliadaComConfirmacao,
      ajustes: [],
    };
  }
  const observ = textoObservacaoCorrelacaoInstituicao(ctxInst, contrato.id_consignacao);
  const statusLinha =
    statusOperacional && competenciaCongeladaParaAnalise(statusOperacional)
      ? statusOperacional
      : camposDivergentes.length > 0 ||
          (ctxInst.conflito_instituicao_historica &&
            ctxInst.temporal.permite_juizo_estrutural_retroativo)
        ? "precisa_revisao"
        : linhaOriginal.status_conciliacao === "precisa_revisao"
          ? "conciliado"
          : linhaOriginal.status_conciliacao;
  const linhaFinal: BaseConciliadaComConfirmacao = {
    ...linhaOriginal, // VALOR / DESCRIÇÃO / banco_origem da folha PRESERVADOS
    instituicao_original_folha:
      linhaOriginal.instituicao_original_folha ?? ctxInst.instituicao_original_folha,
    contexto_instituicao: ctxInst,
    vinculo_contrato_id:
      loanIdMatch ?? linhaOriginal.vinculo_contrato_id ?? null,
    status_conciliacao: statusLinha,
    observacao: linhaOriginal.observacao
      ? `${linhaOriginal.observacao} ${observ}`
      : observ,
    confirmacao_consigfacil: montarConfirmacaoConsigfacilComContexto({
      ctx: ctxInst,
      idConsignacao: contrato.id_consignacao,
      camposConfirmados,
      camposDivergentes,
    }),
    autoridade_temporal_consigfacil: ctxInst.temporal.autoridade_temporal,
    contrato_migrado_para_consigfacil: ctxInst.temporal.contrato_migrado_para_consigfacil,
    tipo_correlacao_temporal: ctxInst.temporal.tipo_correlacao_temporal,
    data_implantacao_fonte: ctxInst.temporal.data_implantacao_fonte,
    mensagem_autoridade_temporal: ctxInst.temporal.mensagem_autoridade_temporal,
  };
  return { linhaFinal, ajustes };
}

export function atualizarBaseComConsigfacil(input: {
  baseConsignacoes: BaseConsignacoesGoverno;
  loans: Loan[];
  baseConciliada: BaseConciliadaLinha[];
  configAuditoria?: ConfigAuditoriaConsigfacil;
}): ResultadoAtualizacaoBaseComConsigfacil {
  const { baseConsignacoes, loans, baseConciliada } = input;
  const configAuditoria = input.configAuditoria ?? CONFIG_AUDITORIA_CONSIGFACIL_PADRAO;
  const eventosOp = baseConsignacoes.eventosOperacionais;
  const registradoEm = new Date().toISOString();

  // Mapas indexados para construir resultado preservando o original
  const confirmacoesPorLoanId = new Map<string, LoanComConfirmacao>();
  const confirmacoesPorLinhaBase = new Map<string, BaseConciliadaComConfirmacao>();
  const ajustes: ConsigfacilAjusteBase[] = [];
  const resultadosConciliacao: ResultadoConciliacaoConsigfacil[] = [];
  const fontesPorContrato: ResultadoAtualizacaoBaseComConsigfacil["fontesPorContrato"] = [];
  const divergencias: ResultadoAtualizacaoBaseComConsigfacil["divergenciasFolhaExtrato"] = [];
  const divergenciasContratoComp = new Set<string>();
  const correcoesPorLoanId = new Map<string, LoanCorrigidoConsigfacil>();
  const matches: LinhaMatchContratoCompleta[] = [];
  const instituicaoOficialPorIdConsignacao = new Map<string, string>();

  for (const c of baseConsignacoes.contratos) {
    const matchLoan = conciliarContratoConsigfacilComLoans(c, loans);
    const oficial = resolverInstituicaoOficial(c.instituicao);
    if (oficial) instituicaoOficialPorIdConsignacao.set(c.id_consignacao, oficial.nome_oficial);

    if (matchLoan.loan && c.confianca >= PRIORIDADE_PARA_CONFIRMAR_LOAN) {
      const r = aplicarConsigfacilNoLoanComConfirmacao({
        loan: matchLoan.loan,
        contrato: c,
        registradoEm,
      });
      confirmacoesPorLoanId.set(r.loanFinal.id, r.loanFinal);
      ajustes.push(...r.ajustes);
    }

    // ----- SCORE OFICIAL DE MATCH + CORREÇÃO AUTOMÁTICA --------------
    const ctxVinculo = avaliarVinculacaoContextualContrato({
      contrato: c,
      loan: matchLoan.loan,
      config: configAuditoria,
    });
    const statusOp = resolverStatusConciliacaoOperacional(c, eventosOp);
    const competenciaCongelada = competenciaCongeladaParaAnalise(statusOp);

    const scoreInfo: ResultadoScoreMatch | null = matchLoan.loan
      ? scoreMatchContrato({
          contrato: c,
          loan: matchLoan.loan,
          config: configAuditoria,
          competenciaFolha: c.competencia,
        })
      : null;
    let acaoAplicada: LinhaMatchContratoCompleta["acao_aplicada"] = "ignorou";

    if (matchLoan.loan && scoreInfo) {
      if (
        scoreInfo.faixa === "match_confirmado" &&
        !scoreInfo.bloqueio_fusao_automatica &&
        !competenciaCongelada
      ) {
        const corrigido = aplicarCorrecaoAutomaticaNoLoan({
          loan: matchLoan.loan,
          contrato: c,
          score: scoreInfo.score,
          registradoEm,
        });
        correcoesPorLoanId.set(matchLoan.loan.id, corrigido.loanCorrigido);
        // O loan corrigido também marca confirmacao_consigfacil
        const existente = confirmacoesPorLoanId.get(matchLoan.loan.id);
        if (existente) {
          confirmacoesPorLoanId.set(matchLoan.loan.id, {
            ...existente,
            confirmacao_consigfacil: {
              ...existente.confirmacao_consigfacil,
              confirmado_consigfacil: true,
            },
          });
        }
        acaoAplicada = "corrigiu";
      } else if (scoreInfo.faixa === "match_provavel") {
        acaoAplicada = "sugeriu";
      } else if (scoreInfo.faixa === "match_manual") {
        acaoAplicada = "apenas_anotou";
      }
    }

    const temporalMatch: ResultadoAutoridadeTemporalConsigfacil =
      classificarAutoridadeTemporalConsigfacil(
        entradaTemporalDeContrato(c, c.competencia),
      );

    matches.push({
      id_consignacao: c.id_consignacao,
      loan_id: matchLoan.loan?.id ?? null,
      instituicao_oficial: oficial?.nome_oficial ?? c.instituicao,
      score: scoreInfo?.score ?? 0,
      faixa: scoreInfo?.faixa ?? "sem_match",
      acao_aplicada: acaoAplicada,
      componentes: scoreInfo?.componentes ?? [],
      rubrica_identificador_forte:
        scoreInfo?.rubrica_identificador_forte ?? ctxVinculo.debug.rubrica_identificador_forte,
      motivo_match: scoreInfo?.motivo_match ?? ctxVinculo.motivo_match,
      motivo_bloqueio_match: scoreInfo?.motivo_bloqueio_match ?? ctxVinculo.motivo_bloqueio_match,
      match_debug: ctxVinculo.debug,
      autoridade_temporal_consigfacil: temporalMatch.autoridade_temporal,
      contrato_migrado_para_consigfacil: temporalMatch.contrato_migrado_para_consigfacil,
      tipo_correlacao_temporal: temporalMatch.tipo_correlacao_temporal,
      data_implantacao_fonte: temporalMatch.data_implantacao_fonte,
      mensagem_autoridade_temporal: temporalMatch.mensagem_autoridade_temporal,
      competencia_referencia: temporalMatch.competencia_analisada,
    });

    const ids = conciliarContratoConsigfacilComBaseConciliada(c, baseConciliada);
    for (const id of ids) {
      const linhaAtual = baseConciliada.find((l) => l.id === id);
      if (!linhaAtual) continue;
      const r = aplicarConfirmacaoNaBaseConciliada({
        linhaOriginal: linhaAtual,
        contrato: c,
        loanIdMatch: matchLoan.loan?.id ?? null,
        registradoEm,
        statusOperacional: statusOp,
        scoreMatch: scoreInfo?.score ?? null,
        baseConciliada,
      });
      // Se múltiplos contratos confirmarem a mesma linha, acumula campos
      const existente = confirmacoesPorLinhaBase.get(id);
      if (existente) {
        r.linhaFinal.confirmacao_consigfacil = mesclarConfirmacaoConsigfacil(
          existente.confirmacao_consigfacil,
          r.linhaFinal.confirmacao_consigfacil,
        );
        r.linhaFinal.contexto_instituicao =
          r.linhaFinal.contexto_instituicao ?? existente.contexto_instituicao;
        r.linhaFinal.instituicao_original_folha =
          existente.instituicao_original_folha ?? r.linhaFinal.instituicao_original_folha;
      }
      confirmacoesPorLinhaBase.set(id, r.linhaFinal);
      ajustes.push(...r.ajustes);

    }

    const competenciasDivergencia = new Set<string>();
    for (const id of ids) {
      const linha = baseConciliada.find((l) => l.id === id);
      if (linha?.competencia) competenciasDivergencia.add(linha.competencia);
    }
    if (c.competencia) competenciasDivergencia.add(c.competencia);

    for (const comp of competenciasDivergencia) {
      if (competenciaCongelada) continue;
      if (contratoIgnoraDivergenciaValorPorMargem(c)) continue;
      const chave = `${c.id_consignacao}::${comp}`;
      if (divergenciasContratoComp.has(chave)) continue;

      const aval = avaliarDivergenciaContratoCompetencia(c, baseConciliada, comp);
      if (aval.somaFolha <= 0 || aval.valorOficial <= 0) continue;
      if (aval.somaFechaComOficial) continue;

      const pct =
        aval.percentualDiferenca ??
        Math.round(diffValor(aval.valorOficial, aval.somaFolha) * 1000) / 10;
      const detalheLinhas =
        aval.qtdLinhas > 1
          ? ` (${aval.qtdLinhas} descontos na folha somam ${aval.somaFolha.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`
          : "";

      divergencias.push({
        id_consignacao: c.id_consignacao,
        instituicao: c.instituicao,
        competencia: comp,
        valor_consigfacil: aval.valorOficial,
        valor_observado: aval.somaFolha,
        diferenca: Math.abs(aval.valorOficial - aval.somaFolha),
        motivo: `Valor de parcela diverge em ${pct.toFixed(1)}%.${detalheLinhas}`,
      });
      divergenciasContratoComp.add(chave);
    }

    if (!matchLoan.loan && ids.length === 0 && !c.eh_cartao_beneficio) {
      if (!contratoIgnoraDivergenciaValorPorMargem(c)) {
        divergencias.push({
          id_consignacao: c.id_consignacao,
          instituicao: c.instituicao,
          competencia: c.competencia,
          valor_consigfacil: c.valor_parcela,
          valor_observado: 0,
          diferenca: c.valor_parcela,
          motivo: "Contrato oficial sem cadastro interno e sem desconto/transação correspondente.",
        });
      }
    }

    const fonte: FonteCanonicaFinanceira =
      c.confianca >= PRIORIDADE_PARA_CONFIRMAR_LOAN
        ? "consigfacil_oficial"
        : matchLoan.loan
          ? "contrato_anexado"
          : "inferencia";

    resultadosConciliacao.push({
      id_consignacao: c.id_consignacao,
      loan_id: matchLoan.loan?.id ?? null,
      linhas_base_conciliada_ids: ids,
      match_score: matchLoan.score,
      fonte_principal: fonte,
      divergencias: matchLoan.divergencias,
    });
    fontesPorContrato.push({
      id_consignacao: c.id_consignacao,
      loan_id: matchLoan.loan?.id ?? null,
      fonte_principal: fonte,
      confianca: c.confianca,
    });
  }

  // Reconstrói arrays preservando ordem original (rubricas não consignáveis sem vínculo ConsigFácil)
  const loansComConfirmacao: LoanComConfirmacao[] = loans.map((l) => {
    if (!ehRubricaConsignavel(l.description ?? l.institution_name ?? "")) {
      return { ...l, confirmacao_consigfacil: confirmacaoVazia };
    }
    const c = confirmacoesPorLoanId.get(l.id);
    if (c) return c;
    return { ...l, confirmacao_consigfacil: confirmacaoVazia };
  });
  const baseConciliadaEnriquecida: BaseConciliadaComConfirmacao[] = baseConciliada.map((l) => {
    if (!ehRubricaConsignavel(textoRubricaLinha(l))) {
      return {
        ...l,
        confirmacao_consigfacil: confirmacaoVazia,
        contexto_instituicao: null,
      };
    }
    const c = confirmacoesPorLinhaBase.get(l.id);
    if (c) return c;
    return { ...l, confirmacao_consigfacil: confirmacaoVazia, contexto_instituicao: null };
  });

  const ajustesConsignaveis = ajustes.filter((a) => ajusteEhRubricaConsignavel(a));

  const loansCorrigidos: LoanCorrigidoConsigfacil[] = [];
  for (const l of loans) {
    const corr = correcoesPorLoanId.get(l.id);
    if (corr) loansCorrigidos.push(corr);
  }

  return {
    loansComConfirmacao,
    loansCorrigidos,
    baseConciliadaEnriquecida,
    ajustes: ajustesConsignaveis,
    resultadosConciliacao,
    matches,
    divergenciasFolhaExtrato: divergencias,
    fontesPorContrato,
    instituicaoOficialPorIdConsignacao,
  };
}
