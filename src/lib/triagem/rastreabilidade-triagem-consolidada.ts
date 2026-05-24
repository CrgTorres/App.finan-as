/**
 * Rastreabilidade pericial da consolidação contextual da triagem.
 * Nenhuma linha é ocultada da fila principal sem contexto_id, justificativa e auditoria.
 */

import { carregarClustersResolvidos } from "@/lib/triagem/agrupar-divergencias-logicas";
import { carregarTriagensResolvidas } from "@/lib/triagem/aplicar-respostas-triagem";
import type { GrupoDivergenciaLogica } from "@/lib/triagem/agrupar-divergencias-logicas";
import {
  consolidarContextosResolutivos,
  itemResolvidoAutomaticamente,
  type ContextoResolutivoTriagem,
  type ResultadoConsolidacaoContextual,
} from "@/lib/triagem/consolidar-contextos-resolutivos";
import {
  priorizarFilaTriagem,
  type ItemTriagemPriorizado,
  type ResultadoPriorizacaoFila,
} from "@/lib/triagem/calcular-prioridade-risco-triagem";
import type { ItemTriagemResolutiva } from "@/lib/triagem/triagem-resolutiva-tipos";
import type { LinhaExportacaoTriagemResolutiva } from "@/lib/triagem/triagem-resolutiva-tipos";
import { linhasExportacaoTriagemResolutiva } from "@/lib/triagem/exportacao-triagem-resolutiva";
import {
  classificarAutoridadeTemporalConsigfacil,
  entradaTemporalDeContrato,
  type ResultadoAutoridadeTemporalConsigfacil,
} from "@/lib/consigfacil/autoridade-temporal-consigfacil";

function temporalTriagemItem(item: ItemTriagemResolutiva): ResultadoAutoridadeTemporalConsigfacil {
  const cf = item.contexto.consigfacil;
  return classificarAutoridadeTemporalConsigfacil(
    cf
      ? entradaTemporalDeContrato(cf, item.pendencia.competencia)
      : {
          competencia: item.pendencia.competencia,
          existeCorrelacaoConsigfacil: Boolean(item.contexto.divergencia.id_consignacao),
        },
  );
}

export type AuditoriaTriagemConsolidada = {
  contexto_id: string;
  linhas_afetadas: string;
  antes_status: string;
  depois_status: string;
  motivo: string;
  origem: string;
  score: number;
  usuario: string;
  timestamp: string;
};

export type RastreabilidadeLinhaTriagem = {
  pendencia_id: string;
  contexto_id: string | null;
  consolidado_em_contexto: boolean;
  oculto_por_visualizacao_consolidada: boolean;
  removido_fila_principal: boolean;
  motivo_ocultacao: string;
  justificativa_contexto: string;
  pode_ocultar_validado: boolean;
};

export type MetricasSaudeTriagemConsolidada = {
  triagem_linhas_consolidadas: number;
  triagem_contextos_resolvidos: number;
  triagem_reducao_ruido_percentual: number;
};

export type ContextoResolutivoExportacao = ContextoResolutivoTriagem & {
  decisao_aplicada: string;
  removido_fila_principal: boolean;
  data_processamento: string;
};

export type LinhaExportacaoTriagemResolutivaRastreada = LinhaExportacaoTriagemResolutiva & {
  autoridade_temporal_consigfacil?: string;
  contrato_migrado_para_consigfacil?: string;
  tipo_correlacao_temporal?: string;
  data_implantacao_fonte?: string;
  mensagem_autoridade_temporal?: string;
  contexto_id: string;
  consolidado_em_contexto: string;
  oculto_por_visualizacao_consolidada: string;
  motivo_ocultacao: string;
  natureza_estrutural: string;
  badge_natureza: string;
  em_fila_principal: string;
};

export type ResultadoRastreabilidadeTriagem = {
  contextos: ContextoResolutivoExportacao[];
  linhas_resolutiva: LinhaExportacaoTriagemResolutivaRastreada[];
  auditorias: AuditoriaTriagemConsolidada[];
  por_linha: Map<string, RastreabilidadeLinhaTriagem>;
  metricas: MetricasSaudeTriagemConsolidada;
  idsOcultosFilaValidados: Set<string>;
};

const STORAGE_AUDITORIA = "financaAuditoriaTriagemConsolidadaV1";

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function carregarAuditoriaTriagemConsolidada(): AuditoriaTriagemConsolidada[] {
  const storage = ls();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_AUDITORIA);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version: 1; registros: AuditoriaTriagemConsolidada[] };
    return parsed.registros ?? [];
  } catch {
    return [];
  }
}

export function salvarAuditoriaTriagemConsolidada(novos: AuditoriaTriagemConsolidada[]): void {
  const storage = ls();
  if (!storage || novos.length === 0) return;
  const existentes = carregarAuditoriaTriagemConsolidada();
  const chave = (a: AuditoriaTriagemConsolidada) =>
    `${a.contexto_id}|${a.linhas_afetadas}|${a.timestamp}`;
  const map = new Map<string, AuditoriaTriagemConsolidada>();
  for (const a of existentes) map.set(chave(a), a);
  for (const a of novos) map.set(chave(a), a);
  const merged = [...map.values()].slice(-2000);
  storage.setItem(STORAGE_AUDITORIA, JSON.stringify({ version: 1, registros: merged }));
}

function decisaoAplicadaItem(item: ItemTriagemResolutiva): string {
  const ru = item.resolucao_usuario;
  if (ru?.respostas.decisao_grupo) return String(ru.respostas.decisao_grupo);
  if (ru?.respostas.acao_grupo) return String(ru.respostas.acao_grupo);
  if (ru?.resultado.nova_classificacao) return ru.resultado.nova_classificacao;
  return item.motor.classificacao;
}

function decisaoContexto(ctx: ContextoResolutivoTriagem, itens: ItemTriagemResolutiva[]): string {
  const clusters = carregarClustersResolvidos().find((c) => c.grupo_id === ctx.contexto_id);
  if (clusters?.decisao_aplicada) return clusters.decisao_aplicada;
  const primeiro = itens.find((i) => ctx.linhas_relacionadas.includes(i.pendencia.id));
  return primeiro ? decisaoAplicadaItem(primeiro) : ctx.classificacao_motor;
}

function mapaGrupoPorLinha(grupos: GrupoDivergenciaLogica[]): Map<string, GrupoDivergenciaLogica> {
  const m = new Map<string, GrupoDivergenciaLogica>();
  for (const g of grupos) {
    for (const id of g.linhas_ids) m.set(id, g);
  }
  return m;
}

function criarAuditoria(input: {
  contexto_id: string;
  linha_id: string;
  antes: string;
  depois: string;
  motivo: string;
  origem: string;
  score: number;
  usuario: string;
}): AuditoriaTriagemConsolidada {
  return {
    contexto_id: input.contexto_id,
    linhas_afetadas: input.linha_id,
    antes_status: input.antes,
    depois_status: input.depois,
    motivo: input.motivo,
    origem: input.origem,
    score: input.score,
    usuario: input.usuario,
    timestamp: new Date().toISOString(),
  };
}

/** Valida regra: ocultação exige contexto_id + justificativa. */
export function validarOcultacaoLinha(r: RastreabilidadeLinhaTriagem): boolean {
  return Boolean(
    r.oculto_por_visualizacao_consolidada &&
      r.contexto_id &&
      r.justificativa_contexto.trim().length > 0,
  );
}

export type EntradaMontarRastreabilidade = {
  itens: ItemTriagemResolutiva[];
  visualizacaoConsolidada: boolean;
  gruposCluster?: GrupoDivergenciaLogica[];
  consolidacao?: ResultadoConsolidacaoContextual;
  priorizacao?: ResultadoPriorizacaoFila;
  usuario?: string;
  persistirAuditoria?: boolean;
};

/**
 * Monta rastreabilidade completa (exportação, UI, auditoria).
 */
export function montarRastreabilidadeTriagemConsolidada(
  entrada: EntradaMontarRastreabilidade,
): ResultadoRastreabilidadeTriagem {
  const usuario = entrada.usuario ?? "sistema";
  const agora = new Date().toISOString();

  const consolidacao =
    entrada.consolidacao ?? consolidarContextosResolutivos(entrada.itens);
  const priorizacao =
    entrada.priorizacao ??
    priorizarFilaTriagem(entrada.itens, {
      idsEmCluster: new Set(entrada.gruposCluster?.flatMap((g) => g.linhas_ids) ?? []),
      idsContextoConsolidado: consolidacao.idsOcultosFila,
    });

  const grupoPorLinha = mapaGrupoPorLinha(entrada.gruposCluster ?? []);
  const idsMonitoramento = new Set(priorizacao.monitoramento.map((i) => i.pendencia.id));
  const por_linha = new Map<string, RastreabilidadeLinhaTriagem>();
  const auditorias: AuditoriaTriagemConsolidada[] = [];
  const idsOcultosFilaValidados = new Set<string>();

  for (const item of entrada.itens) {
    const id = item.pendencia.id;
    const ctxVisual = consolidacao.contextoPorLinhaId.get(id);
    const grupo = grupoPorLinha.get(id);
    const emMonitoramento = idsMonitoramento.has(id);

    let contexto_id: string | null = null;
    let justificativa_contexto = "";
    let motivo_ocultacao = "";
    let origem_auditoria = "triagem";
    let score = item.motor.confianca * 100;

    if (ctxVisual) {
      contexto_id = ctxVisual.contexto_id;
      justificativa_contexto = ctxVisual.justificativa_principal;
      motivo_ocultacao =
        "Visualização consolidada: mesmo banco, competência, tipo e resolução automática.";
      origem_auditoria = ctxVisual.origem_principal;
      score = ctxVisual.score_confianca;
    } else if (grupo) {
      contexto_id = grupo.grupo_id;
      justificativa_contexto = `Cluster lógico: ${grupo.rubrica ?? grupo.banco ?? "padrão"} — ${grupo.quantidade_ocorrencias} ocorrências.`;
      motivo_ocultacao =
        "Padrão detectado (cluster): mesmos valores e rubrica — resolução em lote.";
      score = grupo.score_confianca_cluster;
    } else if (emMonitoramento) {
      const pr = priorizacao.todos_ordenados.find((x) => x.pendencia.id === id);
      const nat = (item as ItemTriagemPriorizado).natureza;
      contexto_id = `ctx_prio_${id.slice(0, 24)}`;
      justificativa_contexto =
        nat?.motivo_natureza ??
        pr?.prioridade_risco.motivo_principal ??
        "Priorização: baixo risco ou resolução automática — monitoramento.";
      motivo_ocultacao = nat?.em_monitoramento_historico
        ? "Monitoramento histórico: sem estrutura oficial (ficha/OCR/inferência)."
        : pr?.prioridade_risco.recomendacao === "resolucao_automatica"
          ? "Enviado a monitoramento: resolvido automaticamente pelo motor."
          : "Enviado a monitoramento: prioridade informativa/baixa sem ação imediata.";
      score = pr?.prioridade_risco.score_risco ?? score;
      origem_auditoria = "priorizacao_risco";
    }

    const consolidado_em_contexto = Boolean(ctxVisual || grupo);
    const removido_fila_principal =
      entrada.visualizacaoConsolidada &&
      (consolidacao.idsOcultosFila.has(id) || emMonitoramento || Boolean(grupo));

    let oculto_por_visualizacao_consolidada =
      entrada.visualizacaoConsolidada && removido_fila_principal;

    const rastreio: RastreabilidadeLinhaTriagem = {
      pendencia_id: id,
      contexto_id,
      consolidado_em_contexto,
      oculto_por_visualizacao_consolidada,
      removido_fila_principal,
      motivo_ocultacao,
      justificativa_contexto,
      pode_ocultar_validado: false,
    };

    if (oculto_por_visualizacao_consolidada) {
      if (!contexto_id || !justificativa_contexto.trim()) {
        contexto_id = contexto_id ?? `ctx_audit_${id}`;
        justificativa_contexto =
          justificativa_contexto ||
          "Auditoria: ocultação bloqueada por falta de metadados — linha mantida rastreável.";
        motivo_ocultacao = "Ocultação não aplicada: contexto incompleto (regra pericial).";
        oculto_por_visualizacao_consolidada = false;
        rastreio.removido_fila_principal = false;
      } else {
        rastreio.pode_ocultar_validado = true;
        idsOcultosFilaValidados.add(id);
        auditorias.push(
          criarAuditoria({
            contexto_id,
            linha_id: id,
            antes: "fila_principal",
            depois: consolidado_em_contexto ? "contexto_consolidado" : "monitoramento",
            motivo: motivo_ocultacao,
            origem: origem_auditoria,
            score,
            usuario,
          }),
        );
      }
    }

    rastreio.contexto_id = contexto_id;
    rastreio.justificativa_contexto = justificativa_contexto;
    rastreio.oculto_por_visualizacao_consolidada = oculto_por_visualizacao_consolidada;
    por_linha.set(id, rastreio);
  }

  if (entrada.persistirAuditoria !== false) {
    salvarAuditoriaTriagemConsolidada(auditorias);
  }

  const contextos: ContextoResolutivoExportacao[] = consolidacao.contextos.map((ctx) => ({
    ...ctx,
    decisao_aplicada: decisaoContexto(ctx, entrada.itens),
    removido_fila_principal: ctx.linhas_relacionadas.every((lid) =>
      idsOcultosFilaValidados.has(lid),
    ),
    data_processamento: agora,
  }));

  const linhas_resolutiva: LinhaExportacaoTriagemResolutivaRastreada[] = entrada.itens.map(
    (item) => {
      const linha = linhasExportacaoTriagemResolutiva([item])[0]!;
      const r = por_linha.get(item.pendencia.id);
      const nat = (item as ItemTriagemPriorizado).natureza;
      const temporal = temporalTriagemItem(item);
      return {
        ...linha,
        contexto_id: r?.contexto_id ?? "",
        consolidado_em_contexto: r?.consolidado_em_contexto ? "sim" : "nao",
        oculto_por_visualizacao_consolidada: r?.oculto_por_visualizacao_consolidada
          ? "sim"
          : "nao",
        motivo_ocultacao: r?.motivo_ocultacao ?? "",
        natureza_estrutural: nat?.natureza_estrutural ?? "",
        badge_natureza: nat?.badge_visual ?? "",
        em_fila_principal: nat?.em_fila_principal ? "sim" : "nao",
        autoridade_temporal_consigfacil: temporal.autoridade_temporal,
        contrato_migrado_para_consigfacil: temporal.contrato_migrado_para_consigfacil
          ? "sim"
          : "nao",
        tipo_correlacao_temporal: temporal.tipo_correlacao_temporal,
        data_implantacao_fonte: temporal.data_implantacao_fonte,
        mensagem_autoridade_temporal: temporal.mensagem_autoridade_temporal,
      };
    },
  );

  const totalAnalisado = entrada.itens.length;
  const linhasConsolidadas = [...idsOcultosFilaValidados].length;
  const metricas: MetricasSaudeTriagemConsolidada = {
    triagem_linhas_consolidadas: linhasConsolidadas,
    triagem_contextos_resolvidos: contextos.length,
    triagem_reducao_ruido_percentual:
      totalAnalisado > 0 ? Math.round((linhasConsolidadas / totalAnalisado) * 100) : 0,
  };

  return {
    contextos,
    linhas_resolutiva,
    auditorias: [...carregarAuditoriaTriagemConsolidada(), ...auditorias].slice(-500),
    por_linha,
    metricas,
    idsOcultosFilaValidados,
  };
}

export function linhasExportacaoContextosResolutivos(
  contextos: ContextoResolutivoExportacao[],
): Array<Record<string, string | number | boolean>> {
  return contextos.map((ctx) => ({
    contexto_id: ctx.contexto_id,
    banco: ctx.banco ?? "",
    tipo_contexto: ctx.tipo_contexto,
    competencias: ctx.competencias.join(", "),
    quantidade_ocorrencias: ctx.quantidade_ocorrencias,
    contratos: ctx.contratos.join("; "),
    linhas_relacionadas: ctx.linhas_relacionadas.join("; "),
    resolvido_automaticamente: ctx.resolvido_automaticamente,
    origem_principal: ctx.origem_principal,
    justificativa_principal: ctx.justificativa_principal,
    impacto_financeiro_total: ctx.impacto_financeiro_total,
    score_confianca: ctx.score_confianca,
    pode_ocultar_linhas_individuais: ctx.pode_ocultar_linhas_individuais,
    decisao_aplicada: ctx.decisao_aplicada,
    removido_fila_principal: ctx.removido_fila_principal,
    data_processamento: ctx.data_processamento,
  }));
}

export function linhasExportacaoAuditoriaTriagemConsolidada(
  auditorias: AuditoriaTriagemConsolidada[],
): Array<Record<string, string | number>> {
  return auditorias.map((a) => ({ ...a }));
}

export function linhasMetricasSaudeTriagemConsolidada(
  metricas: MetricasSaudeTriagemConsolidada,
): Array<Record<string, string | number>> {
  return [
    {
      metrica: "triagem_linhas_consolidadas",
      valor: metricas.triagem_linhas_consolidadas,
    },
    {
      metrica: "triagem_contextos_resolvidos",
      valor: metricas.triagem_contextos_resolvidos,
    },
    {
      metrica: "triagem_reducao_ruido_percentual",
      valor: metricas.triagem_reducao_ruido_percentual,
    },
  ];
}

/** CSV de um único contexto + linhas detalhadas. */
export function exportarContextoResolutivoCsv(
  ctx: ContextoResolutivoExportacao,
  itensPorId: Map<string, ItemTriagemResolutiva>,
  auditorias: AuditoriaTriagemConsolidada[],
): string {
  const rows: Array<Record<string, string | number | boolean>> = [
    ...linhasExportacaoContextosResolutivos([ctx]),
  ];

  for (const lid of ctx.linhas_relacionadas) {
    const item = itensPorId.get(lid);
    if (!item) continue;
    rows.push({
      tipo_registro: "linha",
      pendencia_id: lid,
      banco: item.pendencia.instituicao_oficial ?? "",
      competencia: item.pendencia.competencia ?? "",
      descricao: item.pendencia.descricao ?? "",
      decisao: decisaoAplicadaItem(item),
    });
  }

  for (const a of auditorias.filter((x) => x.contexto_id === ctx.contexto_id)) {
    rows.push({
      tipo_registro: "auditoria",
      contexto_id: a.contexto_id,
      linhas_afetadas: a.linhas_afetadas,
      antes_status: a.antes_status,
      depois_status: a.depois_status,
      motivo: a.motivo,
      origem: a.origem,
      score: a.score,
      usuario: a.usuario,
      timestamp: a.timestamp,
    });
  }

  const cols = Object.keys(rows[0] ?? { contexto_id: "" });
  const header = cols.join(";");
  const body = rows
    .map((row) => cols.map((c) => String(row[c] ?? "").replace(/;/g, ",")).join(";"))
    .join("\n");
  return "\ufeff" + header + "\n" + body;
}

/** Filtra fila principal usando apenas ocultações validadas (regra pericial). */
export function filtrarFilaComRastreabilidade(
  itens: ItemTriagemResolutiva[],
  rastreio: ResultadoRastreabilidadeTriagem,
  opts: {
    visualizacaoConsolidada: boolean;
    idsEmCluster?: Set<string>;
    linhasReveladas?: Set<string>;
  },
): ItemTriagemResolutiva[] {
  let fila = itens;
  if (opts.idsEmCluster?.size) {
    fila = fila.filter((i) => !opts.idsEmCluster!.has(i.pendencia.id));
  }
  if (!opts.visualizacaoConsolidada) return fila;

  return fila.filter((item) => {
    if (opts.linhasReveladas?.has(item.pendencia.id)) return true;
    if (rastreio.idsOcultosFilaValidados.has(item.pendencia.id)) {
      return false;
    }
    return true;
  });
}
