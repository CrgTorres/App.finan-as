import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "@/types";
import { extrairDocumento, extrairFavorecido } from "./extrair-referencia-transacao";

export type RuleType = "documento" | "favorecido" | "palavra_chave";

export type TransactionClassificationRuleRow = {
  id: string;
  user_id: string;
  document_ref: string | null;
  payee_name: string | null;
  keyword: string | null;
  category: Category;
  rule_type: RuleType;
  created_at: string;
};

/** Linha gravada como memória por uma alteração manual de categoria */
export type RuleInsertPayload = {
  category: Category;
  rule_type: RuleType;
  document_ref: string | null;
  payee_name: string | null;
  keyword: string | null;
};

function normalizarEspacos(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Heurística quando não há CPF/CNPJ nem favorecido identificável. */
function keywordFallback(descricaoBruta: string): string | null {
  let s = normalizarEspacos(descricaoBruta);
  if (!s) return null;
  const tirarPref = [
    /^transfer[eê]ncia\s+(?:enviada|recebida)\s+(?:pelo\s+)?pix\s+/i,
    /^transfer[eê]ncia\s+pix\s+/i,
    /^pix\s+/i,
    /^pagamento\s+(?:via\s+)?/i,
  ];
  for (const rx of tirarPref) {
    const t = s.replace(rx, "").trim();
    if (t.length >= 3) s = t;
  }
  const k = s.slice(0, 160).trim();
  return k.length >= 2 ? k : null;
}

/**
 * Escolhe o melhor vínculo: documento > favorecido > fragmento livre como palavra-chave.
 */
export function criarPayloadRegraDeDescricao(descricaoBruta: string, category: Category): RuleInsertPayload | null {
  const desc = normalizarEspacos(descricaoBruta);
  if (!desc) return null;

  const doc = extrairDocumento(desc);
  if (doc) {
    return {
      category,
      rule_type: "documento",
      document_ref: doc.trim(),
      payee_name: null,
      keyword: null,
    };
  }

  const payee = extrairFavorecido(desc);
  if (payee && payee.trim().length >= 3) {
    const p = payee.trim().slice(0, 320);
    return {
      category,
      rule_type: "favorecido",
      document_ref: null,
      payee_name: p,
      keyword: null,
    };
  }

  const kw = keywordFallback(desc);
  if (!kw) return null;

  return {
    category,
    rule_type: "palavra_chave",
    document_ref: null,
    payee_name: null,
    keyword: kw.toLowerCase().slice(0, 200),
  };
}

async function apagarChaveIgual(
  supabase: SupabaseClient,
  userId: string,
  tipo: RuleType,
  campo: string,
  valor: string
): Promise<void> {
  await supabase
    .from("transaction_classification_rules")
    .delete()
    .eq("user_id", userId)
    .eq("rule_type", tipo)
    .eq(campo, valor);
}

/** Substitui regra igual (única por usuário/chave conforme índices). */
export async function persistManualCategoryRule(
  supabase: SupabaseClient,
  userId: string,
  descricao: string,
  category: Category
): Promise<{ ok: boolean; erro?: string; payload?: RuleInsertPayload | null }> {
  const payload = criarPayloadRegraDeDescricao(descricao, category);
  if (!payload) return { ok: true, payload: null };

  const linhaBase = {
    user_id: userId,
    category: payload.category,
    rule_type: payload.rule_type,
    document_ref: payload.document_ref,
    payee_name: payload.payee_name,
    keyword: payload.keyword,
  };

  try {
    if (payload.rule_type === "documento" && payload.document_ref) {
      await apagarChaveIgual(supabase, userId, "documento", "document_ref", payload.document_ref);
    } else if (payload.rule_type === "favorecido" && payload.payee_name) {
      await apagarChaveIgual(supabase, userId, "favorecido", "payee_name", payload.payee_name);
    } else if (payload.rule_type === "palavra_chave" && payload.keyword) {
      await apagarChaveIgual(supabase, userId, "palavra_chave", "keyword", payload.keyword);
    }

    const { error } = await supabase.from("transaction_classification_rules").insert(linhaBase);
    if (error) return { ok: false, erro: error.message };
    return { ok: true, payload };
  } catch (e: unknown) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : "Erro desconhecido",
    };
  }
}

export async function listarClassificationRulesUsuario(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: TransactionClassificationRuleRow[]; error?: string }> {
  const { data, error } = await supabase
    .from("transaction_classification_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []) as unknown as TransactionClassificationRuleRow[],
  };
}
