/**
 * Fila de trabalho da triagem segmentada por público (perfil de uso).
 */

import type { AlertaIntegracao } from "@/lib/auditoria/auditoria-integracao-fontes";
import type { RiscoRefinForcado } from "@/lib/juridico/detectar-risco-refin-forcado";
import type { GrupoDivergenciaLogica } from "@/lib/triagem/agrupar-divergencias-logicas";
import type {
  ItemTriagemPriorizado,
  NivelPrioridadeTriagem,
} from "@/lib/triagem/calcular-prioridade-risco-triagem";
import type { NaturezaEstruturalPendencia } from "@/lib/triagem/classificar-natureza-estrutural-pendencia";
import { itemResolvidoAutomaticamente } from "@/lib/triagem/consolidar-contextos-resolutivos";
import { pendenciaOcultaPorTriagem } from "@/lib/triagem/aplicar-respostas-triagem";
import type { ContextoResolutivoExportacao } from "@/lib/triagem/rastreabilidade-triagem-consolidada";

export type PerfilTrabalhoTriagem =
  | "usuario_comum"
  | "ia"
  | "orientador"
  | "juridico"
  | "contabil"
  | "pericial";

export type ItemFilaTrabalhoTriagem = {
  id: string;
  perfil: PerfilTrabalhoTriagem;
  prioridade: NivelPrioridadeTriagem;
  titulo: string;
  descricao: string;
  acao_recomendada: string;
  origem_item: string;
  risco_juridico: boolean;
  risco_financeiro: boolean;
  requer_documento: boolean;
  requer_especialista: boolean;
  entidade_tipo: string;
  entidade_id: string;
};

export const ROTULO_PERFIL_TRABALHO: Record<PerfilTrabalhoTriagem, string> = {
  usuario_comum: "Para você",
  ia: "IA",
  orientador: "Orientador",
  juridico: "Jurídico",
  contabil: "Contábil",
  pericial: "Pericial",
};

const ORDEM_PRIORIDADE: Record<NivelPrioridadeTriagem, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baixa: 3,
  informativa: 4,
};

const LOG_FILA_PERFIL = "[FILA_PERFIL]";

const NATUREZAS_EXCLUIDAS_FILA: NaturezaEstruturalPendencia[] = [
  "historico_financeiro",
  "monitoramento_historico",
  "consolidado_contextual",
  "ruido_ocr",
];

export type EntradaFilaTrabalhoPerfil = {
  /** Fila principal pós-saneamento (mesma base dos KPIs). Preferir sobre itensPriorizados. */
  filaPrincipal?: ItemTriagemPriorizado[];
  /** @deprecated Use filaPrincipal (ex.: priorizacao.fila_principal). */
  itensPriorizados?: ItemTriagemPriorizado[];
  gruposCluster?: GrupoDivergenciaLogica[];
  contextos?: ContextoResolutivoExportacao[];
  alertasIntegracao?: AlertaIntegracao[];
  riscosRefin?: RiscoRefinForcado[];
  /** Inclui clusters/contextos/alertas extras (padrão: false — alinhado ao saneamento). */
  incluirFontesAuxiliares?: boolean;
};

export type MetricasFilaTrabalhoPerfil = {
  total_original: number;
  total_filtrado: number;
  total_humano_final: number;
};

export type ResultadoFilaTrabalhoPerfil = {
  filas: Record<PerfilTrabalhoTriagem, ItemFilaTrabalhoTriagem[]>;
  todos: ItemFilaTrabalhoTriagem[];
  acao_humana_por_perfil: Record<PerfilTrabalhoTriagem, number>;
  metricas: MetricasFilaTrabalhoPerfil;
  filaPrincipalFinal: ItemTriagemPriorizado[];
};

function compararPrioridade(a: ItemFilaTrabalhoTriagem, b: ItemFilaTrabalhoTriagem): number {
  return ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade];
}

function linguagemSimples(texto: string): string {
  return texto
    .replace(/ConsigFácil/gi, "portal oficial de consignação")
    .replace(/consigfacil/gi, "portal oficial")
    .replace(/OCR/gi, "leitura automática do documento")
    .replace(/divergencia_consigfacil_campo/gi, "diferença no cadastro")
    .replace(/refinanciamento induzido/gi, "possível troca de contrato")
    .replace(/desconto fracionado/gi, "desconto menor por limite de margem")
    .replace(/margem insuficiente/gi, "limite de consignação")
    .slice(0, 280);
}

/**
 * Mesmo critério da fila principal pós-saneamento (KPIs da triagem resolutiva).
 */
export function itemElegivelFilaTrabalhoPerfil(item: ItemTriagemPriorizado): boolean {
  const nat = item.natureza;
  if (!nat?.em_fila_principal) return false;
  if (nat.em_monitoramento_historico) return false;
  if (NATUREZAS_EXCLUIDAS_FILA.includes(nat.natureza_estrutural)) return false;
  if (
    nat.badge_visual === "ocr_invalido" ||
    nat.badge_visual === "historico" ||
    nat.badge_visual === "inferencia_historica"
  ) {
    return false;
  }
  if (nat.natureza_estrutural === "operacional" && nat.fecha_automaticamente) return false;
  if (pendenciaOcultaPorTriagem(item.pendencia.id)) return false;
  if (itemResolvidoAutomaticamente(item)) return false;
  if (item.motor.resolvido && item.motor.remover_conferencia) return false;
  if (
    item.motor.resolvido &&
    item.motor.origem === "automatica_motor" &&
    (nat.fecha_automaticamente || nat.natureza_estrutural === "consolidado_contextual")
  ) {
    return false;
  }
  return true;
}

export function filtrarFilaPrincipalFinal(
  itens: ItemTriagemPriorizado[],
): ItemTriagemPriorizado[] {
  return itens.filter(itemElegivelFilaTrabalhoPerfil);
}

function exigeAcaoHumana(item: ItemTriagemPriorizado): boolean {
  if (!itemElegivelFilaTrabalhoPerfil(item)) return false;

  const pr = item.prioridade_risco;
  if (pr.prioridade === "informativa") return false;

  if (
    pr.recomendacao === "acao_imediata" ||
    pr.recomendacao === "revisao_humana"
  ) {
    return true;
  }

  if (
    item.motor.classificacao === "pendente_usuario" ||
    item.motor.classificacao === "revisar_manual"
  ) {
    return true;
  }

  if (!item.motor.resolvido) return true;

  if (
    itemResolvidoAutomaticamente(item) &&
    (pr.recomendacao === "apenas_monitoramento" || pr.recomendacao === "resolucao_automatica")
  ) {
    return false;
  }

  return item.motor.perguntas_pendentes.length > 0;
}

function acaoUsuarioComum(item: ItemTriagemPriorizado): string {
  const tipo = item.pendencia.tipo;
  if (tipo === "sem_evidencia") return "Anexar o contrato ou comprovante do empréstimo.";
  if (tipo === "divergencia_valor") return "Conferir se o valor descontado na folha está correto.";
  if (tipo === "match_baixo") return "Confirmar se você reconhece este contrato/desconto.";
  if (tipo === "cartao_rmc_rcc_sem_confirmacao") {
    return "Confirmar se o cartão consignado (RMC/RCC) é seu.";
  }
  if (tipo === "contrato_sem_desconto" || tipo === "desconto_sem_contrato") {
    return "Verificar se o empréstimo/desconto deveria aparecer na folha.";
  }
  return "Revisar o aviso; ignorar se já souber do que se trata.";
}

function itemBaseDePendencia(
  item: ItemTriagemPriorizado,
  perfil: PerfilTrabalhoTriagem,
  opts: {
    titulo?: string;
    descricao?: string;
    acao?: string;
    origem?: string;
    forcarHumano?: boolean;
  },
): ItemFilaTrabalhoTriagem | null {
  const pr = item.prioridade_risco;
  const f = pr.fatores;
  const humano = opts.forcarHumano ?? exigeAcaoHumana(item);

  if (perfil === "usuario_comum" && !humano) return null;
  if (perfil === "ia" && humano && !item.motor.perguntas_pendentes.length && !item.aprendizado_aplicado) {
    return null;
  }

  const tituloPadrao = `${item.pendencia.instituicao_oficial ?? "Banco"} · ${item.pendencia.competencia ?? "Competência"}`;

  return {
    id: `ft_${perfil}_${item.pendencia.id}`,
    perfil,
    prioridade: pr.prioridade,
    titulo: opts.titulo ?? tituloPadrao,
    descricao:
      perfil === "usuario_comum"
        ? linguagemSimples(opts.descricao ?? pr.motivo_principal)
        : (opts.descricao ?? pr.motivo_principal).slice(0, 400),
    acao_recomendada: opts.acao ?? acaoUsuarioComum(item),
    origem_item: opts.origem ?? "pendencia_triagem",
    risco_juridico: Boolean(f.risco_juridico || f.refinanciamento_forcado || f.possivel_fraude),
    risco_financeiro: Boolean(f.risco_financeiro || f.margem_excedida),
    requer_documento: item.pendencia.tipo === "sem_evidencia",
    requer_especialista: Boolean(
      pr.prioridade === "critica" && (f.risco_juridico || f.possivel_fraude),
    ),
    entidade_tipo: "pendencia_triagem",
    entidade_id: item.pendencia.id,
  };
}

function perfisParaItem(item: ItemTriagemPriorizado): PerfilTrabalhoTriagem[] {
  if (!itemElegivelFilaTrabalhoPerfil(item)) return [];

  const perfis: PerfilTrabalhoTriagem[] = [];
  const p = item.pendencia;
  const pr = item.prioridade_risco;
  const f = pr.fatores;
  const humano = exigeAcaoHumana(item);
  const nat = item.natureza;

  if (humano) perfis.push("usuario_comum");

  const candidatoIa =
    item.aprendizado_aplicado ||
    item.motor.perguntas_pendentes.length > 0 ||
    (item.motor.resolvido && item.motor.origem === "automatica_motor") ||
    item.motor.origem === "aprendizado";
  if (candidatoIa) perfis.push("ia");

  const candidatoOrientador =
    f.risco_financeiro ||
    f.margem_excedida ||
    f.desconto_nao_processado ||
    item.motor.classificacao === "desconto_fracionado" ||
    item.motor.classificacao === "quebra_temporaria" ||
    item.motor.classificacao === "margem_insuficiente" ||
    p.tipo === "margem_incompativel" ||
    item.contexto.margem_ultrapassada;
  if (candidatoOrientador) perfis.push("orientador");

  const candidatoJuridico =
    nat?.natureza_estrutural === "juridico" ||
    nat?.natureza_estrutural === "refin_real" ||
    (nat?.contabiliza_refin !== false &&
      (f.risco_juridico ||
        f.refinanciamento_forcado ||
        f.possivel_fraude ||
        item.motor.classificacao === "risco_refin_induzido" ||
        item.motor.classificacao === "refinanciamento_real")) ||
    p.tipo === "cartao_rmc_rcc_sem_confirmacao" ||
    /seguro|venda casada|rmc|rcc|apólice|apolice/i.test(p.descricao ?? "");
  if (candidatoJuridico) perfis.push("juridico");

  const candidatoContabil =
    p.tipo === "divergencia_consigfacil_campo" ||
    p.tipo === "tolerancia_excedida" ||
    p.tipo === "divergencia_valor" ||
    /duplicidade|extrato|receita|desconto|folha|power bi|exporta/i.test(p.descricao ?? "") ||
    /duplicidade|extrato|concilia/i.test(pr.motivo_principal);
  if (candidatoContabil) perfis.push("contabil");

  if (
    nat?.natureza_estrutural === "estrutural_oficial" ||
    nat?.natureza_estrutural === "refin_real" ||
    nat?.natureza_estrutural === "juridico" ||
    pr.prioridade === "critica" ||
    pr.prioridade === "alta"
  ) {
    perfis.push("pericial");
  }

  return [...new Set(perfis)];
}

function itemDeCluster(grupo: GrupoDivergenciaLogica, perfil: PerfilTrabalhoTriagem): ItemFilaTrabalhoTriagem | null {
  if (perfil !== "ia" && perfil !== "pericial") return null;

  const prioridade: NivelPrioridadeTriagem =
    grupo.score_confianca_cluster >= 85 ? "baixa" : "media";

  return {
    id: `ft_${perfil}_cluster_${grupo.grupo_id}`,
    perfil,
    prioridade,
    titulo: `${grupo.banco ?? "Banco"} — padrão ${grupo.rubrica ?? "repetido"} (${grupo.quantidade_ocorrencias}×)`,
    descricao: `Agrupamento lógico: ${grupo.quantidade_ocorrencias} linhas com o mesmo desvio.`,
    acao_recomendada:
      perfil === "ia"
        ? "Aplicar resolução em lote ou regra aprendida para o padrão."
        : "Auditar cluster, decisão aplicada e linhas vinculadas.",
    origem_item: "cluster_logico",
    risco_juridico: false,
    risco_financeiro: true,
    requer_documento: false,
    requer_especialista: perfil === "pericial",
    entidade_tipo: "cluster_logico",
    entidade_id: grupo.grupo_id,
  };
}

function itemDeContexto(
  ctx: ContextoResolutivoExportacao,
  perfil: PerfilTrabalhoTriagem,
): ItemFilaTrabalhoTriagem | null {
  if (perfil !== "ia" && perfil !== "pericial") return null;

  return {
    id: `ft_${perfil}_ctx_${ctx.contexto_id}`,
    perfil,
    prioridade: ctx.score_confianca >= 85 ? "informativa" : "media",
    titulo: `${ctx.banco ?? "Banco"} — ${ctx.quantidade_ocorrencias} ocorrências automáticas`,
    descricao: ctx.justificativa_principal,
    acao_recomendada:
      perfil === "ia"
        ? "Manter consolidado; revisar exceções se score baixar."
        : "Verificar auditoria, origem e impacto financeiro do contexto.",
    origem_item: "contexto_resolutivo",
    risco_juridico: ctx.tipo_contexto === "risco_refin",
    risco_financeiro: ctx.impacto_financeiro_total > 0,
    requer_documento: false,
    requer_especialista: perfil === "pericial",
    entidade_tipo: "contexto_resolutivo",
    entidade_id: ctx.contexto_id,
  };
}

function itemDeRiscoRefin(r: RiscoRefinForcado): ItemFilaTrabalhoTriagem {
  const prioridade: NivelPrioridadeTriagem =
    r.nivel === "critico" ? "critica" : r.nivel === "alto" ? "alta" : "media";

  return {
    id: `ft_juridico_refin_${r.banco}_${r.contrato_destino ?? "x"}`,
    perfil: "juridico",
    prioridade,
    titulo: `Risco de refinanciamento — ${r.banco}`,
    descricao: r.sequencia_texto,
    acao_recomendada: "Avaliar tese jurídica, vincular jurisprudência e decisões aplicáveis.",
    origem_item: "risco_refin_forcado",
    risco_juridico: true,
    risco_financeiro: true,
    requer_documento: true,
    requer_especialista: true,
    entidade_tipo: "risco_refin",
    entidade_id: r.contrato_destino ?? r.contrato_origem ?? r.banco,
  };
}

function itemDeAlerta(a: AlertaIntegracao, perfil: PerfilTrabalhoTriagem): ItemFilaTrabalhoTriagem | null {
  if (perfil === "contabil" && /duplicidade|extrato|exporta|dados|fonte/i.test(a.titulo + a.descricao)) {
    return {
      id: `ft_contabil_alerta_${a.id}`,
      perfil: "contabil",
      prioridade: a.severidade === "critico" ? "alta" : "media",
      titulo: a.titulo,
      descricao: a.descricao,
      acao_recomendada: a.acao ?? "Corrigir base e reexportar para análise contábil.",
      origem_item: "alerta_integracao",
      risco_juridico: false,
      risco_financeiro: true,
      requer_documento: false,
      requer_especialista: false,
      entidade_tipo: "alerta",
      entidade_id: a.id,
    };
  }
  if (perfil === "pericial") {
    return {
      id: `ft_pericial_alerta_${a.id}`,
      perfil: "pericial",
      prioridade: a.severidade === "critico" ? "critica" : "media",
      titulo: a.titulo,
      descricao: a.descricao,
      acao_recomendada: a.acao ?? "Registrar na cadeia de evidências.",
      origem_item: "alerta_integracao",
      risco_juridico: /jurid|refin|fraude/i.test(a.descricao),
      risco_financeiro: true,
      requer_documento: false,
      requer_especialista: true,
      entidade_tipo: "alerta",
      entidade_id: a.id,
    };
  }
  return null;
}

function itemPericialDePendencia(item: ItemTriagemPriorizado): ItemFilaTrabalhoTriagem {
  const pr = item.prioridade_risco;
  return {
    id: `ft_pericial_${item.pendencia.id}`,
    perfil: "pericial",
    prioridade: pr.prioridade,
    titulo: `[${pr.prioridade.toUpperCase()}] ${item.pendencia.instituicao_oficial ?? "—"} · score ${pr.score_risco}`,
    descricao: [
      pr.motivo_principal,
      `Motor: ${item.motor.explicacao.slice(0, 120)}`,
      `Origem resolução: ${item.motor.origem}`,
      `Eventos operacionais: ${item.contexto.eventos_operacionais.length}`,
    ].join(" · "),
    acao_recomendada: "Conferir cadeia de evidências, fontes, auditoria e histórico temporal.",
    origem_item: "pendencia_triagem",
    risco_juridico: Boolean(pr.fatores.risco_juridico),
    risco_financeiro: Boolean(pr.fatores.risco_financeiro),
    requer_documento: item.pendencia.tipo === "sem_evidencia",
    requer_especialista: true,
    entidade_tipo: "pendencia_triagem",
    entidade_id: item.pendencia.id,
  };
}

function contarAcaoHumana(itens: ItemFilaTrabalhoTriagem[]): number {
  return itens.filter(
    (i) =>
      i.prioridade !== "informativa" &&
      !/monitoramento|automático|automatico|lote aprendido/i.test(i.acao_recomendada),
  ).length;
}

/**
 * Monta filas de trabalho por perfil de público.
 */
function riscoRefinElegivelFila(
  r: RiscoRefinForcado,
  filaPrincipalFinal: ItemTriagemPriorizado[],
): boolean {
  if (filaPrincipalFinal.length === 0) return false;
  const banco = (r.banco ?? "").toLowerCase();
  return filaPrincipalFinal.some((item) => {
    const ib = (item.pendencia.instituicao_oficial ?? "").toLowerCase();
    const nat = item.natureza;
    return (
      (ib && banco && ib.includes(banco)) ||
      nat?.natureza_estrutural === "refin_real" ||
      nat?.natureza_estrutural === "juridico"
    );
  });
}

export function montarFilaTrabalhoPerfil(
  entrada: EntradaFilaTrabalhoPerfil,
): ResultadoFilaTrabalhoPerfil {
  const origemLista = entrada.filaPrincipal ?? entrada.itensPriorizados ?? [];
  const total_original = origemLista.length;
  const filaPrincipalFinal = filtrarFilaPrincipalFinal(origemLista);
  const total_filtrado = filaPrincipalFinal.length;
  const incluirAux = entrada.incluirFontesAuxiliares === true;

  const filas: Record<PerfilTrabalhoTriagem, ItemFilaTrabalhoTriagem[]> = {
    usuario_comum: [],
    ia: [],
    orientador: [],
    juridico: [],
    contabil: [],
    pericial: [],
  };

  const idsVistos = new Set<string>();

  const push = (item: ItemFilaTrabalhoTriagem | null) => {
    if (!item || idsVistos.has(item.id)) return;
    idsVistos.add(item.id);
    filas[item.perfil].push(item);
  };

  for (const item of filaPrincipalFinal) {
    const perfis = perfisParaItem(item);

    for (const perfil of perfis) {
      if (perfil === "pericial") {
        push(itemPericialDePendencia(item));
        continue;
      }

      if (perfil === "usuario_comum") {
        push(
          itemBaseDePendencia(item, "usuario_comum", {
            titulo: linguagemSimples(
              `${item.pendencia.instituicao_oficial ?? "Desconto"} — ${item.pendencia.competencia ?? "mês"}`,
            ),
            descricao: linguagemSimples(item.pendencia.descricao ?? item.prioridade_risco.motivo_principal),
            acao: acaoUsuarioComum(item),
            forcarHumano: true,
          }),
        );
        continue;
      }

      if (perfil === "ia") {
        const acaoIa = item.motor.perguntas_pendentes.length
          ? "Responder ou refinar perguntas para automação futura."
          : item.aprendizado_aplicado
            ? "Aplicar padrão aprendido automaticamente."
            : "Processar com motor/agrupamento automático.";
        push(
          itemBaseDePendencia(item, "ia", {
            acao: acaoIa,
            origem: item.motor.origem,
          }),
        );
        continue;
      }

      if (perfil === "orientador") {
        push(
          itemBaseDePendencia(item, "orientador", {
            titulo: `Orçamento/margem — ${item.pendencia.instituicao_oficial ?? "banco"}`,
            descricao: `Impacto financeiro ~R$ ${item.impacto_financeiro.toFixed(2)}. ${item.prioridade_risco.motivo_principal}`,
            acao: "Revisar comprometimento da renda, margem e fluxo de caixa.",
          }),
        );
        continue;
      }

      if (perfil === "juridico") {
        push(
          itemBaseDePendencia(item, "juridico", {
            titulo: `Risco jurídico — ${item.pendencia.instituicao_oficial ?? "contrato"}`,
            descricao: item.prioridade_risco.motivo_principal,
            acao: "Analisar dano potencial, documentos e jurisprudência aplicável.",
          }),
        );
        continue;
      }

      if (perfil === "contabil") {
        push(
          itemBaseDePendencia(item, "contabil", {
            titulo: `Conferência contábil — ${item.pendencia.tipo.replace(/_/g, " ")}`,
            descricao: item.pendencia.descricao ?? item.prioridade_risco.motivo_principal,
            acao: "Conciliar folha, extrato e base exportada (Power BI / Excel).",
          }),
        );
      }
    }
  }

  if (incluirAux && total_filtrado > 0) {
    for (const g of entrada.gruposCluster ?? []) {
      push(itemDeCluster(g, "ia"));
      push(itemDeCluster(g, "pericial"));
    }

    for (const ctx of entrada.contextos ?? []) {
      push(itemDeContexto(ctx, "ia"));
      push(itemDeContexto(ctx, "pericial"));
    }

    for (const a of entrada.alertasIntegracao ?? []) {
      push(itemDeAlerta(a, "contabil"));
      push(itemDeAlerta(a, "pericial"));
    }
  }

  for (const r of entrada.riscosRefin ?? []) {
    if (!riscoRefinElegivelFila(r, filaPrincipalFinal)) continue;
    push(itemDeRiscoRefin(r));
    const pericialDup = itemDeRiscoRefin(r);
    pericialDup.id = `ft_pericial_${pericialDup.id}`;
    pericialDup.perfil = "pericial";
    push(pericialDup);
  }

  for (const k of Object.keys(filas) as PerfilTrabalhoTriagem[]) {
    filas[k].sort(compararPrioridade);
  }

  const todos = (Object.keys(filas) as PerfilTrabalhoTriagem[]).flatMap((p) => filas[p]);

  const acao_humana_por_perfil = {} as Record<PerfilTrabalhoTriagem, number>;
  for (const p of Object.keys(filas) as PerfilTrabalhoTriagem[]) {
    acao_humana_por_perfil[p] = contarAcaoHumana(filas[p]);
  }

  /** Alinhado ao KPI `fila_humana_estimada` (= itens em fila_principal pós-saneamento). */
  const total_humano_final = total_filtrado;

  console.log(LOG_FILA_PERFIL, {
    total_original,
    total_filtrado,
    total_humano_final,
    usuario_comum: acao_humana_por_perfil.usuario_comum,
    incluir_aux: incluirAux,
  });

  return {
    filas,
    todos,
    acao_humana_por_perfil,
    metricas: {
      total_original,
      total_filtrado,
      total_humano_final,
    },
    filaPrincipalFinal,
  };
}

export function linhasExportacaoFilaTrabalho(
  resultado: ResultadoFilaTrabalhoPerfil,
): Array<Record<string, string | boolean>> {
  return resultado.todos.map((i) => ({
    perfil: i.perfil,
    prioridade: i.prioridade,
    titulo: i.titulo,
    descricao: i.descricao,
    acao_recomendada: i.acao_recomendada,
    risco_juridico: i.risco_juridico,
    risco_financeiro: i.risco_financeiro,
    requer_documento: i.requer_documento,
    requer_especialista: i.requer_especialista,
    entidade_tipo: i.entidade_tipo,
    entidade_id: i.entidade_id,
  }));
}
