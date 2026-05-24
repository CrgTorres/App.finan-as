/**
 * Estima margem consignável / cartão / cartão benefício mês a mês a partir do contracheque.
 *
 * Base AM (heurística alinhada ao portal ConsigFácil):
 *   base = proventos − IR − Amazon Prev − pensão alimentícia
 *   margem consignável total ≈ 30% da base
 *   margem cartão ≈ 5% da base
 *   margem cartão benefício ≈ 5% da base
 *
 * Quando há snapshot ConsigFácil na competência, o merge oficial prevalece
 * (ver `margem-historica-unificada.ts`).
 */

import type { Payslip, PayslipItem } from "@/types/contracheque";
import type { BaseMargemConsignavel } from "@/types/consigfacil";
import {
  descontoClassificadoComoEmprestimoNaFolha,
  rubricaEhAmazonPrevFppm,
  rubricaEhImpostoRendaOuIrrf,
  rubricaEhPensaoAlimenticia,
} from "@/lib/anexos/payslip-desconto-historico";
import { filtrarPayslipsAnaliseSemAdiantamentoParcial130 } from "@/lib/anexos/decimo-terceiro-coerencia";
import { payslipContribuiHistoricoRubricas } from "@/lib/anexos/payslip-desconto-historico";
import type { MargemHistorica, OrigemMargemHistorica, TipoMargemHistorica } from "./margem-historica-unificada";

export const ANO_INICIO_MARGEM_HISTORICA = 2012;

/** Percentuais usados na estimativa pela folha (Lei 10.820 / prática ConsigFácil AM). */
export const PCT_MARGEM_CONSIGNAVEL_FOLHA = 0.3;
export const PCT_MARGEM_CARTAO_FOLHA = 0.05;
export const PCT_MARGEM_CARTAO_BENEFICIO_FOLHA = 0.05;

export type ComponentesBaseMargemFolha = {
  proventos: number;
  imposto_renda: number;
  previdencia_amazonprev: number;
  pensao_alimenticia: number;
  base_remuneracao: number;
  desconto_emprestimo_consignado: number;
  desconto_cartao_beneficio: number;
  desconto_cartao_credito: number;
};

export type MargemHistoricaDetalhe = MargemHistorica & {
  base_remuneracao: number | null;
  componentes: ComponentesBaseMargemFolha | null;
  /** Quando havia dado oficial na mesma competência (auditoria). */
  oficial_consigfacil?: {
    margem_total: number;
    margem_utilizada: number;
    delta_total: number;
  } | null;
  observacao?: string | null;
};

function competenciaDePayslip(p: Payslip): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctComprometido(utilizada: number, total: number): number {
  if (total <= 0) return utilizada > 0 ? 100 : 0;
  return Math.min(100, Math.round((utilizada / total) * 1000) / 10);
}

export function rubricaPareceCartaoBeneficio(it: PayslipItem): boolean {
  if (it.type !== "desconto" || it.value <= 0) return false;
  const n = it.description.toLowerCase();
  if (/cred\s*cesta|credicesta|cred\s*cesta\s*card/i.test(n)) return true;
  if (/cart[aã]o\s*benef|beneficio\s*compra|cb\s*compra|cart\s*benef/i.test(n)) return true;
  if (/rmc|rcc|reserva\s+(de\s+)?margem|reserva\s+cart/i.test(n)) return false;
  const a = it.parcelaAtual;
  const b = it.parcelaTotal;
  if (a === 1 && b === 1 && /compra|cart[aã]o/i.test(n)) return true;
  return false;
}

export function rubricaPareceCartaoCreditoConsignado(it: PayslipItem): boolean {
  if (it.type !== "desconto" || it.value <= 0) return false;
  if (rubricaPareceCartaoBeneficio(it)) return false;
  const n = it.description.toLowerCase();
  return /\brmc\b|\brcc\b|cart[aã]o\s+(de\s+)?cr[eé]dito|cart[aã]o\s+consign/i.test(n);
}

function somarProventos(items: PayslipItem[]): number {
  let s = 0;
  for (const it of items) {
    if (it.type === "vantagem" && it.value > 0) s += it.value;
  }
  return arredondar(s);
}

export function extrairComponentesMargemFolha(p: Payslip): ComponentesBaseMargemFolha {
  const items = p.items ?? [];
  let proventos = somarProventos(items);
  if (proventos <= 0 && (p.gross_salary ?? 0) > 0) {
    proventos = arredondar(Number(p.gross_salary));
  }

  let ir = 0;
  let prev = 0;
  let pensao = 0;
  let descontoEmprestimo = 0;
  let descontoCartaoBenef = 0;
  let descontoCartaoCred = 0;

  for (const it of items) {
    if (it.type !== "desconto" || it.value <= 0) continue;
    if (rubricaEhImpostoRendaOuIrrf(it.description)) {
      ir += it.value;
      continue;
    }
    if (rubricaEhAmazonPrevFppm(it.description)) {
      prev += it.value;
      continue;
    }
    if (rubricaEhPensaoAlimenticia(it.description)) {
      pensao += it.value;
      continue;
    }
    if (rubricaPareceCartaoBeneficio(it)) {
      descontoCartaoBenef += it.value;
      continue;
    }
    if (rubricaPareceCartaoCreditoConsignado(it)) {
      descontoCartaoCred += it.value;
      continue;
    }
    if (descontoClassificadoComoEmprestimoNaFolha(it)) {
      descontoEmprestimo += it.value;
    }
  }

  const base = Math.max(0, proventos - ir - prev - pensao);

  return {
    proventos: arredondar(proventos),
    imposto_renda: arredondar(ir),
    previdencia_amazonprev: arredondar(prev),
    pensao_alimenticia: arredondar(pensao),
    base_remuneracao: arredondar(base),
    desconto_emprestimo_consignado: arredondar(descontoEmprestimo),
    desconto_cartao_beneficio: arredondar(descontoCartaoBenef),
    desconto_cartao_credito: arredondar(descontoCartaoCred),
  };
}

function linhaMargemDeFolha(
  competencia: string,
  tipo: TipoMargemHistorica,
  pctLimite: number,
  utilizada: number,
  componentes: ComponentesBaseMargemFolha,
): MargemHistoricaDetalhe {
  const total = arredondar(componentes.base_remuneracao * pctLimite);
  const disp = arredondar(Math.max(0, total - utilizada));
  return {
    competencia,
    tipo_margem: tipo,
    margem_total: total,
    margem_utilizada: utilizada,
    margem_disponivel: disp,
    percentual_comprometido: pctComprometido(utilizada, total),
    origem: "extrapolacao_descontos",
    base_remuneracao: componentes.base_remuneracao,
    componentes,
    oficial_consigfacil: null,
    observacao:
      total <= 0
        ? "Base de remuneração zerada ou folha sem proventos — revisar OCR/importação."
        : null,
  };
}

/** Uma competência × até 3 tipos de margem estimados pela folha. */
export function calcularMargemHistoricaDesdeFolha(
  payslips: Payslip[],
  opts?: { anoInicio?: number },
): MargemHistoricaDetalhe[] {
  const anoInicio = opts?.anoInicio ?? ANO_INICIO_MARGEM_HISTORICA;
  const folhas = filtrarPayslipsAnaliseSemAdiantamentoParcial130(payslips)
    .filter((p) => payslipContribuiHistoricoRubricas(p))
    .filter((p) => p.year > anoInicio || (p.year === anoInicio && p.month >= 1));

  const porComp = new Map<string, Payslip>();
  for (const p of folhas) {
    const c = competenciaDePayslip(p);
    const prev = porComp.get(c);
    if (!prev) {
      porComp.set(c, p);
      continue;
    }
    const emitAtual = String(p.folha_emit_kind ?? "");
    if (emitAtual === "mensal_principal" && prev.folha_emit_kind !== "mensal_principal") {
      porComp.set(c, p);
    }
  }

  const out: MargemHistoricaDetalhe[] = [];
  for (const p of porComp.values()) {
    const comp = competenciaDePayslip(p);
    const compBase = extrairComponentesMargemFolha(p);
    if (compBase.base_remuneracao <= 0 && compBase.proventos <= 0) continue;

    out.push(
      linhaMargemDeFolha(
        comp,
        "consignavel",
        PCT_MARGEM_CONSIGNAVEL_FOLHA,
        compBase.desconto_emprestimo_consignado,
        compBase,
      ),
      linhaMargemDeFolha(
        comp,
        "cartao",
        PCT_MARGEM_CARTAO_FOLHA,
        compBase.desconto_cartao_credito,
        compBase,
      ),
      linhaMargemDeFolha(
        comp,
        "cartao_beneficio",
        PCT_MARGEM_CARTAO_BENEFICIO_FOLHA,
        compBase.desconto_cartao_beneficio,
        compBase,
      ),
    );
  }

  out.sort((a, b) =>
    a.competencia === b.competencia
      ? a.tipo_margem.localeCompare(b.tipo_margem)
      : a.competencia.localeCompare(b.competencia),
  );
  return out;
}

export function indexarMargensOficiais(
  margens: BaseMargemConsignavel[],
): Map<string, BaseMargemConsignavel> {
  const map = new Map<string, BaseMargemConsignavel>();
  for (const m of margens) {
    const tipo =
      m.tipo_margem === "margem_consignavel"
        ? "consignavel"
        : m.tipo_margem === "margem_cartao"
          ? "cartao"
          : m.tipo_margem === "margem_cartao_beneficio"
            ? "cartao_beneficio"
            : null;
    if (!tipo) continue;
    map.set(`${m.competencia}__${tipo}`, m);
  }
  return map;
}

export function mesclarDetalheComOficial(
  folha: MargemHistoricaDetalhe,
  oficial: BaseMargemConsignavel | undefined,
): MargemHistoricaDetalhe {
  if (!oficial) return folha;

  const delta = arredondar(folha.margem_total - oficial.margem_total);
  const obs =
    Math.abs(delta) > 80
      ? `Estimativa folha (${folha.margem_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) difere do portal (${oficial.margem_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Use o oficial.`
      : null;

  return {
    competencia: oficial.competencia,
    tipo_margem: folha.tipo_margem,
    margem_total: oficial.margem_total,
    margem_utilizada: oficial.margem_utilizada,
    margem_disponivel: oficial.margem_disponivel,
    percentual_comprometido: oficial.percentual_comprometido,
    origem: "consigfacil_oficial" as OrigemMargemHistorica,
    base_remuneracao: folha.base_remuneracao,
    componentes: folha.componentes,
    oficial_consigfacil: {
      margem_total: oficial.margem_total,
      margem_utilizada: oficial.margem_utilizada,
      delta_total: delta,
    },
    observacao: obs,
  };
}
