/**
 * Consolidação visual de contextos resolutivos — reduz ruído na UI da triagem.
 */

import type { ItemTriagemResolutiva } from "@/lib/triagem/triagem-resolutiva-tipos";
import { normalizarBancoCluster } from "@/lib/triagem/agrupar-divergencias-logicas";

export type TipoContextoResolutivo =
  | "suspensao_operacional"
  | "desconto_fracionado"
  | "bloqueio"
  | "quebra_temporaria"
  | "consignacao_parcial"
  | "risco_refin"
  | "divergencia_lote";

export type OrigemPrincipalContexto =
  | "consigfacil"
  | "folha"
  | "extrato"
  | "email"
  | "ocr"
  | "manual";

export type ContextoResolutivoTriagem = {
  contexto_id: string;
  banco: string | null;
  tipo_contexto: TipoContextoResolutivo;
  competencias: string[];
  quantidade_ocorrencias: number;
  contratos: string[];
  linhas_relacionadas: string[];
  resolvido_automaticamente: boolean;
  origem_principal: OrigemPrincipalContexto;
  justificativa_principal: string;
  impacto_financeiro_total: number;
  score_confianca: number;
  pode_ocultar_linhas_individuais: boolean;
  /** Classificação canônica do motor (exibição) */
  classificacao_motor: string;
};

export type MetricasConsolidacaoContextual = {
  linhas_consolidadas: number;
  reducao_cognitiva_pct: number;
  resolucoes_automaticas_agrupadas: number;
  percentual_ruido_removido: number;
  contextos_exibidos: number;
  linhas_na_fila_principal: number;
};

export type ResultadoConsolidacaoContextual = {
  contextos: ContextoResolutivoTriagem[];
  metricas: MetricasConsolidacaoContextual;
  /** IDs ocultos da fila principal quando visualização consolidada ativa */
  idsOcultosFila: Set<string>;
  /** Mapa id → contexto para expandir detalhes */
  contextoPorLinhaId: Map<string, ContextoResolutivoTriagem>;
};

const SCORE_MIN_CONSOLIDAR = 80;
const MIN_OCORRENCIAS = 2;

const ROTULO_TIPO: Record<TipoContextoResolutivo, string> = {
  suspensao_operacional: "Suspensão operacional",
  desconto_fracionado: "Desconto fracionado",
  bloqueio: "Bloqueio governamental",
  quebra_temporaria: "Quebra temporária de margem",
  consignacao_parcial: "Consignação parcial",
  risco_refin: "Risco de refinanciamento",
  divergencia_lote: "Divergência em lote",
};

const ROTULO_ORIGEM: Record<OrigemPrincipalContexto, string> = {
  consigfacil: "ConsigFácil",
  folha: "Folha de pagamento",
  extrato: "Extrato bancário",
  email: "E-mail / comunicação",
  ocr: "OCR / documento",
  manual: "Conferência manual",
};

export function rotuloTipoContexto(t: TipoContextoResolutivo): string {
  return ROTULO_TIPO[t];
}

export function rotuloOrigemContexto(o: OrigemPrincipalContexto): string {
  return ROTULO_ORIGEM[o];
}

function normalizarJustificativa(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function tipoContextoDeItem(item: ItemTriagemResolutiva): TipoContextoResolutivo {
  const c = item.motor.classificacao;
  const motivo = item.pendencia.motivo_quebra_desconto ?? "";

  if (c === "suspensao_operacional" || motivo === "suspensao_operacional") {
    return "suspensao_operacional";
  }
  if (c === "bloqueio_governo" || motivo === "bloqueio_governo") {
    return "bloqueio";
  }
  if (c === "desconto_fracionado" || motivo === "desconto_fracionado" || motivo === "margem_insuficiente") {
    return "desconto_fracionado";
  }
  if (c === "quebra_temporaria" || c === "margem_insuficiente") {
    return "quebra_temporaria";
  }
  if (c === "risco_refin_induzido" || c === "refinanciamento_real") {
    return "risco_refin";
  }
  if (
    item.pendencia.tipo === "divergencia_consigfacil_campo" ||
    c === "divergencia_operacional"
  ) {
    return "consignacao_parcial";
  }
  if (item.pendencia.tipo === "divergencia_valor") {
    return "divergencia_lote";
  }
  return "consignacao_parcial";
}

function origemPrincipalDeItem(item: ItemTriagemResolutiva): OrigemPrincipalContexto {
  const tipo = item.pendencia.tipo;
  if (
    tipo.includes("consigfacil") ||
    item.contexto.consigfacil != null ||
    item.motor.explicacao.toLowerCase().includes("consigfácil") ||
    item.motor.explicacao.toLowerCase().includes("consigfacil")
  ) {
    return "consigfacil";
  }
  if (tipo.includes("folha") || item.contexto.linhas_folha_competencia.length > 0) {
    return "folha";
  }
  if (item.motor.explicacao.toLowerCase().includes("extrato")) {
    return "extrato";
  }
  if (item.motor.explicacao.toLowerCase().includes("ocr")) {
    return "ocr";
  }
  if (item.motor.explicacao.toLowerCase().includes("email")) {
    return "email";
  }
  return "manual";
}

function decisaoAutomaticaChave(item: ItemTriagemResolutiva): string {
  const origem = item.motor.origem;
  const classificacao = item.resolucao_usuario?.resultado.nova_classificacao ?? item.motor.classificacao;
  const decisaoGrupo = item.resolucao_usuario?.respostas?.decisao_grupo ?? "";
  return `${origem}|${classificacao}|${decisaoGrupo}|${item.motor.etapa_aplicada ?? ""}`;
}

export function itemResolvidoAutomaticamente(item: ItemTriagemResolutiva): boolean {
  if (item.motor.resolvido && item.motor.origem === "automatica_motor") return true;
  if (item.motor.resolvido && item.motor.origem === "aprendizado") return true;
  if (item.aprendizado_aplicado && item.motor.resolvido) return true;
  const res = item.resolucao_usuario;
  if (res?.resultado.remover_pendencia && res.respostas.motor_lote === "auto") return true;
  if (res?.respostas.decisao_grupo && res.resultado.remover_pendencia) return true;
  return false;
}

function impactoLinha(item: ItemTriagemResolutiva): number {
  const prev = item.contexto.divergencia.valor_previsto ?? 0;
  const desc = item.contexto.divergencia.valor_descontado ?? 0;
  return Math.abs(prev - desc);
}

type GrupoBruto = {
  chave: string;
  itens: ItemTriagemResolutiva[];
};

function fingerprintGrupo(item: ItemTriagemResolutiva): string {
  const comp = item.pendencia.competencia ?? "_sem_comp";
  const banco = normalizarBancoCluster(item.pendencia.instituicao_oficial);
  const tipo = tipoContextoDeItem(item);
  const origem = origemPrincipalDeItem(item);
  const justificativa = normalizarJustificativa(
    item.pendencia.motivo_quebra_desconto ??
      item.motor.explicacao ??
      item.pendencia.descricao ??
      "",
  );
  const decisao = decisaoAutomaticaChave(item);
  return [banco, tipo, comp, origem, justificativa, decisao].join("||");
}

function scoreContexto(itens: ItemTriagemResolutiva[]): number {
  const mediaConf =
    itens.reduce((s, i) => s + (i.motor.confianca ?? 0), 0) / Math.max(1, itens.length);
  let score = Math.round(mediaConf * 100);
  if (itens.every((i) => itemResolvidoAutomaticamente(i))) score += 5;
  if (itens.length >= 3) score += Math.min(10, itens.length * 2);
  return Math.min(98, score);
}

function competenciaRotulo(comp: string): string {
  const m = comp.match(/^(\d{4})-(\d{2})/);
  if (!m) return comp;
  const meses = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];
  const mi = Number(m[2]) - 1;
  return `${meses[mi] ?? m[2]}/${m[1]}`;
}

export function tituloContextoResolutivo(ctx: ContextoResolutivoTriagem): string {
  const comp =
    ctx.competencias.length === 1
      ? competenciaRotulo(ctx.competencias[0]!)
      : ctx.competencias.length > 1
        ? `${competenciaRotulo(ctx.competencias[0]!)} … ${competenciaRotulo(ctx.competencias[ctx.competencias.length - 1]!)}`
        : "—";
  return `${ctx.banco ?? "Banco não informado"} — ${comp}`;
}

export function justificativaExibicao(ctx: ContextoResolutivoTriagem): string {
  const tipo = rotuloTipoContexto(ctx.tipo_contexto).toLowerCase();
  const origem = rotuloOrigemContexto(ctx.origem_principal);
  if (ctx.origem_principal === "consigfacil") {
    return `${tipo} no ConsigFácil`;
  }
  return `${tipo} · ${origem}`;
}

/**
 * Agrupa itens resolvidos automaticamente (e elegíveis) em contextos visuais únicos.
 */
export function consolidarContextosResolutivos(
  itens: ItemTriagemResolutiva[],
  opts?: { incluirNaoAutomaticos?: boolean },
): ResultadoConsolidacaoContextual {
  const candidatos = itens.filter((item) => {
    if (opts?.incluirNaoAutomaticos) return item.motor.resolvido;
    return itemResolvidoAutomaticamente(item);
  });

  const porChave = new Map<string, ItemTriagemResolutiva[]>();
  for (const item of candidatos) {
    const k = fingerprintGrupo(item);
    const lista = porChave.get(k) ?? [];
    lista.push(item);
    porChave.set(k, lista);
  }

  const contextos: ContextoResolutivoTriagem[] = [];
  const contextoPorLinhaId = new Map<string, ContextoResolutivoTriagem>();
  const idsOcultosFila = new Set<string>();

  for (const [chave, grupoItens] of porChave) {
    if (grupoItens.length < MIN_OCORRENCIAS) continue;

    const score = scoreContexto(grupoItens);
    if (score < SCORE_MIN_CONSOLIDAR) continue;

    const primeiro = grupoItens[0]!;
    const comps = [...new Set(grupoItens.map((i) => i.pendencia.competencia ?? "").filter(Boolean))].sort();
    const contratos = [
      ...new Set(
        grupoItens.map((i) => i.pendencia.id_consignacao ?? i.contexto.divergencia.contrato ?? "").filter(Boolean),
      ),
    ];

    const impacto = grupoItens.reduce((s, i) => s + impactoLinha(i), 0);
    const justificativa =
      primeiro.pendencia.motivo_quebra_desconto ??
      primeiro.motor.explicacao.slice(0, 200) ??
      primeiro.pendencia.descricao ??
      "Resolução automática pelo motor";

    const ctx: ContextoResolutivoTriagem = {
      contexto_id: `ctx_${chave.slice(0, 36)}_${grupoItens.length}`,
      banco: primeiro.pendencia.instituicao_oficial,
      tipo_contexto: tipoContextoDeItem(primeiro),
      competencias: comps,
      quantidade_ocorrencias: grupoItens.length,
      contratos,
      linhas_relacionadas: grupoItens.map((i) => i.pendencia.id),
      resolvido_automaticamente: grupoItens.every((i) => itemResolvidoAutomaticamente(i)),
      origem_principal: origemPrincipalDeItem(primeiro),
      justificativa_principal: justificativa,
      impacto_financeiro_total: Math.round(impacto * 100) / 100,
      score_confianca: score,
      pode_ocultar_linhas_individuais: score >= SCORE_MIN_CONSOLIDAR && grupoItens.length >= MIN_OCORRENCIAS,
      classificacao_motor: primeiro.motor.classificacao,
    };

    contextos.push(ctx);
    if (ctx.pode_ocultar_linhas_individuais) {
      for (const id of ctx.linhas_relacionadas) {
        idsOcultosFila.add(id);
        contextoPorLinhaId.set(id, ctx);
      }
    }
  }

  contextos.sort((a, b) => {
    if (b.quantidade_ocorrencias !== a.quantidade_ocorrencias) {
      return b.quantidade_ocorrencias - a.quantidade_ocorrencias;
    }
    if (b.score_confianca !== a.score_confianca) {
      return b.score_confianca - a.score_confianca;
    }
    return b.impacto_financeiro_total - a.impacto_financeiro_total;
  });

  const linhasConsolidadas = contextos.reduce((s, c) => s + c.quantidade_ocorrencias, 0);
  const totalAuto = candidatos.length;
  const metricas: MetricasConsolidacaoContextual = {
    linhas_consolidadas: linhasConsolidadas,
    reducao_cognitiva_pct:
      totalAuto > 0 ? Math.round((1 - contextos.length / totalAuto) * 100) : 0,
    resolucoes_automaticas_agrupadas: contextos.length,
    percentual_ruido_removido:
      totalAuto > 0 ? Math.round((linhasConsolidadas / totalAuto) * 100) : 0,
    contextos_exibidos: contextos.length,
    linhas_na_fila_principal: 0,
  };

  return { contextos, metricas, idsOcultosFila, contextoPorLinhaId };
}

/** Itens que exigem atenção humana ou são exceção (fila principal). */
export function itemExigeFilaPrincipal(item: ItemTriagemResolutiva): boolean {
  if (!item.motor.resolvido && !item.resolucao_usuario?.resultado.remover_pendencia) {
    return true;
  }
  if (item.motor.nivel_risco === "alto" || item.motor.nivel_risco === "critico") {
    return true;
  }
  if (
    item.motor.classificacao === "revisar_manual" ||
    item.motor.classificacao === "pendente_usuario" ||
    item.motor.classificacao === "risco_refin_induzido"
  ) {
    return true;
  }
  if (item.motor.resolvido && !item.motor.remover_conferencia) {
    return true;
  }
  if (item.motor.origem === "pergunta_usuario") {
    return true;
  }
  return false;
}

export function filtrarItensFilaPrincipal(
  itens: ItemTriagemResolutiva[],
  consolidacao: ResultadoConsolidacaoContextual,
  opts: {
    visualizacaoConsolidada: boolean;
    idsEmCluster?: Set<string>;
  },
): ItemTriagemResolutiva[] {
  let fila = itens;

  if (opts.idsEmCluster?.size) {
    fila = fila.filter((i) => !opts.idsEmCluster!.has(i.pendencia.id));
  }

  if (opts.visualizacaoConsolidada) {
    fila = fila.filter((i) => {
      if (consolidacao.idsOcultosFila.has(i.pendencia.id)) {
        return itemExigeFilaPrincipal(i);
      }
      return itemExigeFilaPrincipal(i) || !itemResolvidoAutomaticamente(i);
    });
  }

  consolidacao.metricas.linhas_na_fila_principal = fila.length;
  return fila;
}
