import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbColumnError } from "@/lib/supabase/transactions-source-columns";
import type {
  ConsigfacilContrato,
  ConsigfacilMargem,
  ConsigfacilSnapshot,
} from "@/types/consigfacil";

const LOCAL_STORAGE_KEY = "financa:consigfacil_snapshots:v1";

export type ConsigfacilArmazenado = {
  snapshots: ConsigfacilSnapshot[];
  origem: "supabase" | "local";
};

/**
 * Lê todos os snapshots ConsigFácil do usuário. Tenta Supabase primeiro;
 * se a tabela ainda não existe (migration não aplicada), cai no localStorage.
 *
 * O caller passa os snapshots para `consolidarSnapshotsConsigfacil()` para
 * obter a `BaseConsignacoesGoverno` canônica.
 */
export async function listarSnapshotsConsigfacil(
  client: SupabaseClient,
  userId: string,
): Promise<ConsigfacilArmazenado> {
  try {
    const res = await client
      .from("consigfacil_snapshots")
      .select("documento_origem, origem, capturado_em, bruto, avisos")
      .eq("user_id", userId)
      .order("capturado_em", { ascending: false });
    if (res.error) {
      if (isMissingDbColumnError(res.error)) {
        return { snapshots: lerLocalStorage(), origem: "local" };
      }
      return { snapshots: lerLocalStorage(), origem: "local" };
    }
    const rows = res.data as Array<{
      documento_origem: string;
      origem: ConsigfacilSnapshot["origem"];
      capturado_em: string;
      bruto: string;
      avisos: string[] | null;
    }>;
    // Os snapshots do Supabase guardam apenas bruto + metadados. Para reconstruir
    // o snapshot completo (contratos, margens, etc.) o caller deve rodar o parser
    // novamente sobre `bruto`. Aqui devolvemos com listas vazias e o caller decide.
    const snapshots: ConsigfacilSnapshot[] = rows.map((r) => ({
      capturado_em: r.capturado_em,
      documento_origem: r.documento_origem,
      origem: r.origem,
      bruto: r.bruto,
      avisos: r.avisos ?? [],
      contratos: [],
      cartoes: [],
      margens: [],
      historico: [],
    }));
    return { snapshots, origem: "supabase" };
  } catch {
    return { snapshots: lerLocalStorage(), origem: "local" };
  }
}

export type ResultadoPersistencia = {
  origem: "supabase" | "local";
  error: Error | null;
};

/**
 * Persiste um snapshot novo + os contratos/margens já extraídos. Faz upsert no
 * Supabase; em qualquer falha grava também no localStorage para a UI não
 * perder o dado entre sessões.
 */
export async function salvarSnapshotConsigfacil(
  client: SupabaseClient,
  userId: string,
  snapshot: ConsigfacilSnapshot,
): Promise<ResultadoPersistencia> {
  appendLocalStorage(snapshot);

  try {
    const insertSnap = await client
      .from("consigfacil_snapshots")
      .insert({
        user_id: userId,
        documento_origem: snapshot.documento_origem,
        origem: snapshot.origem,
        capturado_em: snapshot.capturado_em,
        bruto: snapshot.bruto,
        avisos: snapshot.avisos,
      })
      .select("id")
      .maybeSingle();

    if (insertSnap.error) {
      if (isMissingDbColumnError(insertSnap.error)) {
        return { origem: "local", error: null };
      }
      return { origem: "supabase", error: new Error(insertSnap.error.message) };
    }

    const snapshotId = insertSnap.data?.id ?? null;

    if (snapshot.contratos.length > 0) {
      const upsertContratos = await client
        .from("consigfacil_contratos")
        .upsert(
          snapshot.contratos.map((c) => ({
            user_id: userId,
            snapshot_id: snapshotId,
            id_consignacao: c.id_consignacao,
            instituicao: c.instituicao,
            codigo_instituicao: c.codigo_instituicao,
            data_contrato: c.data_contrato,
            competencia: c.competencia,
            valor_parcela: c.valor_parcela,
            parcela_atual: c.parcela_atual,
            parcelas_total: c.parcelas_total,
            tipo_margem: c.tipo_margem,
            status: c.status,
            averbado_por: c.averbado_por,
            origem: c.origem,
            situacao_importacao: c.situacao_importacao,
            eh_cartao: c.eh_cartao,
            eh_rmc: c.eh_rmc,
            eh_rcc: c.eh_rcc,
            eh_cartao_beneficio: c.eh_cartao_beneficio,
            eh_refinanciamento: c.eh_refinanciamento,
            contrato_substituido: c.contrato_substituido,
            confianca: c.confianca,
            observacao: c.observacao,
            texto_bruto: c.texto_bruto,
            modalidade_slug: c.modalidade_slug,
            grupo_canonico: c.grupo_canonico,
            modalidade_original: c.classificacao.modalidade_original,
            instituicao_original: c.classificacao.instituicao_original,
            instituicao_oficial: c.classificacao.instituicao_oficial,
            classificacao_anterior: c.classificacao.classificacao_anterior,
            divergencia_classificacao: c.classificacao.divergencia_classificacao,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "user_id,id_consignacao" },
        );
      if (upsertContratos.error && !isMissingDbColumnError(upsertContratos.error)) {
        return { origem: "supabase", error: new Error(upsertContratos.error.message) };
      }
    }

    if (snapshot.margens.length > 0) {
      const upsertMargens = await client
        .from("consigfacil_margens")
        .upsert(
          snapshot.margens.map((m: ConsigfacilMargem) => ({
            user_id: userId,
            snapshot_id: snapshotId,
            competencia: m.competencia,
            tipo_margem: m.tipo_margem,
            margem_total: m.margem_total,
            margem_utilizada: m.margem_utilizada,
            margem_disponivel: m.margem_disponivel,
            percentual_comprometido: m.percentual_comprometido,
            documento_origem: m.documento_origem,
            capturado_em: m.capturado_em,
          })),
          { onConflict: "user_id,competencia,tipo_margem" },
        );
      if (upsertMargens.error && !isMissingDbColumnError(upsertMargens.error)) {
        return { origem: "supabase", error: new Error(upsertMargens.error.message) };
      }
    }

    if (snapshot.cartoes.length > 0) {
      const upsertCartoes = await client
        .from("consigfacil_cartoes")
        .upsert(
          snapshot.cartoes.map((k) => ({
            user_id: userId,
            snapshot_id: snapshotId,
            id_consignacao: k.id_consignacao,
            tipo_cartao: k.tipo_cartao,
            consignataria: k.consignataria,
            valor_mensal: k.valor_mensal,
            parcelas_total: k.parcelas_total,
            parcela_atual: k.parcela_atual,
            competencia_inicio: k.competencia_inicio,
            situacao: k.situacao,
            documento_origem: k.documento_origem,
          })),
          { onConflict: "user_id,id_consignacao" },
        );
      if (upsertCartoes.error && !isMissingDbColumnError(upsertCartoes.error)) {
        return { origem: "supabase", error: new Error(upsertCartoes.error.message) };
      }
    }

    if (snapshot.historico.length > 0) {
      const insertHistorico = await client.from("consigfacil_historico").insert(
        snapshot.historico.map((h) => ({
          user_id: userId,
          snapshot_id: snapshotId,
          id_consignacao: h.id_consignacao,
          competencia: h.competencia,
          evento: h.evento,
          detalhe: h.detalhe,
          documento_origem: h.documento_origem,
          capturado_em: h.capturado_em,
        })),
      );
      if (insertHistorico.error && !isMissingDbColumnError(insertHistorico.error)) {
        return { origem: "supabase", error: new Error(insertHistorico.error.message) };
      }
    }

    return { origem: "supabase", error: null };
  } catch (e) {
    return {
      origem: "local",
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

/** Remove um snapshot (e em cascata, seus refinanciamentos derivados). */
export async function removerSnapshotConsigfacil(
  client: SupabaseClient,
  userId: string,
  capturadoEm: string,
): Promise<ResultadoPersistencia> {
  removerDoLocalStorage(capturadoEm);
  try {
    const res = await client
      .from("consigfacil_snapshots")
      .delete()
      .eq("user_id", userId)
      .eq("capturado_em", capturadoEm);
    if (res.error) {
      if (isMissingDbColumnError(res.error)) return { origem: "local", error: null };
      return { origem: "supabase", error: new Error(res.error.message) };
    }
    return { origem: "supabase", error: null };
  } catch (e) {
    return { origem: "local", error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ---------------------------------------------------------------------------
// LocalStorage fallback (mantém UI funcional sem migration)
// ---------------------------------------------------------------------------

function obterStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function lerLocalStorage(): ConsigfacilSnapshot[] {
  const storage = obterStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConsigfacilSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendLocalStorage(snapshot: ConsigfacilSnapshot): void {
  const storage = obterStorage();
  if (!storage) return;
  try {
    const atuais = lerLocalStorage().filter((s) => s.capturado_em !== snapshot.capturado_em);
    atuais.push(snapshot);
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(atuais));
  } catch {
    // noop
  }
}

function removerDoLocalStorage(capturadoEm: string): void {
  const storage = obterStorage();
  if (!storage) return;
  try {
    const atuais = lerLocalStorage().filter((s) => s.capturado_em !== capturadoEm);
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(atuais));
  } catch {
    // noop
  }
}

export function lerSnapshotsLocaisDireto(): ConsigfacilSnapshot[] {
  return lerLocalStorage();
}

/** Substitui todos os snapshots no localStorage (após reparse do texto bruto). */
export function salvarSnapshotsLocaisDireto(snapshots: ConsigfacilSnapshot[]): void {
  const storage = obterStorage();
  if (!storage) return;
  try {
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    /* noop */
  }
}

export function listarContratosConsigfacilSupabase(
  client: SupabaseClient,
  userId: string,
): Promise<{ data: ConsigfacilContrato[]; error: Error | null }> {
  return (async () => {
    try {
      const res = await client
        .from("consigfacil_contratos")
        .select("*")
        .eq("user_id", userId);
      if (res.error) {
        if (isMissingDbColumnError(res.error)) return { data: [], error: null };
        return { data: [], error: new Error(res.error.message) };
      }
      const data = ((res.data ?? []) as unknown as Array<Record<string, unknown>>).map(
        (r): ConsigfacilContrato => ({
          id_consignacao: String(r.id_consignacao ?? ""),
          instituicao: String(r.instituicao ?? ""),
          codigo_instituicao: (r.codigo_instituicao as string | null) ?? null,
          data_contrato: String(r.data_contrato ?? "").slice(0, 10),
          competencia: String(r.competencia ?? ""),
          valor_parcela: Number(r.valor_parcela ?? 0),
          parcela_atual:
            r.parcela_atual == null || r.parcela_atual === ""
              ? null
              : Number(r.parcela_atual) > 0
                ? Number(r.parcela_atual)
                : null,
          parcelas_total: Number(r.parcelas_total ?? 0),
          tipo_margem: (r.tipo_margem as ConsigfacilContrato["tipo_margem"]) ?? null,
          status: (r.status as ConsigfacilContrato["status"]) ?? "desconhecido",
          averbado_por: (r.averbado_por as string | null) ?? null,
          origem: (r.origem as ConsigfacilContrato["origem"]) ?? "manual",
          situacao_importacao: (r.situacao_importacao as string | null) ?? null,
          eh_cartao: Boolean(r.eh_cartao ?? false),
          eh_rmc: Boolean(r.eh_rmc ?? false),
          eh_rcc: Boolean(r.eh_rcc ?? false),
          eh_cartao_beneficio: Boolean(
            r.eh_cartao_beneficio ??
              ((r.tipo_margem as string) === "margem_cartao_beneficio"),
          ),
          eh_refinanciamento: Boolean(r.eh_refinanciamento ?? false),
          contrato_substituido: (r.contrato_substituido as string | null) ?? null,
          confianca: Number(r.confianca ?? 0),
          fonte_oficial: true,
          documento_origem: String(r.documento_origem ?? ""),
          texto_bruto: String(r.texto_bruto ?? ""),
          observacao: (r.observacao as string | null) ?? null,
          modalidade_slug:
            (r.modalidade_slug as ConsigfacilContrato["modalidade_slug"]) ?? null,
          grupo_canonico:
            (r.grupo_canonico as ConsigfacilContrato["grupo_canonico"]) ?? null,
          classificacao: {
            modalidade_original: (r.modalidade_original as string | null) ?? null,
            modalidade_oficial:
              (r.modalidade_slug as ConsigfacilContrato["modalidade_slug"]) ?? null,
            instituicao_original: (r.instituicao_original as string | null) ?? null,
            instituicao_oficial: (r.instituicao_oficial as string | null) ?? null,
            classificacao_anterior: (r.classificacao_anterior as string | null) ?? null,
            classificacao_oficial:
              (r.grupo_canonico as ConsigfacilContrato["grupo_canonico"]) ?? null,
            divergencia_classificacao: Boolean(r.divergencia_classificacao ?? false),
          },
        }),
      );
      return { data, error: null };
    } catch (e) {
      return { data: [], error: e instanceof Error ? e : new Error(String(e)) };
    }
  })();
}
