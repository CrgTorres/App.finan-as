import type { Category } from "@/types";

/** Valores aceites pela constraint actual da app (alinhado a `supabase/schema.sql`). */
export const CATEGORIAS_TRANSACTIONS_SUPABASE: readonly Category[] = [
  "Alimentação",
  "Transporte",
  "Moradia",
  "Lazer",
  "Saúde",
  "Educação",
  "Salário",
  "Freelance",
  "Pets",
  "Outros",
  "Receita",
  "Mercado",
  "Combustível",
  "Conta de consumo",
  "Cartão/Fatura",
  "Boleto",
  "Transferência própria",
  "Transferência para terceiros",
  "Empréstimo",
] as const;

const SET_CATEGORIAS = new Set<string>(CATEGORIAS_TRANSACTIONS_SUPABASE);

/** Constraint antiga (`patch_transactions_source_pets` original): 10 categorias + Pets. */
const CATEGORIAS_DB_LEGACY: readonly Category[] = [
  "Alimentação",
  "Transporte",
  "Moradia",
  "Lazer",
  "Saúde",
  "Educação",
  "Salário",
  "Freelance",
  "Pets",
  "Outros",
] as const;

const SET_LEGACY = new Set<string>(CATEGORIAS_DB_LEGACY);

/**
 * Garante valor aceite pelo CHECK em `transactions.category` (schema completo).
 * Bases antigas só com 10 categorias: atualizar Supabase com `expand_transaction_categories_v2.sql` ou patch actualizado.
 */
export function sanitizarCategoriaParaInsertTransactions(raw: string | undefined | null): Category {
  const s = (raw ?? "").trim();
  if (SET_CATEGORIAS.has(s)) return s as Category;
  return "Outros";
}

/**
 * Mapeia categorias novas para o subconjunto da constraint legada (10 valores sem Receita/Mercado/…).
 * Usado como fallback quando o INSERT falha com `transactions_category_check`.
 */
export function mapearCategoriaParaDbLegada10(cat: Category): Category {
  if (SET_LEGACY.has(cat)) return cat;
  switch (cat) {
    case "Combustível":
      return "Transporte";
    case "Receita":
    case "Mercado":
    case "Conta de consumo":
    case "Cartão/Fatura":
    case "Boleto":
    case "Transferência própria":
    case "Transferência para terceiros":
    case "Empréstimo":
      return "Outros";
    default:
      return "Outros";
  }
}

export function isErroCheckCategoriaTransactions(err: unknown): boolean {
  const partes: string[] = [];
  if (typeof err === "object" && err !== null) {
    const o = err as Record<string, unknown>;
    for (const k of ["message", "details", "hint"]) {
      const v = o[k];
      if (v != null && String(v).trim()) partes.push(String(v));
    }
    if (o.code != null) partes.push(String(o.code));
  } else if (err != null) {
    partes.push(String(err));
  }
  const t = partes.join(" ").normalize("NFC");
  return (
    /transactions_category_check/i.test(t) ||
    (/23514/.test(t) && /transactions/i.test(t) && (/categor/i.test(t) || /failing row/i.test(t))) ||
    (/check constraint/i.test(t) &&
      (/category/i.test(t) || /categor/i.test(t) || /transactions_category/i.test(t)))
  );
}
