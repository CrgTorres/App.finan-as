"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import type {
  BaseFinanceiraWorkerPayload,
  BaseFinanceiraWorkerResumo,
  BaseFinanceiraWorkerResponse,
} from "@/workers/base-financeira-worker.types";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import { perfilLeituraParaWorker } from "@/lib/leitura-analise/perfil-leitura-worker-payload";

export type UseBaseFinanceiraWorkerState = {
  base: BaseFinanceiraNormalizada | null;
  computing: boolean;
  resumo: BaseFinanceiraWorkerResumo | null;
  logs: string[];
  tempoProcessamentoMs: number | null;
  error: string | null;
  snapshotsProcessados: ConsigfacilSnapshot[] | null;
  run: (payload: BaseFinanceiraWorkerPayload) => void;
  cancel: () => void;
};

function createWorker(): Worker {
  return new Worker(new URL("../../workers/base-financeira.worker.ts", import.meta.url), {
    type: "module",
  });
}

export function useBaseFinanceiraWorker(): UseBaseFinanceiraWorkerState {
  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef(0);
  const handlerRef = useRef<(ev: MessageEvent<BaseFinanceiraWorkerResponse>) => void>(() => {});

  const [base, setBase] = useState<BaseFinanceiraNormalizada | null>(null);
  const [computing, setComputing] = useState(false);
  const [resumo, setResumo] = useState<BaseFinanceiraWorkerResumo | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [tempoProcessamentoMs, setTempoProcessamentoMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshotsProcessados, setSnapshotsProcessados] = useState<ConsigfacilSnapshot[] | null>(
    null,
  );

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  const attachWorker = useCallback(() => {
    terminateWorker();
    const worker = createWorker();
    worker.onmessage = (ev) => handlerRef.current(ev);
    worker.onerror = (ev) => {
      const jobId = jobIdRef.current;
      if (jobId === 0) return;
      setError(ev.message || "Erro no worker da base financeira.");
      setComputing(false);
    };
    workerRef.current = worker;
    return worker;
  }, [terminateWorker]);

  useEffect(() => {
    handlerRef.current = (ev: MessageEvent<BaseFinanceiraWorkerResponse>) => {
      const msg = ev.data;
      if (msg.jobId !== jobIdRef.current) return;

      if (msg.type === "success") {
        setBase(msg.base);
        setResumo(msg.resumo);
        setLogs(msg.logs);
        setTempoProcessamentoMs(msg.tempoProcessamentoMs);
        setSnapshotsProcessados(msg.snapshotsProcessados);
        setError(null);
        setComputing(false);
        return;
      }

      setError(msg.message);
      setLogs(msg.logs);
      setTempoProcessamentoMs(msg.tempoProcessamentoMs);
      setComputing(false);
    };

    return () => {
      terminateWorker();
    };
  }, [terminateWorker]);

  const cancel = useCallback(() => {
    jobIdRef.current += 1;
    setComputing(false);
    terminateWorker();
  }, [terminateWorker]);

  const run = useCallback(
    (payload: BaseFinanceiraWorkerPayload) => {
      terminateWorker();
      const jobId = ++jobIdRef.current;

      setComputing(true);
      setBase(null);
      setResumo(null);
      setLogs([]);
      setTempoProcessamentoMs(null);
      setError(null);
      setSnapshotsProcessados(null);

      const worker = attachWorker();
      worker.postMessage({
        type: "build",
        jobId,
        payload: {
          ...payload,
          perfilLeitura: perfilLeituraParaWorker(payload.perfilLeitura),
        },
      });
    },
    [attachWorker, terminateWorker],
  );

  return {
    base,
    computing,
    resumo,
    logs,
    tempoProcessamentoMs,
    error,
    snapshotsProcessados,
    run,
    cancel,
  };
}
