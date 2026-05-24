import {
  detectarCartaoSaqueEmRubricasContracheque,
  type PayslipHistoricoRubricaMin,
} from "@/lib/contracheque/detectar-cartao-saque-em-rubricas-contracheque";
import type { AnaliseCartaoSaqueContracheque, RubricaCartaoSaqueContracheque } from "@/types/cartao-saque-embutido";
import { TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE, ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE } from "@/types/cartao-saque-embutido";
import type { Payslip } from "@/types/contracheque";
import type { AlertaFinanceiroAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";

export type RubricaCartaoSaqueComPayslip = RubricaCartaoSaqueContracheque & {
  payslipId?: string;
};

export type ResumoCartaoSaqueConferencia = {
  totalComAlerta: number;
  pendentes: number;
  confirmadas: number;
  falsoPositivo: number;
  revisaoJuridica: number;
  vinculadas: number;
  ignoradas: number;
};

const STATUS_PENDENTE = new Set(["pendente_conferencia", "pendente"]);

/** Status efetivo (override local após gravar sem esperar reload). */
export function statusConferenciaCartaoSaquePayslip(
  p: Payslip,
  statusOverride?: string | null,
): string | null | undefined {
  return statusOverride ?? p.cartao_saque_status_conferencia ?? undefined;
}

/** Folha ainda na fila de conferência do painel cartão/saque. */
export function payslipCartaoSaquePendenteConferencia(
  p: Payslip,
  statusOverride?: string | null,
): boolean {
  const st = statusConferenciaCartaoSaquePayslip(p, statusOverride);
  return !st || STATUS_PENDENTE.has(st);
}

/** Análise a partir das colunas gravadas ou recálculo pelas rubricas. */
export function obterAnaliseCartaoSaqueDePayslip(
  p: Payslip,
  historico: PayslipHistoricoRubricaMin[] = [],
): AnaliseCartaoSaqueContracheque {
  const stored = p.cartao_saque_analise_json;
  const recalculada = detectarCartaoSaqueEmRubricasContracheque(
    p.items ?? [],
    { mes: p.month, ano: p.year },
    historico.filter((h) => !(h.mes === p.month && h.ano === p.year)),
  );
  if (recalculada.encontrado) return recalculada;
  if (stored && typeof stored === "object" && "versao" in stored && stored.versao === 2) {
    return stored as AnaliseCartaoSaqueContracheque;
  }
  return recalculada;
}

/** Todas as rubricas com indício, de todos os contracheques gravados. */
export function listarRubricasCartaoSaqueEmPayslips(payslips: Payslip[]): RubricaCartaoSaqueComPayslip[] {
  const historico: PayslipHistoricoRubricaMin[] = payslips.map((p) => ({
    mes: p.month,
    ano: p.year,
    items: p.items ?? [],
  }));

  const out: RubricaCartaoSaqueComPayslip[] = [];
  for (const p of payslips) {
    const analise = obterAnaliseCartaoSaqueDePayslip(p, historico);
    for (const r of analise.rubricas) {
      out.push({ ...r, payslipId: p.id });
    }
  }
  out.sort((a, b) => b.ano * 12 + b.mes - (a.ano * 12 + a.mes));
  return out;
}

/** Alertas para painel de análise financeira (não substitui alertas de empréstimo). */
export function alertasCartaoSaqueContrachequeParaAnalise(
  rubricas: RubricaCartaoSaqueComPayslip[],
): AlertaFinanceiroAnalise[] {
  if (rubricas.length === 0) return [];

  const pior = rubricas.reduce((a, b) => (rank(b.risco) > rank(a.risco) ? b : a));
  const nivel: AlertaFinanceiroAnalise["nivel"] =
    pior.risco === "alto" ? "critico" : pior.risco === "medio" ? "aviso" : "info";

  const alertas: AlertaFinanceiroAnalise[] = [
    {
      id: "cartao-saque-rubrica-contracheque",
      nivel,
      titulo: TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE,
      detalhe: `${rubricas.length} rubrica(s): ${ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE} Ex.: «${pior.nomeRubrica.slice(0, 48)}» (${String(pior.mes).padStart(2, "0")}/${pior.ano}). Pendente de conferência — não cadastrar como empréstimo comum sem revisão.`,
    },
  ];

  const recorrentes = rubricas.filter((r) => r.descontoRecorrente);
  if (recorrentes.length > 0) {
    const r0 = recorrentes[0]!;
    alertas.push({
      id: "cartao-saque-recorrente-contracheque",
      nivel: "critico",
      titulo: "Desconto recorrente (cartão/RMC/RCC)",
      detalhe: `«${r0.nomeRubrica.slice(0, 40)}» em ${r0.mesesRecorrencia} mês(es) — conferir contrato de cartão/saque, não tratar como empréstimo parcelado comum.`,
    });
  }

  return alertas;
}

function rank(r: string): number {
  if (r === "alto") return 3;
  if (r === "medio") return 2;
  return 1;
}

export function payslipTemCartaoSaqueParaExibir(p: Payslip): boolean {
  if (p.cartao_saque_embutido_detectado) return true;
  if (p.cartao_saque_status_conferencia) return true;
  const stored = p.cartao_saque_analise_json;
  if (stored && typeof stored === "object" && "encontrado" in stored && stored.encontrado) return true;
  return false;
}

export function resumoCartaoSaqueEmPayslips(payslips: Payslip[]): ResumoCartaoSaqueConferencia {
  const historico: PayslipHistoricoRubricaMin[] = payslips.map((p) => ({
    mes: p.month,
    ano: p.year,
    items: p.items ?? [],
  }));
  const comAlerta = payslips.filter(
    (p) => payslipTemCartaoSaqueParaExibir(p) || obterAnaliseCartaoSaqueDePayslip(p, historico).encontrado,
  );
  const res: ResumoCartaoSaqueConferencia = {
    totalComAlerta: comAlerta.length,
    pendentes: 0,
    confirmadas: 0,
    falsoPositivo: 0,
    revisaoJuridica: 0,
    vinculadas: 0,
    ignoradas: 0,
  };
  for (const p of comAlerta) {
    const st = p.cartao_saque_status_conferencia;
    if (!st || STATUS_PENDENTE.has(st)) res.pendentes += 1;
    else if (st === "confirmado") res.confirmadas += 1;
    else if (st === "falso_positivo") res.falsoPositivo += 1;
    else if (st === "precisa_revisao_juridica") res.revisaoJuridica += 1;
    else if (st === "contrato_localizado") res.vinculadas += 1;
    else if (st === "ignorado") res.ignoradas += 1;
  }
  return res;
}

/** @deprecated Use listarRubricasCartaoSaqueEmPayslips */
export type OcorrenciaCartaoSaqueEmbutido = {
  payslipId?: string;
  mes: number;
  ano: number;
  deteccao: { encontrado: boolean; rubricas: RubricaCartaoSaqueContracheque[] };
};

export function analisarCartaoSaqueEmbutidoEmPayslips(payslips: Payslip[]): OcorrenciaCartaoSaqueEmbutido[] {
  const historico: PayslipHistoricoRubricaMin[] = payslips.map((p) => ({
    mes: p.month,
    ano: p.year,
    items: p.items ?? [],
  }));
  const out: OcorrenciaCartaoSaqueEmbutido[] = [];
  for (const p of payslips) {
    const analise = obterAnaliseCartaoSaqueDePayslip(p, historico);
    if (!analise.encontrado) continue;
    out.push({
      payslipId: p.id,
      mes: p.month,
      ano: p.year,
      deteccao: { encontrado: true, rubricas: analise.rubricas },
    });
  }
  return out;
}

export function alertasCartaoSaqueEmbutidoParaAnalise(
  ocorrencias: OcorrenciaCartaoSaqueEmbutido[],
): AlertaFinanceiroAnalise[] {
  const rubricas: RubricaCartaoSaqueComPayslip[] = ocorrencias.flatMap((o) =>
    o.deteccao.rubricas.map((r) => ({ ...r, payslipId: o.payslipId })),
  );
  return alertasCartaoSaqueContrachequeParaAnalise(rubricas);
}
