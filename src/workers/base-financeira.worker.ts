/// <reference lib="webworker" />

import { runBaseFinanceiraPipeline } from "@/lib/dashboard/run-base-financeira-pipeline";
import type {
  BaseFinanceiraWorkerRequest,
  BaseFinanceiraWorkerResponse,
} from "@/workers/base-financeira-worker.types";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<BaseFinanceiraWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== "build") return;

  const { jobId, payload } = msg;
  const t0 = performance.now();
  const logs: string[] = [];

  try {
    const result = runBaseFinanceiraPipeline(payload);
    const response: BaseFinanceiraWorkerResponse = {
      type: "success",
      jobId,
      base: result.base,
      logs: result.logs,
      resumo: result.resumo,
      tempoProcessamentoMs: result.tempoProcessamentoMs,
      snapshotsProcessados: result.snapshotsProcessados,
    };
    ctx.postMessage(response);
  } catch (e) {
    const response: BaseFinanceiraWorkerResponse = {
      type: "error",
      jobId,
      message: e instanceof Error ? e.message : String(e),
      logs,
      tempoProcessamentoMs: Math.round(performance.now() - t0),
    };
    ctx.postMessage(response);
  }
};

export {};
