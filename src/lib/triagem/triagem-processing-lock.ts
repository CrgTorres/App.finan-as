/**
 * Mutex global da Triagem Resolutiva — serializa saneamento, vinculação, auto e recarga.
 * Sem "steal": chamada concorrente é rejeitada (toast no caller).
 */

const LOG_PREFIX = "[TRIAGEM_LOCK]";
const TIMEOUT_MS = 120_000;

export type TriagemLockState = {
  locked: boolean;
  owner: string | null;
  acquiredAt: number | null;
  queueLength: number;
};

type Waiter = {
  origin: string;
  resolve: (release: () => void) => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
};

let locked = false;
let owner: string | null = null;
let acquiredAt: number | null = null;
const fifoWaiters: Waiter[] = [];
const listeners = new Set<(state: TriagemLockState) => void>();

function log(msg: string, extra?: unknown) {
  if (extra !== undefined) {
    console.log(`${LOG_PREFIX} ${msg}`, extra);
  } else {
    console.log(`${LOG_PREFIX} ${msg}`);
  }
}

function notify() {
  const state = getTriagemLockState();
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function getTriagemLockState(): TriagemLockState {
  return {
    locked,
    owner,
    acquiredAt,
    queueLength: fifoWaiters.length,
  };
}

export function subscribeTriagemProcessingLock(
  listener: (state: TriagemLockState) => void,
): () => void {
  listeners.add(listener);
  listener(getTriagemLockState());
  return () => listeners.delete(listener);
}

function forceReleaseIfTimedOut(): boolean {
  if (!locked || acquiredAt == null) return false;
  if (Date.now() - acquiredAt <= TIMEOUT_MS) return false;
  log(`timeout automático (${TIMEOUT_MS}ms) — liberando lock de ${owner ?? "?"}`);
  releaseTriagemProcessingLock("timeout");
  return true;
}

/**
 * Indica se há processamento em andamento (com liberação por timeout).
 */
export function isTriagemProcessingLocked(): boolean {
  forceReleaseIfTimedOut();
  return locked;
}

/**
 * Tenta adquirir o lock sem fila de espera (uso em cliques da UI).
 * @returns função release ou null se ocupado
 */
export function acquireTriagemProcessingLock(origin: string): (() => void) | null {
  forceReleaseIfTimedOut();
  if (locked) {
    log(`rejeitado (ocupado por ${owner}) — origem=${origin}`);
    return null;
  }
  locked = true;
  owner = origin;
  acquiredAt = Date.now();
  log(`adquirido — origem=${origin}`);
  notify();
  return () => releaseTriagemProcessingLock(origin);
}

/**
 * Adquire o lock ou entra na fila FIFO até liberar (sem steal).
 */
export function acquireTriagemProcessingLockAsync(origin: string): Promise<() => void> {
  forceReleaseIfTimedOut();
  if (!locked) {
    const release = acquireTriagemProcessingLock(origin);
    if (release) return Promise.resolve(release);
  }
  log(`enfileirado — origem=${origin} fila=${fifoWaiters.length + 1}`);
  return new Promise((resolve, reject) => {
    fifoWaiters.push({
      origin,
      resolve,
      reject,
      enqueuedAt: Date.now(),
    });
  });
}

/**
 * Libera o lock e atende o próximo da fila FIFO, se houver.
 */
export function releaseTriagemProcessingLock(reason = "manual"): void {
  if (!locked) return;
  log(`liberado — motivo=${reason} owner=${owner ?? "?"}`);
  locked = false;
  owner = null;
  acquiredAt = null;
  notify();
  drainFifoQueue();
}

function drainFifoQueue(): void {
  if (locked || fifoWaiters.length === 0) return;
  const next = fifoWaiters.shift();
  if (!next) return;
  if (Date.now() - next.enqueuedAt > TIMEOUT_MS) {
    log(`waiter expirado — origem=${next.origin}`);
    next.reject(new Error("Timeout na fila de processamento da triagem."));
    drainFifoQueue();
    return;
  }
  const release = acquireTriagemProcessingLock(next.origin);
  if (release) {
    log(`waiter atendido — origem=${next.origin}`);
    next.resolve(release);
  } else {
    fifoWaiters.unshift(next);
  }
}
