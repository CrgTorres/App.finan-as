import type { SupabaseClient } from "@supabase/supabase-js";
import {
  inferirTitularDeTextoFolha,
  perfilTitularDeEnv,
  unirPerfisTitular,
  type PerfilTitularApp,
} from "@/lib/contratos/perfil-titular-app";
import {
  carregarPerfilUsuarioSupabase,
  perfilTitularDeUserProfile,
  sincronizarPerfilUsuarioDeAuthMetadata,
} from "@/lib/contratos/perfil-usuario-supabase";

/** Perfil do titular: cadastro (Supabase) → env/local → contracheques. */
export async function carregarPerfilTitularParaSessao(
  supabase: SupabaseClient,
): Promise<PerfilTitularApp> {
  await sincronizarPerfilUsuarioDeAuthMetadata(supabase);
  const row = await carregarPerfilUsuarioSupabase(supabase);
  const cadastro = row ? perfilTitularDeUserProfile(row) : { fontes: [] as string[] };

  const env = perfilTitularDeEnv();
  const { data } = await supabase
    .from("payslips")
    .select("raw_text")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(6);
  const texto = (data ?? []).map((r) => String((r as { raw_text?: string }).raw_text ?? "")).join("\n");
  const folha = texto.trim().length > 80 ? inferirTitularDeTextoFolha(texto) : { fontes: [] as string[] };
  return unirPerfisTitular(cadastro, env, folha);
}
