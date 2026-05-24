/** Linha persistida na tabela `bank_statement_parser_profiles`. */
export type BankStatementParserProfileRow = {
  id: string;
  user_id: string;
  bank_name: string | null;
  detector_keywords: string[] | null;
  date_pattern: string | null;
  value_format: string | null;
  columns_map: Record<string, unknown>;
  ignore_keywords: string[] | null;
  created_at: string;
  updated_at: string;
};

export type BankStatementParserProfileInsert = {
  user_id: string;
  bank_name?: string | null;
  detector_keywords: string[];
  date_pattern?: string | null;
  value_format?: string | null;
  columns_map: Record<string, unknown>;
  ignore_keywords?: string[];
};
