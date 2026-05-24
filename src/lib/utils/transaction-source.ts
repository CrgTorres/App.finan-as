import type { TransactionSource, Transaction } from "@/types";

const LABELS: Record<TransactionSource, string> = {
  manual: "Manual",
  extrato: "Extrato",
  nota_fiscal: "Nota fiscal",
  contracheque: "Contracheque",
};

/** NF-e referência curta no app: "NF-e …" ou chave só dígitos */
export function isNFeSourceRef(ref: string): boolean {
  const t = ref.trim();
  if (t.startsWith("NF-e")) return true;
  const d = t.replace(/\D/g, "");
  return d.length === 44;
}

/**
 * Origem da UI inferida a partir de source_ref e metadados de arquivo (Postgres: sem coluna `source`).
 */
export function inferTransactionSource(
  t: Pick<Transaction, "source_ref" | "source_file_name" | "source_file_hash">
): TransactionSource {
  const ref = (t.source_ref ?? "").trim();
  const rlow = ref.toLowerCase();
  if (rlow.startsWith("contracheque:")) return "contracheque";
  if (isNFeSourceRef(ref)) return "nota_fiscal";
  if ((t.source_file_hash ?? "").trim() || (t.source_file_name ?? "").trim())
    return "extrato";
  if (ref.length > 0) return "extrato";
  return "manual";
}

/** Uso em regras (“há extrato importado?”): exclui NF-e e contracheque embutidos na mesma coluna. */
export function transactionIsExtratoImport(
  t: Pick<Transaction, "source_ref" | "source_file_name" | "source_file_hash">
): boolean {
  return inferTransactionSource(t) === "extrato";
}

/** Rótulo curto para badges e listas (`TransactionSource` inferido, não coluna SQL). */
export function transactionSourceLabel(kind: TransactionSource | null | undefined): string {
  if (!kind) return "Legado";
  return LABELS[kind] ?? kind;
}

export function transactionSourceLabelFromTransaction(t: Transaction): string {
  return transactionSourceLabel(inferTransactionSource(t));
}

/** Texto para tooltip (referência do arquivo / chave). */
export function transactionSourceTitle(t: Transaction): string {
  const logical = inferTransactionSource(t);
  const base = LABELS[logical] ?? logical;
  const ref = (t.source_ref ?? "").trim();
  const file = (t.source_file_name ?? "").trim();
  const parts = [ref || null, file ? `Arquivo: ${file}` : null].filter(Boolean);
  if (parts.length === 0) return base;
  return `${base}: ${parts.join(" · ")}`;
}
