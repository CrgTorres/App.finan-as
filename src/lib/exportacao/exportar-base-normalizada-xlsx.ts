import * as XLSX from "xlsx";
import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import {
  buildExportacaoFinanceiraPayload,
  EXPORTACAO_FINANCEIRA_SHEETS,
} from "@/lib/exportacao/build-exportacao-financeira-payload";
import { downloadBlob } from "@/lib/utils/download-blob";

function sheetFromRows(rows: Array<Record<string, unknown>>): XLSX.WorkSheet {
  return rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([["Sem dados"]]);
}

export function exportarBaseNormalizadaXlsx(
  base: BaseFinanceiraNormalizada,
  filenameBase = "base-financeira-normalizada",
): void {
  const payload = buildExportacaoFinanceiraPayload(base);
  const wb = XLSX.utils.book_new();
  for (const sheetName of EXPORTACAO_FINANCEIRA_SHEETS) {
    XLSX.utils.book_append_sheet(wb, sheetFromRows(payload.sheets[sheetName]), sheetName);
  }
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    buf,
    `${filenameBase}-${payload.gerado_em.slice(0, 10)}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

