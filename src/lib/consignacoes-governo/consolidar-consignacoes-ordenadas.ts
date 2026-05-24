/**
 * Consolida a visão FINAL ordenada de consignações:
 *
 *   - Empréstimos consignados
 *   - Cartões benefício / cartão de crédito
 *   - RMC / RCC
 *   - Contribuições (sindicato etc.)
 *
 * Cruza 3 fontes para cada "linha consolidada":
 *   1. `Loan` (cadastro interno)
 *   2. `ConsigfacilContrato` (catálogo oficial)
 *   3. `BaseConciliadaLinha` (descontos observados em folha/extrato)
 *
 * Regras CRÍTICAS (não-destrutivas):
 *   - Usa SEMPRE `instituicao_oficial` / `modalidade_oficial` / `grupo_canonico`
 *     determinados pela `classificacao-canonica`. Nome bruto fica em
 *     `instituicao_original` apenas para auditoria.
 *   - `primeiro_desconto` / `ultimo_desconto` vêm dos descontos reais
 *     observados na `BaseConciliada`. Se não há observação, caímos para
 *     `start_date` do loan ou `data_contrato` do ConsigFácil.
 *   - `valor_parcela_oficial` = ConsigFácil quando disponível, senão Loan.
 *   - `valor_parcela_folha` = mediana dos descontos observados em folha.
 *   - `valor_total_pago_estimado` = soma absoluta dos descontos observados.
 */

import type { Loan } from "@/types/contracheque";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type {
  ConsigfacilContrato,
  ConsigfacilModalidadeSlug,
  ConsigfacilStatus,
  ConsigfacilTipoMargem,
  FonteClassificacao,
  GrupoFinanceiroCanonico,
  ResultadoClassificacaoFinanceira,
} from "@/types/consigfacil";
import {
  classificarLinhaFinanceira,
  normalizarInstituicaoConsigfacil,
} from "@/lib/consignacoes-governo/classificacao-canonica";
import type { Payslip } from "@/types/contracheque";
import {
  classificarConsigfacilContrato,
  classificarDescontoAvulsoEstrutura,
  classificarLoanEstrutura,
  geraDivergenciaContratual,
  mesclarClassificacaoEstrutura,
  type ClassificacaoEstruturaContrato,
  type FonteEstruturaContrato,
  type TipoEstruturaContrato,
} from "@/lib/contratos/classificar-estrutura-contrato";
import {
  classificarAutoridadeTemporalConsigfacil,
  entradaTemporalDeContrato,
} from "@/lib/consigfacil/autoridade-temporal-consigfacil";
import {
  instituicaoEhRotuloInvalido,
  instituicaoPareceNomePessoa,
} from "@/lib/consignacoes-governo/parser-consigfacil-print";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import { extrairInstituicaoOriginalFolha } from "@/lib/conciliacao/contexto-instituicao-folha-consigfacil";
import { detectarInstituicaoNaDescricao } from "@/lib/reading/instituicoes-financeiras";
import { normalizarNomeBanco } from "@/lib/auditoria/normalizar-banco";

/** Resolve nome do catálogo a partir de texto bruto (folha, ConsigFácil, cadastro). */
function instituicaoOficialDeTexto(nome: string | null | undefined): string | null {
  const t = nome?.trim();
  if (!t || instituicaoEhRotuloInvalido(t) || instituicaoPareceNomePessoa(t)) return null;

  const catalogo = resolverInstituicaoOficial(t);
  if (catalogo?.nome_oficial) return catalogo.nome_oficial;

  const norm = normalizarInstituicaoConsigfacil(t);
  if (norm.instituicao_oficial) return norm.instituicao_oficial;

  const detect = detectarInstituicaoNaDescricao(t);
  if (detect?.nome) {
    const nomeDetect = detect.nome.trim();
    const catalogoDetect = resolverInstituicaoOficial(nomeDetect);
    if (catalogoDetect?.nome_oficial) return catalogoDetect.nome_oficial;
    const normDetect = normalizarInstituicaoConsigfacil(nomeDetect);
    if (normDetect.instituicao_oficial) return normDetect.instituicao_oficial;
    if (!instituicaoEhRotuloInvalido(nomeDetect) && !instituicaoPareceNomePessoa(nomeDetect)) {
      return normalizarNomeBanco(nomeDetect);
    }
  }

  return null;
}

function candidatosInstituicaoDeDescontos(descontos: BaseConciliadaLinha[]): string[] {
  const out: string[] = [];
  for (const d of descontos) {
    if (d.banco_origem?.trim()) out.push(d.banco_origem);
    const folha = extrairInstituicaoOriginalFolha(d.descricao_original ?? "", d.banco_origem);
    if (folha.banco_original) out.push(folha.banco_original);
    if (d.descricao_original?.trim()) out.push(d.descricao_original);
    if (d.descricao_normalizada?.trim()) out.push(d.descricao_normalizada);
  }
  return out;
}

/**
 * Nome canônico para gráficos/filtros — extrai banco real da folha/ConsigFácil/catálogo.
 * Não usa rótulo genérico; prioriza rubrica e `banco_origem` da base conciliada.
 */
function resolverInstituicaoOficialLinha(
  classificacao: ResultadoClassificacaoFinanceira,
  descontos: BaseConciliadaLinha[],
  consigfacil?: ConsigfacilContrato,
  loan?: Loan,
): string {
  const tentativas: Array<string | null | undefined> = [
    classificacao.instituicao_oficial,
    ...candidatosInstituicaoDeDescontos(descontos),
    consigfacil?.banco_atual,
    consigfacil?.instituicao,
    consigfacil?.averbado_por,
    classificacao.instituicao_original,
    loan?.institution_name,
    loan?.description,
    consigfacil?.observacao,
  ];

  for (const candidato of tentativas) {
    const resolvido = instituicaoOficialDeTexto(candidato);
    if (resolvido) return resolvido;
  }

  const textoFolha = descontos
    .map((d) => `${d.banco_origem ?? ""} ${d.descricao_original ?? ""}`)
    .join(" ");
  const detectFolha = detectarInstituicaoNaDescricao(textoFolha);
  if (detectFolha?.nome) {
    const viaFolha = instituicaoOficialDeTexto(detectFolha.nome);
    if (viaFolha) return viaFolha;
    return normalizarNomeBanco(detectFolha.nome);
  }

  const ultimo = tentativas.find((c) => c?.trim() && !instituicaoEhRotuloInvalido(c) && !instituicaoPareceNomePessoa(c));
  if (ultimo) {
    const norm = normalizarNomeBanco(ultimo);
    if (norm !== "Não identificado" && !instituicaoEhRotuloInvalido(norm)) return norm;
  }

  const folhaResumida = textoFolha.slice(0, 48).trim();
  if (folhaResumida) {
    const viaFolhaResumida = instituicaoOficialDeTexto(folhaResumida);
    if (viaFolhaResumida) return viaFolhaResumida;
    const normFolha = normalizarNomeBanco(folhaResumida);
    if (normFolha !== "Não identificado" && !instituicaoEhRotuloInvalido(normFolha)) return normFolha;
  }

  return "—";
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ConsignacaoOrdenadaLinha = {
  /** ID lógico estável (loan.id || `consigfacil:<id>` || `inferida:<hash>`). */
  id: string;
  alvo_tipo: "loan" | "consigfacil_avulso" | "desconto_avulso";
  // ---- IDENTIFICAÇÃO OFICIAL (USAR ESTES NOS GRÁFICOS) ------------------
  instituicao_oficial: string;
  modalidade_oficial: ConsigfacilModalidadeSlug | null;
  grupo_canonico: GrupoFinanceiroCanonico;
  tipo_margem: ConsigfacilTipoMargem;
  // ---- ORIGEM (auditoria, NÃO usar em gráficos) -------------------------
  instituicao_original: string | null;
  modalidade_original: string | null;
  // ---- TIMELINE ---------------------------------------------------------
  primeiro_desconto: string | null;
  ultimo_desconto: string | null;
  meses_detectados: number;
  /** Lista de competências yyyy-mm em que houve desconto observado. */
  competencias_detectadas: string[];
  // ---- VALORES ----------------------------------------------------------
  valor_parcela_oficial: number;
  valor_parcela_folha: number;
  valor_total_pago_estimado: number;
  parcela_atual: number;
  parcelas_total: number;
  // ---- STATUS / FLAGS ---------------------------------------------------
  status_oficial: ConsigfacilStatus;
  confirmado_consigfacil: boolean;
  divergencia_consigfacil: boolean;
  eh_refinanciamento: boolean;
  eh_cartao_beneficio: boolean;
  eh_cartao: boolean;
  eh_rmc: boolean;
  eh_rcc: boolean;
  // ---- METADADOS --------------------------------------------------------
  fonte_principal: FonteClassificacao;
  grau_confianca: number;
  vinculo_loan_id: string | null;
  vinculo_consigfacil_id: string | null;
  tipo_estrutura: TipoEstruturaContrato;
  fonte_estrutura_contrato: FonteEstruturaContrato;
  confianca_estrutural: number;
  mensagem_estrutura: string;
  exibir_parcelas_estruturais: boolean;
  autoridade_temporal_consigfacil: import("@/lib/consigfacil/autoridade-temporal-consigfacil").AutoridadeTemporalConsigfacil;
  contrato_migrado_para_consigfacil: boolean;
  tipo_correlacao_temporal: import("@/lib/consigfacil/autoridade-temporal-consigfacil").TipoCorrelacaoTemporal;
  data_implantacao_fonte: string;
  mensagem_autoridade_temporal: string;
};

export type EntradaConsignacoesOrdenadas = {
  loans: Loan[];
  baseConciliada: BaseConciliadaLinha[];
  consigfacilContratos: ConsigfacilContrato[];
  classificacoesLoans: Array<{ loan_id: string } & ResultadoClassificacaoFinanceira>;
  /** Conciliação loan_id ↔ id_consignacao (vinda do `atualizarBaseComConsigfacil`). */
  vinculosConsigfacilPorLoanId?: Map<string, string>;
  /** Conjunto de loan_ids confirmados pelo ConsigFácil (sem divergência). */
  loansConfirmadosConsigfacilIds?: Set<string>;
  /** Conjunto de loan_ids com divergência apontada pelo ConsigFácil. */
  loansComDivergenciaConsigfacilIds?: Set<string>;
  payslips?: Payslip[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function competenciaDeData(data: string): string {
  return /^\d{4}-\d{2}/.test(data) ? data.slice(0, 7) : "";
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 0 ? (ord[meio - 1] + ord[meio]) / 2 : ord[meio];
}

function statusConsigfacilOuLoan(
  consigfacil: ConsigfacilContrato | undefined,
  loan: Loan | undefined,
): ConsigfacilStatus {
  if (consigfacil) return consigfacil.status;
  if (loan) {
    if (loan.status === "quitado") return "quitado";
    if (loan.status === "ativo") return "ativo";
  }
  return "desconhecido";
}

/**
 * Constrói uma linha consolidada a partir das fontes disponíveis. Recebe um
 * "ponto de pivô" (loan ou contrato) e o conjunto de descontos observados.
 */
function montarLinha(args: {
  id: string;
  alvo_tipo: ConsignacaoOrdenadaLinha["alvo_tipo"];
  loan?: Loan;
  consigfacil?: ConsigfacilContrato;
  classificacao: ResultadoClassificacaoFinanceira;
  descontos: BaseConciliadaLinha[];
  confirmado: boolean;
  divergencia: boolean;
  estrutura: ClassificacaoEstruturaContrato;
}): ConsignacaoOrdenadaLinha {
  const { loan, consigfacil, classificacao, descontos } = args;

  const competencias = Array.from(
    new Set(
      descontos
        .map((d) => d.competencia || competenciaDeData(d.data))
        .filter((c) => /^\d{4}-\d{2}$/.test(c)),
    ),
  ).sort();
  const valoresAbs = descontos.map((d) => Math.abs(d.valor)).filter((v) => v > 0);

  const primeiro_desconto = (() => {
    if (competencias.length > 0) return competencias[0];
    if (consigfacil?.competencia) return consigfacil.competencia;
    if (loan?.start_date) return String(loan.start_date).slice(0, 7);
    return null;
  })();
  const ultimo_desconto = (() => {
    if (competencias.length > 0) return competencias[competencias.length - 1];
    return primeiro_desconto;
  })();

  const valor_parcela_oficial =
    consigfacil?.valor_parcela && consigfacil.valor_parcela > 0
      ? consigfacil.valor_parcela
      : loan?.installment_amount ?? 0;
  const valor_parcela_folha = mediana(valoresAbs);
  const valor_total_pago_estimado = valoresAbs.reduce((s, v) => s + v, 0);

  const { estrutura } = args;
  const ehHistorico = estrutura.tipo_estrutura === "historico";
  let parcela_atual = 0;
  let parcelas_total = 0;
  if (!ehHistorico) {
    parcela_atual =
      consigfacil?.parcela_atual && consigfacil.parcela_atual > 0
        ? consigfacil.parcela_atual
        : loan?.paid_installments ?? 0;
    parcelas_total =
      consigfacil?.parcelas_total && consigfacil.parcelas_total > 0
        ? consigfacil.parcelas_total
        : loan?.total_installments ?? 0;
  }

  const competenciaRef =
    competencias[0] ?? consigfacil?.competencia ?? primeiro_desconto?.slice(0, 7) ?? null;
  const temporal = consigfacil
    ? classificarAutoridadeTemporalConsigfacil(
        entradaTemporalDeContrato(consigfacil, competenciaRef, {
          bancoHistorico: classificacao.instituicao_original ?? loan?.institution_name,
        }),
      )
    : classificarAutoridadeTemporalConsigfacil({
        competencia: competenciaRef,
        existeCorrelacaoConsigfacil: false,
      });

  const divergenciaEfetiva =
    geraDivergenciaContratual(estrutura) &&
    args.divergencia &&
    temporal.permite_divergencia_estrutural;
  const naoRefinConfirmado =
    consigfacil?.status === "nao_refinanciamento_confirmado" ||
    !!(consigfacil as { nao_refinanciamento_confirmado?: boolean } | undefined)
      ?.nao_refinanciamento_confirmado;
  const refinEfetivo =
    temporal.permite_refin_automatico &&
    !ehHistorico &&
    !naoRefinConfirmado &&
    (consigfacil?.eh_refinanciamento ?? false);

  const grauConfianca = Math.min(
    100,
    classificacao.indice_confianca_classificacao + estrutura.confianca_estrutural * 0.35,
  );

  return {
    id: args.id,
    alvo_tipo: args.alvo_tipo,
    instituicao_oficial: resolverInstituicaoOficialLinha(classificacao, descontos, consigfacil, loan),
    modalidade_oficial: classificacao.modalidade_oficial,
    grupo_canonico: classificacao.grupo_canonico,
    tipo_margem: classificacao.tipo_margem,
    instituicao_original:
      classificacao.instituicao_original ??
      loan?.institution_name ??
      consigfacil?.instituicao ??
      null,
    modalidade_original: classificacao.modalidade_original,
    primeiro_desconto,
    ultimo_desconto,
    meses_detectados: competencias.length,
    competencias_detectadas: competencias,
    valor_parcela_oficial,
    valor_parcela_folha,
    valor_total_pago_estimado,
    parcela_atual,
    parcelas_total,
    status_oficial: statusConsigfacilOuLoan(consigfacil, loan),
    confirmado_consigfacil: args.confirmado,
    divergencia_consigfacil: divergenciaEfetiva,
    eh_refinanciamento: refinEfetivo,
    eh_cartao_beneficio:
      consigfacil?.eh_cartao_beneficio ??
      classificacao.eh_cartao_beneficio ??
      false,
    eh_cartao: consigfacil?.eh_cartao ?? classificacao.eh_cartao ?? false,
    eh_rmc: consigfacil?.eh_rmc ?? false,
    eh_rcc: consigfacil?.eh_rcc ?? false,
    fonte_principal: classificacao.fonte_classificacao,
    grau_confianca: grauConfianca,
    vinculo_loan_id: loan?.id ?? null,
    vinculo_consigfacil_id: consigfacil?.id_consignacao ?? null,
    tipo_estrutura: estrutura.tipo_estrutura,
    fonte_estrutura_contrato: estrutura.fonte_estrutura_contrato,
    confianca_estrutural: estrutura.confianca_estrutural,
    mensagem_estrutura: estrutura.mensagem_exibicao,
    exibir_parcelas_estruturais: estrutura.tipo_estrutura === "estrutural" && estrutura.tem_parc_estrutural,
    autoridade_temporal_consigfacil: temporal.autoridade_temporal,
    contrato_migrado_para_consigfacil: temporal.contrato_migrado_para_consigfacil,
    tipo_correlacao_temporal: temporal.tipo_correlacao_temporal,
    data_implantacao_fonte: temporal.data_implantacao_fonte,
    mensagem_autoridade_temporal: temporal.mensagem_autoridade_temporal,
  };
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

export function consolidarConsignacoesOrdenadas(
  input: EntradaConsignacoesOrdenadas,
): ConsignacaoOrdenadaLinha[] {
  const {
    loans,
    baseConciliada,
    consigfacilContratos,
    classificacoesLoans,
    vinculosConsigfacilPorLoanId = new Map<string, string>(),
    loansConfirmadosConsigfacilIds = new Set<string>(),
    loansComDivergenciaConsigfacilIds = new Set<string>(),
    payslips = [],
  } = input;

  const linhas: ConsignacaoOrdenadaLinha[] = [];
  const classifPorLoanId = new Map(
    classificacoesLoans.map((c) => [c.loan_id, c] as const),
  );
  const consigfacilPorId = new Map(consigfacilContratos.map((c) => [c.id_consignacao, c] as const));
  const consigfacilUsados = new Set<string>();

  // -------------------------------------------------------------------------
  // 1) Linha por Loan cadastrado
  // -------------------------------------------------------------------------
  for (const loan of loans) {
    const classificacao =
      classifPorLoanId.get(loan.id) ??
      classificarLinhaFinanceira({
        instituicao: loan.institution_name ?? loan.description,
        descricao: loan.description,
        id_consignacao_consigfacil: vinculosConsigfacilPorLoanId.get(loan.id) ?? null,
      });

    const idConsigfacil = vinculosConsigfacilPorLoanId.get(loan.id) ?? null;
    const consigfacil = idConsigfacil ? consigfacilPorId.get(idConsigfacil) : undefined;
    if (consigfacil) consigfacilUsados.add(consigfacil.id_consignacao);

    const descontos = baseConciliada.filter(
      (l) =>
        l.vinculo_contrato_id === loan.id &&
        (l.natureza === "desconto" || l.natureza === "emprestimo" || l.natureza === "cartao"),
    );

    const mesesDesc = new Set(
      descontos.map((d) => d.competencia).filter((c) => /^\d{4}-\d{2}$/.test(c ?? "")),
    ).size;

    const clsEstrutura = mesclarClassificacaoEstrutura([
      ...(consigfacil ? [classificarConsigfacilContrato(consigfacil)] : []),
      classificarLoanEstrutura({
        loan,
        consigfacil,
        payslips,
        mesesHistorico: mesesDesc,
      }),
    ]);

    linhas.push(
      montarLinha({
        id: `loan:${loan.id}`,
        alvo_tipo: "loan",
        loan,
        consigfacil,
        classificacao,
        descontos,
        confirmado: loansConfirmadosConsigfacilIds.has(loan.id),
        divergencia: loansComDivergenciaConsigfacilIds.has(loan.id),
        estrutura: clsEstrutura,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // 2) Contratos ConsigFácil sem Loan correspondente — entram avulsos.
  //    Importante para cartão benefício / contratos só-oficiais.
  // -------------------------------------------------------------------------
  for (const c of consigfacilContratos) {
    if (consigfacilUsados.has(c.id_consignacao)) continue;
    const classificacao = classificarLinhaFinanceira({
      instituicao: c.instituicao,
      descricao: c.observacao ?? c.instituicao,
      modalidade: c.modalidade_slug ?? null,
      id_consignacao_consigfacil: c.id_consignacao,
    });
    linhas.push(
      montarLinha({
        id: `consigfacil:${c.id_consignacao}`,
        alvo_tipo: "consigfacil_avulso",
        consigfacil: c,
        classificacao,
        descontos: [],
        confirmado: true,
        divergencia: false,
        estrutura: classificarConsigfacilContrato(c),
      }),
    );
  }

  // -------------------------------------------------------------------------
  // 3) Descontos da BaseConciliada sem `vinculo_contrato_id` — quando o desconto
  //    bate em folha mas não existe Loan nem ConsigFácil mapeado.
  //    Agrupa por (banco_origem + categoria_canonica) para evitar 1 linha por mês.
  // -------------------------------------------------------------------------
  const descontosAvulsos = baseConciliada.filter(
    (l) =>
      !l.vinculo_contrato_id &&
      (l.natureza === "desconto" || l.natureza === "emprestimo" || l.natureza === "cartao") &&
      l.origem === "contracheque", // só contracheques avulsos viram linhas — extrato fica para outro painel
  );
  const gruposAvulsos = new Map<string, BaseConciliadaLinha[]>();
  for (const d of descontosAvulsos) {
    const chave = `${d.banco_origem || "—"}::${d.categoria_canonica || d.grupo_canonico || "—"}`;
    const arr = gruposAvulsos.get(chave) ?? [];
    arr.push(d);
    gruposAvulsos.set(chave, arr);
  }
  let avulsoIdx = 0;
  for (const [chave, descontos] of gruposAvulsos) {
    avulsoIdx += 1;
    // Classifica usando o banco_origem do grupo + a descrição normalizada.
    const banco = descontos[0]?.banco_origem ?? "";
    const desc =
      descontos[0]?.descricao_normalizada ?? descontos[0]?.descricao_original ?? "";
    const classificacao = classificarLinhaFinanceira({
      instituicao: banco,
      descricao: desc,
    });
    // Pula linhas que não conseguimos sequer classificar minimamente.
    const inst = normalizarInstituicaoConsigfacil(banco);
    if (inst.fonte === "sem_correspondencia" && classificacao.grupo_canonico === "outros") {
      continue;
    }

    const clsAvulso = classificarDescontoAvulsoEstrutura({ descontos, payslips });

    linhas.push(
      montarLinha({
        id: `desconto-avulso:${avulsoIdx}:${chave}`,
        alvo_tipo: "desconto_avulso",
        classificacao,
        descontos,
        confirmado: false,
        divergencia: geraDivergenciaContratual(clsAvulso),
        estrutura: clsAvulso,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // 4) ORDENAÇÃO OBRIGATÓRIA
  //    a) primeiro_desconto ASC (nulos vão pro fim)
  //    b) instituicao_oficial ASC
  //    c) modalidade_oficial ASC
  // -------------------------------------------------------------------------
  linhas.sort((a, b) => {
    const an = a.primeiro_desconto ?? "9999-99";
    const bn = b.primeiro_desconto ?? "9999-99";
    if (an !== bn) return an.localeCompare(bn);
    if (a.instituicao_oficial !== b.instituicao_oficial)
      return a.instituicao_oficial.localeCompare(b.instituicao_oficial);
    return String(a.modalidade_oficial ?? "").localeCompare(String(b.modalidade_oficial ?? ""));
  });

  return linhas;
}

// ---------------------------------------------------------------------------
// Dicionário de colunas (para a aba `Dicionario_Colunas`)
// ---------------------------------------------------------------------------

export function dicionarioColunasConsignacoesOrdenadas(): Array<{
  coluna: string;
  descricao: string;
}> {
  return [
    { coluna: "instituicao_oficial", descricao: "Banco/instituição canônica do catálogo ConsigFácil." },
    { coluna: "modalidade_oficial", descricao: "Slug oficial da modalidade (emprestimo_consignado, cartao_beneficio_compra…)." },
    { coluna: "grupo_canonico", descricao: "Agrupamento canônico para gráficos." },
    { coluna: "tipo_margem", descricao: "margem_consignavel | margem_cartao | margem_cartao_beneficio | null." },
    { coluna: "primeiro_desconto", descricao: "Primeira competência yyyy-mm com desconto observado." },
    { coluna: "ultimo_desconto", descricao: "Última competência observada." },
    { coluna: "meses_detectados", descricao: "Quantidade de competências distintas com desconto." },
    { coluna: "valor_parcela_oficial", descricao: "Valor da parcela conforme ConsigFácil ou cadastro." },
    { coluna: "valor_parcela_folha", descricao: "Mediana dos valores observados em folha/extrato." },
    { coluna: "valor_total_pago_estimado", descricao: "Soma absoluta dos descontos detectados." },
    { coluna: "parcela_atual", descricao: "Parcela atual conforme fonte oficial." },
    { coluna: "parcelas_total", descricao: "Total de parcelas conforme fonte oficial." },
    { coluna: "status_oficial", descricao: "Status canônico (ativo, suspenso, quitado…)." },
    { coluna: "confirmado_consigfacil", descricao: "true quando ConsigFácil confirmou a linha." },
    { coluna: "divergencia_consigfacil", descricao: "true quando há divergência apontada." },
    { coluna: "eh_refinanciamento", descricao: "true quando detector marcou refinanciamento." },
    { coluna: "eh_cartao_beneficio", descricao: "true para cartão benefício (não somar com empréstimo comum)." },
    { coluna: "eh_rmc", descricao: "true quando o registro corresponde a RMC." },
    { coluna: "eh_rcc", descricao: "true quando o registro corresponde a RCC." },
    { coluna: "fonte_principal", descricao: "Fonte usada na classificação canônica." },
    { coluna: "grau_confianca", descricao: "0..100 — confiança da classificação." },
    { coluna: "tipo_estrutura", descricao: "historico | estrutural — separação histórico vs contrato oficial." },
    { coluna: "fonte_estrutura_contrato", descricao: "consigfacil | contracheque_moderno | contrato_pdf | ficha_financeira | inferencia_historica." },
    { coluna: "confianca_estrutural", descricao: "Bônus 0..100 da fonte estrutural (ConsigFácil +60, PARC +40, ficha máx 20)." },
    { coluna: "mensagem_estrutura", descricao: "Texto de exibição (histórico sem PARC ou estrutura oficial)." },
  ];
}
