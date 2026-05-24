/**
 * Análise legível da série histórica de margem — alertas, tendências e sugestões.
 */

import type { ConsigfacilResumoMensalMargem } from "@/types/consigfacil";
import type { MargemHistorica, TipoMargemHistorica } from "./margem-historica-unificada";
import type { MargemHistoricaDetalhe } from "./calcular-margem-desde-folha";

export type SeveridadeInsightMargem = "info" | "atencao" | "alerta" | "positivo";

export type InsightMargemHistorica = {
  severidade: SeveridadeInsightMargem;
  titulo: string;
  mensagem: string;
  competencias?: string[];
};

export type ResumoMargemVigente = {
  /** Competência de referência unificada (mesma nos 3 cards). */
  competencia: string | null;
  /** Competência real do dado quando diferente da referência (ex.: folha anterior). */
  competencia_dado: string | null;
  tipo_margem: TipoMargemHistorica;
  margem_total: number;
  margem_disponivel: number;
  percentual_comprometido: number;
  origem: string;
};

export type AnaliseMargemHistorica = {
  ano_inicio: number;
  primeira_competencia: string | null;
  ultima_competencia: string | null;
  /** Competência única usada como “vigente” nos três cards. */
  competencia_vigente: string | null;
  competencias_com_folha: number;
  competencias_oficiais_consigfacil: number;
  vigente: ResumoMargemVigente[];
  insights: InsightMargemHistorica[];
  serie_consignavel: Array<{
    competencia: string;
    margem_total: number;
    margem_utilizada: number;
    percentual_comprometido: number;
    origem: MargemHistorica["origem"];
  }>;
  lacunas_competencia: string[];
};

const LABEL_TIPO: Record<TipoMargemHistorica, string> = {
  consignavel: "Margem consignável",
  cartao: "Margem cartão",
  cartao_beneficio: "Margem cartão benefício",
};

function competenciasEntre(inicio: string, fim: string): string[] {
  const m1 = /^(\d{4})-(\d{2})$/.exec(inicio);
  const m2 = /^(\d{4})-(\d{2})$/.exec(fim);
  if (!m1 || !m2) return [];
  let y = Number(m1[1]);
  let mo = Number(m1[2]);
  const yEnd = Number(m2[1]);
  const moEnd = Number(m2[2]);
  const out: string[] = [];
  while (y < yEnd || (y === yEnd && mo <= moEnd)) {
    out.push(`${y}-${String(mo).padStart(2, "0")}`);
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return out;
}

function ultimaPorTipo(
  historico: MargemHistorica[],
  tipo: TipoMargemHistorica,
): MargemHistorica | undefined {
  return [...historico].filter((h) => h.tipo_margem === tipo).sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
}

function normalizarCompetencia(c: string): string {
  return c.slice(0, 7);
}

/** Portal com margem consignável coerente (evita snapshot parcial tipo R$ 307). */
function resumoConsignavelPlausivel(r: ConsigfacilResumoMensalMargem): boolean {
  const t = r.margem_consignavel_total;
  if (t < 800) return false;
  const u = r.margem_consignavel_utilizada;
  const d = r.margem_consignavel_disponivel;
  return u + d <= t * 1.12;
}

function normalizarValoresMargem(input: {
  margem_total: number;
  margem_utilizada?: number;
  margem_disponivel: number;
  percentual_comprometido: number;
}): Pick<ResumoMargemVigente, "margem_total" | "margem_disponivel" | "percentual_comprometido"> {
  let t = Math.max(0, Math.round(input.margem_total));
  let d = Math.max(0, Math.round(input.margem_disponivel));
  let u = Math.max(0, Math.round(input.margem_utilizada ?? 0));
  let pct = input.percentual_comprometido;

  if (t > 0) {
    if (u <= 0 && d <= 0 && pct > 0) {
      u = Math.round((t * pct) / 100);
    }
    if (u <= 0 && d > 0 && d <= t) {
      u = t - d;
    } else if (d <= 0 && u > 0 && u <= t) {
      d = t - u;
    } else if (d <= 0 && u <= 0 && pct > 0) {
      u = Math.round((t * pct) / 100);
      d = Math.max(0, t - u);
    }
    if (u + d > t * 1.1) {
      if (pct > 0) {
        u = Math.round((t * pct) / 100);
        d = Math.max(0, t - u);
      } else {
        d = Math.max(0, t - u);
      }
    }
    const pctCalc = Math.round((u / t) * 1000) / 10;
    if (pct <= 0 || Math.abs(pct - pctCalc) > 20) {
      pct = pctCalc;
    }
  } else {
    pct = 0;
    t = 0;
    d = 0;
  }

  return {
    margem_total: t,
    margem_disponivel: d,
    percentual_comprometido: pct,
  };
}

function escolherCompetenciaVigente(
  resumoMargemMensal: ConsigfacilResumoMensalMargem[] | undefined,
  historico: MargemHistorica[],
  detalhes: MargemHistoricaDetalhe[],
): string | null {
  const resumos = [...(resumoMargemMensal ?? [])]
    .map((r) => ({ ...r, competencia: normalizarCompetencia(r.competencia) }))
    .sort((a, b) => b.competencia.localeCompare(a.competencia));

  const confiavel = resumos.find((r) => resumoConsignavelPlausivel(r));
  if (confiavel) return confiavel.competencia;

  const compsDetalhe = [...new Set(detalhes.map((d) => d.competencia))].sort((a, b) =>
    b.localeCompare(a),
  );
  for (const c of compsDetalhe) {
    const tipos = new Set(
      detalhes.filter((d) => d.competencia === c).map((d) => d.tipo_margem),
    );
    if (tipos.size >= 3) return c;
  }

  if (resumos[0]) return resumos[0].competencia;

  const compsOficial = [
    ...new Set(
      detalhes.filter((d) => d.origem === "consigfacil_oficial").map((d) => d.competencia),
    ),
  ].sort((a, b) => b.localeCompare(a));
  if (compsOficial[0]) return compsOficial[0];

  const comps = [...new Set(historico.map((h) => h.competencia))].sort((a, b) =>
    b.localeCompare(a),
  );
  return comps[0] ?? null;
}

function linhaVigente(
  compRef: string | null,
  tipo: TipoMargemHistorica,
  historico: MargemHistorica[],
  resumoRow: ConsigfacilResumoMensalMargem | undefined,
): ResumoMargemVigente {
  const mapResumo: Record<
    TipoMargemHistorica,
    { total: number; disp: number; util: number; pct: number }
  > = {
    consignavel: {
      total: resumoRow?.margem_consignavel_total ?? 0,
      disp: resumoRow?.margem_consignavel_disponivel ?? 0,
      util: resumoRow?.margem_consignavel_utilizada ?? 0,
      pct: resumoRow?.margem_consignavel_percentual ?? 0,
    },
    cartao: {
      total: resumoRow?.margem_cartao_total ?? 0,
      disp: resumoRow?.margem_cartao_disponivel ?? 0,
      util: resumoRow?.margem_cartao_utilizada ?? 0,
      pct: resumoRow?.margem_cartao_percentual ?? 0,
    },
    cartao_beneficio: {
      total: resumoRow?.margem_cartao_beneficio_total ?? 0,
      disp: resumoRow?.margem_cartao_beneficio_disponivel ?? 0,
      util: resumoRow?.margem_cartao_beneficio_utilizada ?? 0,
      pct: resumoRow?.margem_cartao_beneficio_percentual ?? 0,
    },
  };

  const usarResumo =
    resumoRow &&
    resumoConsignavelPlausivel(resumoRow) &&
    compRef &&
    normalizarCompetencia(resumoRow.competencia) === compRef;

  if (usarResumo && mapResumo[tipo].total > 0) {
    const norm = normalizarValoresMargem({
      margem_total: mapResumo[tipo].total,
      margem_disponivel: mapResumo[tipo].disp,
      margem_utilizada: mapResumo[tipo].util,
      percentual_comprometido: mapResumo[tipo].pct,
    });
    return {
      competencia: compRef,
      competencia_dado: compRef,
      tipo_margem: tipo,
      ...norm,
      origem: "consigfacil_oficial",
    };
  }

  const naComp =
    compRef && historico.find((h) => h.competencia === compRef && h.tipo_margem === tipo);
  if (naComp && naComp.margem_total > 0) {
    const norm = normalizarValoresMargem({
      margem_total: naComp.margem_total,
      margem_disponivel: naComp.margem_disponivel,
      margem_utilizada: naComp.margem_utilizada,
      percentual_comprometido: naComp.percentual_comprometido,
    });
    return {
      competencia: compRef,
      competencia_dado: compRef,
      tipo_margem: tipo,
      ...norm,
      origem: naComp.origem,
    };
  }

  const fallback = ultimaPorTipo(historico, tipo);
  const norm = normalizarValoresMargem({
    margem_total: fallback?.margem_total ?? 0,
    margem_disponivel: fallback?.margem_disponivel ?? 0,
    margem_utilizada: fallback?.margem_utilizada ?? 0,
    percentual_comprometido: fallback?.percentual_comprometido ?? 0,
  });
  return {
    competencia: compRef,
    competencia_dado: fallback?.competencia ?? null,
    tipo_margem: tipo,
    ...norm,
    origem: fallback?.origem ?? "inferencia",
  };
}

function montarVigenteUnificado(
  historico: MargemHistorica[],
  detalhes: MargemHistoricaDetalhe[],
  resumoMargemMensal?: ConsigfacilResumoMensalMargem[],
): { vigente: ResumoMargemVigente[]; competencia_vigente: string | null } {
  const competencia_vigente = escolherCompetenciaVigente(
    resumoMargemMensal,
    historico,
    detalhes,
  );
  const resumoRow = (resumoMargemMensal ?? []).find(
    (r) => normalizarCompetencia(r.competencia) === competencia_vigente,
  );

  const tipos: TipoMargemHistorica[] = ["consignavel", "cartao", "cartao_beneficio"];
  const vigente = tipos.map((tipo) =>
    linhaVigente(competencia_vigente, tipo, historico, resumoRow),
  );

  return { vigente, competencia_vigente };
}

export function gerarAnaliseMargemHistorica(
  historico: MargemHistorica[],
  detalhes: MargemHistoricaDetalhe[],
  opts?: { anoInicio?: number; resumoMargemMensal?: ConsigfacilResumoMensalMargem[] },
): AnaliseMargemHistorica {
  const anoInicio = opts?.anoInicio ?? 2012;
  const consignavel = historico
    .filter((h) => h.tipo_margem === "consignavel")
    .sort((a, b) => a.competencia.localeCompare(b.competencia));

  const serie_consignavel = consignavel.map((h) => ({
    competencia: h.competencia,
    margem_total: h.margem_total,
    margem_utilizada: h.margem_utilizada,
    percentual_comprometido: h.percentual_comprometido,
    origem: h.origem,
  }));

  const primeira = consignavel[0]?.competencia ?? null;
  const ultima = consignavel[consignavel.length - 1]?.competencia ?? null;

  const compsFolha = new Set(
    detalhes.filter((d) => d.origem !== "consigfacil_oficial").map((d) => d.competencia),
  );
  const compsOficial = new Set(
    detalhes.filter((d) => d.origem === "consigfacil_oficial").map((d) => d.competencia),
  );

  const lacunas: string[] = [];
  if (primeira && ultima) {
    const esperadas = competenciasEntre(primeira, ultima);
    const temConsignavel = new Set(consignavel.map((c) => c.competencia));
    for (const c of esperadas) {
      if (!temConsignavel.has(c)) lacunas.push(c);
    }
  }

  const { vigente, competencia_vigente } = montarVigenteUnificado(
    historico,
    detalhes,
    opts?.resumoMargemMensal,
  );

  const insights: InsightMargemHistorica[] = [];

  if (consignavel.length === 0) {
    insights.push({
      severidade: "alerta",
      titulo: "Sem histórico de margem",
      mensagem:
        "Importe contracheques (desde 2012) e/ou uma captura do ConsigFácil para reconstruir a evolução mensal.",
    });
    return {
      ano_inicio: anoInicio,
      primeira_competencia: null,
      ultima_competencia: null,
      competencia_vigente,
      competencias_com_folha: 0,
      competencias_oficiais_consigfacil: 0,
      vigente,
      insights,
      serie_consignavel,
      lacunas_competencia: lacunas,
    };
  }

  const resumosOrdenados = [...(opts?.resumoMargemMensal ?? [])].sort((a, b) =>
    normalizarCompetencia(b.competencia).localeCompare(normalizarCompetencia(a.competencia)),
  );
  const ultimoResumo = resumosOrdenados[0];
  if (
    ultimoResumo &&
    competencia_vigente &&
    normalizarCompetencia(ultimoResumo.competencia) !== competencia_vigente &&
    !resumoConsignavelPlausivel(ultimoResumo)
  ) {
    insights.push({
      severidade: "atencao",
      titulo: "Snapshot do portal incompleto",
      mensagem: `O print de ${formatarCompetenciaInsight(ultimoResumo.competencia)} parece parcial (margem consignável ${ultimoResumo.margem_consignavel_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Os cards vigentes usam ${formatarCompetenciaInsight(competencia_vigente)} pela folha até haver captura oficial completa.`,
      competencias: [normalizarCompetencia(ultimoResumo.competencia), competencia_vigente],
    });
  }

  insights.push({
    severidade: "info",
    titulo: "Período coberto",
    mensagem: `Série de ${consignavel.length} competência(s) com margem consignável estimada ou oficial, de ${primeira} a ${ultima}.`,
  });

  if (compsOficial.size > 0) {
    insights.push({
      severidade: "positivo",
      titulo: "Dados oficiais do portal",
      mensagem: `${compsOficial.size} competência(s) com margem vinda do ConsigFácil (prioridade sobre estimativa da folha).`,
    });
  }

  const acima35 = consignavel.filter((c) => c.percentual_comprometido >= 35);
  if (acima35.length > 0) {
    insights.push({
      severidade: "alerta",
      titulo: "Margem consignável acima de 35%",
      mensagem: `${acima35.length} mês(es) com comprometimento elevado — risco de bloqueio de novas averbações e de leitura errada como refinanciamento.`,
      competencias: acima35.map((c) => c.competencia),
    });
  }

  const acima30 = consignavel.filter(
    (c) => c.percentual_comprometido >= 30 && c.percentual_comprometido < 35,
  );
  if (acima30.length > 0) {
    insights.push({
      severidade: "atencao",
      titulo: "Margem consignável entre 30% e 35%",
      mensagem: "Monitore reservas no portal antes de novos contratos.",
      competencias: acima30.map((c) => c.competencia),
    });
  }

  const vigConsignavel = vigente.find((v) => v.tipo_margem === "consignavel");
  if (
    vigConsignavel &&
    vigConsignavel.margem_disponivel < 200 &&
    vigConsignavel.margem_total > 0
  ) {
    insights.push({
      severidade: "alerta",
      titulo: "Pouca margem disponível (vigente)",
      mensagem: `${LABEL_TIPO.consignavel}: apenas ${vigConsignavel.margem_disponivel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} livres em ${vigConsignavel.competencia_dado ?? competencia_vigente ?? "—"} (${vigConsignavel.percentual_comprometido}% usados).`,
    });
  }

  if (consignavel.length >= 6) {
    const recente = consignavel.slice(-6);
    const mediaUtil =
      recente.reduce((s, r) => s + r.margem_utilizada, 0) / recente.length;
    const antiga = consignavel.slice(0, 6);
    const mediaAnt =
      antiga.reduce((s, r) => s + r.margem_utilizada, 0) / Math.max(antiga.length, 1);
    if (mediaUtil > mediaAnt * 1.15) {
      insights.push({
        severidade: "atencao",
        titulo: "Tendência de aumento de descontos",
        mensagem:
          "A média de margem utilizada nos últimos 6 meses supera o início do período — confira novos contratos ou retenção indevida.",
      });
    }
  }

  if (lacunas.length > 0 && lacunas.length <= 24) {
    insights.push({
      severidade: "atencao",
      titulo: "Meses sem contracheque na base",
      mensagem: `Faltam ${lacunas.length} competência(s) entre a primeira e a última — importe PDFs para fechar a série.`,
      competencias: lacunas.slice(0, 12),
    });
  } else if (lacunas.length > 24) {
    insights.push({
      severidade: "atencao",
      titulo: "Lacunas na série",
      mensagem: `${lacunas.length} meses sem folha importada entre ${primeira} e ${ultima}.`,
    });
  }

  const divergentes = detalhes.filter(
    (d) => d.observacao && d.origem === "consigfacil_oficial",
  );
  if (divergentes.length > 0) {
    insights.push({
      severidade: "info",
      titulo: "Folha × portal",
      mensagem:
        "Em alguns meses a estimativa pela folha difere do ConsigFácil — normal quando há verbas que não entram na base ou reservas no portal.",
    });
  }

  return {
    ano_inicio: anoInicio,
    primeira_competencia: primeira,
    ultima_competencia: ultima,
    competencia_vigente,
    competencias_com_folha: compsFolha.size,
    competencias_oficiais_consigfacil: compsOficial.size,
    vigente,
    insights,
    serie_consignavel,
    lacunas_competencia: lacunas,
  };
}

function formatarCompetenciaInsight(c: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(c);
  if (!m) return c;
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}
