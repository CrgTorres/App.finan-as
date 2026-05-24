import type { TransactionsSourceTrackingColumns } from "@/lib/supabase/transactions-source-columns";

type QueryLike = {
  eq: (c: string, v: string) => QueryLike;
  not: (c: string, o: string, v?: string | null) => QueryLike;
  or: (f: string) => QueryLike;
  in: (c: string, values: string[]) => QueryLike;
};

/**
 * Restringe a consulta aos lançamentos do mesmo arquivo de extrato (sem coluna `source`).
 * Prioridade: hash → nome → fingerprints em source_ref → outras refs de extrato na coluna ref.
 */
export function applyImportedExtratoDedupeFilters<Q extends QueryLike>(
  query: Q,
  cols: TransactionsSourceTrackingColumns,
  opts: {
    fileHashHex: string | null;
    fileNameTruncated: string;
    /** fingerprints da importação atual; permite escopo quando só existe source_ref */
    sourceRefFingerprints: string[];
  }
): Q {
  const fps = [...new Set(opts.sourceRefFingerprints.filter(Boolean))];
  if (cols.sourceFileHash && opts.fileHashHex) {
    return query.eq("source_file_hash", opts.fileHashHex) as Q;
  }
  if (cols.sourceFileName && opts.fileNameTruncated.trim()) {
    return query.eq("source_file_name", opts.fileNameTruncated.trim()) as Q;
  }
  if (cols.sourceRef && fps.length > 0) {
    return query.in("source_ref", fps) as Q;
  }
  if (cols.sourceRef) {
    return query
      .not("source_ref", "is", null)
      .not("source_ref", "ilike", "NF-e%")
      .not("source_ref", "ilike", "contracheque:%") as Q;
  }
  return query;
}
