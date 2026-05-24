import type { PendenciasRevisaoSyncSnapshot } from "@/lib/anexos/pendencias-analise-ui";
import {
  origemDeveSincronizarFontes,
  sincronizarFontesAnaliseFromSupabase,
} from "@/lib/auditoria/sincronizar-fontes-cliente";

/**
 * Notifica componentes do dashboard (gráficos, rodapé, análise, boletins)
 * para voltarem a ler Supabase após alterações em anexos ou transações.
 */
export const DASHBOARD_DATA_UPDATED = "financa:dashboard-data-updated";

/** Revisão de pendências da análise de empréstimos (estado local/UI); não recarrega folhas do Supabase. */
export const PENDENCIAS_ANALISE_REVISAO_ATUALIZADA = "financa:pendencias-analise-revisao-atualizada";

export type PendenciasAnaliseRevisaoDetail = {
  at?: string;
  /** Quem disparou (UI); não é dado de `transactions` (rastreio no banco = source_ref / arquivo). */
  origin?: string;
  snapshot: PendenciasRevisaoSyncSnapshot;
};
export type DashboardDataUpdatedDetail = {
  /** Identificador do fluxo que causou o refresh (ex.: import_extrato); não é coluna SQL. */
  origin?: string;
  /** ISO quando o evento foi emitido (útil ao rodapé / assistente). */
  at?: string;
  /** Força pipeline de sincronização de fontes (padrão: true para origens de upload). */
  sincronizarFontes?: boolean;
  /** Metadados opcionais quando a origem é anexo de folha (contracheque ou ficha). */
  payslipMeta?: {
    documentKind?: string;
    month?: number;
    year?: number;
    folhaEmitKind?: string;
  };
};

const DEBOUNCE_MS = 400;
const SYNC_DEBOUNCE_MS = 1_200;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncOriginPendente: string | undefined;
let triagemPipelineEmitSuppress = 0;

/** Bloqueia emissões intermediárias durante o pipeline da triagem (sem steal). */
export function beginTriagemPipelineEmitSuppression(): () => void {
  triagemPipelineEmitSuppress += 1;
  return () => {
    triagemPipelineEmitSuppress = Math.max(0, triagemPipelineEmitSuppress - 1);
  };
}

export function isTriagemPipelineEmitSuppressed(): boolean {
  return triagemPipelineEmitSuppress > 0;
}

export function emitDashboardDataUpdated(detail?: DashboardDataUpdatedDetail): void {
  if (typeof window === "undefined") return;
  if (triagemPipelineEmitSuppress > 0) {
    console.log("[TRIAGEM_CACHE] emit suprimido durante pipeline", detail?.origin);
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const merged: DashboardDataUpdatedDetail = {
      at: new Date().toISOString(),
      ...detail,
    };
    window.dispatchEvent(
      new CustomEvent<DashboardDataUpdatedDetail>(DASHBOARD_DATA_UPDATED, {
        detail: merged,
      })
    );

    const deveSync =
      merged.sincronizarFontes === true ||
      (merged.sincronizarFontes !== false && origemDeveSincronizarFontes(merged.origin));
    if (deveSync) {
      agendarSincronizacaoFontes(merged.origin ?? "dashboard_data_updated");
    }
  }, DEBOUNCE_MS);
}

function agendarSincronizacaoFontes(origin: string): void {
  syncOriginPendente = origin;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    const origemSync = syncOriginPendente ?? "dashboard_data_updated";
    syncOriginPendente = undefined;
    void sincronizarFontesAnaliseFromSupabase(origemSync).then((res) => {
      if (!res) return;
      try {
        sessionStorage.setItem(
          "financa:ultima-auditoria-integracao:v1",
          JSON.stringify({
            at: res.sincronizado_em,
            indice: res.auditoria.indice_confiabilidade.indice,
            classificacao: res.auditoria.indice_confiabilidade.classificacao,
            alertas: res.auditoria.alertas.slice(0, 12),
            nivel_prontidao: res.auditoria.prontidao.nivel_prontidao_analise,
            niveis_atingidos: res.auditoria.prontidao.niveis_atingidos,
            selo_publicos: res.auditoria.prontidao.publicos_disponiveis,
          }),
        );
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent<DashboardDataUpdatedDetail>(DASHBOARD_DATA_UPDATED, {
          detail: {
            origin: "sincronizar_fontes_analise",
            at: new Date().toISOString(),
            sincronizarFontes: false,
          },
        }),
      );
    });
  }, SYNC_DEBOUNCE_MS);
}

/** Listener com debounce — evita vários reloads seguidos (ex.: conferência em lote). */
export function subscribeDashboardDataUpdated(
  fn: (detail?: DashboardDataUpdatedDetail) => void,
  debounceMs = 500,
): () => void {
  if (typeof window === "undefined") return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<DashboardDataUpdatedDetail>).detail;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(detail);
    }, debounceMs);
  };
  window.addEventListener(DASHBOARD_DATA_UPDATED, handler);
  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener(DASHBOARD_DATA_UPDATED, handler);
  };
}

export function emitPendenciasAnaliseRevisaoAtualizada(
  snapshot: PendenciasRevisaoSyncSnapshot,
  origin = "pendencias-analise-panel",
): void {
  if (typeof window === "undefined") return;
  const detail: PendenciasAnaliseRevisaoDetail = {
    at: new Date().toISOString(),
    origin,
    snapshot,
  };
  window.dispatchEvent(
    new CustomEvent<PendenciasAnaliseRevisaoDetail>(PENDENCIAS_ANALISE_REVISAO_ATUALIZADA, { detail }),
  );
}