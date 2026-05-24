/**
 * Classificação estrutural obrigatória de cada pendência na triagem resolutiva.
 * Separa histórico financeiro de fila estrutural oficial.
 */

import type { LinhaMatchContratoCompleta } from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import type { EntidadeComEstrutura } from "@/lib/contratos/classificar-estrutura-contrato";
import { MENSAGEM_HISTORICO_SEM_ESTRUTURA } from "@/lib/contratos/classificar-estrutura-contrato";
import {
  autoridadePermiteJuizoEstrutural,
  classificarAutoridadeTemporalConsigfacil,
  entradaTemporalDeContrato,
} from "@/lib/consigfacil/autoridade-temporal-consigfacil";
import type { ItemTriagemResolutiva } from "@/lib/triagem/triagem-resolutiva-tipos";

export type NaturezaEstruturalPendencia =
  | "historico_financeiro"
  | "estrutural_oficial"
  | "operacional"
  | "juridico"
  | "refin_real"
  | "monitoramento_historico"
  | "ruido_ocr"
  | "consolidado_contextual";

export type BadgeNaturezaTriagem =
  | "historico"
  | "estrutural_oficial"
  | "ocr_invalido"
  | "consigfacil_oficial"
  | "inferencia_historica"
  | "operacional"
  | "juridico"
  | "refin";

export type ResultadoNaturezaEstruturalPendencia = {
  natureza_estrutural: NaturezaEstruturalPendencia;
  badge_visual: BadgeNaturezaTriagem;
  em_fila_principal: boolean;
  em_monitoramento_historico: boolean;
  score_match: number | null;
  tipo_estrutura: "historico" | "estrutural";
  fonte_estrutura: string;
  motivo_natureza: string;
  fecha_automaticamente: boolean;
  contabiliza_risco_financeiro: boolean;
  contabiliza_refin: boolean;
  contabiliza_divergencia_estrutural: boolean;
};

export type LinhaMonitoramentoHistoricoTriagem = {
  pendencia_id: string;
  banco: string;
  periodo: string;
  meses_detectados: number;
  valor_medio: number;
  origem: string;
  natureza_estrutural: NaturezaEstruturalPendencia;
};

const FONTES_HISTORICO = new Set([
  "ficha_financeira",
  "inferencia_historica",
  "ocr_legado",
  "extrato_bancario",
]);

const NATUREZAS_AUTO_FECHAR: NaturezaEstruturalPendencia[] = [
  "historico_financeiro",
  "monitoramento_historico",
  "ruido_ocr",
  "consolidado_contextual",
];

function deveRebaixarMonitoramentoHistorico(
  natureza: NaturezaEstruturalPendencia,
  opts: { ocrInvalido: boolean; scoreMatch: number | null; tipoEstrutura: "historico" | "estrutural" },
): boolean {
  if (opts.ocrInvalido) return true;
  if (natureza === "monitoramento_historico") return true;
  if (opts.scoreMatch != null && opts.scoreMatch < 70 && opts.tipoEstrutura === "historico") {
    return true;
  }
  return false;
}

const CLASSIFICACOES_OPERACIONAIS = new Set([
  "suspensao_operacional",
  "bloqueio_governo",
  "desconto_fracionado",
  "quebra_temporaria",
  "margem_insuficiente",
  "desconto_recuperado",
  "divergencia_operacional",
]);

function scoreMatchParaItem(
  item: ItemTriagemResolutiva,
  matches: LinhaMatchContratoCompleta[],
): number | null {
  const id = item.contexto.divergencia.id_consignacao;
  if (!id) return null;
  const m = matches.find((x) => x.id_consignacao === id);
  return m?.score ?? null;
}

function inferirFonteEstrutura(
  item: ItemTriagemResolutiva,
  cf: (ConsigfacilContrato & Partial<EntidadeComEstrutura>) | null,
): { tipo: "historico" | "estrutural"; fonte: string } {
  if (cf?.fonte_estrutura_contrato) {
    return {
      tipo: cf.tipo_estrutura ?? "estrutural",
      fonte: cf.fonte_estrutura_contrato,
    };
  }
  const desc = (item.pendencia.descricao ?? "").toLowerCase();
  if (/ficha|histórico|historico/.test(desc)) {
    return { tipo: "historico", fonte: "ficha_financeira" };
  }
  if (/parcela atual diverge|total de parcelas|120\/1|ocr/.test(desc)) {
    return { tipo: "estrutural", fonte: "ocr_legado" };
  }
  if (item.pendencia.tipo === "match_baixo") {
    return { tipo: "historico", fonte: "inferencia_historica" };
  }
  return { tipo: "historico", fonte: "inferencia_historica" };
}

function resolverBadge(
  natureza: NaturezaEstruturalPendencia,
  fonte: string,
  ocrInvalido?: boolean,
): BadgeNaturezaTriagem {
  if (ocrInvalido || natureza === "ruido_ocr") return "ocr_invalido";
  if (fonte === "consigfacil") return "consigfacil_oficial";
  if (fonte === "inferencia_historica") {
    return "inferencia_historica";
  }
  if (natureza === "monitoramento_historico" || natureza === "historico_financeiro") {
    return "historico";
  }
  if (natureza === "refin_real") return "refin";
  if (natureza === "juridico") return "juridico";
  if (natureza === "operacional") return "operacional";
  return "estrutural_oficial";
}

/**
 * Classificação obrigatória da natureza estrutural de uma pendência de triagem.
 */
export function classificarNaturezaEstruturalPendencia(input: {
  item: ItemTriagemResolutiva;
  score_match?: number | null;
  em_cluster?: boolean;
  em_contexto_consolidado?: boolean;
}): ResultadoNaturezaEstruturalPendencia {
  const { item } = input;
  const cf = item.contexto.consigfacil as (ConsigfacilContrato & Partial<EntidadeComEstrutura>) | null;
  const { tipo: tipoEstrutura, fonte } = inferirFonteEstrutura(item, cf);
  const scoreMatch = input.score_match ?? null;
  const motor = item.motor;
  const desc = (item.pendencia.descricao ?? "").toLowerCase();

  const temporal = classificarAutoridadeTemporalConsigfacil(
    cf
      ? entradaTemporalDeContrato(cf, item.pendencia.competencia, {
          bancoConsigfacil: cf.instituicao,
        })
      : {
          competencia: item.pendencia.competencia,
          existeCorrelacaoConsigfacil: Boolean(item.contexto.divergencia.id_consignacao),
          contratoEmAndamento: false,
        },
  );
  const juizoTemporalOficial = autoridadePermiteJuizoEstrutural(
    temporal.autoridade_temporal,
  );

  const ocrInvalido =
    !!(cf as { parcela_ocr_invalida?: boolean })?.parcela_ocr_invalida ||
    /ocr inválido|ocr invalido|estrutura incoerente/.test(desc);

  let natureza: NaturezaEstruturalPendencia;

  if (ocrInvalido) {
    natureza = "monitoramento_historico";
  } else if (
    tipoEstrutura === "historico" ||
    FONTES_HISTORICO.has(fonte) ||
    (scoreMatch != null && scoreMatch < 70)
  ) {
    natureza = "monitoramento_historico";
  } else if (input.em_cluster || input.em_contexto_consolidado) {
    natureza = "consolidado_contextual";
  } else if (
    !juizoTemporalOficial ||
    temporal.contrato_migrado_para_consigfacil
  ) {
    natureza = "monitoramento_historico";
  } else if (motor.classificacao === "refinanciamento_real" && tipoEstrutura === "estrutural") {
    natureza = "refin_real";
  } else if (
    motor.classificacao === "risco_refin_induzido" ||
    item.contexto.riscos_refin.some((r) => r.nivel === "alto" || r.nivel === "critico")
  ) {
    natureza = "juridico";
  } else if (CLASSIFICACOES_OPERACIONAIS.has(motor.classificacao)) {
    natureza = "operacional";
  } else if (tipoEstrutura === "estrutural") {
    natureza = "estrutural_oficial";
  } else {
    natureza = "monitoramento_historico";
  }

  if (
    deveRebaixarMonitoramentoHistorico(natureza, { ocrInvalido, scoreMatch, tipoEstrutura }) &&
    natureza !== "refin_real" &&
    natureza !== "juridico" &&
    natureza !== "estrutural_oficial"
  ) {
    natureza = "monitoramento_historico";
  }

  const ehHistorico = natureza === "monitoramento_historico";
  const ehRuidoOcr = ocrInvalido;
  const ehConsolidado = natureza === "consolidado_contextual";

  const possivelFraude =
    item.pendencia.tipo === "match_baixo" &&
    tipoEstrutura === "estrutural" &&
    !ehHistorico;
  const operacionalCritico =
    natureza === "operacional" &&
    (motor.nivel_risco === "alto" ||
      motor.nivel_risco === "critico" ||
      item.contexto.eventos_operacionais.length >= 2);
  const riscoAlto =
    motor.nivel_risco === "alto" || motor.nivel_risco === "critico";

  const em_fila_principal =
    !ehHistorico &&
    !ehRuidoOcr &&
    !ehConsolidado &&
    (natureza === "estrutural_oficial" ||
      natureza === "refin_real" ||
      natureza === "juridico" ||
      operacionalCritico ||
      possivelFraude ||
      (riscoAlto && tipoEstrutura === "estrutural"));

  const em_monitoramento_historico = ehHistorico || ehRuidoOcr || ehConsolidado || !em_fila_principal;

  const motivo_natureza = (() => {
    if (!juizoTemporalOficial) {
      return temporal.mensagem_autoridade_temporal;
    }
    if (natureza === "monitoramento_historico") {
      return MENSAGEM_HISTORICO_SEM_ESTRUTURA;
    }
    if (ocrInvalido) return "OCR de parcela inválido — não gera divergência financeira.";
    if (natureza === "consolidado_contextual") {
      return "Agrupado em contexto/cluster — fora da fila estrutural principal.";
    }
    if (scoreMatch != null && scoreMatch < 70) {
      return `Match ${scoreMatch} < 70 com cadastro histórico — monitoramento.`;
    }
    return `Fonte ${fonte} · estrutura ${tipoEstrutura}.`;
  })();

  return {
    natureza_estrutural: natureza,
    badge_visual: resolverBadge(natureza, fonte, ocrInvalido),
    em_fila_principal,
    em_monitoramento_historico,
    score_match: scoreMatch,
    tipo_estrutura: tipoEstrutura,
    fonte_estrutura: fonte,
    motivo_natureza,
    fecha_automaticamente:
      NATUREZAS_AUTO_FECHAR.includes(natureza) ||
      (natureza === "operacional" && !operacionalCritico),
    contabiliza_risco_financeiro:
      em_fila_principal && !ehHistorico && juizoTemporalOficial,
    contabiliza_refin:
      natureza === "refin_real" &&
      tipoEstrutura === "estrutural" &&
      juizoTemporalOficial,
    contabiliza_divergencia_estrutural:
      em_fila_principal &&
      tipoEstrutura === "estrutural" &&
      !ocrInvalido &&
      juizoTemporalOficial,
  };
}

export function montarLinhaMonitoramentoHistorico(
  item: ItemTriagemResolutiva,
  meta: ResultadoNaturezaEstruturalPendencia,
): LinhaMonitoramentoHistoricoTriagem {
  const h = item.contexto.historico_contrato;
  const comps = h.competencias.filter((c) => /^\d{4}-\d{2}$/.test(c));
  const vals = h.valores_descontados.filter((v) => v > 0);
  const meses = comps.length;
  const valor_medio =
    vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  const periodo =
    comps.length >= 2
      ? `${comps[0]} → ${comps[comps.length - 1]}`
      : comps[0] ?? item.pendencia.competencia ?? "—";

  return {
    pendencia_id: item.pendencia.id,
    banco: item.pendencia.instituicao_oficial ?? item.contexto.divergencia.banco ?? "—",
    periodo,
    meses_detectados: meses,
    valor_medio: Math.round(valor_medio * 100) / 100,
    origem: meta.fonte_estrutura,
    natureza_estrutural: meta.natureza_estrutural,
  };
}

export type ItemTriagemComNaturezaEstrutural = ItemTriagemResolutiva & {
  natureza: ResultadoNaturezaEstruturalPendencia;
};

export type MetricasSaneamentoTriagemResolutiva = {
  total: number;
  estruturais_oficiais: number;
  historicos_monitorados: number;
  ocr_descartados: number;
  ruido_removido_estruturalmente: number;
  fila_humana_estimada: number;
  em_monitoramento: number;
};

export type ResultadoSaneamentoTriagemResolutiva = {
  itens: ItemTriagemComNaturezaEstrutural[];
  monitoramento_historico: LinhaMonitoramentoHistoricoTriagem[];
  metricas: MetricasSaneamentoTriagemResolutiva;
};

/** Aplica classificação a todos os itens e calcula KPIs. */
export function aplicarSaneamentoNaturezaTriagemResolutiva(input: {
  itens: ItemTriagemResolutiva[];
  matches?: LinhaMatchContratoCompleta[];
  idsEmCluster?: Set<string>;
  idsContextoConsolidado?: Set<string>;
}): ResultadoSaneamentoTriagemResolutiva {
  const matches = input.matches ?? [];
  const idsCluster = input.idsEmCluster ?? new Set<string>();
  const idsCtx = input.idsContextoConsolidado ?? new Set<string>();

  const itens: ItemTriagemComNaturezaEstrutural[] = [];
  const monitoramento_historico: LinhaMonitoramentoHistoricoTriagem[] = [];

  let estruturais_oficiais = 0;
  let historicos_monitorados = 0;
  let ocr_descartados = 0;
  let ruido_removido = 0;
  let fila_humana = 0;

  for (const item of input.itens) {
    const score = (() => {
      const id = item.contexto.divergencia.id_consignacao;
      if (!id) return null;
      return matches.find((m) => m.id_consignacao === id)?.score ?? null;
    })();

    const natureza = classificarNaturezaEstruturalPendencia({
      item,
      score_match: score,
      em_cluster: idsCluster.has(item.pendencia.id),
      em_contexto_consolidado: idsCtx.has(item.pendencia.id),
    });

    itens.push({ ...item, natureza });

    if (natureza.em_monitoramento_historico) {
      monitoramento_historico.push(montarLinhaMonitoramentoHistorico(item, natureza));
      historicos_monitorados++;
      if (
        natureza.natureza_estrutural === "monitoramento_historico" &&
        natureza.badge_visual === "ocr_invalido"
      ) {
        ocr_descartados++;
      }
      if (
        natureza.natureza_estrutural !== "estrutural_oficial" &&
        natureza.natureza_estrutural !== "refin_real"
      ) {
        ruido_removido++;
      }
    } else if (natureza.em_fila_principal) {
      estruturais_oficiais++;
      fila_humana++;
    }
  }

  return {
    itens,
    monitoramento_historico,
    metricas: {
      total: itens.length,
      estruturais_oficiais,
      historicos_monitorados,
      ocr_descartados,
      ruido_removido_estruturalmente: ruido_removido,
      fila_humana_estimada: fila_humana,
      em_monitoramento: historicos_monitorados,
    },
  };
}

export function deveFecharAutomaticamenteTriagem(
  natureza: ResultadoNaturezaEstruturalPendencia,
): boolean {
  return natureza.fecha_automaticamente;
}
