/**
 * Base consignável real — NÃO é salário líquido bancário.
 *
 * base_consignavel =
 *   proventos_elegiveis
 *   − IR − previdência (Amazon Prev) − pensão/manutenção − outros obrigatórios
 *
 * ConsigFácil vigente calibra a competência atual; a folha reconstrói o histórico.
 */

import type { Payslip } from "@/types/contracheque";
import type { ConsigfacilResumoMensalMargem } from "@/types/consigfacil";
import { payslipContribuiHistoricoRubricas } from "@/lib/anexos/payslip-desconto-historico";
import {
  rubricaEhAmazonPrevFppm,
  rubricaEhImpostoRendaOuIrrf,
  rubricaEhPensaoAlimenticia,
  rubricaPareceConsignadoEmprestimo,
} from "@/lib/anexos/payslip-desconto-historico";
import { rubricaPareceCartaoBeneficio, rubricaPareceCartaoCreditoConsignado } from "./calcular-margem-desde-folha";
import { filtrarPayslipsAnaliseSemAdiantamentoParcial130 } from "@/lib/anexos/decimo-terceiro-coerencia";

export const PCT_MARGEM_CONSIGNAVEL = 0.3;
export const PCT_MARGEM_CARTAO = 0.05;
export const PCT_MARGEM_CARTAO_BENEFICIO = 0.05;

export type TipoClassificacaoRubricaBase =
  | "provento_elegivel"
  | "provento_excluido"
  | "desconto_obrigatorio"
  | "desconto_consignavel"
  | "neutro";

export interface RubricaFolhaBaseConsignavel {
  codigo?: string | null;
  descricao: string;
  valor: number;
  tipo?: "vantagem" | "desconto" | string | null;
}

export interface SnapshotConsigfacilBase {
  margem_consignavel_total?: number | null;
  margem_cartao_total?: number | null;
  margem_cartao_beneficio_total?: number | null;
}

export interface BaseConsignavelReal {
  competencia: string;
  total_ganhos_bruto: number;
  proventos_elegiveis: number;
  proventos_excluidos: number;
  desconto_ir: number;
  desconto_previdencia: number;
  desconto_pensao: number;
  outros_descontos_obrigatorios: number;
  base_consignavel_calculada: number;
  margem_consignavel_30: number;
  margem_cartao_5: number;
  margem_cartao_beneficio_5: number;
  base_portal_inferida: number | null;
  diferenca_base_portal: number | null;
  percentual_aderencia_portal: number | null;
  fonte: "folha" | "portal" | "hibrido_calibrado";
  rubricas_incluidas: string[];
  rubricas_excluidas: string[];
  rubricas_obrigatorias_abatidas: string[];
  confianca_calculo: "alta" | "media" | "baixa";
  observacoes: string[];
}

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function rotuloRubrica(r: RubricaFolhaBaseConsignavel): string {
  const cod = r.codigo?.trim();
  const desc = (r.descricao ?? "").trim().slice(0, 48);
  return cod ? `${cod} ${desc}` : desc;
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

const RE_PROVENTO_ELEGIVEL = [
  /\bSOLDO\b/,
  /\bGRATIF\.?\s*DE\s*TROPA\b/,
  /\bGRATIF\.?\s*DE\s*CURSO\b/,
  /\bGRAT\.?\s*MOT\b/,
  /\bGRATIFICACAO\s+DE\s+TROPA\b/,
  /\bGRATIFICACAO\s+DE\s+CURSO\b/,
  /\bDIF\.?\s*DE\s*REAJ\.?\s*SAL/i,
  /\bDIF\.?\s*REAJ\.?\s*SAL/i,
  /\bREAJ\.?\s*SALARIAL\b/,
  /\bVENCIMENTO\b/,
  /\bSUBSIDIO\b/,
  /\bADICIONAL\s+PERMANENTE\b/,
];

const RE_PROVENTO_EXCLUIDO = [
  /\bETAPAS\b/,
  /\bSERV\.?\s*EXTRA\b/,
  /\bEXTRA\s*GRAT/i,
  /\bFERIAS\b/,
  /\b13\.?\s*SAL/i,
  /\bDECIMO\s+TERCEIRO\b/,
  /\bABONO\b/,
  /\bINDENIZ/i,
  /\bDIARIA\b/,
  /\bDIÁRIA\b/,
  /\bRETROATIVO\s+EVENTUAL\b/,
  /\bDIFERENCA\s+EVENTUAL\b/,
  /\bDIF\.?\s*EVENTUAL\b/,
  /\bAUXILIO\b/,
  /\bAUXÍLIO\b/,
  /\bAJUDA\s+DE\s+CUSTO\b/,
  /\bREEMBOLSO\b/,
  /\bBOLSA\b/,
];

const RE_OUTRO_OBRIGATORIO = [
  /\bFUNDO\s+PREVIDENCIARIO\b/,
  /\bFUNDO\s+PREVID\b/,
  /\bDECISAO\s+JUDICIAL\b/,
  /\bPENSAO\s+JUDICIAL\b/,
  /\bCONTRIB\s+PREV\b/,
];

export function classificarRubricaParaBaseConsignavel(rubrica: RubricaFolhaBaseConsignavel): {
  tipo: TipoClassificacaoRubricaBase;
  motivo: string;
} {
  const desc = rubrica.descricao ?? "";
  const texto = normalizarTexto(desc);
  const tipoLinha = (rubrica.tipo ?? "").toLowerCase();
  const valor = Math.abs(rubrica.valor);

  if (valor <= 0) {
    return { tipo: "neutro", motivo: "Valor zero." };
  }

  if (tipoLinha === "vantagem" || tipoLinha === "receita") {
    for (const re of RE_PROVENTO_EXCLUIDO) {
      if (re.test(texto)) {
        return { tipo: "provento_excluido", motivo: `Verba não elegível: ${desc}` };
      }
    }
    for (const re of RE_PROVENTO_ELEGIVEL) {
      if (re.test(texto)) {
        return { tipo: "provento_elegivel", motivo: `Provento elegível: ${desc}` };
      }
    }
    if (/\bGRATIF/i.test(texto) && !/\bEXTRA\b/i.test(texto)) {
      return { tipo: "provento_elegivel", motivo: `Gratificação recorrente: ${desc}` };
    }
    if (/\bDIF\.?\s*REAJ/i.test(texto) && !/\b13\b/i.test(texto)) {
      return { tipo: "provento_elegivel", motivo: `Diferença de reajuste salarial: ${desc}` };
    }
    return { tipo: "provento_elegivel", motivo: `Vantagem incluída por padrão: ${desc}` };
  }

  if (tipoLinha === "desconto" || tipoLinha === "emprestimo" || tipoLinha === "cartao") {
    if (rubricaEhImpostoRendaOuIrrf(desc)) {
      return { tipo: "desconto_obrigatorio", motivo: "Imposto de renda." };
    }
    if (rubricaEhAmazonPrevFppm(desc)) {
      return { tipo: "desconto_obrigatorio", motivo: "Amazon Prev / previdência." };
    }
    if (rubricaEhPensaoAlimenticia(desc)) {
      return { tipo: "desconto_obrigatorio", motivo: "Pensão / manutenção familiar." };
    }
    for (const re of RE_OUTRO_OBRIGATORIO) {
      if (re.test(texto)) {
        return { tipo: "desconto_obrigatorio", motivo: `Desconto obrigatório: ${desc}` };
      }
    }
    if (
      rubricaPareceConsignadoEmprestimo(desc, { code: rubrica.codigo ?? undefined }) ||
      rubricaPareceCartaoCreditoConsignado({
        type: "desconto",
        value: valor,
        description: desc,
      } as import("@/types/contracheque").PayslipItem) ||
      rubricaPareceCartaoBeneficio({
        type: "desconto",
        value: valor,
        description: desc,
      } as import("@/types/contracheque").PayslipItem)
    ) {
      return { tipo: "desconto_consignavel", motivo: "Desconto consignável (não reduz base)." };
    }
    if (/\bENERGIA\b|\bELET\b|\bAGUA\b|\bCEB\b|\bAMAZONAS\s*ENERG/i.test(texto)) {
      return { tipo: "neutro", motivo: "Conta de consumo — fora da base." };
    }
    return { tipo: "neutro", motivo: "Desconto não classificado na base." };
  }

  return { tipo: "neutro", motivo: "Linha neutra." };
}

function pctDiferenca(a: number, b: number): number {
  if (b <= 0) return a <= 0 ? 0 : 100;
  return Math.abs((a - b) / b) * 100;
}

function calibrarComPortal(
  baseCalculada: number,
  snapshot: SnapshotConsigfacilBase | null | undefined,
  usarCalibracao: boolean,
): Pick<
  BaseConsignavelReal,
  | "base_portal_inferida"
  | "diferenca_base_portal"
  | "percentual_aderencia_portal"
  | "fonte"
  | "confianca_calculo"
  | "observacoes"
> {
  const observacoes: string[] = [];
  const margemPortal = snapshot?.margem_consignavel_total;
  if (!usarCalibracao || margemPortal == null || margemPortal <= 0) {
    return {
      base_portal_inferida: null,
      diferenca_base_portal: null,
      percentual_aderencia_portal: null,
      fonte: "folha",
      confianca_calculo: "media",
      observacoes: [
        "Base calculada apenas pela folha (sem snapshot ConsigFácil para calibração nesta competência).",
      ],
    };
  }

  const basePortal = arredondar(margemPortal / PCT_MARGEM_CONSIGNAVEL);
  const diff = arredondar(baseCalculada - basePortal);
  const pctDiff = arredondar(pctDiferenca(baseCalculada, basePortal));
  const aderencia = arredondar(Math.max(0, 100 - pctDiff));

  let fonte: BaseConsignavelReal["fonte"] = "folha";
  let confianca: BaseConsignavelReal["confianca_calculo"] = "baixa";

  if (pctDiff <= 2) {
    fonte = "hibrido_calibrado";
    confianca = "alta";
    observacoes.push("Base da folha alinhada à base inferida pelo ConsigFácil (≤2%).");
  } else if (pctDiff <= 8) {
    fonte = "hibrido_calibrado";
    confianca = "media";
    observacoes.push(
      "Base calculada próxima da base inferida pelo ConsigFácil; revisar rubricas eventuais.",
    );
  } else {
    confianca = "baixa";
    observacoes.push(
      "Base calculada difere da base inferida pelo ConsigFácil; provável rubrica excluída/incluída incorretamente.",
    );
  }

  observacoes.push(
    `ConsigFácil: margem consignável portal ${margemPortal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} → base inferida ${basePortal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
  );

  return {
    base_portal_inferida: basePortal,
    diferenca_base_portal: diff,
    percentual_aderencia_portal: aderencia,
    fonte,
    confianca_calculo: confianca,
    observacoes,
  };
}

export function calcularBaseConsignavelReal(input: {
  competencia: string;
  rubricasFolha: RubricaFolhaBaseConsignavel[];
  snapshotConsigfacil?: SnapshotConsigfacilBase | null;
  usarCalibracaoPortal?: boolean;
}): BaseConsignavelReal {
  const comp = input.competencia.slice(0, 7);
  const usarCalibracao = input.usarCalibracaoPortal !== false;

  let total_ganhos_bruto = 0;
  let proventos_elegiveis = 0;
  let proventos_excluidos = 0;
  let desconto_ir = 0;
  let desconto_previdencia = 0;
  let desconto_pensao = 0;
  let outros_descontos_obrigatorios = 0;

  const rubricas_incluidas: string[] = [];
  const rubricas_excluidas: string[] = [];
  const rubricas_obrigatorias_abatidas: string[] = [];

  for (const r of input.rubricasFolha) {
    const cls = classificarRubricaParaBaseConsignavel(r);
    const v = arredondar(Math.abs(r.valor));
    const rotulo = rotuloRubrica(r);

    if (r.tipo === "vantagem" || r.tipo === "receita") {
      total_ganhos_bruto += v;
    }

    switch (cls.tipo) {
      case "provento_elegivel":
        proventos_elegiveis += v;
        rubricas_incluidas.push(rotulo);
        break;
      case "provento_excluido":
        proventos_excluidos += v;
        rubricas_excluidas.push(rotulo);
        break;
      case "desconto_obrigatorio":
        if (rubricaEhImpostoRendaOuIrrf(r.descricao)) {
          desconto_ir += v;
        } else if (rubricaEhAmazonPrevFppm(r.descricao)) {
          desconto_previdencia += v;
        } else if (rubricaEhPensaoAlimenticia(r.descricao)) {
          desconto_pensao += v;
        } else {
          outros_descontos_obrigatorios += v;
        }
        rubricas_obrigatorias_abatidas.push(rotulo);
        break;
      default:
        break;
    }
  }

  const obrigatorios =
    desconto_ir + desconto_previdencia + desconto_pensao + outros_descontos_obrigatorios;
  const base_consignavel_calculada = arredondar(Math.max(0, proventos_elegiveis - obrigatorios));

  const margem_consignavel_30 = arredondar(base_consignavel_calculada * PCT_MARGEM_CONSIGNAVEL);
  const margem_cartao_5 = arredondar(base_consignavel_calculada * PCT_MARGEM_CARTAO);
  const margem_cartao_beneficio_5 = arredondar(
    base_consignavel_calculada * PCT_MARGEM_CARTAO_BENEFICIO,
  );

  const calibracao = calibrarComPortal(
    base_consignavel_calculada,
    input.snapshotConsigfacil,
    usarCalibracao,
  );

  const observacoes = [
    "Esta base não é o salário líquido. É a base consignável estimada conforme rubricas elegíveis, descontos obrigatórios e calibração pelo ConsigFácil.",
    ...calibracao.observacoes,
  ];

  if (desconto_pensao > 0) {
    observacoes.push(
      `Pensão/manutenção familiar (${desconto_pensao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) abatida antes dos 30%.`,
    );
  }

  return {
    competencia: comp,
    total_ganhos_bruto: arredondar(total_ganhos_bruto),
    proventos_elegiveis: arredondar(proventos_elegiveis),
    proventos_excluidos: arredondar(proventos_excluidos),
    desconto_ir: arredondar(desconto_ir),
    desconto_previdencia: arredondar(desconto_previdencia),
    desconto_pensao: arredondar(desconto_pensao),
    outros_descontos_obrigatorios: arredondar(outros_descontos_obrigatorios),
    base_consignavel_calculada,
    margem_consignavel_30,
    margem_cartao_5,
    margem_cartao_beneficio_5,
    base_portal_inferida: calibracao.base_portal_inferida,
    diferenca_base_portal: calibracao.diferenca_base_portal,
    percentual_aderencia_portal: calibracao.percentual_aderencia_portal,
    fonte: calibracao.fonte,
    rubricas_incluidas,
    rubricas_excluidas,
    rubricas_obrigatorias_abatidas,
    confianca_calculo: calibracao.confianca_calculo,
    observacoes,
  };
}

export function rubricasFolhaDePayslip(p: Payslip): RubricaFolhaBaseConsignavel[] {
  return (p.items ?? []).map((it) => ({
    codigo: it.code ?? null,
    descricao: it.description,
    valor: it.value,
    tipo: it.type,
  }));
}

export function snapshotConsigfacilDeResumo(
  r: ConsigfacilResumoMensalMargem | null | undefined,
): SnapshotConsigfacilBase | null {
  if (!r) return null;
  return {
    margem_consignavel_total: r.margem_consignavel_total,
    margem_cartao_total: r.margem_cartao_total,
    margem_cartao_beneficio_total: r.margem_cartao_beneficio_total,
  };
}

function competenciaDePayslip(p: Payslip): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

/** Bases por competência a partir de contracheques + resumo portal. */
export function montarBasesConsignavelRealPorPayslips(input: {
  payslips: Payslip[];
  resumoMargemMensal?: ConsigfacilResumoMensalMargem[];
  usarCalibracaoPortal?: boolean;
}): BaseConsignavelReal[] {
  const resumoPorComp = new Map(
    (input.resumoMargemMensal ?? []).map((r) => [r.competencia.slice(0, 7), r]),
  );

  const folhas = filtrarPayslipsAnaliseSemAdiantamentoParcial130(input.payslips).filter((p) =>
    payslipContribuiHistoricoRubricas(p),
  );

  const porComp = new Map<string, Payslip>();
  for (const p of folhas) {
    const c = competenciaDePayslip(p);
    const prev = porComp.get(c);
    if (!prev || p.folha_emit_kind === "mensal_principal") {
      porComp.set(c, p);
    }
  }

  const comps = new Set([...porComp.keys(), ...resumoPorComp.keys()]);
  const out: BaseConsignavelReal[] = [];

  for (const comp of [...comps].sort()) {
    const p = porComp.get(comp);
    const rubricas = p ? rubricasFolhaDePayslip(p) : [];
    const snap = snapshotConsigfacilDeResumo(resumoPorComp.get(comp));

    out.push(
      calcularBaseConsignavelReal({
        competencia: comp,
        rubricasFolha: rubricas,
        snapshotConsigfacil: snap,
        usarCalibracaoPortal: input.usarCalibracaoPortal,
      }),
    );
  }

  return out;
}

export function baseConsignavelVigente(
  bases: BaseConsignavelReal[],
): BaseConsignavelReal | null {
  if (bases.length === 0) return null;
  return [...bases].sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
}

export function linhasExportacaoBaseConsignavelReal(
  bases: BaseConsignavelReal[],
): Array<Record<string, unknown>> {
  return bases.map((b) => ({
    competencia: b.competencia,
    total_ganhos_bruto: b.total_ganhos_bruto,
    proventos_elegiveis: b.proventos_elegiveis,
    proventos_excluidos: b.proventos_excluidos,
    desconto_ir: b.desconto_ir,
    desconto_previdencia: b.desconto_previdencia,
    desconto_pensao: b.desconto_pensao,
    outros_descontos_obrigatorios: b.outros_descontos_obrigatorios,
    base_consignavel_calculada: b.base_consignavel_calculada,
    margem_consignavel_30: b.margem_consignavel_30,
    margem_cartao_5: b.margem_cartao_5,
    margem_cartao_beneficio_5: b.margem_cartao_beneficio_5,
    base_portal_inferida: b.base_portal_inferida,
    diferenca_base_portal: b.diferenca_base_portal,
    percentual_aderencia_portal: b.percentual_aderencia_portal,
    fonte: b.fonte,
    confianca_calculo: b.confianca_calculo,
    rubricas_incluidas: b.rubricas_incluidas.join(" | "),
    rubricas_excluidas: b.rubricas_excluidas.join(" | "),
    rubricas_obrigatorias_abatidas: b.rubricas_obrigatorias_abatidas.join(" | "),
  }));
}
