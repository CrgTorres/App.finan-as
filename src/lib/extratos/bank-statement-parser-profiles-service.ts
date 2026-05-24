import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BankStatementParserProfileInsert,
  BankStatementParserProfileRow,
} from "@/lib/extratos/bank-statement-parser-profiles-types";

const TABLE = "bank_statement_parser_profiles";

export async function listarPerfisExtratoPorUsuario(
  client: SupabaseClient,
  userId: string
): Promise<{ data: BankStatementParserProfileRow[]; error: Error | null }> {
  const res = await client
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (res.error) return { data: [], error: new Error(res.error.message) };
  return {
    data: ((res.data ?? []) as unknown) as BankStatementParserProfileRow[],
    error: null,
  };
}

export async function inserirPerfilExtratoParser(
  client: SupabaseClient,
  payload: BankStatementParserProfileInsert
): Promise<{ data: BankStatementParserProfileRow | null; error: Error | null }> {
  const res = await client
    .from(TABLE)
    .insert({
      user_id: payload.user_id,
      bank_name: payload.bank_name ?? null,
      detector_keywords: payload.detector_keywords,
      date_pattern: payload.date_pattern ?? null,
      value_format: payload.value_format ?? null,
      columns_map: payload.columns_map,
      ignore_keywords: payload.ignore_keywords ?? [],
    })
    .select("*")
    .maybeSingle();

  if (res.error) return { data: null, error: new Error(res.error.message) };
  return { data: ((res.data ?? null) as unknown) as BankStatementParserProfileRow | null, error: null };
}
