export type TransactionType = "receita" | "despesa";

export type Category =
  | "Alimentação"
  | "Transporte"
  | "Moradia"
  | "Lazer"
  | "Saúde"
  | "Educação"
  | "Salário"
  | "Freelance"
  | "Outros";

export interface Transaction {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  date: string;
  type: TransactionType;
  category: Category;
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
