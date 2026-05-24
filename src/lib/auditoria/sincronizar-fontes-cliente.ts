/**
 * Carrega dados do Supabase e executa `sincronizarFontesAnalise` (browser).
 */

import { createClient } from "@/lib/supabase/client";
import { listarStatusManualConciliacao } from "@/lib/conciliacao/status-manual-conciliacao-service";
import type { EntradaStatusManualBaseConciliada } from "@/lib/conciliacao/conciliacao-financeira";
import { listarSnapshotsConsigfacil } from "@/lib/consignacoes-governo/consigfacil-service";
import {
  consolidarSnapshotsConsigfacil,
  reparseSnapshotsBrutos,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import { obterParametrosLeituraAtivos } from "@/lib/leitura-analise/perfil-leitura-storage";
import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import {
  sincronizarFontesAnalise,
  type ResultadoSincronizacaoFontes,
} from "@/lib/auditoria/sincronizar-fontes-analise";

const ORIGENS_COM_SINCRONIZACAO = new Set([
  "import_extrato",
  "nota_fiscal",
  "payslip",
  "contracheque_anexo",
  "evidencia_emprestimo",
  "contrato_emprestimo",
  "consigfacil_snapshot",
  "perfil_leitura",
  "transacao_manual",
  "transacao_delete",
  "conciliacao_manual",
]);

export function origemDeveSincronizarFontes(origin?: string): boolean {
  if (!origin) return false;
  return ORIGENS_COM_SINCRONIZACAO.has(origin);
}

let syncEmAndamento = false;

/**
 * Busca transações, folhas, evidências e ConsigFácil; recalcula base e auditoria.
 * Ignora chamadas concorrentes (debounce já existe no evento do dashboard).
 */
export async function sincronizarFontesAnaliseFromSupabase(
  origin = "sincronizar_fontes_cliente",
): Promise<ResultadoSincronizacaoFontes | null> {
  if (typeof window === "undefined") return null;
  if (syncEmAndamento) return null;
  syncEmAndamento = true;
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;

    const [{ data: tx }, { data: ln }, { data: ps }, { data: ev }, statusRes, consigfacilRes] =
      await Promise.all([
        supabase.from("transactions").select("*").order("date", { ascending: true }),
        supabase.from("loans").select("*"),
        supabase
          .from("payslips")
          .select("*")
          .order("year", { ascending: true })
          .order("month", { ascending: true }),
        supabase.from("loan_evidences").select("*").order("created_at", { ascending: false }),
        userId
          ? listarStatusManualConciliacao(supabase, userId)
          : Promise.resolve({ data: [] as EntradaStatusManualBaseConciliada[], origem: "local" as const, error: null }),
        userId
          ? listarSnapshotsConsigfacil(supabase, userId)
          : Promise.resolve({ snapshots: [], origem: "local" as const }),
      ]);

    const snapshots = reparseSnapshotsBrutos(consigfacilRes.snapshots);
    const perfilLeitura = obterParametrosLeituraAtivos();
    const consigfacil = consolidarSnapshotsConsigfacil(snapshots, perfilLeitura.configAuditoria);

    return sincronizarFontesAnalise({
      transactions: (tx as Transaction[]) ?? [],
      loans: (ln as Loan[]) ?? [],
      payslips: (ps as Payslip[]) ?? [],
      evidencias: (ev as LoanEvidence[]) ?? [],
      statusManualConciliacao: statusRes.data,
      consigfacil,
      snapshotsConsigfacil: snapshots,
      perfilLeitura,
      origin,
      emitirEvento: false,
    });
  } catch {
    return null;
  } finally {
    syncEmAndamento = false;
  }
}
