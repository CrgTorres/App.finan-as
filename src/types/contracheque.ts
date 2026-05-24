export type LoanStatus = "ativo" | "quitado";

export interface Loan {
  id: string;
  user_id: string;
  description: string;
  total_amount: number;
  installment_amount: number;
  total_installments: number;
  paid_installments: number;
  start_date: string; // YYYY-MM-DD
  status: LoanStatus;
  payoff_date?: string;
  created_at: string;
  /** Código da rubrica (apenas dígitos), quando preenchido no cadastro ou importação. */
  rubrica_code?: string | null;
  institution_name?: string | null;
  parcela_inicial_detectada?: number | null;
  parcela_final_detectada?: number | null;
  primeira_aparicao?: string | null;
  ultima_aparicao?: string | null;
  quantidade_aparicoes?: number | null;
  total_pago_detectado?: number | null;
  tipo_contrato?: string | null;
  origem?: string | null;
  status_analise_contracheque?: string | null;
  /** Continuidade estrutural na folha (074/088 → 075/088…). */
  timeline_parcelas?: import("@/lib/conciliacao/timeline-estrutural-contrato").TimelineParcelaContrato[];
  classificacao_continuidade?: import("@/lib/conciliacao/timeline-estrutural-contrato").ClassificacaoContinuidadeTimeline;
  timeline_analise?: import("@/lib/conciliacao/timeline-estrutural-contrato").ResultadoAnaliseTimelineEstrutural;
}

export interface LoanPayoff {
  id: string;
  loan_id: string;
  user_id: string;
  confirmed_installments: number;
  payoff_date: string;
  notes?: string;
  created_at: string;
}

export type PayslipItemType = "vantagem" | "desconto";

/** Instituição citada na rubrica (ex.: consignado “EMP CONSIG BB”). */
export interface PayslipItemBanco {
  compe: string;
  nome: string;
  matchedToken: string;
}

/** Cruza COMPE curado + indício de crédito; links Bacen / portal para conferência manual. */
export interface PayslipItemBancoConfirmacao {
  compe: string;
  nome: string;
  confiancaRef: "alta" | "media";
  urlsReferencia: readonly string[];
}

export interface PayslipItem {
  /** Descrição da rubrica sem parcela N/M (valores em `parcelaAtual` / `parcelaTotal`). */
  description: string;
  value: number;
  type: PayslipItemType;
  code?: string; // código da rubrica (ex: "0001")
  /** Preenchido quando o texto da rubrica reconhece banco/sigla conhecida. */
  banco?: PayslipItemBanco;
  /** COMPE + nome alinhados a cadastro curado e indício de consignado (não substitui revisão do PDF). */
  bancoConfirmacao?: PayslipItemBancoConfirmacao;
  /**
   * Consignado: parcela corrente / total na folha (ex. 01/48), quando consta após o nome do contrato.
   * A chave de histórico de descontos ignora N/M para cruzar o mesmo empréstimo mês a mês.
   */
  parcelaAtual?: number;
  parcelaTotal?: number;
}

/** Origem do registro na tabela `payslips` (anexos da folha). */
export type PayslipDocumentKind =
  | "contracheque_mensal"
  | "ficha_financeira"
  | "outro";

/**
 * Caso existam **dois** PDFs no mesmo mês/ano (folha normal + folha especial, ex. 13º antecipado):
 * grava em linhas distintas — exige coluna `folha_emit_kind` e UNIQUE (user_id, month, year, folha_emit_kind).
 */
export type PayslipFolhaEmitKind =
  | "mensal_principal"
  | "folha_especial"
  | "ficha_import"
  /** Visão sintética: vários anexos da mesma competência fundidos em memória (não persiste na BD). */
  | "merged_multi_anexo";

export interface Payslip {
  id: string;
  user_id: string;
  month: number; // 1–12
  year: number;
  gross_salary: number;
  net_salary: number;
  total_discounts: number;
  items: PayslipItem[];
  raw_text: string;
  file_name: string;
  /** Legenda do anexo quando a coluna existir no Supabase. */
  document_kind?: PayslipDocumentKind | string | null;
  /** Emissão quando há mais de um extrato no mesmo mês (ver `PayslipFolhaEmitKind`). */
  folha_emit_kind?: PayslipFolhaEmitKind | string | null;
  created_at: string;
  /** Detecção cartão/RMC/RCC (`patch_payslips_cartao_saque_embutido.sql`). */
  cartao_saque_embutido_detectado?: boolean | null;
  cartao_saque_tipo?: string | null;
  cartao_saque_risco?: string | null;
  cartao_saque_termos?: string[] | null;
  cartao_saque_linhas?: string[] | null;
  cartao_saque_valor_mensal?: number | null;
  cartao_saque_banco_possivel?: string | null;
  cartao_saque_observacao?: string | null;
  cartao_saque_status_conferencia?: string | null;
  cartao_saque_analise_json?: import("@/types/cartao-saque-embutido").AnaliseCartaoSaqueContracheque | null;
}

export interface LoanProjection {
  paidAmount: number;
  remainingAmount: number;
  remainingInstallments: number;
  percentComplete: number;
  projectedEndDate: Date;
}

export function getLoanProjection(loan: Loan): LoanProjection {
  const paidAmount = loan.paid_installments * loan.installment_amount;
  const remainingInstallments = Math.max(0, loan.total_installments - loan.paid_installments);
  const remainingAmount = remainingInstallments * loan.installment_amount;
  const percentComplete = loan.total_installments > 0
    ? (loan.paid_installments / loan.total_installments) * 100
    : 0;

  // Calcula data de quitação projetada
  const start = new Date(loan.start_date);
  const projectedEndDate = new Date(start);
  projectedEndDate.setMonth(projectedEndDate.getMonth() + loan.total_installments);

  return { paidAmount, remainingAmount, remainingInstallments, percentComplete, projectedEndDate };
}
