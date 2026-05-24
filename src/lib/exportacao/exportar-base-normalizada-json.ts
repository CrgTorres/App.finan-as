import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import { buildExportacaoFinanceiraPayload } from "@/lib/exportacao/build-exportacao-financeira-payload";
import { downloadTextFile } from "@/lib/utils/download-blob";

export function exportarBaseNormalizadaJson(
  base: BaseFinanceiraNormalizada,
  filenameBase = "base-financeira-normalizada",
): void {
  const payload = buildExportacaoFinanceiraPayload(base);
  downloadTextFile(
    JSON.stringify(payload.json_tecnico, null, 2),
    `${filenameBase}-${payload.gerado_em.slice(0, 10)}.json`,
    "application/json;charset=utf-8;",
  );
}

