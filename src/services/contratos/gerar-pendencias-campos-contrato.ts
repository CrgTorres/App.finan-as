/**
 * Pendências de conferência quando faltam campos essenciais do contrato na extração.
 */

import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { PendenciaConferenciaContratoEmprestimo } from "@/types/analise-contrato-emprestimo";

export type CampoObrigatorioContrato = {
  id: string;
  rotulo: string;
  prioridade: PendenciaConferenciaContratoEmprestimo["prioridade"];
};

const CAMPOS_OBRIGATORIOS: {
  id: string;
  rotulo: string;
  prioridade: PendenciaConferenciaContratoEmprestimo["prioridade"];
  presente: (e: ContratoExtraido) => boolean;
}[] = [
  {
    id: "valor_liberado",
    rotulo: "Valor liberado",
    prioridade: "alta",
    presente: (e) =>
      numeroPositivo(e.valorSolicitado) ||
      numeroPositivo(e.trocoLiberado),
  },
  {
    id: "valor_financiado",
    rotulo: "Valor financiado",
    prioridade: "alta",
    presente: (e) => numeroPositivo(e.valorFinanciado),
  },
  {
    id: "quantidade_parcelas",
    rotulo: "Quantidade de parcelas",
    prioridade: "alta",
    presente: (e) => inteiroPositivo(e.parcelas),
  },
  {
    id: "valor_parcela",
    rotulo: "Valor da parcela",
    prioridade: "alta",
    presente: (e) => numeroPositivo(e.parcela),
  },
  {
    id: "cet",
    rotulo: "CET",
    prioridade: "alta",
    presente: (e) => percentualValido(e.cetAnual) || percentualValido(e.cetMensal),
  },
  {
    id: "taxa_mensal",
    rotulo: "Taxa mensal",
    prioridade: "alta",
    presente: (e) =>
      percentualValido(e.jurosMensal) || percentualValido(e.jurosEfetivoMensal),
  },
  {
    id: "taxa_anual",
    rotulo: "Taxa anual",
    prioridade: "alta",
    presente: (e) =>
      percentualValido(e.jurosAnual) || percentualValido(e.jurosEfetivoAnual),
  },
  {
    id: "iof",
    rotulo: "IOF",
    prioridade: "media",
    presente: (e) => e.iof != null && Number.isFinite(e.iof) && e.iof >= 0,
  },
  {
    id: "data_contrato",
    rotulo: "Data do contrato",
    prioridade: "media",
    presente: (e) => dataIsoValida(e.dataContratacao) || dataIsoValida(e.dataDocumento),
  },
  {
    id: "primeiro_vencimento",
    rotulo: "Primeiro vencimento",
    prioridade: "media",
    presente: (e) => dataIsoValida(e.primeiroVencimento),
  },
  {
    id: "assinatura",
    rotulo: "Assinatura",
    prioridade: "media",
    presente: (e) => dataIsoValida(e.dataAssinatura),
  },
];

function numeroPositivo(v: number | undefined): boolean {
  return v != null && Number.isFinite(v) && v > 0;
}

function inteiroPositivo(v: number | undefined): boolean {
  return v != null && Number.isInteger(v) && v > 0;
}

function percentualValido(v: number | undefined): boolean {
  return v != null && Number.isFinite(v) && v > 0;
}

function dataIsoValida(v: string | undefined): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

/** Campos obrigatórios não preenchidos na extração. */
export function listarCamposObrigatoriosContratoAusentes(
  extraido: ContratoExtraido,
): CampoObrigatorioContrato[] {
  return CAMPOS_OBRIGATORIOS.filter((c) => !c.presente(extraido)).map((c) => ({
    id: c.id,
    rotulo: c.rotulo,
    prioridade: c.prioridade,
  }));
}

/** Uma pendência por campo ausente para conferência no PDF. */
export function gerarPendenciasCamposContratoObrigatorios(
  extraido: ContratoExtraido,
): PendenciaConferenciaContratoEmprestimo[] {
  return listarCamposObrigatoriosContratoAusentes(extraido).map((c) => ({
    id: `ausente_${c.id}`,
    tipo: "campo_obrigatorio_ausente",
    descricao: `Conferir no PDF: ${c.rotulo} não foi extraído ou está incompleto.`,
    prioridade: c.prioridade,
  }));
}
