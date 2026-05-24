import type { SupabaseClient } from "@supabase/supabase-js";

export type TransactionsSourceTrackingColumns = {
  sourceRef: boolean;
  sourceFileName: boolean;
  sourceFileHash: boolean;
  sourceImportedAt: boolean;
};

export function isMissingDbColumnError(
  error: { message?: string } | null | undefined
): boolean {
  const m = (error?.message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("undefined column") ||
    m.includes("schema cache")
  );
}

async function selectColumnPresent(
  supabase: SupabaseClient,
  column: string
): Promise<boolean> {
  const { error } = await supabase.from("transactions").select(column).limit(1);
  if (!error) return true;
  if (isMissingDbColumnError(error)) return false;
  return false;
}

/**
 * Descobre quais colunas de rastreio existem na tabela (DB antigo vs migration aplicada).
 */
export async function probeTransactionsSourceTrackingColumns(
  supabase: SupabaseClient
): Promise<TransactionsSourceTrackingColumns> {
  const [sourceRef, sourceFileName, sourceFileHash, sourceImportedAt] =
    await Promise.all([
      selectColumnPresent(supabase, "source_ref"),
      selectColumnPresent(supabase, "source_file_name"),
      selectColumnPresent(supabase, "source_file_hash"),
      selectColumnPresent(supabase, "source_imported_at"),
    ]);
  return { sourceRef, sourceFileName, sourceFileHash, sourceImportedAt };
}
