import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import { buildExportacaoFinanceiraPayload } from "@/lib/exportacao/build-exportacao-financeira-payload";
import { downloadTextFile } from "@/lib/utils/download-blob";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "Sem dados\n";
  const headers = Object.keys(rows[0] ?? {});
  return [headers.join(";"), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(";"))].join("\n");
}

export function exportarBaseNormalizadaCsv(
  base: BaseFinanceiraNormalizada,
  filenameBase = "base-financeira-normalizada",
): void {
  const payload = buildExportacaoFinanceiraPayload(base);
  downloadTextFile(
    rowsToCsv(payload.sheets.Base_Normalizada),
    `${filenameBase}-${payload.gerado_em.slice(0, 10)}.csv`,
    "text/csv;charset=utf-8;",
    true,
  );
}

