"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EntradaCalcularMargemHistoricaAvancada,
  PacoteMargemHistoricaAvancada,
} from "@/lib/consignacoes-governo/calcular-margem-historica-avancada";
import { pacoteMargemHistoricaAvancadaVazio } from "@/lib/consignacoes-governo/calcular-margem-historica-avancada";
import type { MargemHistoricaWorkerResponse } from "@/workers/margem-historica.worker";

const LIMITE_FOLHAS_WORKER = 100;

/**
 * Recalcula margem avançada em Web Worker quando há muitas folhas (UI não trava).
 * A base normalizada já calcula no pipeline; use isto só para recálculo client-side.
 */
export function useMargemHistoricaWorker(
  input: EntradaCalcularMargemHistoricaAvancada | null,
  fallback: PacoteMargemHistoricaAvancada,
) {
  const [pacote, setPacote] = useState<PacoteMargemHistoricaAvancada>(fallback);
  const [computing, setComputing] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const recalcular = useCallback(() => {
    if (!input) {
      setPacote(fallback);
      return;
    }
    const nFolhas = input.payslips?.length ?? 0;
    if (nFolhas < LIMITE_FOLHAS_WORKER) {
      return;
    }

    setComputing(true);
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("@/workers/margem-historica.worker.ts", import.meta.url),
      );
    }
    const worker = workerRef.current;
    const jobId = `margem-${Date.now()}`;

    const onMessage = (ev: MessageEvent<MargemHistoricaWorkerResponse>) => {
      if (ev.data.jobId !== jobId) return;
      worker.removeEventListener("message", onMessage);
      setComputing(false);
      if (ev.data.type === "success") {
        setPacote(ev.data.pacote);
      }
    };

    worker.addEventListener("message", onMessage);
    worker.postMessage({
      type: "calcular",
      jobId,
      input: { ...input, chunkSize: 6 },
    } satisfies import("@/workers/margem-historica.worker").MargemHistoricaWorkerRequest);
  }, [input, fallback]);

  useEffect(() => {
    setPacote(fallback);
  }, [fallback]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return {
    pacote,
    computing,
    recalcular,
    usaWorker: (input?.payslips?.length ?? 0) >= LIMITE_FOLHAS_WORKER,
    vazio: pacoteMargemHistoricaAvancadaVazio,
  };
}
