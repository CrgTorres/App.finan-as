import type { SupabaseClient } from "@supabase/supabase-js";
import type { Loan } from "@/types/contracheque";

export type RendaReferenciaUsuario = {
  rendaLiquidaMensal: number | null;
  fonte: string | null;
  competencia?: { year: number; month: number };
};

/** Último contracheque gravado (líquido) como referência de renda. */
export async function obterRendaReferenciaUsuario(
  supabase: SupabaseClient,
): Promise<RendaReferenciaUsuario> {
  const { data } = await supabase
    .from("payslips")
    .select("net_salary, year, month")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || Number(data.net_salary) <= 0) {
    return { rendaLiquidaMensal: null, fonte: null };
  }

  return {
    rendaLiquidaMensal: Number(data.net_salary),
    fonte: `Contracheque ${String(data.month).padStart(2, "0")}/${data.year} (líquido)`,
    competencia: { year: data.year, month: data.month },
  };
}

/** Soma das parcelas mensais de empréstimos ativos no cadastro. */
export function somarParcelasAtivasLoans(
  loans: Loan[],
  opts?: { excluirLoanId?: string; parcelaAdicional?: number },
): number {
  let soma = 0;
  for (const l of loans) {
    if (l.status === "quitado") continue;
    if (opts?.excluirLoanId && l.id === opts.excluirLoanId) continue;
    const p = Number(l.installment_amount);
    if (Number.isFinite(p) && p > 0) soma += p;
  }
  if (opts?.parcelaAdicional != null && opts.parcelaAdicional > 0) {
    const jaInclui = opts.excluirLoanId
      ? false
      : loans.some(
          (l) =>
            l.id !== opts.excluirLoanId &&
            l.status !== "quitado" &&
            Math.abs(Number(l.installment_amount) - opts.parcelaAdicional!) < 0.02,
        );
    if (!jaInclui) soma += opts.parcelaAdicional;
  }
  return Math.round(soma * 100) / 100;
}
