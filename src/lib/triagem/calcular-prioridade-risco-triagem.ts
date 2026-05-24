/**
 * Priorização contextual de risco na triagem resolutiva.
 */

import type { ItemTriagemResolutiva } from "@/lib/triagem/triagem-resolutiva-tipos";
import { itemResolvidoAutomaticamente } from "@/lib/triagem/consolidar-contextos-resolutivos";
import type { ResultadoNaturezaEstruturalPendencia } from "@/lib/triagem/classificar-natureza-estrutural-pendencia";

export type NivelPrioridadeTriagem =
  | "critica"
  | "alta"
  | "media"
  | "baixa"
  | "informativa";

export type RecomendacaoPrioridadeTriagem =
  | "acao_imediata"
  | "revisao_humana"
  | "acompanhar"
  | "resolucao_automatica"
  | "apenas_monitoramento";

export type FatoresRiscoTriagem = {
  refinanciamento_forcado?: boolean;
  suspensao_operacional?: boolean;
  bloqueio_governo?: boolean;
  divergencia_parcela?: boolean;
  divergencia_prazo?: boolean;
  risco_juridico?: boolean;
  risco_financeiro?: boolean;
  possivel_fraude?: boolean;
  desconto_nao_processado?: boolean;
  margem_excedida?: boolean;
  contrato_sem_evidencia?: boolean;
};

export type PrioridadeRiscoTriagem = {
  prioridade: NivelPrioridadeTriagem;
  score_risco: number;
  motivo_principal: string;
  fatores: FatoresRiscoTriagem;
  recomendacao: RecomendacaoPrioridadeTriagem;
};

export type CategoriaRiscoTriagem =
  | "risco_juridico"
  | "risco_financeiro"
  | "possivel_fraude"
  | "refinanciamento_induzido"
  | "crescimento_divida"
  | "contrato_sem_evidencia";

export type FiltroPrioridadeTriagem =
  | "todas"
  | "somente_criticas"
  | "somente_juridicas"
  | "somente_financeiras"
  | "somente_fraude"
  | "somente_automaticas"
  | "monitoramento";

export type ItemTriagemPriorizado = ItemTriagemResolutiva & {
  prioridade_risco: PrioridadeRiscoTriagem;
  impacto_financeiro: number;
  recorrencia: number;
  categorias_risco: CategoriaRiscoTriagem[];
  natureza?: ResultadoNaturezaEstruturalPendencia;
};

export type ResultadoPriorizacaoFila = {
  atencao_imediata: ItemTriagemPriorizado[];
  fila_principal: ItemTriagemPriorizado[];
  monitoramento: ItemTriagemPriorizado[];
  todos_ordenados: ItemTriagemPriorizado[];
  por_categoria: Record<CategoriaRiscoTriagem, ItemTriagemPriorizado[]>;
  metricas: {
    criticas: number;
    altas: number;
    em_monitoramento: number;
    atencao_imediata: number;
    estruturais_oficiais: number;
    historicos_monitorados: number;
    ocr_descartados: number;
    ruido_removido_estruturalmente: number;
    fila_humana_estimada: number;
  };
};

const ORDEM_PRIORIDADE: Record<NivelPrioridadeTriagem, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baixa: 3,
  informativa: 4,
};

export const ROTULO_PRIORIDADE: Record<NivelPrioridadeTriagem, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  informativa: "Informativa",
};

export const ROTULO_RECOMENDACAO: Record<RecomendacaoPrioridadeTriagem, string> = {
  acao_imediata: "Ação imediata",
  revisao_humana: "Revisão humana",
  acompanhar: "Acompanhar",
  resolucao_automatica: "Resolução automática",
  apenas_monitoramento: "Apenas monitoramento",
};

function impactoFinanceiro(item: ItemTriagemResolutiva): number {
  const prev = item.contexto.divergencia.valor_previsto ?? 0;
  const desc = item.contexto.divergencia.valor_descontado ?? 0;
  return Math.round(Math.abs(prev - desc) * 100) / 100;
}

function indiceRecorrencia(item: ItemTriagemResolutiva): number {
  const h = item.contexto.historico_contrato;
  const ev = item.contexto.eventos_operacionais.length + item.contexto.eventos_competencia.length;
  const quebras = h.quebras_percentual.length;
  const recorrente = item.contexto.comportamento_recorrente ? 2 : 0;
  return ev + quebras + recorrente;
}

function crescimentoAbruptoDivida(item: ItemTriagemResolutiva): boolean {
  const vals = item.contexto.historico_contrato.valores_descontados.filter((v) => v > 0);
  if (vals.length < 2) return false;
  const ult = vals[vals.length - 1]!;
  const pen = vals[vals.length - 2]!;
  return ult > pen * 1.35 && ult - pen > 80;
}

function naturezaDoItem(item: ItemTriagemResolutiva): ResultadoNaturezaEstruturalPendencia | undefined {
  return (item as ItemTriagemPriorizado).natureza;
}

function detectarFatores(item: ItemTriagemResolutiva): FatoresRiscoTriagem {
  const nat = naturezaDoItem(item);
  if (
    nat &&
    (!nat.contabiliza_risco_financeiro ||
      nat.em_monitoramento_historico ||
      nat.natureza_estrutural === "historico_financeiro" ||
      nat.natureza_estrutural === "monitoramento_historico" ||
      nat.badge_visual === "ocr_invalido")
  ) {
    return {
      refinanciamento_forcado: false,
      suspensao_operacional: nat.natureza_estrutural === "operacional",
      bloqueio_governo: false,
      divergencia_parcela: false,
      divergencia_prazo: false,
      risco_juridico: false,
      risco_financeiro: false,
      possivel_fraude: false,
      desconto_nao_processado: false,
      margem_excedida: false,
      contrato_sem_evidencia: false,
    };
  }

  const ctx = item.contexto;
  const p = item.pendencia;
  const desc = (p.descricao ?? "").toLowerCase();
  const motor = item.motor;

  const riscoRefinAlto = ctx.riscos_refin.some(
    (r) => r.nivel === "alto" || r.nivel === "critico",
  );

  const fatores: FatoresRiscoTriagem = {
    refinanciamento_forcado:
      nat?.contabiliza_refin !== false &&
      (riscoRefinAlto ||
        motor.classificacao === "risco_refin_induzido" ||
        (ctx.refin_detectado && ctx.novo_contrato_mesmo_banco)),
    suspensao_operacional:
      motor.classificacao === "suspensao_operacional" ||
      p.motivo_quebra_desconto === "suspensao_operacional" ||
      ctx.eventos_operacionais.some((e) => e.tipo === "suspensao"),
    bloqueio_governo:
      motor.classificacao === "bloqueio_governo" ||
      p.motivo_quebra_desconto === "bloqueio_governo" ||
      ctx.eventos_operacionais.some((e) => e.tipo === "bloqueio"),
    divergencia_parcela:
      nat?.contabiliza_divergencia_estrutural !== false &&
      (desc.includes("parcela atual diverge") || ctx.parcela_mudou),
    divergencia_prazo:
      nat?.contabiliza_divergencia_estrutural !== false &&
      (desc.includes("total de parcelas diverge") || ctx.prazo_aumentou),
    risco_juridico:
      riscoRefinAlto ||
      motor.classificacao === "risco_refin_induzido" ||
      motor.nivel_risco === "critico",
    risco_financeiro:
      impactoFinanceiro(item) >= 200 ||
      (ctx.divergencia.percentual_divergencia ?? 0) >= 15,
    possivel_fraude:
      (p.tipo === "match_baixo" || p.tipo === "sem_evidencia") &&
      impactoFinanceiro(item) >= 150 &&
      (!ctx.consigfacil || p.tipo === "match_baixo"),
    desconto_nao_processado:
      p.motivo_quebra_desconto === "nao_processado" ||
      p.motivo_quebra_desconto === "inadimplencia",
    margem_excedida:
      ctx.margem_ultrapassada ||
      p.tipo === "margem_incompativel" ||
      motor.classificacao === "margem_insuficiente",
    contrato_sem_evidencia: p.tipo === "sem_evidencia",
  };

  if (
    motor.classificacao === "desconto_recuperado" &&
    ctx.novo_contrato_mesmo_banco
  ) {
    fatores.refinanciamento_forcado = true;
    fatores.risco_juridico = true;
  }

  if (crescimentoAbruptoDivida(item)) {
    fatores.risco_financeiro = true;
  }

  if (
    fatores.bloqueio_governo &&
    ctx.novo_contrato_mesmo_banco
  ) {
    fatores.refinanciamento_forcado = true;
  }

  return fatores;
}

function calcularScoreRisco(
  fatores: FatoresRiscoTriagem,
  item: ItemTriagemResolutiva,
): number {
  let score = 0;
  if (fatores.refinanciamento_forcado) score += 28;
  if (fatores.possivel_fraude) score += 26;
  if (fatores.risco_juridico) score += 22;
  if (fatores.bloqueio_governo && item.contexto.novo_contrato_mesmo_banco) score += 24;
  if (fatores.bloqueio_governo) score += 14;
  if (fatores.risco_financeiro) score += 16;
  if (fatores.margem_excedida) score += 14;
  if (fatores.divergencia_parcela) score += 12;
  if (fatores.divergencia_prazo) score += 12;
  if (fatores.suspensao_operacional) score += 10;
  if (fatores.desconto_nao_processado) score += 10;
  if (fatores.contrato_sem_evidencia) score += 8;
  if (crescimentoAbruptoDivida(item)) score += 18;

  if (item.motor.nivel_risco === "critico") score += 15;
  if (item.motor.nivel_risco === "alto") score += 10;
  if (item.motor.nivel_risco === "medio") score += 5;

  const impacto = impactoFinanceiro(item);
  if (impacto >= 500) score += 12;
  else if (impacto >= 200) score += 8;
  else if (impacto < 30) score -= 8;

  if (item.contexto.eventos_operacionais.length >= 3) score += 6;
  if (item.contexto.comportamento_recorrente) score += 5;

  if (itemResolvidoAutomaticamente(item) && item.motor.confianca >= 0.85) {
    score -= 25;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function definirPrioridade(
  score: number,
  fatores: FatoresRiscoTriagem,
  item: ItemTriagemResolutiva,
): NivelPrioridadeTriagem {
  if (
    fatores.possivel_fraude ||
    (fatores.refinanciamento_forcado && fatores.risco_juridico) ||
    (fatores.bloqueio_governo && item.contexto.novo_contrato_mesmo_banco) ||
    (item.motor.classificacao === "desconto_recuperado" && item.contexto.novo_contrato_mesmo_banco) ||
    crescimentoAbruptoDivida(item) ||
    score >= 85
  ) {
    return "critica";
  }

  if (
    score >= 68 ||
    fatores.refinanciamento_forcado ||
    fatores.risco_juridico ||
    fatores.divergencia_parcela ||
    fatores.divergencia_prazo ||
    (fatores.risco_financeiro && fatores.margem_excedida) ||
    item.contexto.eventos_operacionais.length >= 3
  ) {
    return "alta";
  }

  if (
    score >= 42 ||
    fatores.suspensao_operacional ||
    fatores.desconto_nao_processado ||
    item.contexto.comportamento_recorrente ||
    (item.motor.classificacao === "desconto_fracionado" && !item.motor.resolvido)
  ) {
    return "media";
  }

  if (score >= 22 || fatores.contrato_sem_evidencia) {
    return "baixa";
  }

  return "informativa";
}

function motivoPrincipal(
  fatores: FatoresRiscoTriagem,
  item: ItemTriagemResolutiva,
): string {
  if (fatores.possivel_fraude) {
    return "Indícios de inconsistência grave — possível fraude ou vínculo incorreto.";
  }
  if (fatores.refinanciamento_forcado && item.contexto.novo_contrato_mesmo_banco) {
    return "Novo contrato após bloqueio/suspensão — risco de refinanciamento induzido.";
  }
  if (fatores.refinanciamento_forcado) {
    return "Refinanciamento induzido ou rolagem consignada detectada.";
  }
  if (crescimentoAbruptoDivida(item)) {
    return "Crescimento abrupto do desconto / dívida consignada.";
  }
  if (fatores.risco_juridico) {
    return "Risco jurídico elevado — exige análise de defesa e documentação.";
  }
  if (fatores.divergencia_parcela || fatores.divergencia_prazo) {
    return "Divergência oficial de parcela ou prazo incompatível com cadastro.";
  }
  if (fatores.margem_excedida && fatores.risco_financeiro) {
    return "Margem muito comprometida com impacto financeiro relevante.";
  }
  if (fatores.suspensao_operacional) {
    return "Suspensão operacional no ConsigFácil ou folha.";
  }
  if (fatores.bloqueio_governo) {
    return "Bloqueio governamental ativo.";
  }
  if (fatores.contrato_sem_evidencia) {
    return "Contrato sem evidência anexada.";
  }
  if (itemResolvidoAutomaticamente(item)) {
    return "Resolvido automaticamente — agrupamento estável, baixo impacto.";
  }
  if (item.motor.classificacao === "desconto_fracionado") {
    return "Desconto fracionado — conferir se já conciliado.";
  }
  return item.motor.explicacao.slice(0, 160) || item.pendencia.descricao?.slice(0, 160) || "Divergência em análise.";
}

function definirRecomendacao(
  prioridade: NivelPrioridadeTriagem,
  fatores: FatoresRiscoTriagem,
  item: ItemTriagemResolutiva,
): RecomendacaoPrioridadeTriagem {
  if (prioridade === "critica") return "acao_imediata";
  if (prioridade === "alta") {
    return fatores.risco_juridico || fatores.possivel_fraude
      ? "acao_imediata"
      : "revisao_humana";
  }
  if (prioridade === "media") return "revisao_humana";
  if (prioridade === "baixa") {
    return item.motor.resolvido ? "acompanhar" : "revisao_humana";
  }
  if (itemResolvidoAutomaticamente(item) && item.motor.confianca >= 0.8) {
    return "resolucao_automatica";
  }
  return "apenas_monitoramento";
}

export function calcularPrioridadeRiscoTriagem(
  item: ItemTriagemResolutiva,
): PrioridadeRiscoTriagem {
  const fatores = detectarFatores(item);
  const score_risco = calcularScoreRisco(fatores, item);
  const prioridade = definirPrioridade(score_risco, fatores, item);
  const recomendacao = definirRecomendacao(prioridade, fatores, item);

  return {
    prioridade,
    score_risco,
    motivo_principal: motivoPrincipal(fatores, item),
    fatores,
    recomendacao,
  };
}

export function categoriasDeItem(item: ItemTriagemPriorizado): CategoriaRiscoTriagem[] {
  if (item.natureza && !item.natureza.contabiliza_risco_financeiro) {
    return [];
  }
  const f = item.prioridade_risco.fatores;
  const cats: CategoriaRiscoTriagem[] = [];
  if (f.risco_juridico || f.refinanciamento_forcado) cats.push("risco_juridico");
  if (
    item.natureza?.contabiliza_refin !== false &&
    (f.refinanciamento_forcado || item.motor.classificacao === "risco_refin_induzido")
  ) {
    cats.push("refinanciamento_induzido");
  }
  if (f.risco_financeiro || f.margem_excedida) cats.push("risco_financeiro");
  if (f.possivel_fraude) cats.push("possivel_fraude");
  if (crescimentoAbruptoDivida(item)) cats.push("crescimento_divida");
  if (f.contrato_sem_evidencia) cats.push("contrato_sem_evidencia");
  return [...new Set(cats)];
}

function compararItensPriorizados(a: ItemTriagemPriorizado, b: ItemTriagemPriorizado): number {
  const pa = ORDEM_PRIORIDADE[a.prioridade_risco.prioridade];
  const pb = ORDEM_PRIORIDADE[b.prioridade_risco.prioridade];
  if (pa !== pb) return pa - pb;
  if (b.prioridade_risco.score_risco !== a.prioridade_risco.score_risco) {
    return b.prioridade_risco.score_risco - a.prioridade_risco.score_risco;
  }
  if (b.impacto_financeiro !== a.impacto_financeiro) {
    return b.impacto_financeiro - a.impacto_financeiro;
  }
  if (b.recorrencia !== a.recorrencia) {
    return b.recorrencia - a.recorrencia;
  }
  const confA = a.motor.confianca;
  const confB = b.motor.confianca;
  return confA - confB;
}

export function deveIrMonitoramento(
  item: ItemTriagemPriorizado,
  opts?: {
    emCluster?: boolean;
    emContextoConsolidado?: boolean;
  },
): boolean {
  if (item.natureza?.em_monitoramento_historico) return true;
  if (item.natureza && !item.natureza.em_fila_principal) return true;

  const pr = item.prioridade_risco;

  if (opts?.emCluster || opts?.emContextoConsolidado) {
    if (pr.prioridade !== "critica" && pr.prioridade !== "alta") return true;
  }

  if (
    pr.prioridade === "informativa" &&
    (itemResolvidoAutomaticamente(item) ||
      pr.recomendacao === "apenas_monitoramento" ||
      pr.recomendacao === "resolucao_automatica")
  ) {
    return true;
  }

  if (
    itemResolvidoAutomaticamente(item) &&
    pr.score_risco < 40 &&
    pr.prioridade !== "critica" &&
    pr.prioridade !== "alta"
  ) {
    return true;
  }

  if (
    item.motor.resolvido &&
    item.motor.remover_conferencia &&
    pr.score_risco < 35 &&
    !pr.fatores.risco_juridico &&
    !pr.fatores.possivel_fraude
  ) {
    return true;
  }

  return false;
}

export function exigeAtencaoImediata(item: ItemTriagemPriorizado): boolean {
  const pr = item.prioridade_risco;
  if (pr.prioridade === "critica") return true;
  if (pr.prioridade === "alta" && pr.recomendacao === "acao_imediata") return true;
  if (pr.recomendacao === "acao_imediata") return true;
  return false;
}

export function priorizarFilaTriagem(
  itens: ItemTriagemResolutiva[],
  opts?: {
    idsEmCluster?: Set<string>;
    idsContextoConsolidado?: Set<string>;
  },
): ResultadoPriorizacaoFila {
  const priorizados: ItemTriagemPriorizado[] = itens.map((item) => {
    const prioridade_risco = calcularPrioridadeRiscoTriagem(item);
    const nat = (item as ItemTriagemPriorizado).natureza;
    const base: ItemTriagemPriorizado = {
      ...item,
      prioridade_risco,
      impacto_financeiro: impactoFinanceiro(item),
      recorrencia: indiceRecorrencia(item),
      categorias_risco: [],
      natureza: nat,
    };
    base.categorias_risco = categoriasDeItem(base);
    return base;
  });

  priorizados.sort(compararItensPriorizados);

  const atencao_imediata: ItemTriagemPriorizado[] = [];
  const fila_principal: ItemTriagemPriorizado[] = [];
  const monitoramento: ItemTriagemPriorizado[] = [];

  for (const item of priorizados) {
    const emCluster = opts?.idsEmCluster?.has(item.pendencia.id) ?? false;
    const emCtx = opts?.idsContextoConsolidado?.has(item.pendencia.id) ?? false;

    if (deveIrMonitoramento(item, { emCluster, emContextoConsolidado: emCtx })) {
      monitoramento.push(item);
      continue;
    }

    if (item.natureza?.em_fila_principal) {
      if (exigeAtencaoImediata(item)) {
        atencao_imediata.push(item);
      }
      fila_principal.push(item);
    } else {
      monitoramento.push(item);
    }
  }

  const por_categoria: Record<CategoriaRiscoTriagem, ItemTriagemPriorizado[]> = {
    risco_juridico: [],
    risco_financeiro: [],
    possivel_fraude: [],
    refinanciamento_induzido: [],
    crescimento_divida: [],
    contrato_sem_evidencia: [],
  };

  for (const item of priorizados) {
    if (item.natureza && !item.natureza.contabiliza_risco_financeiro) continue;
    for (const cat of item.categorias_risco) {
      por_categoria[cat].push(item);
    }
  }

  for (const k of Object.keys(por_categoria) as CategoriaRiscoTriagem[]) {
    por_categoria[k].sort(compararItensPriorizados);
  }

  return {
    atencao_imediata: atencao_imediata.sort(compararItensPriorizados),
    fila_principal: fila_principal.sort(compararItensPriorizados),
    monitoramento: monitoramento.sort(compararItensPriorizados),
    todos_ordenados: priorizados,
    por_categoria,
    metricas: {
      criticas: fila_principal.filter((i) => i.prioridade_risco.prioridade === "critica").length,
      altas: fila_principal.filter((i) => i.prioridade_risco.prioridade === "alta").length,
      em_monitoramento: monitoramento.length,
      atencao_imediata: atencao_imediata.length,
      estruturais_oficiais: priorizados.filter(
        (i) =>
          i.natureza?.natureza_estrutural === "estrutural_oficial" ||
          i.natureza?.natureza_estrutural === "refin_real",
      ).length,
      historicos_monitorados: priorizados.filter((i) => i.natureza?.em_monitoramento_historico)
        .length,
      ocr_descartados: priorizados.filter((i) => i.natureza?.badge_visual === "ocr_invalido")
        .length,
      ruido_removido_estruturalmente: priorizados.filter(
        (i) =>
          i.natureza?.em_monitoramento_historico &&
          i.natureza.natureza_estrutural !== "estrutural_oficial",
      ).length,
      fila_humana_estimada: fila_principal.length,
    },
  };
}

export function filtrarPorPrioridade(
  itens: ItemTriagemPriorizado[],
  filtro: FiltroPrioridadeTriagem,
): ItemTriagemPriorizado[] {
  if (filtro === "todas") return itens;
  if (filtro === "monitoramento") return itens;

  return itens.filter((item) => {
    const pr = item.prioridade_risco;
    const f = pr.fatores;
    switch (filtro) {
      case "somente_criticas":
        return pr.prioridade === "critica";
      case "somente_juridicas":
        return !!(f.risco_juridico || f.refinanciamento_forcado);
      case "somente_financeiras":
        return !!(f.risco_financeiro || f.margem_excedida);
      case "somente_fraude":
        return !!f.possivel_fraude;
      case "somente_automaticas":
        return (
          pr.recomendacao === "resolucao_automatica" ||
          pr.recomendacao === "apenas_monitoramento" ||
          itemResolvidoAutomaticamente(item)
        );
      default:
        return true;
    }
  });
}
