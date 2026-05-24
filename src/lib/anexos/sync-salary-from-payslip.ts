import type { SupabaseClient } from "@supabase/supabase-js";

const SOURCE_REF_PREFIX = "contracheque";

function supabaseErrText(e: unknown): string {
  if (e == null) return "";
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter((x) => typeof x === "string") as string[];
    return parts.join(" | ");
  }
  return String(e);
}

function omitKeys<T extends Record<string, unknown>>(obj: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * Cria/atualiza receita «Salário» no 1º dia do mês — deduplica por `source_ref` (`contracheque:YYYY-MM`).
 * Essas linhas NÃO entram na conciliação bancária (`validar-fonte-bancaria-real` as exclui).
 */
export async function upsertSalaryTransactionFromPayslip(params: {
  supabase: SupabaseClient;
  userId: string;
  month: number;
  year: number;
  netSalary: number;
  /** Nome do ficheiro anexado (apenas referência na transação). */
  fileHint?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, userId, month, year, netSalary } = params;
  if (!(netSalary > 0)) return { ok: false, message: "Líquido inválido para sincronizar." };

  const date = `${year}-${String(month).padStart(2, "0")}-01`;
  const sourceRef = `${SOURCE_REF_PREFIX}:${year}-${String(month).padStart(2, "0")}`;
  const description = "Salário";
  const sourceRefFull = params.fileHint
    ? `${sourceRef}:${params.fileHint.slice(0, 120)}`
    : sourceRef;
  const importedAt = new Date().toISOString();

  try {
    const payload = {
      description,
      amount: netSalary,
      date,
      type: "receita" as const,
      category: "Salário" as const,
      source_ref: sourceRefFull,
      source_imported_at: importedAt,
    };

    const payloadVariants = [payload, omitKeys(payload, ["source_imported_at"])];

    const seen = new Set<string>();
    const uniquePayloads = payloadVariants.filter((p) => {
      const sig = Object.keys(p).sort().join(",");
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });

    for (const p of uniquePayloads) {
      const ref = p.source_ref as string | undefined;

      const lookup = supabase
        .from("transactions")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "receita")
        .eq("category", "Salário")
        .eq("date", date);

      const scopedLookup = ref ? lookup.eq("source_ref", ref) : lookup;

      const { data: row, error: selErr } = await scopedLookup.maybeSingle();
      if (selErr) {
        const t = supabaseErrText(selErr);
        const recoverable = /does not exist|schema cache|could not find|42703|PGRST/i.test(t);
        if (recoverable) continue;
        return { ok: false, message: t || "Falha ao consultar transação Salário." };
      }

      if (row?.id) {
        const { error } = await supabase.from("transactions").update(p).eq("id", row.id);
        if (!error) return { ok: true };
        const t = supabaseErrText(error);
        const recoverable = /does not exist|schema cache|could not find|42703|PGRST/i.test(t);
        if (recoverable) continue;
        return { ok: false, message: t || "Falha ao atualizar transação Salário." };
      }
      const { error } = await supabase.from("transactions").insert({
        ...p,
        user_id: userId,
      });
      if (!error) return { ok: true };
      const t = supabaseErrText(error);
      const recoverable = /does not exist|schema cache|could not find|42703|PGRST/i.test(t);
      if (recoverable) continue;
      return { ok: false, message: t || "Falha ao criar transação Salário." };
    }
    return {
      ok: false,
      message:
        "Não foi possível sincronizar a transação Salário com o esquema atual de transactions.",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
