/**
 * Motor analítico avançado de margem consignável (2012 → atual).
 * Prioridade: estrutura > timeline > recorrência > assinatura > instituição > valor.
 */

import type { Payslip } from "@/types/contracheque";
import type { ConsigfacilContrato, ConsigfacilRefinanciamento } from "@/types/consigfacil";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import {
  entradaPassivoDePayslipItem,
  identificarPassivoConsignavelEstrutural,
} from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";
import { filtrarPayslipsAnaliseSemAdiantamentoParcial130 } from "@/lib/anexos/decimo-terceiro-coerencia";
import { payslipContribuiHistoricoRubricas } from "@/lib/anexos/payslip-desconto-historico";
import {
  ANO_INICIO_MARGEM_HISTORICA,
  calcularMargemHistoricaDesdeFolha,
  extrairComponentesMargemFolha,
  indexarMargensOficiais,
  mesclarDetalheComOficial,
  PCT_MARGEM_CARTAO_BENEFICIO_FOLHA,
  PCT_MARGEM_CARTAO_FOLHA,
  PCT_MARGEM_CONSIGNAVEL_FOLHA,
  type MargemHistoricaDetalhe,
} from "./calcular-margem-desde-folha";
import type { BaseMargemConsignavel } from "@/types/consigfacil";
import type { DescontoFracionadoConciliado } from "./aplicar-auditoria-consigfacil";
import type { HistoricoContratoEvento } from "@/lib/consignacoes-governo/historico-contrato-eventos";
import type { ConsigfacilResumoMensalMargem } from "@/types/consigfacil";
import {
  montarBasesConsignavelRealPorPayslips,
  type BaseConsignavelReal,
} from "@/lib/consignacoes-governo/calcular-base-consignavel-real";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type FonteMargemHistoricaCompetencia = "folha" | "portal" | "hibrido";

export type NivelPressaoMargem = "baixo" | "moderado" | "alto" | "critico";

export type TipoEventoMargemHistorica =
  | "entrada_banco"
  | "saida_banco"
  | "refinanciamento"
  | "quebra_sequencia"
  | "desconto_fracionado"
  | "cartao_consignado"
  | "cartao_beneficio"
  | "sufocamento"
  | "recuperacao";

export type SeveridadeEventoMargem = "baixa" | "media" | "alta" | "critica";

export interface EventoMargemHistorica {
  competencia: string;
  tipo: TipoEventoMargemHistorica;
  severidade: SeveridadeEventoMargem;
  descricao: string;
  banco?: string;
  contrato?: string;
}

export interface AlertaMargemHistorica {
  competencia: string;
  severidade: SeveridadeEventoMargem;
  descricao: string;
}

export interface MargemHistoricaCompetencia {
  competencia: string;
  fonte: FonteMargemHistoricaCompetencia;
  base_calculo: number;
  margem_consignavel_total: number;
  margem_consignavel_utilizada: number;
  margem_consignavel_disponivel: number;
  margem_cartao_total: number;
  margem_cartao_utilizada: number;
  margem_cartao_disponivel: number;
  margem_beneficio_total: number;
  margem_beneficio_utilizada: number;
  margem_beneficio_disponivel: number;
  percentual_comprometido: number;
  quantidade_contratos: number;
  contratos_ativos: string[];
  score_pressao_financeira: number;
  nivel_pressao: NivelPressaoMargem;
  eventos: EventoMargemHistorica[];
  insights: string[];
  alertas: string[];

  /** Base consignável real (não é líquido bancário). */
  base_consignavel_calculada?: number;
  margem_consignavel_30_calculada?: number;
  margem_cartao_5_calculada?: number;
  margem_beneficio_5_calculada?: number;
  base_portal_inferida?: number | null;
  percentual_aderencia_portal?: number | null;
  confianca_calculo_base?: BaseConsignavelReal["confianca_calculo"];
  fonte_base_consignavel?: BaseConsignavelReal["fonte"];
}

export type CicloEndividamento = {
  inicio: string;
  pico: string;
  recuperacao: boolean;
  competencias_criticas: number;
  score_medio: number;
};

export type ResultadoSufocamentoMargem = {
  competencia: string;
  percentual_comprometido: number;
  meses_consecutivos_alto: number;
  descontos_fracionados: number;
  refin_no_periodo: number;
  queda_saldo_livre_pct: number | null;
  ativo: boolean;
};

export type ProjecaoLiberacaoMargem = {
  competencia: string;
  margem_liberada_estimada: number;
  contratos_encerrando: string[];
  parcelas_restantes_media: number | null;
  confianca: "baixa" | "media" | "alta";
};

export type TipoSimulacaoMargem =
  | "sem_refin"
  | "sem_cartao"
  | "quitacao_parcial"
  | "portabilidade"
  | "reducao_juros";

export type SimulacaoCenarioMargem = {
  cenario: TipoSimulacaoMargem;
  rotulo: string;
  margem_disponivel_atual: number;
  margem_disponivel_simulada: number;
  delta_mensal: number;
  descricao: string;
};

export type ResumoMargemHistoricaAvancada = {
  ano_inicio: number;
  total_competencias: number;
  maior_comprometimento: { competencia: string; percentual: number } | null;
  menor_margem_livre: { competencia: string; valor: number } | null;
  periodo_critico: { inicio: string; fim: string; meses: number } | null;
  quantidade_refin: number;
  bancos_dominantes: string[];
  contratos_ativos_vigentes: number;
  score_medio_pressao: number;
  meses_sufocamento: number;
};

export type PacoteMargemHistoricaAvancada = {
  competencias: MargemHistoricaCompetencia[];
  resumo: ResumoMargemHistoricaAvancada;
  bases_consignavel_real: BaseConsignavelReal[];
  ciclos_endividamento: CicloEndividamento[];
  sufocamento: ResultadoSufocamentoMargem[];
  projecoes: ProjecaoLiberacaoMargem[];
  simulacoes: SimulacaoCenarioMargem[];
  todos_eventos: EventoMargemHistorica[];
  todos_alertas: AlertaMargemHistorica[];
  todos_insights: string[];
};

export type EntradaCalcularMargemHistoricaAvancada = {
  payslips: Payslip[];
  margensConsigfacil?: BaseMargemConsignavel[];
  resumoMargemMensal?: ConsigfacilResumoMensalMargem[];
  basesConsignavelReal?: BaseConsignavelReal[];
  contratos?: ConsigfacilContrato[];
  refinanciamentos?: ConsigfacilRefinanciamento[];
  baseConciliada?: BaseConciliadaLinha[];
  descontosFracionados?: DescontoFracionadoConciliado[];
  historicoEventos?: HistoricoContratoEvento[];
  anoInicio?: number;
  /** Chunk size para processamento incremental (default 12 meses). */
  chunkSize?: number;
};

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

const CHUNK_DEFAULT = 12;

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

function competenciaDePayslip(p: Payslip): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function pctComprometido(utilizada: number, total: number): number {
  if (total <= 0) return utilizada > 0 ? 100 : 0;
  return Math.min(100, Math.round((utilizada / total) * 1000) / 10);
}

function classificarNivelPressao(score: number): NivelPressaoMargem {
  if (score >= 80) return "critico";
  if (score >= 60) return "alto";
  if (score >= 30) return "moderado";
  return "baixo";
}

function resolverFonteCompetencia(
  linhas: MargemHistoricaDetalhe[],
): FonteMargemHistoricaCompetencia {
  const oficiais = linhas.filter((l) => l.origem === "consigfacil_oficial").length;
  if (oficiais === linhas.length && linhas.length > 0) return "portal";
  if (oficiais === 0) return "folha";
  return "hibrido";
}

function detalhesPorCompetencia(
  detalhes: MargemHistoricaDetalhe[],
): Map<string, MargemHistoricaDetalhe[]> {
  const map = new Map<string, MargemHistoricaDetalhe[]>();
  for (const d of detalhes) {
    const arr = map.get(d.competencia) ?? [];
    arr.push(d);
    map.set(d.competencia, arr);
  }
  return map;
}

function linhaPorTipo(
  linhas: MargemHistoricaDetalhe[],
  tipo: MargemHistoricaDetalhe["tipo_margem"],
): MargemHistoricaDetalhe | undefined {
  return linhas.find((l) => l.tipo_margem === tipo);
}

// ---------------------------------------------------------------------------
// Score de pressão financeira
// ---------------------------------------------------------------------------

export function calcularScorePressaoFinanceira(input: {
  percentual_comprometido: number;
  quantidade_contratos: number;
  refin_no_mes: number;
  cartao_beneficio_ativo: boolean;
  desconto_fracionado: boolean;
  margem_disponivel: number;
  margem_total: number;
}): number {
  const pct = Math.min(100, Math.max(0, input.percentual_comprometido));
  let score = (pct / 100) * 40;

  const qtd = input.quantidade_contratos;
  if (qtd >= 8) score += 20;
  else if (qtd >= 5) score += 15;
  else if (qtd >= 3) score += 10;
  else if (qtd >= 1) score += 5;

  if (input.refin_no_mes >= 2) score += 15;
  else if (input.refin_no_mes === 1) score += 10;

  if (input.cartao_beneficio_ativo) score += 10;
  if (input.desconto_fracionado) score += 10;

  if (input.margem_total > 0) {
    const pctLivre = (input.margem_disponivel / input.margem_total) * 100;
    if (pctLivre < 5) score += 5;
    else if (pctLivre < 10) score += 3;
  }

  return Math.min(100, Math.round(score));
}

// ---------------------------------------------------------------------------
// Sufocamento e ciclo de endividamento
// ---------------------------------------------------------------------------

export function detectarSufocamentoMargem(
  competencias: MargemHistoricaCompetencia[],
): ResultadoSufocamentoMargem[] {
  const out: ResultadoSufocamentoMargem[] = [];
  let streak = 0;
  let prevDisp: number | null = null;

  for (const c of competencias) {
    const alto = c.percentual_comprometido >= 85;
    streak = alto ? streak + 1 : 0;

    const fracionados = c.eventos.filter((e) => e.tipo === "desconto_fracionado").length;
    const refin = c.eventos.filter((e) => e.tipo === "refinanciamento").length;

    let queda: number | null = null;
    if (prevDisp != null && prevDisp > 0) {
      queda = arredondar(((prevDisp - c.margem_consignavel_disponivel) / prevDisp) * 100);
    }
    prevDisp = c.margem_consignavel_disponivel;

    const ativo =
      alto ||
      streak >= 3 ||
      (fracionados > 0 && alto) ||
      (refin > 0 && c.percentual_comprometido >= 75) ||
      (queda != null && queda >= 40 && c.percentual_comprometido >= 70);

    out.push({
      competencia: c.competencia,
      percentual_comprometido: c.percentual_comprometido,
      meses_consecutivos_alto: streak,
      descontos_fracionados: fracionados,
      refin_no_periodo: refin,
      queda_saldo_livre_pct: queda,
      ativo,
    });
  }
  return out;
}

export function detectarCicloEndividamento(
  competencias: MargemHistoricaCompetencia[],
): CicloEndividamento[] {
  if (competencias.length < 6) return [];

  const ciclos: CicloEndividamento[] = [];
  let inicio: string | null = null;
  let pico = { comp: "", pct: 0 };
  let criticos = 0;
  let somaScore = 0;
  let n = 0;

  const fechar = () => {
    if (!inicio || n < 4) return;
    ciclos.push({
      inicio,
      pico: pico.comp || inicio,
      recuperacao: competencias[competencias.length - 1]?.percentual_comprometido < 60,
      competencias_criticas: criticos,
      score_medio: n > 0 ? Math.round(somaScore / n) : 0,
    });
  };

  for (const c of competencias) {
    const elevado = c.percentual_comprometido >= 60 || c.nivel_pressao === "alto" || c.nivel_pressao === "critico";
    if (elevado) {
      if (!inicio) inicio = c.competencia;
      n += 1;
      somaScore += c.score_pressao_financeira;
      if (c.percentual_comprometido >= 70 || c.nivel_pressao === "critico") criticos += 1;
      if (c.percentual_comprometido >= pico.pct) {
        pico = { comp: c.competencia, pct: c.percentual_comprometido };
      }
    } else if (inicio) {
      fechar();
      inicio = null;
      pico = { comp: "", pct: 0 };
      criticos = 0;
      somaScore = 0;
      n = 0;
    }
  }
  if (inicio) fechar();

  return ciclos;
}

// ---------------------------------------------------------------------------
// Previsão e simulação
// ---------------------------------------------------------------------------

export function projetarLiberacaoMargem(input: {
  contratos: ConsigfacilContrato[];
  competenciaReferencia: string;
  mesesProjecao?: number;
}): ProjecaoLiberacaoMargem[] {
  const meses = input.mesesProjecao ?? 12;
  const out: ProjecaoLiberacaoMargem[] = [];
  const ref = input.competenciaReferencia;

  for (let i = 1; i <= meses; i += 1) {
    const comp = addMeses(ref, i);
    const encerrando: string[] = [];
    let liberada = 0;
    let parcelasRestantes: number[] = [];

    for (const c of input.contratos) {
      if (c.status === "quitado" || c.status === "substituido") continue;
      const tl = c.timeline_parcelas ?? [];
      const ult = [...tl].sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
      if (!ult?.parcela_atual || !ult.total) continue;
      const restantes = ult.total - ult.parcela_atual;
      parcelasRestantes.push(restantes);
      const mesesAteFim = restantes;
      if (mesesAteFim === i) {
        encerrando.push(c.id_consignacao);
        liberada += c.valor_parcela;
      }
    }

    const confianca: ProjecaoLiberacaoMargem["confianca"] =
      encerrando.length >= 2 ? "alta" : encerrando.length === 1 ? "media" : "baixa";

    out.push({
      competencia: comp,
      margem_liberada_estimada: arredondar(liberada),
      contratos_encerrando: encerrando,
      parcelas_restantes_media:
        parcelasRestantes.length > 0
          ? Math.round(
              parcelasRestantes.reduce((s, x) => s + x, 0) / parcelasRestantes.length,
            )
          : null,
      confianca,
    });
  }
  return out;
}

export function simularCenarioMargem(input: {
  margem_disponivel_atual: number;
  margem_utilizada: number;
  valor_cartao_beneficio?: number;
  valor_refin_medio?: number;
  pct_quitacao_parcial?: number;
}): SimulacaoCenarioMargem[] {
  const disp = input.margem_disponivel_atual;
  const util = input.margem_utilizada;
  const cartao = input.valor_cartao_beneficio ?? 0;
  const refin = input.valor_refin_medio ?? util * 0.15;
  const quitPct = input.pct_quitacao_parcial ?? 0.2;

  const cenarios: SimulacaoCenarioMargem[] = [
    {
      cenario: "sem_refin",
      rotulo: "Sem novos refinanciamentos",
      margem_disponivel_atual: disp,
      margem_disponivel_simulada: arredondar(disp + refin * 0.5),
      delta_mensal: arredondar(refin * 0.5),
      descricao: "Evita acúmulo de parcelas por portabilidade/refin sucessivo.",
    },
    {
      cenario: "sem_cartao",
      rotulo: "Sem cartão consignado/benefício",
      margem_disponivel_atual: disp,
      margem_disponivel_simulada: arredondar(disp + cartao),
      delta_mensal: arredondar(cartao),
      descricao: "Libera reserva de cartão (RMC/RCC/benefício) para empréstimo.",
    },
    {
      cenario: "quitacao_parcial",
      rotulo: "Quitação parcial (20%)",
      margem_disponivel_atual: disp,
      margem_disponivel_simulada: arredondar(disp + util * quitPct),
      delta_mensal: arredondar(util * quitPct),
      descricao: "Amortização parcial dos maiores contratos ativos.",
    },
    {
      cenario: "portabilidade",
      rotulo: "Portabilidade com taxa menor",
      margem_disponivel_atual: disp,
      margem_disponivel_simulada: arredondar(disp + util * 0.08),
      delta_mensal: arredondar(util * 0.08),
      descricao: "Redução estimada de parcela mantendo prazo (≈8% economia).",
    },
    {
      cenario: "reducao_juros",
      rotulo: "Renegociação de juros",
      margem_disponivel_atual: disp,
      margem_disponivel_simulada: arredondar(disp + util * 0.05),
      delta_mensal: arredondar(util * 0.05),
      descricao: "Cenário conservador de redução de encargos (≈5%).",
    },
  ];
  return cenarios;
}

function addMeses(comp: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(comp);
  if (!m) return comp;
  let y = Number(m[1]);
  let mo = Number(m[2]) + delta;
  while (mo > 12) {
    mo -= 12;
    y += 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Passivos estruturais na folha (por competência)
// ---------------------------------------------------------------------------

function passivosConsignaveisNoPayslip(p: Payslip): {
  chaves: Set<string>;
  bancos: Set<string>;
  qtd: number;
  temCartao: boolean;
  temBeneficio: boolean;
} {
  const chaves = new Set<string>();
  const bancos = new Set<string>();
  let temCartao = false;
  let temBeneficio = false;

  for (const it of p.items ?? []) {
    if (it.type !== "desconto" || it.value <= 0) continue;
    const passivo = identificarPassivoConsignavelEstrutural(entradaPassivoDePayslipItem(it));
    if (!passivo.consignavel) continue;
    const chave =
      passivo.chave_recorrencia ??
      `${passivo.instituicao_detectada ?? "?"}/${passivo.parcela_total ?? 0}`;
    chaves.add(chave);
    if (passivo.instituicao_detectada) bancos.add(passivo.instituicao_detectada);
    if (passivo.tipo_passivo === "cartao_consignado") temCartao = true;
    if (/benef|cred.?cesta|rmc|rcc/i.test(it.description)) {
      if (/benef|cesta/i.test(it.description)) temBeneficio = true;
      else temCartao = true;
    }
  }

  return { chaves, bancos, qtd: chaves.size, temCartao, temBeneficio };
}

function contratosAtivosNaCompetencia(
  contratos: ConsigfacilContrato[],
  comp: string,
): string[] {
  const ids: string[] = [];
  for (const c of contratos) {
    const tl = c.timeline_parcelas ?? [];
    const naComp = tl.some(
      (t) => t.competencia.slice(0, 7) === comp.slice(0, 7) && Math.abs(t.valor) > 0,
    );
    if (naComp) {
      ids.push(c.id_consignacao);
      continue;
    }
    if (c.competencia?.slice(0, 7) === comp.slice(0, 7) && c.status === "ativo") {
      ids.push(c.id_consignacao);
    }
  }
  return ids;
}

function montarEventosCompetencia(input: {
  comp: string;
  passivos: ReturnType<typeof passivosConsignaveisNoPayslip>;
  contratos: ConsigfacilContrato[];
  refinPorComp: Map<string, ConsigfacilRefinanciamento[]>;
  fracionadosPorComp: Map<string, DescontoFracionadoConciliado[]>;
  historico: HistoricoContratoEvento[];
  pct: number;
  prevPct: number | null;
}): EventoMargemHistorica[] {
  const eventos: EventoMargemHistorica[] = [];

  for (const r of input.refinPorComp.get(input.comp) ?? []) {
    eventos.push({
      competencia: input.comp,
      tipo: "refinanciamento",
      severidade: "alta",
      descricao: `Refinanciamento detectado: ${r.contrato_origem} → ${r.contrato_destino}`,
      banco: r.banco,
      contrato: r.contrato_destino,
    });
  }

  for (const f of input.fracionadosPorComp.get(input.comp) ?? []) {
    eventos.push({
      competencia: input.comp,
      tipo: "desconto_fracionado",
      severidade: "media",
      descricao: f.motivo,
      banco: f.banco,
      contrato: f.id_consignacao,
    });
  }

  if (input.passivos.temCartao) {
    eventos.push({
      competencia: input.comp,
      tipo: "cartao_consignado",
      severidade: "media",
      descricao: "Desconto estrutural de cartão consignado (RMC/RCC) na folha.",
    });
  }
  if (input.passivos.temBeneficio) {
    eventos.push({
      competencia: input.comp,
      tipo: "cartao_beneficio",
      severidade: "media",
      descricao: "Desconto de cartão benefício identificado na folha.",
    });
  }

  for (const c of input.contratos) {
    const tl = c.timeline_parcelas ?? [];
    const naComp = tl.filter((t) => t.competencia.slice(0, 7) === input.comp.slice(0, 7));
    const prev = tl.filter((t) => t.competencia.slice(0, 7) < input.comp.slice(0, 7));
    if (naComp.length > 0 && prev.length === 0 && c.data_contrato?.startsWith(input.comp.slice(0, 4))) {
      eventos.push({
        competencia: input.comp,
        tipo: "entrada_banco",
        severidade: "baixa",
        descricao: `Nova operação: ${c.instituicao}`,
        banco: c.instituicao,
        contrato: c.id_consignacao,
      });
    }
    if (
      c.classificacao_continuidade === "sequencia_quebrada" &&
      c.competencia?.slice(0, 7) === input.comp.slice(0, 7)
    ) {
      eventos.push({
        competencia: input.comp,
        tipo: "quebra_sequencia",
        severidade: "alta",
        descricao: c.timeline_analise?.motivo ?? "Quebra de sequência estrutural na timeline.",
        banco: c.instituicao,
        contrato: c.id_consignacao,
      });
    }
  }

  if (input.pct >= 85) {
    eventos.push({
      competencia: input.comp,
      tipo: "sufocamento",
      severidade: input.pct >= 90 ? "critica" : "alta",
      descricao: `Margem consignável comprometida em ${input.pct.toFixed(1)}%.`,
    });
  } else if (input.prevPct != null && input.prevPct >= 80 && input.pct < 65) {
    eventos.push({
      competencia: input.comp,
      tipo: "recuperacao",
      severidade: "baixa",
      descricao: `Recuperação de margem livre (${input.prevPct.toFixed(0)}% → ${input.pct.toFixed(0)}%).`,
    });
  }

  for (const h of input.historico) {
    const compHist = h.data?.slice(0, 7);
    if (compHist !== input.comp.slice(0, 7)) continue;
    if (h.tipo_evento === "quitado") {
      eventos.push({
        competencia: input.comp,
        tipo: "saida_banco",
        severidade: "baixa",
        descricao: h.descricao,
        banco: h.instituicao_oficial,
        contrato: h.contrato_id,
      });
    }
  }

  return eventos;
}

function gerarInsightsCompetencia(c: MargemHistoricaCompetencia): string[] {
  const insights: string[] = [];
  if (c.nivel_pressao === "critico") {
    insights.push(
      `Sua margem consignável atingiu nível crítico em ${c.competencia} (${c.percentual_comprometido.toFixed(1)}% comprometidos).`,
    );
  }
  if (c.eventos.some((e) => e.tipo === "desconto_fracionado")) {
    insights.push("O sistema identificou fragmentação operacional de descontos neste mês.");
  }
  if (c.eventos.filter((e) => e.tipo === "refinanciamento").length >= 1) {
    insights.push("Há indícios estruturais de refinanciamento no período.");
  }
  if (c.margem_consignavel_total > 0 && c.margem_consignavel_disponivel / c.margem_consignavel_total < 0.05) {
    insights.push("A margem livre caiu abaixo de 5% da capacidade financeira.");
  }
  if (c.quantidade_contratos >= 6) {
    insights.push(
      `${c.quantidade_contratos} passivos consignáveis simultâneos — pressão por quantidade de contratos.`,
    );
  }
  return insights;
}

function gerarAlertasCompetencia(c: MargemHistoricaCompetencia): string[] {
  const alertas: string[] = [];
  if (c.percentual_comprometido >= 90) {
    alertas.push("Margem comprometida acima de 90%");
  } else if (c.percentual_comprometido >= 85) {
    alertas.push("Margem consignável acima de 85% — risco de sufocamento");
  }
  if (c.score_pressao_financeira >= 80) {
    alertas.push("Score de pressão financeira crítico");
  }
  if (c.eventos.some((e) => e.tipo === "sufocamento" && e.severidade === "critica")) {
    alertas.push("Sufocamento financeiro detectado");
  }
  return alertas;
}

function processarChunkCompetencias(
  comps: string[],
  ctx: {
    porCompDetalhe: Map<string, MargemHistoricaDetalhe[]>;
    payslipPorComp: Map<string, Payslip>;
    basesPorComp: Map<string, BaseConsignavelReal>;
    contratos: ConsigfacilContrato[];
    refinPorComp: Map<string, ConsigfacilRefinanciamento[]>;
    fracionadosPorComp: Map<string, DescontoFracionadoConciliado[]>;
    historico: HistoricoContratoEvento[];
  },
): MargemHistoricaCompetencia[] {
  const out: MargemHistoricaCompetencia[] = [];
  let prevPct: number | null = null;

  for (const comp of comps) {
    const linhas = ctx.porCompDetalhe.get(comp) ?? [];
    const cons = linhaPorTipo(linhas, "consignavel");
    const cart = linhaPorTipo(linhas, "cartao");
    const benef = linhaPorTipo(linhas, "cartao_beneficio");

    const baseReal = ctx.basesPorComp.get(comp);
    const base =
      baseReal?.base_consignavel_calculada ??
      cons?.componentes?.base_remuneracao ??
      cons?.base_remuneracao ??
      (cons?.margem_total ? cons.margem_total / PCT_MARGEM_CONSIGNAVEL_FOLHA : 0);

    const payslip = ctx.payslipPorComp.get(comp);
    const passivos = payslip
      ? passivosConsignaveisNoPayslip(payslip)
      : { chaves: new Set<string>(), bancos: new Set<string>(), qtd: 0, temCartao: false, temBeneficio: false };

    const contratosIds = contratosAtivosNaCompetencia(ctx.contratos, comp);
    const qtdContratos = Math.max(passivos.qtd, contratosIds.length);

    const pct = cons?.percentual_comprometido ?? pctComprometido(cons?.margem_utilizada ?? 0, cons?.margem_total ?? 0);

    const eventos = montarEventosCompetencia({
      comp,
      passivos,
      contratos: ctx.contratos,
      refinPorComp: ctx.refinPorComp,
      fracionadosPorComp: ctx.fracionadosPorComp,
      historico: ctx.historico,
      pct,
      prevPct,
    });

    const descontoFracionado = eventos.some((e) => e.tipo === "desconto_fracionado");
    const refinNoMes = (ctx.refinPorComp.get(comp) ?? []).length;

    const score = calcularScorePressaoFinanceira({
      percentual_comprometido: pct,
      quantidade_contratos: qtdContratos,
      refin_no_mes: refinNoMes,
      cartao_beneficio_ativo: passivos.temBeneficio || (benef?.margem_utilizada ?? 0) > 0,
      desconto_fracionado: descontoFracionado,
      margem_disponivel: cons?.margem_disponivel ?? 0,
      margem_total: cons?.margem_total ?? 0,
    });

    const row: MargemHistoricaCompetencia = {
      competencia: comp,
      fonte: resolverFonteCompetencia(linhas),
      base_calculo: arredondar(base),
      base_consignavel_calculada: baseReal?.base_consignavel_calculada,
      margem_consignavel_30_calculada: baseReal?.margem_consignavel_30,
      margem_cartao_5_calculada: baseReal?.margem_cartao_5,
      margem_beneficio_5_calculada: baseReal?.margem_cartao_beneficio_5,
      base_portal_inferida: baseReal?.base_portal_inferida ?? null,
      percentual_aderencia_portal: baseReal?.percentual_aderencia_portal ?? null,
      confianca_calculo_base: baseReal?.confianca_calculo,
      fonte_base_consignavel: baseReal?.fonte,
      margem_consignavel_total:
        cons?.origem === "consigfacil_oficial" && cons.margem_total > 0
          ? cons.margem_total
          : (baseReal?.margem_consignavel_30 ?? cons?.margem_total ?? 0),
      margem_consignavel_utilizada: cons?.margem_utilizada ?? 0,
      margem_consignavel_disponivel: cons?.margem_disponivel ?? 0,
      margem_cartao_total:
        cart?.origem === "consigfacil_oficial" && cart.margem_total > 0
          ? cart.margem_total
          : (baseReal?.margem_cartao_5 ?? cart?.margem_total ?? arredondar(base * PCT_MARGEM_CARTAO_FOLHA)),
      margem_cartao_utilizada: cart?.margem_utilizada ?? 0,
      margem_cartao_disponivel: cart?.margem_disponivel ?? 0,
      margem_beneficio_total:
        benef?.origem === "consigfacil_oficial" && benef.margem_total > 0
          ? benef.margem_total
          : (baseReal?.margem_cartao_beneficio_5 ??
            benef?.margem_total ??
            arredondar(base * PCT_MARGEM_CARTAO_BENEFICIO_FOLHA)),
      margem_beneficio_utilizada: benef?.margem_utilizada ?? 0,
      margem_beneficio_disponivel: benef?.margem_disponivel ?? 0,
      percentual_comprometido: pct,
      quantidade_contratos: qtdContratos,
      contratos_ativos: contratosIds,
      score_pressao_financeira: score,
      nivel_pressao: classificarNivelPressao(score),
      eventos,
      insights: [],
      alertas: [],
    };

    row.insights = gerarInsightsCompetencia(row);
    row.alertas = gerarAlertasCompetencia(row);
    out.push(row);
    prevPct = pct;
  }

  return out;
}

function montarResumo(competencias: MargemHistoricaCompetencia[], anoInicio: number): ResumoMargemHistoricaAvancada {
  if (competencias.length === 0) {
    return {
      ano_inicio: anoInicio,
      total_competencias: 0,
      maior_comprometimento: null,
      menor_margem_livre: null,
      periodo_critico: null,
      quantidade_refin: 0,
      bancos_dominantes: [],
      contratos_ativos_vigentes: 0,
      score_medio_pressao: 0,
      meses_sufocamento: 0,
    };
  }

  const maior = [...competencias].sort((a, b) => b.percentual_comprometido - a.percentual_comprometido)[0];
  const menorLivre = [...competencias].sort(
    (a, b) => a.margem_consignavel_disponivel - b.margem_consignavel_disponivel,
  )[0];

  const criticos = competencias.filter((c) => c.nivel_pressao === "critico" || c.percentual_comprometido >= 85);
  let periodoCritico: ResumoMargemHistoricaAvancada["periodo_critico"] = null;
  if (criticos.length >= 3) {
    periodoCritico = {
      inicio: criticos[0].competencia,
      fim: criticos[criticos.length - 1].competencia,
      meses: criticos.length,
    };
  }

  const bancoCount = new Map<string, number>();
  for (const c of competencias) {
    for (const e of c.eventos) {
      if (e.banco) bancoCount.set(e.banco, (bancoCount.get(e.banco) ?? 0) + 1);
    }
  }
  const bancosDominantes = [...bancoCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([b]) => b);

  const ult = competencias[competencias.length - 1];
  const refinTotal = competencias.reduce(
    (s, c) => s + c.eventos.filter((e) => e.tipo === "refinanciamento").length,
    0,
  );

  let streakPressao = 0;
  let maxStreak = 0;
  for (const c of competencias) {
    if (c.nivel_pressao === "alto" || c.nivel_pressao === "critico") {
      streakPressao += 1;
      maxStreak = Math.max(maxStreak, streakPressao);
    } else {
      streakPressao = 0;
    }
  }

  const scoreMedio =
    Math.round(
      competencias.reduce((s, c) => s + c.score_pressao_financeira, 0) / competencias.length,
    );

  return {
    ano_inicio: anoInicio,
    total_competencias: competencias.length,
    maior_comprometimento: maior
      ? { competencia: maior.competencia, percentual: maior.percentual_comprometido }
      : null,
    menor_margem_livre: menorLivre
      ? { competencia: menorLivre.competencia, valor: menorLivre.margem_consignavel_disponivel }
      : null,
    periodo_critico: periodoCritico,
    quantidade_refin: refinTotal,
    bancos_dominantes: bancosDominantes,
    contratos_ativos_vigentes: ult?.contratos_ativos.length ?? 0,
    score_medio_pressao: scoreMedio,
    meses_sufocamento: competencias.filter((c) => c.percentual_comprometido >= 85).length,
  };
}

function insightsGlobais(
  competencias: MargemHistoricaCompetencia[],
  resumo: ResumoMargemHistoricaAvancada,
): string[] {
  const out: string[] = [];
  if (resumo.periodo_critico) {
    out.push(
      `Período crítico identificado de ${resumo.periodo_critico.inicio} a ${resumo.periodo_critico.fim} (${resumo.periodo_critico.meses} meses).`,
    );
  }

  let streak = 0;
  let maxStreak = 0;
  for (const c of competencias) {
    if (c.nivel_pressao === "alto" || c.nivel_pressao === "critico") {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else streak = 0;
  }
  if (maxStreak >= 6) {
    out.push(`Foi detectada pressão financeira persistente por ${maxStreak} meses consecutivos.`);
  }

  if (resumo.quantidade_refin >= 2) {
    out.push("Há indícios estruturais de refinanciamentos sucessivos ao longo da série.");
  }

  if (resumo.meses_sufocamento >= 3) {
    out.push(
      `${resumo.meses_sufocamento} competência(s) com margem acima de 85% — padrão de sufocamento financeiro.`,
    );
  }

  const fracionados = competencias.filter((c) =>
    c.eventos.some((e) => e.tipo === "desconto_fracionado"),
  ).length;
  if (fracionados >= 2) {
    out.push("Fragmentação operacional de descontos recorrente na série histórica.");
  }

  return out;
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export function calcularMargemHistoricaAvancada(
  input: EntradaCalcularMargemHistoricaAvancada,
): PacoteMargemHistoricaAvancada {
  const anoInicio = input.anoInicio ?? ANO_INICIO_MARGEM_HISTORICA;
  const chunkSize = input.chunkSize ?? CHUNK_DEFAULT;
  const contratos = input.contratos ?? [];
  const historico = input.historicoEventos ?? [];

  const indexOficial = indexarMargensOficiais(input.margensConsigfacil ?? []);
  const daFolha = calcularMargemHistoricaDesdeFolha(input.payslips, { anoInicio });

  const porChave = new Map<string, MargemHistoricaDetalhe>();
  for (const linha of daFolha) {
    const chave = `${linha.competencia}__${linha.tipo_margem}`;
    const oficial = indexOficial.get(chave);
    porChave.set(chave, mesclarDetalheComOficial(linha, oficial));
    if (oficial) indexOficial.delete(chave);
  }

  const detalhes = Array.from(porChave.values()).sort((a, b) =>
    a.competencia === b.competencia
      ? a.tipo_margem.localeCompare(b.tipo_margem)
      : a.competencia.localeCompare(b.competencia),
  );

  const porCompDetalhe = detalhesPorCompetencia(detalhes);
  const competenciasOrdem = [...porCompDetalhe.keys()].sort((a, b) => a.localeCompare(b));

  const folhas = filtrarPayslipsAnaliseSemAdiantamentoParcial130(input.payslips)
    .filter((p) => payslipContribuiHistoricoRubricas(p));
  const payslipPorComp = new Map<string, Payslip>();
  for (const p of folhas) {
    payslipPorComp.set(competenciaDePayslip(p), p);
  }

  const contratoPorId = new Map(contratos.map((c) => [c.id_consignacao, c]));
  const refinPorComp = new Map<string, ConsigfacilRefinanciamento[]>();
  for (const r of input.refinanciamentos ?? []) {
    const dest = contratoPorId.get(r.contrato_destino);
    const comp = dest?.competencia?.slice(0, 7) ?? dest?.data_contrato?.slice(0, 7);
    if (!comp) continue;
    const arr = refinPorComp.get(comp) ?? [];
    arr.push(r);
    refinPorComp.set(comp, arr);
  }

  const fracionadosPorComp = new Map<string, DescontoFracionadoConciliado[]>();
  for (const f of input.descontosFracionados ?? []) {
    const arr = fracionadosPorComp.get(f.competencia) ?? [];
    arr.push(f);
    fracionadosPorComp.set(f.competencia, arr);
  }

  const basesConsignavel =
    input.basesConsignavelReal ??
    montarBasesConsignavelRealPorPayslips({
      payslips: input.payslips,
      resumoMargemMensal: input.resumoMargemMensal,
    });
  const basesPorComp = new Map(basesConsignavel.map((b) => [b.competencia, b]));

  const ctx = {
    porCompDetalhe,
    payslipPorComp,
    basesPorComp,
    contratos,
    refinPorComp,
    fracionadosPorComp,
    historico,
  };

  const competencias: MargemHistoricaCompetencia[] = [];
  for (let i = 0; i < competenciasOrdem.length; i += chunkSize) {
    const chunk = competenciasOrdem.slice(i, i + chunkSize);
    competencias.push(...processarChunkCompetencias(chunk, ctx));
  }

  const resumo = montarResumo(competencias, anoInicio);
  const sufocamento = detectarSufocamentoMargem(competencias);
  const ciclos = detectarCicloEndividamento(competencias);

  const ultComp = competencias[competencias.length - 1]?.competencia ?? "";
  const projecoes = ultComp
    ? projetarLiberacaoMargem({ contratos, competenciaReferencia: ultComp })
    : [];

  const ult = competencias[competencias.length - 1];
  const simulacoes = ult
    ? simularCenarioMargem({
        margem_disponivel_atual: ult.margem_consignavel_disponivel,
        margem_utilizada: ult.margem_consignavel_utilizada,
        valor_cartao_beneficio: ult.margem_beneficio_utilizada + ult.margem_cartao_utilizada,
      })
    : [];

  const todos_eventos = competencias.flatMap((c) => c.eventos);
  const todos_alertas: AlertaMargemHistorica[] = competencias.flatMap((c) =>
    c.alertas.map((descricao) => ({
      competencia: c.competencia,
      severidade:
        c.percentual_comprometido >= 90
          ? ("critica" as const)
          : c.percentual_comprometido >= 85
            ? ("alta" as const)
            : ("media" as const),
      descricao,
    })),
  );
  const todos_insights = [
    ...insightsGlobais(competencias, resumo),
    ...competencias.flatMap((c) => c.insights),
  ];

  return {
    competencias,
    resumo,
    bases_consignavel_real: basesConsignavel,
    ciclos_endividamento: ciclos,
    sufocamento,
    projecoes,
    simulacoes,
    todos_eventos,
    todos_alertas,
    todos_insights,
  };
}

/** Versão leve para worker — só série + resumo (sem UI). */
export function calcularMargemHistoricaAvancadaResumida(
  input: EntradaCalcularMargemHistoricaAvancada,
): Pick<PacoteMargemHistoricaAvancada, "competencias" | "resumo"> {
  const full = calcularMargemHistoricaAvancada(input);
  return { competencias: full.competencias, resumo: full.resumo };
}

export function pacoteMargemHistoricaAvancadaVazio(anoInicio = ANO_INICIO_MARGEM_HISTORICA): PacoteMargemHistoricaAvancada {
  return {
    competencias: [],
    bases_consignavel_real: [],
    resumo: {
      ano_inicio: anoInicio,
      total_competencias: 0,
      maior_comprometimento: null,
      menor_margem_livre: null,
      periodo_critico: null,
      quantidade_refin: 0,
      bancos_dominantes: [],
      contratos_ativos_vigentes: 0,
      score_medio_pressao: 0,
      meses_sufocamento: 0,
    },
    ciclos_endividamento: [],
    sufocamento: [],
    projecoes: [],
    simulacoes: [],
    todos_eventos: [],
    todos_alertas: [],
    todos_insights: [],
  };
}

export function linhasExportacaoPowerBiMargemAvancada(
  pacote: PacoteMargemHistoricaAvancada,
): {
  MARGEM_HISTORICA: Array<Record<string, unknown>>;
  MARGEM_EVENTOS: Array<Record<string, unknown>>;
  MARGEM_ALERTAS: Array<Record<string, unknown>>;
  MARGEM_INSIGHTS: Array<Record<string, unknown>>;
  MARGEM_PRESSAO: Array<Record<string, unknown>>;
} {
  return {
    MARGEM_HISTORICA: pacote.competencias.map((c) => ({
      competencia: c.competencia,
      fonte: c.fonte,
      base_calculo: c.base_calculo,
      margem_consignavel_total: c.margem_consignavel_total,
      margem_consignavel_utilizada: c.margem_consignavel_utilizada,
      margem_consignavel_disponivel: c.margem_consignavel_disponivel,
      margem_cartao_total: c.margem_cartao_total,
      margem_cartao_utilizada: c.margem_cartao_utilizada,
      margem_cartao_disponivel: c.margem_cartao_disponivel,
      margem_beneficio_total: c.margem_beneficio_total,
      margem_beneficio_utilizada: c.margem_beneficio_utilizada,
      margem_beneficio_disponivel: c.margem_beneficio_disponivel,
      percentual_comprometido: c.percentual_comprometido,
      base_consignavel_calculada: c.base_consignavel_calculada,
      margem_consignavel_30_calculada: c.margem_consignavel_30_calculada,
      base_portal_inferida: c.base_portal_inferida,
      percentual_aderencia_portal: c.percentual_aderencia_portal,
      confianca_calculo_base: c.confianca_calculo_base,
      quantidade_contratos: c.quantidade_contratos,
      score_pressao_financeira: c.score_pressao_financeira,
      nivel_pressao: c.nivel_pressao,
    })),
    MARGEM_EVENTOS: pacote.todos_eventos.map((e) => ({
      competencia: e.competencia,
      tipo: e.tipo,
      severidade: e.severidade,
      descricao: e.descricao,
      banco: e.banco ?? "",
      contrato: e.contrato ?? "",
    })),
    MARGEM_ALERTAS: pacote.todos_alertas.map((a) => ({
      competencia: a.competencia,
      severidade: a.severidade,
      descricao: a.descricao,
    })),
    MARGEM_INSIGHTS: pacote.todos_insights.map((mensagem, i) => ({
      id: i + 1,
      mensagem,
    })),
    MARGEM_PRESSAO: pacote.competencias.map((c) => ({
      competencia: c.competencia,
      score_pressao_financeira: c.score_pressao_financeira,
      nivel_pressao: c.nivel_pressao,
      percentual_comprometido: c.percentual_comprometido,
      margem_disponivel: c.margem_consignavel_disponivel,
    })),
  };
}
