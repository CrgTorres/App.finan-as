import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import {
  bloquearInferenciaBancariaHistorica,
  filtrarTransacoesBancariasReais,
  possuiFonteBancariaReal,
  limparLinhasInferenciaBancariaSemFonte,
  resolverTipoOrigemFolha,
  type TipoOrigemFolha,
} from "@/lib/conciliacao/validar-fonte-bancaria-real";
import { extrairInstituicaoOriginalFolha } from "@/lib/conciliacao/contexto-instituicao-folha-consigfacil";

// ============================================================================
// Tipos do Base_Conciliada
// ============================================================================

/**
 * `contracheque` = previsão / composição da folha (bruto, descontos, rubricas).
 * `extrato_bancario` = movimentação real na conta (dinheiro que entrou/saiu).
 * `contrato` = documento jurídico anexado (Loan).
 * `evidencia` = anexo de contrato armazenado em `loan_evidences`.
 * `manual` = lançamento criado pelo usuário direto na UI (sem documento).
 */
export type ConciliacaoOrigem =
  | "contracheque"
  | "extrato_bancario"
  | "contrato"
  | "evidencia"
  | "manual";

export type ConciliacaoNatureza =
  | "receita"
  | "desconto"
  | "emprestimo"
  | "cartao"
  | "saque"
  | "transferencia"
  | "tarifa"
  | "desconhecido";

export type StatusConciliacao =
  | "nao_conciliado"
  | "conciliado"
  | "possivel_duplicidade"
  | "precisa_revisao"
  | "congelada_operacionalmente"
  | "aguardando_recuperacao"
  | "suspensa_oficial";

/** Marcação que o usuário pode aplicar em uma linha para sobrescrever a inferência. */
export type StatusManualUsuario =
  | "salario"
  | "emprestimo_pessoal"
  | "transferencia_propria"
  | "pix_recebido"
  | "pagamento_emprestimo"
  | "duplicidade_contracheque"
  | "ignorar"
  | "precisa_contrato"
  | "contrato_localizado";

/**
 * Linha canônica da Base_Conciliada. Cada linha representa UM evento financeiro
 * (uma rubrica de contracheque, uma transação bancária, um contrato anexado, etc.).
 *
 * As flags `pode_somar_*` decidem em quais agregações a linha entra:
 * - `pode_somar_composicao_folha`: usar em gráficos de "como está composta a folha".
 *   Só rubricas de contracheque (vantagens + descontos oficiais) entram.
 * - `pode_somar_fluxo_caixa`: usar em "dinheiro que entrou/saiu da conta".
 *   Só extratos bancários NÃO duplicados entram.
 */
export type BaseConciliadaLinha = {
  id: string;
  data: string;
  competencia: string;
  origem: ConciliacaoOrigem;
  banco_origem: string;
  banco_destino: string;
  descricao_original: string;
  descricao_normalizada: string;
  valor: number;
  natureza: ConciliacaoNatureza;
  categoria_canonica: string;
  grupo_canonico: string;
  pode_somar_fluxo_caixa: boolean;
  pode_somar_composicao_folha: boolean;
  possivel_duplicidade: boolean;
  vinculo_contracheque_id: string | null;
  vinculo_extrato_id: string | null;
  vinculo_contrato_id: string | null;
  status_conciliacao: StatusConciliacao;
  observacao: string;
  /** Marca colocada pelo usuário; sobrepõe a inferência automática quando presente. */
  status_manual: StatusManualUsuario | null;
  /**
   * Documento de folha (nunca `extrato_bancario`).
   * Preenchido apenas em linhas `origem === "contracheque"`.
   */
  tipo_origem_folha?: TipoOrigemFolha | null;
  /** Banco/IF observado na rubrica — nunca sobrescrito pelo ConsigFácil. */
  instituicao_original_folha?: string | null;
  contexto_instituicao?: import("@/lib/conciliacao/contexto-instituicao-folha-consigfacil").ContextoInstituicaoConciliacao | null;
  autoridade_temporal_consigfacil?: import("@/lib/consigfacil/autoridade-temporal-consigfacil").AutoridadeTemporalConsigfacil | null;
  contrato_migrado_para_consigfacil?: boolean;
  tipo_correlacao_temporal?: string | null;
  data_implantacao_fonte?: string | null;
  mensagem_autoridade_temporal?: string | null;
};

// ============================================================================
// Dicionários (export para testes / extensão)
// ============================================================================

/** Termos que aparecem em CRÉDITOS de empréstimo no extrato. */
export const TERMOS_EMPRESTIMO_CREDITO: ReadonlyArray<string> = [
  "EMPRESTIMO",
  "CREDITO PESSOAL",
  "CDC",
  "FINANCIAMENTO",
  "REFIN",
  "REFINANCIAMENTO",
  "PORTABILIDADE",
  "TROCO",
  "LIBERACAO EMPRESTIMO",
  "CONTRATO",
  "CONSIGNADO",
  "CAPITAL GIRO",
  "ANTECIPACAO",
  "SAQUE EMPRESTIMO",
  "SAQUE CREDITO",
];

/** Termos que aparecem em DÉBITOS / pagamentos de empréstimo no extrato. */
export const TERMOS_PAGAMENTO_EMPRESTIMO: ReadonlyArray<string> = [
  "PARCELA EMPRESTIMO",
  "DEBITO EMPRESTIMO",
  "DEBITO CONTRATO",
  "FINANCIAMENTO",
  "CDC",
  "CONSIGNADO",
  "CARTAO CONSIGNADO",
  "RMC",
  "RCC",
  "FATURA CARTAO",
  "PAGAMENTO MINIMO",
  "CREDCESTA",
];

/**
 * Instituições cujo core business é crédito (consignado / pessoal). Quando aparecem
 * com um termo de empréstimo (ou sozinhas com valor positivo relevante) viram
 * sinal forte de empréstimo pessoal creditado em conta.
 */
export const INSTITUICOES_CREDITO: ReadonlyArray<string> = [
  "BRADESCO",
  "CAIXA",
  "BANCO DO BRASIL",
  "BB",
  "ITAU",
  "SANTANDER",
  "DAYCOVAL",
  "BMG",
  "PAN",
  "FACTA",
  "C6",
  "OLE",
  "BANRISUL",
  "BANCO INDUSTRIAL",
  "BANCOOB",
  "SICOOB",
  "CREDCESTA",
  "MERCANTIL",
  "AGIBANK",
  "SAFRA",
];

/** Indícios de SALÁRIO LÍQUIDO em entrada bancária (governo / folha estadual / municipal). */
export const TERMOS_SALARIO_EXTRATO: ReadonlyArray<string> = [
  "SALARIO",
  "PAGAMENTO",
  "ESTADO",
  "GOVERNO",
  "SEAD",
  "PMAM",
  "FOLHA",
  "PROVENTOS",
  "VENCIMENTO",
];

/** Termos de cartão consignado / saque embutido em extrato. */
export const TERMOS_CARTAO_SAQUE: ReadonlyArray<string> = [
  "RMC",
  "RCC",
  "CARTAO CONSIGNADO",
  "CARTAO BENEFICIO",
  "CREDCESTA",
  "SAQUE CARTAO",
  "SAQUE CREDITO",
];

/** Tarifas/anuidades — não entram em receita/empréstimo. */
export const TERMOS_TARIFA: ReadonlyArray<string> = [
  "TARIFA",
  "ANUIDADE",
  "MENSALIDADE",
  "MANUTENCAO DE CONTA",
  "PACOTE SERVICO",
  "IOF",
];

/** Pix / transferências bancárias (mantém categoria neutra para fluxo de caixa). */
export const TERMOS_PIX_TRANSFERENCIA: ReadonlyArray<string> = [
  "PIX RECEBIDO",
  "PIX ENVIADO",
  "TED RECEBIDA",
  "TED ENVIADA",
  "DOC RECEBIDO",
  "DOC ENVIADO",
  "TRANSFERENCIA",
];

/** Tolerância padrão para conciliar valores quase iguais (R$). */
export const TOLERANCIA_VALOR_CONCILIACAO = 2.0;

/** Janela de dias para considerar uma transação próxima de uma data de pagamento/contrato. */
export const JANELA_DIAS_CONCILIACAO_PAGAMENTO = 7;

// ============================================================================
// Helpers de normalização e matching
// ============================================================================

/** Caixa alta + sem acentos + espaços normalizados. */
export function normalizarDescricaoConciliacao(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function contemAlgumTermo(textoNormalizado: string, termos: ReadonlyArray<string>): string | null {
  for (const termo of termos) {
    if (textoNormalizado.includes(termo)) return termo;
  }
  return null;
}

function diferencaDiasIso(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

function competenciaIso(date: string): string {
  return (date ?? "").slice(0, 7);
}

// ============================================================================
// Detecção: empréstimo pessoal CREDITADO em extrato
// ============================================================================

export type ResultadoDeteccaoEmprestimoExtrato = {
  detectado: boolean;
  categoria_canonica: string;
  natureza: ConciliacaoNatureza;
  banco_provavel: string | null;
  termo_detectado: string | null;
  motivo: string;
  status_conciliacao: StatusConciliacao;
  observacao: string;
};

/**
 * Tenta classificar uma entrada bancária positiva como empréstimo pessoal creditado.
 * Combinações que disparam o flag:
 * 1. Qualquer termo de TERMOS_EMPRESTIMO_CREDITO presente.
 * 2. Instituição de crédito + valor positivo relevante (>= R$ 200) sem casar com salário/Pix/transferência.
 *
 * Falsos positivos comuns evitados:
 * - Pix recebido (já está em TERMOS_PIX_TRANSFERENCIA).
 * - Salário (governo/folha).
 * - Transferências entre contas próprias.
 */
export function detectarEmprestimoPessoalNoExtrato(
  transacao: Transaction,
): ResultadoDeteccaoEmprestimoExtrato {
  const negativa: ResultadoDeteccaoEmprestimoExtrato = {
    detectado: false,
    categoria_canonica: "",
    natureza: "desconhecido",
    banco_provavel: null,
    termo_detectado: null,
    motivo: "",
    status_conciliacao: "nao_conciliado",
    observacao: "",
  };

  if (transacao.type !== "receita") return negativa;
  if (transacao.amount < 200) return negativa;

  const desc = normalizarDescricaoConciliacao(transacao.description);

  if (contemAlgumTermo(desc, TERMOS_SALARIO_EXTRATO)) return negativa;
  if (contemAlgumTermo(desc, TERMOS_PIX_TRANSFERENCIA)) return negativa;

  const termoEmprestimo = contemAlgumTermo(desc, TERMOS_EMPRESTIMO_CREDITO);
  const instituicao = contemAlgumTermo(desc, INSTITUICOES_CREDITO);

  if (!termoEmprestimo && !instituicao) return negativa;

  // Banco "BB", "ITAU", "BRADESCO", "CAIXA" sozinhos NÃO bastam — são bancos genéricos.
  const bancoGenerico =
    instituicao === "BB" ||
    instituicao === "ITAU" ||
    instituicao === "BRADESCO" ||
    instituicao === "CAIXA" ||
    instituicao === "SANTANDER" ||
    instituicao === "BANCO DO BRASIL";
  if (!termoEmprestimo && bancoGenerico) return negativa;

  const motivo = termoEmprestimo
    ? `Descrição contém termo de empréstimo: "${termoEmprestimo}"`
    : `Instituição de crédito reconhecida: "${instituicao}"`;

  return {
    detectado: true,
    categoria_canonica: "emprestimo_pessoal_creditado",
    natureza: "emprestimo",
    banco_provavel: instituicao,
    termo_detectado: termoEmprestimo ?? instituicao,
    motivo,
    status_conciliacao: "precisa_revisao",
    observacao:
      "Possível empréstimo pessoal creditado em conta bancária. Verificar contrato correspondente.",
  };
}

// ============================================================================
// Detecção: PAGAMENTO de empréstimo em extrato (débito recorrente)
// ============================================================================

export type ResultadoDeteccaoPagamentoExtrato = {
  detectado: boolean;
  categoria_canonica: string;
  natureza: ConciliacaoNatureza;
  termo_detectado: string | null;
  motivo: string;
  status_conciliacao: StatusConciliacao;
  observacao: string;
};

/**
 * Detecta saídas que parecem parcela / fatura / pagamento de empréstimo fora da folha.
 * Recorrência é checada externamente (precisa do histórico) — aqui só testamos a linha.
 */
export function detectarPagamentoEmprestimoNoExtrato(
  transacao: Transaction,
): ResultadoDeteccaoPagamentoExtrato {
  const negativa: ResultadoDeteccaoPagamentoExtrato = {
    detectado: false,
    categoria_canonica: "",
    natureza: "desconhecido",
    termo_detectado: null,
    motivo: "",
    status_conciliacao: "nao_conciliado",
    observacao: "",
  };

  if (transacao.type !== "despesa") return negativa;

  const desc = normalizarDescricaoConciliacao(transacao.description);
  const termo = contemAlgumTermo(desc, TERMOS_PAGAMENTO_EMPRESTIMO);
  const instituicao = contemAlgumTermo(desc, INSTITUICOES_CREDITO);

  // Saída só vira pagamento de empréstimo se tiver termo explícito OU instituição não-genérica.
  const bancoGenerico =
    instituicao === "BB" ||
    instituicao === "ITAU" ||
    instituicao === "BRADESCO" ||
    instituicao === "CAIXA" ||
    instituicao === "SANTANDER" ||
    instituicao === "BANCO DO BRASIL";

  if (!termo && (!instituicao || bancoGenerico)) return negativa;

  return {
    detectado: true,
    categoria_canonica: "pagamento_emprestimo_extrato",
    natureza: "desconto",
    termo_detectado: termo ?? instituicao,
    motivo: termo
      ? `Saída com termo de pagamento de empréstimo: "${termo}"`
      : `Saída para instituição de crédito: "${instituicao}"`,
    status_conciliacao: "precisa_revisao",
    observacao: "Pagamento de empréstimo localizado em extrato bancário fora da folha.",
  };
}

// ============================================================================
// Detecção: cartão consignado / saque embutido em extrato
// ============================================================================

export type ResultadoDeteccaoCartaoSaqueExtrato = {
  detectado: boolean;
  categoria_canonica: string;
  termo_detectado: string | null;
};

export function detectarCartaoSaqueNoExtrato(
  transacao: Transaction,
): ResultadoDeteccaoCartaoSaqueExtrato {
  const desc = normalizarDescricaoConciliacao(transacao.description);
  const termo = contemAlgumTermo(desc, TERMOS_CARTAO_SAQUE);
  if (!termo) return { detectado: false, categoria_canonica: "", termo_detectado: null };

  let categoria: string = "cartao_consignado_extrato";
  if (termo === "RMC") categoria = "rmc";
  else if (termo === "RCC") categoria = "rcc";
  else if (termo === "CREDCESTA") categoria = "credcesta_saque";
  else if (termo === "SAQUE CARTAO" || termo === "SAQUE CREDITO") categoria = "saque_cartao_extrato";

  return { detectado: true, categoria_canonica: categoria, termo_detectado: termo };
}

// ============================================================================
// Conciliação: extrato vs contracheque (líquido do mês)
// ============================================================================

export type ResultadoConciliacaoFolhaExtrato = {
  competencia: string;
  contracheque_id: string;
  extrato_id: string | null;
  liquido_contracheque: number;
  liquido_extrato: number | null;
  diferenca: number | null;
  status: StatusConciliacao;
  motivo: string;
};

/**
 * Para cada contracheque, tenta achar a transação bancária que melhor se aproxima do líquido.
 * Regras (sequenciais):
 * 1. Mesma competência (YYYY-MM).
 * 2. Tipo = receita, e descrição contém algum termo de TERMOS_SALARIO_EXTRATO.
 * 3. |valor − net_salary| <= TOLERANCIA_VALOR_CONCILIACAO.
 * 4. Maior preferência para a transação mais próxima do dia 1º do mês seguinte (pagamento típico).
 */
export function conciliarExtratoComContracheque(
  extratos: Transaction[],
  contracheques: Payslip[],
): ResultadoConciliacaoFolhaExtrato[] {
  const resultados: ResultadoConciliacaoFolhaExtrato[] = [];

  for (const p of contracheques) {
    const competencia = `${p.year}-${String(p.month).padStart(2, "0")}`;
    const dataAlvo = `${competencia}-01`;

    const candidatos = extratos.filter((t) => {
      if (t.type !== "receita") return false;
      if (competenciaIso(t.date) !== competencia) return false;
      const desc = normalizarDescricaoConciliacao(t.description);
      if (!contemAlgumTermo(desc, TERMOS_SALARIO_EXTRATO)) return false;
      return Math.abs(t.amount - p.net_salary) <= TOLERANCIA_VALOR_CONCILIACAO;
    });

    if (candidatos.length === 0) {
      // Procurar match mais frouxo: receita do mês com valor próximo (sem termo salário)
      const frouxo = extratos
        .filter(
          (t) =>
            t.type === "receita" &&
            competenciaIso(t.date) === competencia &&
            Math.abs(t.amount - p.net_salary) <= TOLERANCIA_VALOR_CONCILIACAO,
        )
        .sort((a, b) => diferencaDiasIso(a.date, dataAlvo) - diferencaDiasIso(b.date, dataAlvo))[0];

      if (frouxo) {
        resultados.push({
          competencia,
          contracheque_id: p.id,
          extrato_id: frouxo.id,
          liquido_contracheque: p.net_salary,
          liquido_extrato: frouxo.amount,
          diferenca: Math.abs(frouxo.amount - p.net_salary),
          status: "precisa_revisao",
          motivo:
            "Valor próximo do líquido mas descrição sem termo salarial claro — confirmar manualmente.",
        });
      } else {
        resultados.push({
          competencia,
          contracheque_id: p.id,
          extrato_id: null,
          liquido_contracheque: p.net_salary,
          liquido_extrato: null,
          diferenca: null,
          status: "nao_conciliado",
          motivo: "Sem transação de receita compatível com o líquido do mês.",
        });
      }
      continue;
    }

    const melhor = [...candidatos].sort(
      (a, b) => diferencaDiasIso(a.date, dataAlvo) - diferencaDiasIso(b.date, dataAlvo),
    )[0];

    resultados.push({
      competencia,
      contracheque_id: p.id,
      extrato_id: melhor.id,
      liquido_contracheque: p.net_salary,
      liquido_extrato: melhor.amount,
      diferenca: Math.abs(melhor.amount - p.net_salary),
      status: candidatos.length === 1 ? "conciliado" : "possivel_duplicidade",
      motivo:
        candidatos.length === 1
          ? "Salário líquido localizado no extrato com tolerância de R$ 2,00."
          : `Encontradas ${candidatos.length} transações compatíveis no mês — selecionada a mais próxima do dia 1º.`,
    });
  }

  return resultados;
}

// ============================================================================
// Conciliação: extrato vs contrato (Loan) — liberação do empréstimo na conta
// ============================================================================

export type ResultadoConciliacaoContratoExtrato = {
  contrato_id: string;
  contrato_descricao: string;
  instituicao: string | null;
  data_inicio_contrato: string;
  valor_contrato: number;
  extrato_id: string | null;
  data_extrato: string | null;
  valor_extrato: number | null;
  diferenca: number | null;
  status: "contrato_encontrado" | "contrato_possivel" | "sem_contrato" | "precisa_revisao";
  motivo: string;
};

/**
 * Tenta achar a transação de crédito que representa a LIBERAÇÃO do empréstimo.
 * Regras:
 * - Transação de receita.
 * - Data dentro de uma janela de ±JANELA_DIAS_CONCILIACAO_PAGAMENTO dias da `start_date`.
 * - |valor − total_amount| <= 5% do total ou <= R$ 100, o que for maior (margem para TAC/IOF).
 * - Bonus: descrição contém o nome da instituição do contrato.
 */
export function conciliarExtratoComContrato(
  extratos: Transaction[],
  contratos: Loan[],
): ResultadoConciliacaoContratoExtrato[] {
  const resultados: ResultadoConciliacaoContratoExtrato[] = [];

  for (const c of contratos) {
    const instituicaoNorm = normalizarDescricaoConciliacao(c.institution_name ?? "");
    const margem = Math.max(c.total_amount * 0.05, 100);
    const dataInicio = String(c.start_date).slice(0, 10);

    const candidatos = extratos.filter((t) => {
      if (t.type !== "receita") return false;
      const distancia = diferencaDiasIso(t.date, dataInicio);
      if (distancia > JANELA_DIAS_CONCILIACAO_PAGAMENTO) return false;
      return Math.abs(t.amount - c.total_amount) <= margem;
    });

    if (candidatos.length === 0) {
      resultados.push({
        contrato_id: c.id,
        contrato_descricao: c.description,
        instituicao: c.institution_name ?? null,
        data_inicio_contrato: dataInicio,
        valor_contrato: c.total_amount,
        extrato_id: null,
        data_extrato: null,
        valor_extrato: null,
        diferenca: null,
        status: "sem_contrato",
        motivo:
          "Nenhuma transação de crédito próxima da data inicial do contrato com valor compatível.",
      });
      continue;
    }

    // Prioriza candidatos cuja descrição também menciona a instituição do contrato.
    const comInstituicao = candidatos.filter((t) => {
      if (!instituicaoNorm) return false;
      const desc = normalizarDescricaoConciliacao(t.description);
      return desc.includes(instituicaoNorm);
    });
    const pool = comInstituicao.length > 0 ? comInstituicao : candidatos;
    const melhor = [...pool].sort(
      (a, b) =>
        diferencaDiasIso(a.date, dataInicio) - diferencaDiasIso(b.date, dataInicio) ||
        Math.abs(a.amount - c.total_amount) - Math.abs(b.amount - c.total_amount),
    )[0];

    const status: ResultadoConciliacaoContratoExtrato["status"] =
      comInstituicao.length > 0 ? "contrato_encontrado" : "contrato_possivel";

    resultados.push({
      contrato_id: c.id,
      contrato_descricao: c.description,
      instituicao: c.institution_name ?? null,
      data_inicio_contrato: dataInicio,
      valor_contrato: c.total_amount,
      extrato_id: melhor.id,
      data_extrato: melhor.date.slice(0, 10),
      valor_extrato: melhor.amount,
      diferenca: Math.abs(melhor.amount - c.total_amount),
      status,
      motivo:
        status === "contrato_encontrado"
          ? "Crédito próximo da assinatura, valor compatível e descrição cita a instituição do contrato."
          : "Crédito próximo da assinatura com valor compatível — confirmar instituição manualmente.",
    });
  }

  return resultados;
}

// ============================================================================
// Classificação de uma transação para a Base_Conciliada
// ============================================================================

type ClassificacaoExtrato = {
  natureza: ConciliacaoNatureza;
  categoria_canonica: string;
  grupo_canonico: string;
  banco_origem: string;
  banco_destino: string;
  status_conciliacao: StatusConciliacao;
  observacao: string;
};

function classificarTransacaoParaBaseConciliada(t: Transaction): ClassificacaoExtrato {
  const desc = normalizarDescricaoConciliacao(t.description);

  // Tarifas — categoria isolada (não vira receita nem desconto de empréstimo).
  if (contemAlgumTermo(desc, TERMOS_TARIFA)) {
    return {
      natureza: "tarifa",
      categoria_canonica: "tarifa_bancaria",
      grupo_canonico: "tarifas_bancarias",
      banco_origem: "",
      banco_destino: "",
      status_conciliacao: "nao_conciliado",
      observacao: "Tarifa/anuidade bancária — não considerar como receita nem como empréstimo.",
    };
  }

  // Cartão / RMC / RCC / saque embutido
  const cartao = detectarCartaoSaqueNoExtrato(t);
  if (cartao.detectado) {
    return {
      natureza: t.type === "receita" ? "saque" : "cartao",
      categoria_canonica: cartao.categoria_canonica,
      grupo_canonico: "cartao_consignado",
      banco_origem: "",
      banco_destino: "",
      status_conciliacao: "precisa_revisao",
      observacao:
        "Movimentação compatível com cartão consignado / saque embutido — verificar contrato.",
    };
  }

  // Crédito de empréstimo
  if (t.type === "receita") {
    const emp = detectarEmprestimoPessoalNoExtrato(t);
    if (emp.detectado) {
      return {
        natureza: emp.natureza,
        categoria_canonica: emp.categoria_canonica,
        grupo_canonico: "emprestimo_creditado",
        banco_origem: emp.banco_provavel ?? "",
        banco_destino: "",
        status_conciliacao: emp.status_conciliacao,
        observacao: emp.observacao,
      };
    }

    // Pix / transferência (neutro para fluxo de caixa, mas não é salário nem empréstimo)
    if (contemAlgumTermo(desc, ["PIX RECEBIDO"])) {
      return {
        natureza: "receita",
        categoria_canonica: "pix_recebido",
        grupo_canonico: "entradas_bancarias",
        banco_origem: "",
        banco_destino: "",
        status_conciliacao: "nao_conciliado",
        observacao: "",
      };
    }
    if (contemAlgumTermo(desc, ["TED RECEBIDA", "DOC RECEBIDO", "TRANSFERENCIA"])) {
      return {
        natureza: "transferencia",
        categoria_canonica: "transferencia_recebida",
        grupo_canonico: "entradas_bancarias",
        banco_origem: "",
        banco_destino: "",
        status_conciliacao: "nao_conciliado",
        observacao: "",
      };
    }

    // Possível salário (matching de contracheque é resolvido depois)
    if (contemAlgumTermo(desc, TERMOS_SALARIO_EXTRATO)) {
      return {
        natureza: "receita",
        categoria_canonica: "salario_liquido_extrato",
        grupo_canonico: "entradas_bancarias",
        banco_origem: "",
        banco_destino: "",
        status_conciliacao: "nao_conciliado",
        observacao: "",
      };
    }

    return {
      natureza: "receita",
      categoria_canonica: "outras_entradas",
      grupo_canonico: "entradas_bancarias",
      banco_origem: "",
      banco_destino: "",
      status_conciliacao: "nao_conciliado",
      observacao: "",
    };
  }

  // Despesa: tenta detectar pagamento de empréstimo
  const pag = detectarPagamentoEmprestimoNoExtrato(t);
  if (pag.detectado) {
    return {
      natureza: pag.natureza,
      categoria_canonica: pag.categoria_canonica,
      grupo_canonico: "pagamentos_emprestimos",
      banco_origem: "",
      banco_destino: "",
      status_conciliacao: pag.status_conciliacao,
      observacao: pag.observacao,
    };
  }

  if (contemAlgumTermo(desc, ["PIX ENVIADO"])) {
    return {
      natureza: "transferencia",
      categoria_canonica: "pix_enviado",
      grupo_canonico: "saidas_bancarias",
      banco_origem: "",
      banco_destino: "",
      status_conciliacao: "nao_conciliado",
      observacao: "",
    };
  }
  if (contemAlgumTermo(desc, ["TED ENVIADA", "DOC ENVIADO", "TRANSFERENCIA"])) {
    return {
      natureza: "transferencia",
      categoria_canonica: "transferencia_enviada",
      grupo_canonico: "saidas_bancarias",
      banco_origem: "",
      banco_destino: "",
      status_conciliacao: "nao_conciliado",
      observacao: "",
    };
  }

  return {
    natureza: "desconto",
    categoria_canonica: "outras_saidas",
    grupo_canonico: "saidas_bancarias",
    banco_origem: "",
    banco_destino: "",
    status_conciliacao: "nao_conciliado",
    observacao: "",
  };
}

// ============================================================================
// Builder principal: Base_Conciliada + abas derivadas
// ============================================================================

export type EntradaStatusManualBaseConciliada = {
  /** ID do evento original (`transacao:<id>`, `contracheque:<payslipId>:<idx>`, `contrato:<loanId>`). */
  eventoId: string;
  status: StatusManualUsuario;
};

export type EntradaBuildBaseConciliada = {
  transactions: Transaction[];
  payslips: Payslip[];
  loans: Loan[];
  evidencias?: LoanEvidence[];
  /** Marcações manuais do usuário que sobrepõem inferência. */
  statusManual?: ReadonlyArray<EntradaStatusManualBaseConciliada>;
};

export type ResultadoBaseConciliada = {
  baseConciliada: BaseConciliadaLinha[];
  extratosBancarios: BaseConciliadaLinha[];
  emprestimosExtrato: BaseConciliadaLinha[];
  pagamentosEmprestimosExtrato: BaseConciliadaLinha[];
  duplicidadesProvaveis: BaseConciliadaLinha[];
  conciliacaoFolhaExtrato: ResultadoConciliacaoFolhaExtrato[];
  conciliacaoContratoExtrato: ResultadoConciliacaoContratoExtrato[];
};

const STATUS_PARA_REGRA: Record<
  StatusManualUsuario,
  Partial<Pick<BaseConciliadaLinha, "natureza" | "categoria_canonica" | "pode_somar_fluxo_caixa" | "pode_somar_composicao_folha" | "possivel_duplicidade" | "status_conciliacao" | "observacao">>
> = {
  salario: {
    natureza: "receita",
    categoria_canonica: "salario_liquido_extrato",
    pode_somar_fluxo_caixa: true,
    pode_somar_composicao_folha: false,
    status_conciliacao: "conciliado",
  },
  emprestimo_pessoal: {
    natureza: "emprestimo",
    categoria_canonica: "emprestimo_pessoal_creditado",
    pode_somar_fluxo_caixa: true,
    pode_somar_composicao_folha: false,
    status_conciliacao: "precisa_revisao",
  },
  transferencia_propria: {
    natureza: "transferencia",
    categoria_canonica: "transferencia_propria",
    pode_somar_fluxo_caixa: false,
    pode_somar_composicao_folha: false,
    status_conciliacao: "conciliado",
    observacao: "Transferência entre contas próprias — não somar como receita.",
  },
  pix_recebido: {
    natureza: "receita",
    categoria_canonica: "pix_recebido",
    pode_somar_fluxo_caixa: true,
    pode_somar_composicao_folha: false,
    status_conciliacao: "conciliado",
  },
  pagamento_emprestimo: {
    natureza: "desconto",
    categoria_canonica: "pagamento_emprestimo_extrato",
    pode_somar_fluxo_caixa: true,
    pode_somar_composicao_folha: false,
    status_conciliacao: "conciliado",
  },
  duplicidade_contracheque: {
    possivel_duplicidade: true,
    pode_somar_fluxo_caixa: false,
    pode_somar_composicao_folha: false,
    status_conciliacao: "possivel_duplicidade",
    observacao:
      "Marcado pelo usuário como duplicidade do contracheque — não somar com a folha.",
  },
  ignorar: {
    pode_somar_fluxo_caixa: false,
    pode_somar_composicao_folha: false,
    status_conciliacao: "conciliado",
    observacao: "Linha marcada como ignorada pelo usuário.",
  },
  precisa_contrato: {
    status_conciliacao: "precisa_revisao",
    observacao: "Linha aguarda anexar contrato/evidência correspondente.",
  },
  contrato_localizado: {
    status_conciliacao: "conciliado",
    observacao: "Contrato/evidência localizado pelo usuário para esta linha.",
  },
};

function aplicarStatusManual(
  linha: BaseConciliadaLinha,
  status: StatusManualUsuario | null,
): BaseConciliadaLinha {
  if (!status) return linha;
  const regra = STATUS_PARA_REGRA[status];
  return { ...linha, ...regra, status_manual: status };
}

/**
 * Constrói a Base_Conciliada a partir das fontes brutas.
 *
 * Pipeline:
 * 1. Cada `Transaction` vira UMA linha de origem `extrato_bancario` classificada.
 * 2. Cada `PayslipItem` vira UMA linha de origem `contracheque` (composição da folha).
 * 3. Cada `Loan` vira UMA linha de origem `contrato`.
 * 4. Roda conciliação extrato↔contracheque e marca duplicidades de salário.
 * 5. Roda conciliação extrato↔contrato e vincula `vinculo_contrato_id`.
 * 6. Aplica `statusManual` por último — usuário tem a última palavra.
 */
export function buildBaseConciliada(
  input: EntradaBuildBaseConciliada,
): ResultadoBaseConciliada {
  const { payslips, loans } = input;
  const transacoesBancariasReais = filtrarTransacoesBancariasReais(input.transactions);
  const fonteBancariaReal = possuiFonteBancariaReal(input.transactions);
  const bloqueioBancario = bloquearInferenciaBancariaHistorica(fonteBancariaReal);

  const statusManualPorEvento = new Map<string, StatusManualUsuario>(
    (input.statusManual ?? []).map((s) => [s.eventoId, s.status] as const),
  );

  const baseConciliada: BaseConciliadaLinha[] = [];

  // --- Linhas vindas de TRANSAÇÕES reais (OFX/PDF/CSV/import) — nunca folha inferida
  for (const t of transacoesBancariasReais) {
    const eventoId = `transacao:${t.id}`;
    const classif = classificarTransacaoParaBaseConciliada(t);
    const linha: BaseConciliadaLinha = {
      id: eventoId,
      data: String(t.date).slice(0, 10),
      competencia: competenciaIso(t.date),
      origem: "extrato_bancario",
      banco_origem: classif.banco_origem,
      banco_destino: classif.banco_destino,
      descricao_original: t.description,
      descricao_normalizada: normalizarDescricaoConciliacao(t.description),
      valor: t.amount,
      natureza: classif.natureza,
      categoria_canonica: classif.categoria_canonica,
      grupo_canonico: classif.grupo_canonico,
      pode_somar_fluxo_caixa: true,
      pode_somar_composicao_folha: false,
      possivel_duplicidade: false,
      vinculo_contracheque_id: null,
      vinculo_extrato_id: t.id,
      vinculo_contrato_id: null,
      status_conciliacao: classif.status_conciliacao,
      observacao: classif.observacao,
      status_manual: null,
    };
    baseConciliada.push(linha);
  }

  // --- Linhas vindas de CONTRACHEQUES (rubricas)
  for (const p of payslips) {
    const competencia = `${p.year}-${String(p.month).padStart(2, "0")}`;
    const dataIso = `${competencia}-01`;
    (p.items ?? []).forEach((it, idx) => {
      const eventoId = `contracheque:${p.id}:${idx}`;
      const descNorm = normalizarDescricaoConciliacao(it.description);
      const ehVantagem = it.type === "vantagem";

      let categoria: string = ehVantagem ? "rubrica_vantagem" : "rubrica_desconto";
      let natureza: ConciliacaoNatureza = ehVantagem ? "receita" : "desconto";
      let grupo: string = ehVantagem ? "remuneracao_bruta" : "descontos_oficiais";

      // Classifica rubricas conhecidas de cartão / consignado dentro do contracheque
      if (descNorm.includes("RMC")) {
        categoria = "rmc";
        natureza = "cartao";
        grupo = "cartao_consignado";
      } else if (descNorm.includes("RCC")) {
        categoria = "rcc";
        natureza = "cartao";
        grupo = "cartao_consignado";
      } else if (descNorm.includes("CREDCESTA")) {
        categoria = "credcesta_compra";
        natureza = "cartao";
        grupo = "cartao_consignado";
      } else if (descNorm.includes("CARTAO") && descNorm.includes("CONSIG")) {
        categoria = "cartao_consignado_folha";
        natureza = "cartao";
        grupo = "cartao_consignado";
      } else if (descNorm.includes("SAQUE")) {
        categoria = "saque_cartao_folha";
        natureza = "saque";
        grupo = "cartao_consignado";
      } else if (
        /\bEMPREST|CONSIG|FINANC|REFIN|PARCELA|CDC/.test(descNorm) &&
        it.type === "desconto"
      ) {
        categoria = "parcela_emprestimo_folha";
        natureza = "emprestimo";
        grupo = "emprestimos_folha";
      }

      const instFolha = extrairInstituicaoOriginalFolha(
        it.description,
        it.bancoConfirmacao?.nome ?? it.banco?.nome,
      );
      const linha: BaseConciliadaLinha = {
        id: eventoId,
        data: dataIso,
        competencia,
        origem: "contracheque",
        tipo_origem_folha: resolverTipoOrigemFolha(p),
        instituicao_original_folha: instFolha.instituicao_original_folha,
        banco_origem: instFolha.banco_original ?? "",
        banco_destino: "",
        descricao_original: it.description,
        descricao_normalizada: descNorm,
        valor: it.value,
        natureza,
        categoria_canonica: categoria,
        grupo_canonico: grupo,
        pode_somar_fluxo_caixa: false,
        pode_somar_composicao_folha: true,
        possivel_duplicidade: false,
        vinculo_contracheque_id: p.id,
        vinculo_extrato_id: null,
        vinculo_contrato_id: null,
        status_conciliacao: "nao_conciliado",
        observacao: "",
        status_manual: null,
      };
      baseConciliada.push(linha);
    });
  }

  // --- Linhas vindas de CONTRATOS anexados (não somam em fluxo nem em folha)
  for (const c of loans) {
    const eventoId = `contrato:${c.id}`;
    const linha: BaseConciliadaLinha = {
      id: eventoId,
      data: String(c.start_date).slice(0, 10),
      competencia: competenciaIso(String(c.start_date)),
      origem: "contrato",
      banco_origem: c.institution_name ?? "",
      banco_destino: "",
      descricao_original: c.description,
      descricao_normalizada: normalizarDescricaoConciliacao(c.description),
      valor: c.total_amount,
      natureza: "emprestimo",
      categoria_canonica: "contrato_anexado",
      grupo_canonico: "contratos",
      pode_somar_fluxo_caixa: false,
      pode_somar_composicao_folha: false,
      possivel_duplicidade: false,
      vinculo_contracheque_id: null,
      vinculo_extrato_id: null,
      vinculo_contrato_id: c.id,
      status_conciliacao: "nao_conciliado",
      observacao: "Documento jurídico anexado — referência para conciliação.",
      status_manual: null,
    };
    baseConciliada.push(linha);
  }

  let conciliacaoFolhaExtrato: ResultadoConciliacaoFolhaExtrato[] = [];
  let conciliacaoContratoExtrato: ResultadoConciliacaoContratoExtrato[] = [];

  if (!bloqueioBancario.bloqueado) {
    // --- Conciliação salário (extrato ↔ contracheque) — só com fonte bancária real
    conciliacaoFolhaExtrato = conciliarExtratoComContracheque(transacoesBancariasReais, payslips);
    const extratoIdParaCheque = new Map<string, { contrachequeId: string; competencia: string }>();
    for (const r of conciliacaoFolhaExtrato) {
      if (r.extrato_id) {
        extratoIdParaCheque.set(r.extrato_id, {
          contrachequeId: r.contracheque_id,
          competencia: r.competencia,
        });
      }
    }

    for (const linha of baseConciliada) {
      if (linha.origem !== "extrato_bancario" || !linha.vinculo_extrato_id) continue;
      const vinculo = extratoIdParaCheque.get(linha.vinculo_extrato_id);
      if (!vinculo) continue;

      linha.vinculo_contracheque_id = vinculo.contrachequeId;
      if (linha.categoria_canonica === "salario_liquido_extrato") {
        linha.possivel_duplicidade = true;
        linha.status_conciliacao = "possivel_duplicidade";
        linha.observacao =
          "Entrada bancária possivelmente corresponde ao líquido do contracheque. Não somar com rubricas da folha.";
        linha.pode_somar_fluxo_caixa = true;
        linha.pode_somar_composicao_folha = false;
      }
    }

    // --- Conciliação contrato ↔ extrato (liberação do empréstimo)
    conciliacaoContratoExtrato = conciliarExtratoComContrato(transacoesBancariasReais, loans);
    const extratoIdParaContrato = new Map<string, string>();
    for (const r of conciliacaoContratoExtrato) {
      if (
        r.extrato_id &&
        (r.status === "contrato_encontrado" || r.status === "contrato_possivel")
      ) {
        extratoIdParaContrato.set(r.extrato_id, r.contrato_id);
      }
    }
    for (const linha of baseConciliada) {
      if (linha.origem !== "extrato_bancario" || !linha.vinculo_extrato_id) continue;
      const contratoId = extratoIdParaContrato.get(linha.vinculo_extrato_id);
      if (!contratoId) continue;
      linha.vinculo_contrato_id = contratoId;
      if (linha.categoria_canonica === "emprestimo_pessoal_creditado") {
        linha.status_conciliacao = "conciliado";
        linha.observacao =
          "Empréstimo creditado em conta associado ao contrato anexado correspondente.";
      }
    }
  }

  // --- Status manual sobrescreve qualquer inferência
  for (let i = 0; i < baseConciliada.length; i++) {
    const manual = statusManualPorEvento.get(baseConciliada[i].id) ?? null;
    baseConciliada[i] = aplicarStatusManual(baseConciliada[i], manual);
  }

  const baseLimpa = limparLinhasInferenciaBancariaSemFonte(baseConciliada, fonteBancariaReal);

  // --- Filtros derivados para as abas
  const extratosBancarios = baseLimpa.filter((l) => l.origem === "extrato_bancario");
  const emprestimosExtrato = extratosBancarios.filter(
    (l) => l.categoria_canonica === "emprestimo_pessoal_creditado",
  );
  const pagamentosEmprestimosExtrato = extratosBancarios.filter(
    (l) => l.categoria_canonica === "pagamento_emprestimo_extrato",
  );
  const duplicidadesProvaveis = baseLimpa.filter((l) => l.possivel_duplicidade);

  baseLimpa.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

  return {
    baseConciliada: baseLimpa,
    extratosBancarios,
    emprestimosExtrato,
    pagamentosEmprestimosExtrato,
    duplicidadesProvaveis,
    conciliacaoFolhaExtrato,
    conciliacaoContratoExtrato,
  };
}

// ============================================================================
// Dicionário de colunas (para a aba Dicionario_Colunas do XLSX)
// ============================================================================

export function dicionarioColunasConciliacao(): Array<Record<string, string>> {
  const linhas: Array<[string, string]> = [
    ["banco_origem", "Instituição financeira de origem (folha, contrato ou extrato), quando identificada."],
    ["banco_destino", "Instituição de destino quando aplicável (ex.: TED entre bancos)."],
    ["natureza", "receita, desconto, emprestimo, cartao, saque, transferencia, tarifa ou desconhecido."],
    ["categoria_canonica", "Categoria fina (ex.: salario_liquido_extrato, emprestimo_pessoal_creditado, rmc)."],
    ["grupo_canonico", "Agrupador analítico (ex.: entradas_bancarias, cartao_consignado, contratos)."],
    ["pode_somar_fluxo_caixa", "true → entra na soma do FLUXO DE CAIXA bancário."],
    ["pode_somar_composicao_folha", "true → entra na soma da COMPOSIÇÃO DA FOLHA."],
    ["possivel_duplicidade", "true → não somar com a folha (salário-extrato vs. rubricas)."],
    ["vinculo_contracheque_id", "ID do contracheque conciliado (quando salário-extrato bate com a folha)."],
    ["vinculo_extrato_id", "ID da transação do extrato (para cruzar com a tabela `transactions`)."],
    ["vinculo_contrato_id", "ID do contrato (Loan) ligado à linha quando há crédito de empréstimo conciliado."],
    ["status_conciliacao", "nao_conciliado | conciliado | possivel_duplicidade | precisa_revisao."],
    ["status_manual", "Override do usuário: salario | emprestimo_pessoal | transferencia_propria | …"],
  ];
  return linhas.map(([coluna, descricao]) => ({ coluna, descricao }));
}
