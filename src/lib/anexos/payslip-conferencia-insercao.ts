/**
 * Conferência automática na inserção: totais (ganhos/despesas), coerência interna
 * e comparação com a base histórica por competência e por rubrica.
 */

import type { ParsedPayslipPayload } from "@/lib/anexos/sead-payslip-parse";
import {
  compararDescontosComHistorico,
  compararGanhosComHistorico,
  historicoDescontosPorChave,
  historicoGanhosPorChave,
  payslipContribuiHistoricoRubricas,
  type AlertaDescontoLinha,
} from "@/lib/anexos/payslip-desconto-historico";
import type { Payslip, PayslipItem } from "@/types/contracheque";

export type SeveridadeConferencia = "critico" | "aviso" | "info";

export type CategoriaConferenciaInsercao =
  | "totais_cabecalho"
  | "totais_coerencia"
  | "competencia_anterior"
  | "rubrica_ganho"
  | "rubrica_desconto";

export type AlertaConferenciaInsercao = {
  id: string;
  severidade: SeveridadeConferencia;
  categoria: CategoriaConferenciaInsercao;
  titulo: string;
  descricao: string;
};

export type TotaisRubricasFolha = {
  somaGanhos: number;
  somaDescontos: number;
  liquidoRubricas: number;
};

export type BaseCompetenciaFolha = TotaisRubricasFolha & {
  mes: number;
  ano: number;
  brutoGravado: number;
  descontosGravados: number;
  liquidoGravado: number;
  rubricas: number;
};

export type ResultadoConferenciaInsercao = {
  competencia: { mes: number; ano: number };
  totaisRubricas: TotaisRubricasFolha;
  cabecalho: { bruto: number; descontos: number; liquido: number };
  /** Quando o cabeçalho diverge das rubricas, estes totais devem ser gravados. */
  totaisCorrigidos: { bruto: number; descontos: number; liquido: number } | null;
  alertas: AlertaConferenciaInsercao[];
  alertasRubricas: AlertaDescontoLinha[];
  bloqueiaGravacao: boolean;
  mesAnterior: BaseCompetenciaFolha | null;
};

function near(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function totaisRubricasDeItems(items: PayslipItem[]): TotaisRubricasFolha {
  const somaGanhos = items
    .filter((i) => i.type === "vantagem" && i.value > 0 && !/^liquido\b/i.test(i.description.trim()))
    .reduce((s, i) => s + i.value, 0);
  const somaDescontos = items
    .filter((i) => i.type === "desconto" && i.value > 0)
    .reduce((s, i) => s + i.value, 0);
  return {
    somaGanhos: Math.round(somaGanhos * 100) / 100,
    somaDescontos: Math.round(somaDescontos * 100) / 100,
    liquidoRubricas: Math.round((somaGanhos - somaDescontos) * 100) / 100,
  };
}

function totaisDePayslip(p: Payslip): TotaisRubricasFolha {
  const items = p.items ?? [];
  const tr = totaisRubricasDeItems(items);
  if (items.length >= 4 && tr.somaGanhos > 200) {
    return tr;
  }
  const bruto = p.gross_salary ?? 0;
  const desc = p.total_discounts ?? 0;
  const liq = p.net_salary ?? Math.max(0, bruto - desc);
  return {
    somaGanhos: bruto,
    somaDescontos: desc,
    liquidoRubricas: liq,
  };
}

export function construirBaseCompetenciasFolha(payslips: Payslip[]): BaseCompetenciaFolha[] {
  const porComp = new Map<string, Payslip>();
  for (const p of payslips) {
    if (!payslipContribuiHistoricoRubricas(p)) continue;
    const k = `${p.year}-${String(p.month).padStart(2, "0")}`;
    const prev = porComp.get(k);
    if (!prev || (p.items?.length ?? 0) >= (prev.items?.length ?? 0)) {
      porComp.set(k, p);
    }
  }
  return [...porComp.values()]
    .map((p) => {
      const t = totaisDePayslip(p);
      return {
        mes: p.month,
        ano: p.year,
        ...t,
        brutoGravado: p.gross_salary ?? t.somaGanhos,
        descontosGravados: p.total_discounts ?? t.somaDescontos,
        liquidoGravado: p.net_salary ?? t.liquidoRubricas,
        rubricas: p.items?.length ?? 0,
      };
    })
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

export function competenciaAnterior(
  mes: number,
  ano: number,
): { mes: number; ano: number } {
  if (mes <= 1) return { mes: 12, ano: ano - 1 };
  return { mes: mes - 1, ano };
}

function pctDelta(atual: number, ref: number): number | null {
  if (ref <= 0) return null;
  return ((atual - ref) / ref) * 100;
}

function alertaRubricasParaConferencia(
  descontos: ReturnType<typeof compararDescontosComHistorico>,
  ganhos: ReturnType<typeof compararGanhosComHistorico>,
): { alertas: AlertaConferenciaInsercao[]; rubricas: AlertaDescontoLinha[]; bloqueia: boolean } {
  const out: AlertaConferenciaInsercao[] = [];
  const rubricas = [...descontos.alertas, ...ganhos.alertas];
  for (const a of descontos.alertas) {
    out.push({
      id: `rub-d-${a.idx}-${a.chave}`,
      severidade: a.nivel === "desvio" ? "critico" : "aviso",
      categoria: "rubrica_desconto",
      titulo: `Desconto: ${a.rubrica.slice(0, 42)}`,
      descricao: a.mensagem,
    });
  }
  for (const a of ganhos.alertas) {
    out.push({
      id: `rub-g-${a.idx}-${a.chave}`,
      severidade: a.nivel === "desvio" ? "aviso" : "aviso",
      categoria: "rubrica_ganho",
      titulo: `Ganho: ${a.rubrica.slice(0, 42)}`,
      descricao: a.mensagem,
    });
  }
  return {
    alertas: out,
    rubricas,
    bloqueia: descontos.bloqueiaSemConfirmacao,
  };
}

/**
 * Conferência completa antes de gravar — ganhos e despesas na base histórica.
 */
export function conferirPayslipAntesInsercao(
  parsed: ParsedPayslipPayload,
  payslipsHistorico: Payslip[],
  opts: { mes: number; ano: number },
): ResultadoConferenciaInsercao {
  const alertas: AlertaConferenciaInsercao[] = [];
  let bloqueia = false;

  const items = parsed.items ?? [];
  const tr = totaisRubricasDeItems(items);
  const cab = {
    bruto: parsed.grossSalary,
    descontos: parsed.totalDiscounts,
    liquido: parsed.netSalary,
  };

  const base = construirBaseCompetenciasFolha(payslipsHistorico);
  const ant = competenciaAnterior(opts.mes, opts.ano);
  const mesAnterior =
    base.find((b) => b.mes === ant.mes && b.ano === ant.ano) ?? null;

  let totaisCorrigidos: ResultadoConferenciaInsercao["totaisCorrigidos"] = null;

  if (tr.somaGanhos > 400 && tr.somaDescontos > 100 && items.length >= 5) {
    const cabecalhoSubcontaGanhos = cab.bruto < tr.somaGanhos * 0.9;
    const cabecalhoSubcontaDesc =
      cab.descontos > 0 && cab.descontos < tr.somaDescontos * 0.9;
    const cabecalhoNaoFecha =
      cab.bruto > 0 &&
      !near(cab.bruto - cab.descontos, cab.liquido, Math.max(80, cab.bruto * 0.04));

    if (cabecalhoSubcontaGanhos || cabecalhoSubcontaDesc) {
      totaisCorrigidos = {
        bruto: tr.somaGanhos,
        descontos: tr.somaDescontos,
        liquido: tr.liquidoRubricas,
      };
      alertas.push({
        id: "cabecalho-vs-rubricas",
        severidade: "critico",
        categoria: "totais_cabecalho",
        titulo: "Cabeçalho não contabiliza todas as rubricas",
        descricao: `O OCR/cabeçalho mostra Bruto ${fmtBrl(cab.bruto)} e Líquido ${fmtBrl(cab.liquido)}, mas a soma das linhas de ganhos é ${fmtBrl(tr.somaGanhos)} e de descontos ${fmtBrl(tr.somaDescontos)} (líquido ${fmtBrl(tr.liquidoRubricas)}). Na gravação, os totais serão corrigidos automaticamente a partir das rubricas.`,
      });
      bloqueia = true;
    }

    if (
      !near(tr.liquidoRubricas, cab.liquido, Math.max(100, tr.somaGanhos * 0.05)) &&
      !cabecalhoSubcontaGanhos
    ) {
      alertas.push({
        id: "liquido-interno",
        severidade: "aviso",
        categoria: "totais_coerencia",
        titulo: "Líquido do cabeçalho vs rubricas",
        descricao: `Cabeçalho líquido ${fmtBrl(cab.liquido)}; ganhos − descontos nas linhas = ${fmtBrl(tr.liquidoRubricas)}.`,
      });
    }
  }

  if (mesAnterior && tr.somaGanhos > 300) {
    const dG = pctDelta(tr.somaGanhos, mesAnterior.somaGanhos);
    const dD = pctDelta(tr.somaDescontos, mesAnterior.somaDescontos);
    const dL = pctDelta(tr.liquidoRubricas, mesAnterior.liquidoRubricas);
    if (dG != null && Math.abs(dG) > 40) {
      alertas.push({
        id: "mes-ant-ganhos",
        severidade: "aviso",
        categoria: "competencia_anterior",
        titulo: "Ganhos muito diferentes do mês anterior",
        descricao: `${fmtBrl(tr.somaGanhos)} vs ${fmtBrl(mesAnterior.somaGanhos)} em ${String(mesAnterior.mes).padStart(2, "0")}/${mesAnterior.ano} (${dG > 0 ? "+" : ""}${dG.toFixed(0)}%). Confira reajuste ou leitura incompleta.`,
      });
    }
    if (dD != null && Math.abs(dD) > 40) {
      alertas.push({
        id: "mes-ant-descontos",
        severidade: "aviso",
        categoria: "competencia_anterior",
        titulo: "Descontos muito diferentes do mês anterior",
        descricao: `${fmtBrl(tr.somaDescontos)} vs ${fmtBrl(mesAnterior.somaDescontos)} em ${String(mesAnterior.mes).padStart(2, "0")}/${mesAnterior.ano} (${dD > 0 ? "+" : ""}${dD.toFixed(0)}%).`,
      });
    }
    if (dL != null && Math.abs(dL) > 45) {
      alertas.push({
        id: "mes-ant-liquido",
        severidade: "aviso",
        categoria: "competencia_anterior",
        titulo: "Líquido muito diferente do mês anterior",
        descricao: `${fmtBrl(tr.liquidoRubricas)} vs ${fmtBrl(mesAnterior.liquidoRubricas)} (${dL > 0 ? "+" : ""}${dL.toFixed(0)}%).`,
      });
    }
  }

  const histD = historicoDescontosPorChave(payslipsHistorico, opts);
  const histG = historicoGanhosPorChave(payslipsHistorico, opts);
  const rub = alertaRubricasParaConferencia(
    compararDescontosComHistorico(items, histD),
    compararGanhosComHistorico(items, histG),
  );
  alertas.push(...rub.alertas);

  return {
    competencia: opts,
    totaisRubricas: tr,
    cabecalho: cab,
    totaisCorrigidos,
    alertas,
    alertasRubricas: rub.rubricas,
    bloqueiaGravacao: bloqueia,
    mesAnterior,
  };
}

/** Aplica totais corrigidos quando rubricas são a fonte da verdade. */
export function normalizarParsedComConferencia(
  parsed: ParsedPayslipPayload,
  conf: ResultadoConferenciaInsercao,
): ParsedPayslipPayload {
  if (!conf.totaisCorrigidos) return parsed;
  return {
    ...parsed,
    grossSalary: conf.totaisCorrigidos.bruto,
    totalDiscounts: conf.totaisCorrigidos.descontos,
    netSalary: conf.totaisCorrigidos.liquido,
    leituraPossivelmenteIncompleta: true,
  };
}

export type TotaisGravadosPayslip = {
  gross_salary: number;
  total_discounts: number;
  net_salary: number;
};

/** Indica se os totais gravados devem ser substituídos pela soma das rubricas. */
export function totaisCorrigidosDeItemsSeNecessario(
  cab: TotaisGravadosPayslip,
  items: PayslipItem[],
): TotaisRubricasFolha | null {
  const tr = totaisRubricasDeItems(items);
  if (tr.somaGanhos <= 400 || tr.somaDescontos <= 100 || items.length < 5) return null;
  const subGanhos = cab.gross_salary < tr.somaGanhos * 0.9;
  const subDesc = cab.total_discounts > 0 && cab.total_discounts < tr.somaDescontos * 0.9;
  if (!subGanhos && !subDesc) return null;
  return tr;
}

/** Varre a base gravada: competências em que o cabeçalho não reflete a soma das rubricas. */
export function auditarBaseGravadaInconsistente(payslips: Payslip[]): BaseCompetenciaFolha[] {
  const ruins: BaseCompetenciaFolha[] = [];
  for (const p of payslips) {
    if (!payslipContribuiHistoricoRubricas(p)) continue;
    const tr = totaisRubricasDeItems(p.items ?? []);
    if ((p.items?.length ?? 0) < 4 || tr.somaGanhos < 400) continue;
    const cab = {
      gross_salary: p.gross_salary ?? 0,
      total_discounts: p.total_discounts ?? 0,
      net_salary: p.net_salary ?? 0,
    };
    if (totaisCorrigidosDeItemsSeNecessario(cab, p.items ?? [])) {
      ruins.push({
        mes: p.month,
        ano: p.year,
        ...tr,
        brutoGravado: cab.gross_salary,
        descontosGravados: cab.total_discounts,
        liquidoGravado: cab.net_salary,
        rubricas: p.items?.length ?? 0,
      });
    }
  }
  return ruins;
}
