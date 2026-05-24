import { buildBaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import { restaurarCatalogoCacheFromWorker } from "@/lib/consignacoes-governo/consigfacil-catalogo-cache";
import {
  consolidarSnapshotsConsigfacil,
  reprocessarSnapshotsConsigfacil,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import type {
  BaseFinanceiraWorkerPayload,
  BaseFinanceiraWorkerResumo,
} from "@/workers/base-financeira-worker.types";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";

export type BaseFinanceiraPipelineResult = {
  base: BaseFinanceiraNormalizada;
  snapshotsProcessados: ConsigfacilSnapshot[];
  logs: string[];
  resumo: BaseFinanceiraWorkerResumo;
  tempoProcessamentoMs: number;
};

export function runBaseFinanceiraPipeline(
  payload: BaseFinanceiraWorkerPayload,
): BaseFinanceiraPipelineResult {
  const t0 = performance.now();
  const logs: string[] = [];

  if (payload.catalogoCache) {
    logs.push("Restaurando catálogo ConsigFácil no worker.");
    restaurarCatalogoCacheFromWorker(payload.catalogoCache);
  }

  logs.push(`Reprocessando ${payload.snapshotsConsigfacil.length} snapshot(s) ConsigFácil.`);
  const snapshotsProcessados = reprocessarSnapshotsConsigfacil(payload.snapshotsConsigfacil, {
    persistirLocal: false,
    emitirDashboard: false,
  });

  logs.push("Consolidando base ConsigFácil.");
  const consigfacil = consolidarSnapshotsConsigfacil(
    snapshotsProcessados,
    payload.perfilLeitura.configAuditoria,
  );

  logs.push(
    `Montando base financeira (${payload.payslips.length} folha(s), ${payload.transactions.length} transação(ões)).`,
  );
  const base = buildBaseFinanceiraNormalizada({
    transactions: payload.transactions,
    loans: payload.loans,
    payslips: payload.payslips,
    evidencias: payload.evidencias,
    statusManualConciliacao: payload.statusManualConciliacao,
    consigfacil,
    perfilLeitura: payload.perfilLeitura,
    snapshotsConsigfacilRaw: snapshotsProcessados,
  });

  const tempoProcessamentoMs = Math.round(performance.now() - t0);
  const resumo: BaseFinanceiraWorkerResumo = {
    folhas: payload.payslips.length,
    transacoes: payload.transactions.length,
    emprestimosCadastro: payload.loans.length,
    evidencias: payload.evidencias.length,
    snapshotsConsigfacil: payload.snapshotsConsigfacil.length,
    linhasConciliada: base.baseConciliada.length,
    pendenciasReais: base.pendenciasConferenciaReais.length,
    contratosConsigfacil: base.consigfacil.contratos.length,
  };

  logs.push(
    `Concluído em ${tempoProcessamentoMs} ms — ${resumo.linhasConciliada} linha(s) conciliada(s), ${resumo.pendenciasReais} pendência(s).`,
  );

  return {
    base,
    snapshotsProcessados,
    logs,
    resumo,
    tempoProcessamentoMs,
  };
}
