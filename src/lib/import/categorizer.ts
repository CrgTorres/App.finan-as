import type { Category } from "@/types";
import { classificarDespesaExtratoKeywords } from "@/lib/transacoes/classificador-palavras-chave";

/**
 * Sugestão de categoria só com base na descrição (sem tipo nem regras do usuário).
 * Usado em parsers onde ainda não há contexto — importação corrige por tipo/heurísticas completas.
 */
export function categorize(description: string): Category {
  const r = classificarDespesaExtratoKeywords(description);
  if (r.intensidade !== "baixa") return r.category;
  return "Outros";
}
