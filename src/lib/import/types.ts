import type { Category } from "@/types";
import type { ResultadoNormalizacaoSemantica } from "@/lib/transacoes/normalizacao-semantica-transacao";

/** Metadados da classificação automática ao carregar o extrato (Importar). */
export interface ImportAutoClassification {
  categoriaSugerida: Category;
  /** Confiança estimada 0–100 conforme o tipo de regra aplicada */
  confianca: number;
  motivo: string;
  documentoDetectado: string | null;
  favorecidoDetectado: string | null;
  referenciaDetectada: string | null;
}

export interface ImportedRow {
  id: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  type: "receita" | "despesa";
  category: Category;
  selected: boolean;
  /** ID da operação (ex.: Mercado Pago PDF) — não confundir com valor. */
  idOperacao?: string;
  /** Parser que criou a linha (Mercado Pago, etc.) — heurísticas de UI/categoria opcionais. */
  extratoParserId?: string;
  /** Preenchido ao aplicar regras salvas na tela de importação */
  autoClass?: ImportAutoClassification;
  /** Pós-parser: título/subtítulo inteligível e sugestões (Mercado Pago, gateways, etc.). */
  semantic?: ResultadoNormalizacaoSemantica;
}
