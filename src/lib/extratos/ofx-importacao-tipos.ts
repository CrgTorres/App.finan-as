/**
 * Skeletons para a fase 2 de importação de extrato bancário (OFX).
 * Nenhum parser é implementado aqui — só as interfaces que o resto do app
 * pode começar a referenciar (UI, serviços, conciliação) sem quebrar.
 *
 * Quando o parser OFX entrar, ele deve:
 *  1. Receber o arquivo bruto e gerar `OfxImportadoBruto`.
 *  2. Normalizar para `ExtratoBancarioImportado` (linhas equivalentes a `Transaction`).
 *  3. Rodar `conciliacao_automatica_ofx` para amarrar com contracheque/contratos.
 */

/** Identificador do tipo de operação no OFX (`TRNTYPE`). */
export type OfxTrnType =
  | "CREDIT"
  | "DEBIT"
  | "INT"
  | "DIV"
  | "FEE"
  | "SRVCHG"
  | "DEP"
  | "ATM"
  | "POS"
  | "XFER"
  | "CHECK"
  | "PAYMENT"
  | "CASH"
  | "DIRECTDEP"
  | "DIRECTDEBIT"
  | "REPEATPMT"
  | "OTHER";

/** Conta listada no OFX (`BANKACCTFROM` / `CCACCTFROM`). */
export type OfxConta = {
  bankId?: string;
  branchId?: string;
  accountId: string;
  accountType?: "CHECKING" | "SAVINGS" | "CREDITLINE" | "MONEYMRKT" | "CREDITCARD";
  currency?: string;
};

/** Linha bruta do OFX (`STMTTRN`). */
export type OfxTransacaoBruta = {
  fitid: string;
  dtPosted: string;
  trnType: OfxTrnType;
  trnAmount: number;
  memo?: string;
  name?: string;
  checkNum?: string | null;
  refNum?: string | null;
};

/** Resultado bruto do parser OFX antes da normalização. */
export type OfxImportadoBruto = {
  versaoOfx: "1.x" | "2.x";
  conta: OfxConta;
  saldoFinal?: { valor: number; data: string };
  transacoes: OfxTransacaoBruta[];
  dataInicioStatement?: string;
  dataFimStatement?: string;
};

/**
 * Linha normalizada — mesma forma que `Transaction` mas sem id Supabase ainda.
 * `external_ref` = `${conta.accountId}:${fitid}` (idempotência de import).
 */
export type ExtratoBancarioImportado = {
  external_ref: string;
  data: string;
  competencia: string;
  descricao_original: string;
  descricao_normalizada: string;
  valor: number;
  tipo: "receita" | "despesa";
  trnType: OfxTrnType;
  conta: OfxConta;
  arquivo_origem: string;
  digest_arquivo_sha256?: string;
};

/** Resultado da conciliação automática extrato OFX ↔ contracheque/contrato. */
export type ConciliacaoAutomaticaOfxResultado = {
  extrato_external_ref: string;
  vinculo_contracheque_id: string | null;
  vinculo_contrato_id: string | null;
  status: "conciliado" | "possivel_duplicidade" | "precisa_revisao" | "nao_conciliado";
  motivo: string;
};

/**
 * Contrato de função planejado (não implementado aqui).
 * Quando o parser OFX existir, este será o ponto único de entrada para conciliar
 * batch de transações OFX com a base do usuário.
 */
export type ConciliacaoAutomaticaOfxFn = (input: {
  importacao: OfxImportadoBruto;
  contracheques: ReadonlyArray<{ id: string; year: number; month: number; net_salary: number }>;
  contratos: ReadonlyArray<{ id: string; total_amount: number; start_date: string; institution_name?: string | null }>;
}) => ConciliacaoAutomaticaOfxResultado[];

/**
 * Estado provisório no Supabase para extratos OFX importados.
 * Não há migration ainda — esses tipos servem como referência da modelagem futura.
 */
export type OfxImportadoSupabaseRow = {
  id: string;
  user_id: string;
  arquivo_nome: string;
  arquivo_sha256: string;
  conta_account_id: string;
  conta_bank_id: string | null;
  versao_ofx: "1.x" | "2.x";
  data_inicio: string;
  data_fim: string;
  saldo_final: number | null;
  total_linhas: number;
  created_at: string;
};
