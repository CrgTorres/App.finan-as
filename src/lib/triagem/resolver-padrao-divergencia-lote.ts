/**
 * Resolução em lote de pendências com o mesmo % de divergência (padrão visual na triagem).
 */

import { extrairPercentualDivergenciaDescricao } from "@/lib/consignacoes-governo/divergencia-valor-folha";
import {
  aplicarRespostasTriagem,
  type ResultadoAplicacaoTriagem,
} from "@/lib/triagem/aplicar-respostas-triagem";
import { contextoDePendencia } from "@/lib/triagem/triagem-service";
import type { ContextoTriagem, RespostasTriagem } from "@/lib/triagem/triagem-inteligente-tipos";
import { resolverTriagemFinanceira } from "@/lib/triagem/resolver-triagem-financeira";

export type PadraoDivergenciaLote = "desconto_fracionado" | "consigfacil" | "folha";

export type PendenciaTriagemMin = {
  id: string;
  tipo?: string;
  descricao?: string | null;
  competencia?: string | null;
  instituicao_oficial?: string | null;
  valor_esperado?: number | null;
  valor_observado?: number | null;
  id_consignacao?: string | null;
};

export function agruparPendenciasPorPercentualDivergencia(
  pendencias: PendenciaTriagemMin[],
): Map<number, PendenciaTriagemMin[]> {
  const map = new Map<number, PendenciaTriagemMin[]>();
  for (const p of pendencias) {
    if ((p.tipo ?? "") !== "divergencia_valor") continue;
    const pct = extrairPercentualDivergenciaDescricao(p.descricao);
    if (pct == null) continue;
    const chave = Math.round(pct * 10) / 10;
    const lista = map.get(chave) ?? [];
    lista.push(p);
    map.set(chave, lista);
  }
  return map;
}

function respostasParaPadrao(padrao: PadraoDivergenciaLote): RespostasTriagem {
  switch (padrao) {
    case "desconto_fracionado":
      return { div_1: "sim", div_2: "sim" };
    case "consigfacil":
      return { div_1: "nao", div_3: "sim" };
    case "folha":
      return { div_1: "nao", div_3: "nao", div_4: "sim" };
  }
}

function terminalParaPadrao(padrao: PadraoDivergenciaLote): string {
  switch (padrao) {
    case "desconto_fracionado":
      return "div_fim_fracionado";
    case "consigfacil":
      return "div_fim_consigfacil";
    case "folha":
      return "div_fim_folha";
  }
}

export function sugerirPadraoParaPercentual(pct: number): PadraoDivergenciaLote {
  if (pct >= 5 && pct <= 12) return "desconto_fracionado";
  if (pct < 5) return "consigfacil";
  return "folha";
}

export function resolverPendenciasDivergenciaEmLote(input: {
  pendencias: PendenciaTriagemMin[];
  percentualAlvo: number;
  padrao?: PadraoDivergenciaLote;
}): { resolvidas: number; mantidas: number; detalhes: ResultadoAplicacaoTriagem[] } {
  const padrao = input.padrao ?? sugerirPadraoParaPercentual(input.percentualAlvo);
  const respostas = respostasParaPadrao(padrao);
  const terminal = terminalParaPadrao(padrao);
  const alvo = Math.round(input.percentualAlvo * 10) / 10;

  let resolvidas = 0;
  let mantidas = 0;
  const detalhes: ResultadoAplicacaoTriagem[] = [];

  for (const p of input.pendencias) {
    const pct = extrairPercentualDivergenciaDescricao(p.descricao);
    if (pct == null || Math.round(pct * 10) / 10 !== alvo) continue;

    const ctx: ContextoTriagem = contextoDePendencia(p);
    const resultado = resolverTriagemFinanceira(
      "divergencia_valor",
      respostas,
      ctx,
      terminal,
    );
    const aplicacao = aplicarRespostasTriagem({ contexto: ctx, respostas, resultado });
    detalhes.push(aplicacao);
    if (resultado.remover_pendencia) resolvidas++;
    else mantidas++;
  }

  return { resolvidas, mantidas, detalhes };
}
