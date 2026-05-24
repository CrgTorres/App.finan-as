import type { SupabaseClient } from "@supabase/supabase-js";
import { totaisCorrigidosDeItemsSeNecessario } from "@/lib/anexos/payslip-conferencia-insercao";
import { payslipContribuiHistoricoRubricas } from "@/lib/anexos/payslip-desconto-historico";
import { upsertSalaryTransactionFromPayslip } from "@/lib/anexos/sync-salary-from-payslip";
import type { Payslip, PayslipItem } from "@/types/contracheque";

export type CorrecaoTotaisPayslipLinha = {
  id: string;
  month: number;
  year: number;
  antes: { bruto: number; descontos: number; liquido: number };
  depois: { bruto: number; descontos: number; liquido: number };
  rubricas: number;
};

export type ResultadoCorrecaoTotaisPayslips = {
  analisados: number;
  corrigidos: number;
  ignorados: number;
  erros: number;
  linhas: CorrecaoTotaisPayslipLinha[];
  primeiraMensagemErro: string | null;
};

type PayslipRow = Pick<
  Payslip,
  | "id"
  | "month"
  | "year"
  | "gross_salary"
  | "total_discounts"
  | "net_salary"
  | "items"
  | "folha_emit_kind"
  | "document_kind"
>;

function normalizarItems(items: unknown): PayslipItem[] {
  if (Array.isArray(items)) return items as PayslipItem[];
  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items) as unknown;
      return Array.isArray(parsed) ? (parsed as PayslipItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function listarPayslipsUsuario(
  supabase: SupabaseClient,
  userId: string,
): Promise<PayslipRow[]> {
  const pageSize = 500;
  const rows: PayslipRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("payslips")
      .select(
        "id, month, year, gross_salary, total_discounts, net_salary, items, folha_emit_kind, document_kind",
      )
      .eq("user_id", userId)
      .order("year", { ascending: true })
      .order("month", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as PayslipRow[];
    rows.push(
      ...chunk.map((p) => ({
        ...p,
        items: normalizarItems(p.items),
      })),
    );
    if (chunk.length < pageSize) break;
  }
  return rows;
}

/**
 * Corrige na base `gross_salary`, `total_discounts` e `net_salary` a partir das rubricas
 * quando o cabeçalho gravado está abaixo da soma das linhas (OCR fraco).
 */
export async function corrigirTotaisPayslipsGravados(
  supabase: SupabaseClient,
  opts?: {
    userId?: string;
    dryRun?: boolean;
    sincronizarSalario?: boolean;
  },
): Promise<ResultadoCorrecaoTotaisPayslips> {
  let userId = opts?.userId;
  if (!userId) {
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr) throw new Error(authErr.message);
    if (!user) throw new Error("Sessão expirada. Faça login novamente.");
    userId = user.id;
  }

  const rows = await listarPayslipsUsuario(supabase, userId);
  const linhas: CorrecaoTotaisPayslipLinha[] = [];
  let corrigidos = 0;
  let ignorados = 0;
  let erros = 0;
  let primeiraMensagemErro: string | null = null;

  for (const p of rows) {
    if (!payslipContribuiHistoricoRubricas(p as Payslip)) {
      ignorados++;
      continue;
    }
    const items = p.items ?? [];
    const cab = {
      gross_salary: Number(p.gross_salary) || 0,
      total_discounts: Number(p.total_discounts) || 0,
      net_salary: Number(p.net_salary) || 0,
    };
    const tr = totaisCorrigidosDeItemsSeNecessario(cab, items);
    if (!tr) {
      ignorados++;
      continue;
    }

    const depois = {
      bruto: tr.somaGanhos,
      descontos: tr.somaDescontos,
      liquido: tr.liquidoRubricas,
    };
    const antes = {
      bruto: cab.gross_salary,
      descontos: cab.total_discounts,
      liquido: cab.net_salary,
    };

    linhas.push({
      id: p.id,
      month: p.month,
      year: p.year,
      antes,
      depois,
      rubricas: items.length,
    });

    if (opts?.dryRun) {
      corrigidos++;
      continue;
    }

    const { error } = await supabase
      .from("payslips")
      .update({
        gross_salary: depois.bruto,
        total_discounts: depois.descontos,
        net_salary: depois.liquido,
      })
      .eq("id", p.id)
      .eq("user_id", userId);

    if (error) {
      erros++;
      if (!primeiraMensagemErro) primeiraMensagemErro = error.message;
      continue;
    }

    corrigidos++;

    const emit = (p.folha_emit_kind ?? "mensal_principal") as string;
    if (
      opts?.sincronizarSalario !== false &&
      depois.liquido > 0 &&
      emit !== "folha_especial"
    ) {
      await upsertSalaryTransactionFromPayslip({
        supabase,
        userId,
        month: p.month,
        year: p.year,
        netSalary: depois.liquido,
      });
    }
  }

  return {
    analisados: rows.length,
    corrigidos,
    ignorados,
    erros,
    linhas,
    primeiraMensagemErro,
  };
}

/** Prévia sem gravar (útil para logs). */
export function preverCorrecoesTotais(payslips: Payslip[]): CorrecaoTotaisPayslipLinha[] {
  const out: CorrecaoTotaisPayslipLinha[] = [];
  for (const p of payslips) {
    if (!payslipContribuiHistoricoRubricas(p)) continue;
    const items = p.items ?? [];
    const cab = {
      gross_salary: p.gross_salary ?? 0,
      total_discounts: p.total_discounts ?? 0,
      net_salary: p.net_salary ?? 0,
    };
    const tr = totaisCorrigidosDeItemsSeNecessario(cab, items);
    if (!tr) continue;
    out.push({
      id: p.id,
      month: p.month,
      year: p.year,
      antes: {
        bruto: cab.gross_salary,
        descontos: cab.total_discounts,
        liquido: cab.net_salary,
      },
      depois: {
        bruto: tr.somaGanhos,
        descontos: tr.somaDescontos,
        liquido: tr.liquidoRubricas,
      },
      rubricas: items.length,
    });
  }
  return out;
}
