/**
 * Aprendizado de resoluções de divergência — localStorage + auto-resolução futura.
 */

import type { ClassificacaoResolucaoDivergencia } from "@/lib/triagem/triagem-resolutiva-tipos";

export type RespostaAprendizadoDivergencia =
  | "sempre_fraciona"
  | "ocasionalmente_fraciona"
  | "nao_fraciona"
  | "revisar_manual"
  | "aceitar_consigfacil"
  | "aceitar_folha"
  | "ignorar_padrao_futuro";

export type RegistroAprendizadoDivergencia = {
  id: string;
  banco: string;
  tipo_divergencia: string;
  resposta_usuario: RespostaAprendizadoDivergencia;
  classificacao: ClassificacaoResolucaoDivergencia;
  frequencia: number;
  nivel_confianca: number;
  aplicar_automaticamente_futuro: boolean;
  percentual_tipico: number | null;
  atualizado_em: string;
};

const STORAGE_KEY = "financaAprendizadoDivergenciasV1";
const LIMITE_CONFIANCA_AUTO = 0.78;
const MIN_FREQUENCIA_AUTO = 2;

type Store = { version: 1; registros: RegistroAprendizadoDivergencia[] };

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizarBanco(b: string): string {
  return b
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function carregarAprendizadoDivergencias(): RegistroAprendizadoDivergencia[] {
  const storage = ls();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Store;
    return parsed.registros ?? [];
  } catch {
    return [];
  }
}

function gravar(registros: RegistroAprendizadoDivergencia[]): void {
  const storage = ls();
  if (!storage) return;
  const payload: Store = { version: 1, registros: registros.slice(-300) };
  storage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function registrarAprendizadoDivergencia(input: {
  banco: string;
  tipo_divergencia: string;
  resposta_usuario: RespostaAprendizadoDivergencia;
  classificacao: ClassificacaoResolucaoDivergencia;
  percentual_tipico?: number | null;
  aplicar_automaticamente_futuro?: boolean;
}): RegistroAprendizadoDivergencia {
  const banco = normalizarBanco(input.banco);
  const lista = carregarAprendizadoDivergencias();
  const existente = lista.find(
    (r) =>
      r.banco === banco &&
      r.tipo_divergencia === input.tipo_divergencia &&
      r.resposta_usuario === input.resposta_usuario,
  );

  const agora = new Date().toISOString();
  let reg: RegistroAprendizadoDivergencia;

  if (existente) {
    reg = {
      ...existente,
      frequencia: existente.frequencia + 1,
      nivel_confianca: Math.min(0.98, existente.nivel_confianca + 0.06),
      classificacao: input.classificacao,
      percentual_tipico: input.percentual_tipico ?? existente.percentual_tipico,
      aplicar_automaticamente_futuro:
        input.aplicar_automaticamente_futuro ?? existente.aplicar_automaticamente_futuro,
      atualizado_em: agora,
    };
    const idx = lista.indexOf(existente);
    lista[idx] = reg;
  } else {
    reg = {
      id: `apd_${banco}_${Date.now()}`,
      banco,
      tipo_divergencia: input.tipo_divergencia,
      resposta_usuario: input.resposta_usuario,
      classificacao: input.classificacao,
      frequencia: 1,
      nivel_confianca: 0.55,
      aplicar_automaticamente_futuro: input.aplicar_automaticamente_futuro ?? false,
      percentual_tipico: input.percentual_tipico ?? null,
      atualizado_em: agora,
    };
    lista.push(reg);
  }

  gravar(lista);
  return reg;
}

export function buscarAprendizadoParaDivergencia(input: {
  banco: string | null;
  tipo_divergencia: string;
  percentual_divergencia?: number | null;
}): RegistroAprendizadoDivergencia | null {
  if (!input.banco) return null;
  const banco = normalizarBanco(input.banco);
  const candidatos = carregarAprendizadoDivergencias().filter(
    (r) =>
      r.banco === banco &&
      r.tipo_divergencia === input.tipo_divergencia &&
      r.aplicar_automaticamente_futuro &&
      r.nivel_confianca >= LIMITE_CONFIANCA_AUTO &&
      r.frequencia >= MIN_FREQUENCIA_AUTO,
  );

  if (candidatos.length === 0) return null;

  if (input.percentual_divergencia != null) {
    const pct = Math.round(input.percentual_divergencia * 10) / 10;
    const comPct = candidatos.find(
      (c) => c.percentual_tipico != null && Math.abs(c.percentual_tipico - pct) <= 1.5,
    );
    if (comPct) return comPct;
  }

  return candidatos.sort((a, b) => b.nivel_confianca - a.nivel_confianca)[0] ?? null;
}

export function atualizarPreferenciaBancoQuebraMargem(
  banco: string,
  resposta: RespostaAprendizadoDivergencia,
): void {
  const classificacao =
    resposta === "sempre_fraciona" || resposta === "ocasionalmente_fraciona"
      ? "desconto_fracionado"
      : resposta === "aceitar_consigfacil"
        ? "divergencia_operacional"
        : "revisar_manual";

  registrarAprendizadoDivergencia({
    banco,
    tipo_divergencia: "divergencia_valor",
    resposta_usuario: resposta,
    classificacao,
    aplicar_automaticamente_futuro:
      resposta === "sempre_fraciona" || resposta === "ignorar_padrao_futuro",
  });
}
