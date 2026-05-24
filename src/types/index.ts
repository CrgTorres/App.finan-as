export type TransactionType = "receita" | "despesa";

/** Como a linha entrou na base — visível na lista para conferir extrato/NF/manual. */
export type TransactionSource = "manual" | "extrato" | "nota_fiscal" | "contracheque";

export type Category =
  | "Alimentação"
  | "Transporte"
  | "Moradia"
  | "Lazer"
  | "Saúde"
  | "Educação"
  | "Salário"
  | "Freelance"
  | "Pets"
  | "Outros"
  | "Receita"
  | "Mercado"
  | "Combustível"
  | "Conta de consumo"
  | "Cartão/Fatura"
  | "Boleto"
  | "Transferência própria"
  | "Transferência para terceiros"
  | "Empréstimo";

export interface Transaction {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  date: string;
  type: TransactionType;
  category: Category;
  /** Rastreio: fingerprint de extrato, chave/resumo NF-e, contracheque:, etc. (sem coluna `source` no banco) */
  source_ref?: string | null;
  source_file_name?: string | null;
  source_file_hash?: string | null;
  source_imported_at?: string | null;
  created_at: string;
}

export interface TransactionFormData {
  description: string;
  amount: number;
  date: string;
  type: TransactionType;
  category: Category;
}

export interface DashboardSummary {
  totalReceitas: number;
  totalDespesas: number;
  saldo: number;
}

export interface CategoryTotal {
  category: Category;
  total: number;
  type: TransactionType;
}

export interface TransactionFilters {
  month?: number;
  year?: number;
  category?: Category | "all";
  search?: string;
}
