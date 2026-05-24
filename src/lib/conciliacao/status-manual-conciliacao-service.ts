import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbColumnError } from "@/lib/supabase/transactions-source-columns";
import type {
  EntradaStatusManualBaseConciliada,
  StatusManualUsuario,
} from "@/lib/conciliacao/conciliacao-financeira";

const TABLE = "status_manual_conciliacao";
const LOCAL_STORAGE_KEY = "financa:status_manual_conciliacao:v1";

/**
 * Erro humano para distinguir "tabela ausente no Supabase" de "RLS / outro problema".
 * Quando a tabela não existe ainda (migration não aplicada), seguimos com fallback
 * localStorage. Para qualquer outro erro o caller decide o que fazer.
 */
export class StatusManualTabelaIndisponivelError extends Error {
  constructor(public readonly causa: string) {
    super(
      `Tabela ${TABLE} indisponível no Supabase (${causa}). Usando fallback local.`,
    );
    this.name = "StatusManualTabelaIndisponivelError";
  }
}

type LinhaSupabase = {
  id?: string;
  evento_id: string;
  status: StatusManualUsuario;
  observacao?: string | null;
  updated_at?: string;
};

/**
 * Lista todos os status manuais do usuário. Em ordem decrescente por `updated_at`.
 * Faz fallback automático para localStorage quando a tabela ainda não existe.
 */
export async function listarStatusManualConciliacao(
  client: SupabaseClient,
  userId: string,
): Promise<{
  data: EntradaStatusManualBaseConciliada[];
  origem: "supabase" | "local";
  error: Error | null;
}> {
  try {
    const res = await client
      .from(TABLE)
      .select("evento_id, status, observacao, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (res.error) {
      if (isMissingDbColumnError(res.error)) {
        return {
          data: lerLocalStorage(),
          origem: "local",
          error: null,
        };
      }
      return { data: [], origem: "supabase", error: new Error(res.error.message) };
    }

    const data = ((res.data ?? []) as unknown as LinhaSupabase[]).map(
      (r): EntradaStatusManualBaseConciliada => ({
        eventoId: r.evento_id,
        status: r.status,
      }),
    );
    return { data, origem: "supabase", error: null };
  } catch (e) {
    return {
      data: lerLocalStorage(),
      origem: "local",
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

/**
 * Insere ou atualiza um status manual (upsert por `user_id + evento_id`).
 * Sempre escreve no localStorage também — assim a UI fica responsiva mesmo offline.
 */
export async function salvarStatusManualConciliacao(
  client: SupabaseClient,
  userId: string,
  entrada: EntradaStatusManualBaseConciliada,
  observacao?: string | null,
): Promise<{ origem: "supabase" | "local"; error: Error | null }> {
  gravarLocalStorage(entrada);

  try {
    const res = await client
      .from(TABLE)
      .upsert(
        {
          user_id: userId,
          evento_id: entrada.eventoId,
          status: entrada.status,
          observacao: observacao ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,evento_id" },
      )
      .select("evento_id")
      .maybeSingle();

    if (res.error) {
      if (isMissingDbColumnError(res.error)) {
        return { origem: "local", error: null };
      }
      return { origem: "supabase", error: new Error(res.error.message) };
    }
    return { origem: "supabase", error: null };
  } catch (e) {
    return {
      origem: "local",
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

/**
 * Remove o status manual (volta a usar a inferência automática).
 */
export async function removerStatusManualConciliacao(
  client: SupabaseClient,
  userId: string,
  eventoId: string,
): Promise<{ origem: "supabase" | "local"; error: Error | null }> {
  removerLocalStorage(eventoId);

  try {
    const res = await client
      .from(TABLE)
      .delete()
      .eq("user_id", userId)
      .eq("evento_id", eventoId);

    if (res.error) {
      if (isMissingDbColumnError(res.error)) {
        return { origem: "local", error: null };
      }
      return { origem: "supabase", error: new Error(res.error.message) };
    }
    return { origem: "supabase", error: null };
  } catch (e) {
    return {
      origem: "local",
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

// ---------------------------------------------------------------------------
// Fallback localStorage (responsivo + funciona sem migration)
// ---------------------------------------------------------------------------

type EntradaLocal = EntradaStatusManualBaseConciliada & { observacao?: string | null };

function obterStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function lerLocalStorage(): EntradaStatusManualBaseConciliada[] {
  const storage = obterStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EntradaLocal[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({ eventoId: p.eventoId, status: p.status }));
  } catch {
    return [];
  }
}

function gravarLocalStorage(entrada: EntradaStatusManualBaseConciliada): void {
  const storage = obterStorage();
  if (!storage) return;
  try {
    const atuais = lerLocalStorage().filter((e) => e.eventoId !== entrada.eventoId);
    atuais.push(entrada);
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(atuais));
  } catch {
    // ignora quotaExceeded / privado
  }
}

function removerLocalStorage(eventoId: string): void {
  const storage = obterStorage();
  if (!storage) return;
  try {
    const atuais = lerLocalStorage().filter((e) => e.eventoId !== eventoId);
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(atuais));
  } catch {
    // noop
  }
}
