import type { SupabaseClient } from "@supabase/supabase-js";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import {
  cpfSoDigitos,
  formatarCpf11,
  normalizarNomeTitular,
  salvarPerfilTitularLocal,
  type PerfilTitularApp,
} from "@/lib/contratos/perfil-titular-app";
import { cpfDigitosValido } from "@/lib/contratos/validar-cpf";

export type UserProfileRow = {
  user_id: string;
  nome_completo: string;
  cpf_digits: string;
};

export type UpsertPerfilUsuarioResult =
  | { ok: true; persistencia: "supabase" }
  | { ok: true; persistencia: "local_e_metadata"; aviso: string }
  | { ok: false; message: string };

function erroTabelaUserProfilesAusente(error: { message?: string; code?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    msg.includes("user_profiles") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table")
  );
}

async function persistirPerfilLocalEAuthMetadata(
  supabase: SupabaseClient,
  nome: string,
  cpf_digits: string,
): Promise<void> {
  salvarPerfilTitularLocal({ nome, cpfDigitos: cpf_digits });
  await supabase.auth.updateUser({
    data: { full_name: nome, cpf_digits },
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DASHBOARD_DATA_UPDATED));
  }
}

export async function carregarPerfilUsuarioSupabase(
  supabase: SupabaseClient,
): Promise<UserProfileRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, nome_completo, cpf_digits")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserProfileRow;
}

export function perfilTitularDeUserProfile(row: UserProfileRow): PerfilTitularApp {
  return {
    nome: normalizarNomeTitular(row.nome_completo),
    cpfDigitos: row.cpf_digits,
    cpf: formatarCpf11(row.cpf_digits),
    fontes: ["Perfil da conta (cadastro)"],
  };
}

/** Grava ou atualiza perfil do utilizador autenticado. */
export async function upsertPerfilUsuarioSupabase(
  supabase: SupabaseClient,
  opts: { nomeCompleto: string; cpf: string },
): Promise<UpsertPerfilUsuarioResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sessão inválida. Faça login novamente." };

  const nome = normalizarNomeTitular(opts.nomeCompleto);
  if (nome.length < 4) return { ok: false, message: "Informe o nome completo." };

  const cpf_digits = cpfDigitosValido(opts.cpf);
  if (!cpf_digits) return { ok: false, message: "CPF inválido." };

  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      nome_completo: nome,
      cpf_digits,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    if (erroTabelaUserProfilesAusente(error)) {
      await persistirPerfilLocalEAuthMetadata(supabase, nome, cpf_digits);
      return {
        ok: true,
        persistencia: "local_e_metadata",
        aviso:
          "Perfil guardado neste navegador e na sessão. Para sincronizar entre dispositivos, execute supabase/patch_user_profiles.sql no SQL Editor do Supabase e clique em Guardar novamente.",
      };
    }
    return { ok: false, message: error.message };
  }

  await persistirPerfilLocalEAuthMetadata(supabase, nome, cpf_digits);
  return { ok: true, persistencia: "supabase" };
}

/** Sincroniza metadata do Auth → user_profiles (após registro com confirmação de e-mail). */
export async function sincronizarPerfilUsuarioDeAuthMetadata(supabase: SupabaseClient): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const existente = await carregarPerfilUsuarioSupabase(supabase);
  if (existente?.nome_completo && existente.cpf_digits) return;

  const meta = user.user_metadata ?? {};
  const nome = normalizarNomeTitular(String(meta.full_name ?? meta.nome ?? ""));
  const cpf_digits =
    cpfDigitosValido(String(meta.cpf_digits ?? meta.cpf ?? "")) ??
    cpfSoDigitos(String(meta.cpf ?? ""));

  if (nome.length < 4 || !cpf_digits) return;

  await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      nome_completo: nome,
      cpf_digits,
    },
    { onConflict: "user_id" },
  );

  salvarPerfilTitularLocal({ nome, cpfDigitos: cpf_digits });
}
