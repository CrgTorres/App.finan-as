import type { Payslip, PayslipFolhaEmitKind } from "@/types/contracheque";
import { filtrarPayslipsAnaliseSemAdiantamentoParcial130 } from "@/lib/anexos/decimo-terceiro-coerencia";

function emitRank(k: string | null | undefined): number {
  const v = (k ?? "mensal_principal") as PayslipFolhaEmitKind;
  if (v === "mensal_principal" || v === "merged_multi_anexo") return 0;
  if (v === "folha_especial") return 1;
  if (v === "ficha_import") return 2;
  return 3;
}

/** Para gráficos/dicas: usar o contracheque «completo», não só o extra de 13º. */
export function payslipPreferidoParaAnalise(rows: Payslip[]): Payslip | null {
  const analisaveis = filtrarPayslipsAnaliseSemAdiantamentoParcial130(rows);
  if (!analisaveis.length) return null;
  return [...analisaveis].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    if (b.month !== a.month) return b.month - a.month;
    const rk = emitRank(a.folha_emit_kind) - emitRank(b.folha_emit_kind);
    if (rk !== 0) return rk;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}
