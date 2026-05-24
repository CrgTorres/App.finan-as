import type { AnaliseExportPayload } from "@/lib/analise/build-analise-export-payload";
import { downloadTextFile } from "@/lib/utils/download-blob";

export function exportAnaliseJson(payload: AnaliseExportPayload, filenameBase = "analise-financeira"): void {
  const stamp = payload.exportedAt.slice(0, 10);
  downloadTextFile(
    JSON.stringify(payload, null, 2),
    `${filenameBase}-${stamp}.json`,
    "application/json;charset=utf-8;",
    false,
  );
}
