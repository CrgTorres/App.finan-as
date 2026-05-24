/**
 * Rótulos e tom visual da Triagem Resolutiva (pipeline saneado/contextual).
 */

import type { ItemTriagemPriorizado } from "@/lib/triagem/calcular-prioridade-risco-triagem";
import type { ResultadoNaturezaEstruturalPendencia } from "@/lib/triagem/classificar-natureza-estrutural-pendencia";
import { itemResolvidoAutomaticamente } from "@/lib/triagem/consolidar-contextos-resolutivos";

export const ROTULOS_TRIAGEM_UI = {
  itensProcessados: "Itens processados",
  subtituloBaseSaneada: "Base histórica saneada e classificada automaticamente.",
  itensMonitoradosAutomaticamente: "Itens monitorados automaticamente",
  filaHumanaEstrutural: "Fila humana estrutural",
  monitoramentoContextualTitulo: "Monitoramento contextual",
  monitoramentoContextualDesc:
    "Processados automaticamente pelo motor contextual — sem necessidade de ação humana",
  nenhumItemMonitoramento: "Nenhum item em monitoramento contextual no momento.",
  nenhumaAcaoFiltro: "Nenhuma ação humana necessária neste contexto.",
  nenhumaAcaoHumanaPendente: "Nenhuma ação humana pendente.",
  triagemEstabilizada: "Triagem estabilizada",
  motorContextualMonitorados: (n: number) =>
    `${n} itens monitorados automaticamente pelo motor contextual.`,
  filaHumanaListaTitulo: "Fila humana estrutural",
  filaHumanaListaDesc:
    "Contratos com estrutura oficial, refin real, risco jurídico ou operacional crítico — exigem decisão humana.",
  atencaoEstruturalTitulo: "Decisão estrutural prioritária",
  nenhumCasoCritico: "Nenhuma decisão estrutural urgente neste contexto.",
  maisNaFilaHumana: (n: number) => `+ ${n} na fila humana estrutural`,
  priorizacaoContextual: "Priorização contextual",
  priorizacaoContextualDesc: (monitoramento: number) =>
    `${monitoramento} em monitoramento contextual · separado da fila humana estrutural`,
  filtroMonitoramento: "Monitorados automaticamente",
} as const;

const NATUREZAS_CRITICAS = new Set([
  "estrutural_oficial",
  "refin_real",
  "juridico",
]);

/** Linguagem de erro/divergência/pendência crítica só para fila estrutural real. */
export function exigeLinguagemCritica(item: ItemTriagemPriorizado): boolean {
  const nat = item.natureza;
  if (!nat?.em_fila_principal) return false;
  if (nat.em_monitoramento_historico) return false;
  if (nat.natureza_estrutural === "consolidado_contextual") return false;
  if (nat.natureza_estrutural === "monitoramento_historico") return false;
  if (nat.badge_visual === "historico" || nat.badge_visual === "ocr_invalido") return false;
  if (nat.badge_visual === "inferencia_historica") return false;

  if (item.prioridade_risco.fatores.possivel_fraude) return true;
  if (nat.natureza_estrutural === "refin_real" || nat.natureza_estrutural === "juridico") {
    return true;
  }
  if (
    nat.natureza_estrutural === "operacional" &&
    !nat.fecha_automaticamente &&
    (item.prioridade_risco.prioridade === "critica" ||
      item.prioridade_risco.prioridade === "alta")
  ) {
    return true;
  }
  if (
    nat.natureza_estrutural === "estrutural_oficial" &&
    NATUREZAS_CRITICAS.has(nat.natureza_estrutural) &&
    (item.prioridade_risco.prioridade === "critica" ||
      item.prioridade_risco.prioridade === "alta" ||
      item.prioridade_risco.recomendacao === "acao_imediata")
  ) {
    return true;
  }
  return false;
}

export function itemEmContextoSaneado(item: ItemTriagemPriorizado): boolean {
  const nat = item.natureza;
  if (!nat) return false;
  if (nat.em_monitoramento_historico) return true;
  if (nat.natureza_estrutural === "consolidado_contextual") return true;
  if (nat.fecha_automaticamente) return true;
  if (itemResolvidoAutomaticamente(item)) return true;
  if (item.motor.resolvido && item.motor.remover_conferencia) return true;
  if (!nat.em_fila_principal) return true;
  return !exigeLinguagemCritica(item);
}

export function motivoExibicaoTriagem(item: ItemTriagemPriorizado): string {
  const nat = item.natureza;
  if (itemEmContextoSaneado(item) && nat?.motivo_natureza) {
    return nat.motivo_natureza;
  }
  return item.prioridade_risco.motivo_principal;
}

export function rotuloRecomendacaoTriagem(
  item: ItemTriagemPriorizado,
  rotuloPadrao: string,
): string {
  if (itemEmContextoSaneado(item)) {
    if (item.natureza?.em_monitoramento_historico) return "Histórico monitorado";
    if (item.natureza?.natureza_estrutural === "consolidado_contextual") {
      return "Consolidado contextual";
    }
    if (itemResolvidoAutomaticamente(item) || item.motor.resolvido) {
      return "Resolvido pelo motor contextual";
    }
    return "Monitoramento contextual";
  }
  return rotuloPadrao;
}

export function classesCardTriagem(
  item: ItemTriagemPriorizado,
  resolvido: boolean,
): string {
  if (resolvido || itemEmContextoSaneado(item)) {
    return "border-emerald-500/30 bg-emerald-500/5";
  }
  const pr = item.prioridade_risco;
  if (exigeLinguagemCritica(item) && pr.prioridade === "critica") {
    return "border-red-500/50 bg-red-500/5";
  }
  if (exigeLinguagemCritica(item) && pr.prioridade === "alta") {
    return "border-orange-500/40";
  }
  return "border-border/80 bg-muted/20";
}

export function textoBotaoResolver(item: ItemTriagemPriorizado): string {
  if (itemEmContextoSaneado(item)) return "Revisar contexto";
  if (exigeLinguagemCritica(item)) {
    return item.prioridade_risco.prioridade === "critica" ||
      item.prioridade_risco.prioridade === "alta"
      ? "Resolver agora"
      : "Resolver com perguntas";
  }
  return "Revisar";
}

export function filtrarCategoriasRiscoExibicao(
  item: ItemTriagemPriorizado,
): ItemTriagemPriorizado["categorias_risco"] {
  if (itemEmContextoSaneado(item)) return [];
  return item.categorias_risco;
}

export function naturezaEhMonitoramentoContextual(
  nat?: ResultadoNaturezaEstruturalPendencia,
): boolean {
  if (!nat) return false;
  return (
    nat.em_monitoramento_historico ||
    nat.natureza_estrutural === "consolidado_contextual" ||
    nat.fecha_automaticamente
  );
}
