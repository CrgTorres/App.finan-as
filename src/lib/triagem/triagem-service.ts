/**
 * Persistência Supabase de triagem (com fallback localStorage).
 */

import { createClient } from "@/lib/supabase/client";
import type {
  ContextoTriagem,
  RespostasTriagem,
  ResultadoResolucaoTriagem,
  TipoProblemaTriagem,
} from "@/lib/triagem/triagem-inteligente-tipos";
import type { NivelLeitura } from "@/lib/triagem/triagem-inteligente-tipos";
import { inferirTipoProblemaDePendencia } from "@/lib/triagem/resolver-triagem-financeira";

export type SalvarTriagemRespostaInput = {
  tipo_problema: TipoProblemaTriagem;
  nivel: NivelLeitura;
  entidade_tipo: string;
  entidade_id: string;
  pergunta_id: string;
  pergunta: string;
  resposta: unknown;
  resultado: ResultadoResolucaoTriagem;
  resolvido: boolean;
  remover_pendencia: boolean;
};

const LS_TRIAGEM_RESPOSTAS = "financaTriagemRespostasSupabaseFallbackV1";

export async function salvarTriagemResposta(
  input: SalvarTriagemRespostaInput,
): Promise<{ ok: boolean; origem: "supabase" | "local"; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    gravarFallbackLocal(input);
    return { ok: true, origem: "local" };
  }

  const { error } = await supabase.from("triagem_respostas").insert({
    user_id: user.id,
    tipo_problema: input.tipo_problema,
    nivel: input.nivel,
    entidade_tipo: input.entidade_tipo,
    entidade_id: input.entidade_id,
    pergunta_id: input.pergunta_id,
    pergunta: input.pergunta,
    resposta: input.resposta,
    resultado: input.resultado,
    resolvido: input.resolvido,
    remover_pendencia: input.remover_pendencia,
  });

  if (error) {
    const recoverable =
      /does not exist|schema cache|could not find|42703|42P01|PGRST/i.test(error.message);
    if (recoverable) {
      gravarFallbackLocal(input);
      return { ok: true, origem: "local", error: error.message };
    }
    return { ok: false, origem: "local", error: error.message };
  }

  return { ok: true, origem: "supabase" };
}

function gravarFallbackLocal(input: SalvarTriagemRespostaInput): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LS_TRIAGEM_RESPOSTAS);
    const arr: SalvarTriagemRespostaInput[] = raw ? JSON.parse(raw) : [];
    arr.push(input);
    localStorage.setItem(LS_TRIAGEM_RESPOSTAS, JSON.stringify(arr.slice(-500)));
  } catch {
    /* ignore */
  }
}

export async function salvarPadraoAprendidoSupabase(input: {
  tipo_problema: TipoProblemaTriagem;
  condicoes: Record<string, unknown>;
  acao_recomendada: string;
  nivel_confianca: number;
}): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("triagem_padroes_aprendidos").insert({
    user_id: user.id,
    tipo_problema: input.tipo_problema,
    condicoes: input.condicoes,
    acao_recomendada: input.acao_recomendada,
    nivel_confianca: input.nivel_confianca,
    ativo: true,
  });
}

export function contextoDePendencia(p: {
  id: string;
  tipo?: string;
  descricao?: string | null;
  competencia?: string | null;
  instituicao_oficial?: string | null;
  valor_esperado?: number | null;
  valor_observado?: number | null;
  id_consignacao?: string | null;
}): ContextoTriagem {
  const tipo = inferirTipoProblemaDePendencia({
    tipo: p.tipo,
    descricao: p.descricao,
  });
  return {
    entidade_tipo: "pendencia",
    entidade_id: p.id,
    tipo_problema: tipo,
    competencia: p.competencia,
    banco: p.instituicao_oficial,
    valor_esperado: p.valor_esperado,
    valor_observado: p.valor_observado,
    descricao: p.descricao,
    id_consignacao: p.id_consignacao,
  };
}
