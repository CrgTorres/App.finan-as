/// <reference lib="webworker" />

import {
  calcularMargemHistoricaAvancada,
  type EntradaCalcularMargemHistoricaAvancada,
} from "@/lib/consignacoes-governo/calcular-margem-historica-avancada";

export type MargemHistoricaWorkerRequest = {
  type: "calcular";
  jobId: string;
  input: EntradaCalcularMargemHistoricaAvancada;
};

export type MargemHistoricaWorkerResponse =
  | {
      type: "success";
      jobId: string;
      pacote: ReturnType<typeof calcularMargemHistoricaAvancada>;
      tempoMs: number;
    }
  | { type: "error"; jobId: string; message: string };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<MargemHistoricaWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== "calcular") return;
  const t0 = performance.now();
  try {
    const pacote = calcularMargemHistoricaAvancada({
      ...msg.input,
      chunkSize: msg.input.chunkSize ?? 6,
    });
    const response: MargemHistoricaWorkerResponse = {
      type: "success",
      jobId: msg.jobId,
      pacote,
      tempoMs: Math.round(performance.now() - t0),
    };
    ctx.postMessage(response);
  } catch (e) {
    ctx.postMessage({
      type: "error",
      jobId: msg.jobId,
      message: e instanceof Error ? e.message : String(e),
    } satisfies MargemHistoricaWorkerResponse);
  }
};

export {};
