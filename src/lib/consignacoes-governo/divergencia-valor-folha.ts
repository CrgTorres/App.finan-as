/**
 * Lógica compartilhada: divergência ConsigFácil × folha (parcela vs descontos).
 * Evita pendências por linha isolada quando a soma dos descontos fecha com o oficial.
 */

import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import { linhaEhRubricaConsignavel } from "@/lib/conciliacao/regras-natureza-consignavel";
import { timelinePriorizaSobreValorIsolado } from "@/lib/conciliacao/timeline-estrutural-contrato";
import {
  detectarDescontoFracionadoPorMargem,
  linhaFolhaMesDeBaseConciliada,
} from "@/lib/contratos/detectar-desconto-fracionado-margem";
import { contratoIgnoraDivergenciaValorPorMargem } from "@/lib/contratos/detectar-contexto-operacional-margem";
import { assinaturaEstruturalContrato } from "@/lib/conciliacao/assinatura-estrutural-contrato";

export const TOLERANCIA_DIVERGENCIA_PARCELA_PCT = 0.05;

function normalizarBanco(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function bancoCompativelLinhaContrato(
  linha: BaseConciliadaLinha,
  contrato: Pick<ConsigfacilContrato, "instituicao" | "codigo_instituicao">,
): boolean {
  const a = normalizarBanco(linha.banco_origem || linha.descricao_normalizada);
  const b = normalizarBanco(contrato.instituicao);
  const oficial = resolverInstituicaoOficial(contrato.instituicao)?.nome_normalizado ?? b;
  const codigo = contrato.codigo_instituicao?.replace(/\D+/g, "") ?? "";
  if (codigo && linha.descricao_normalizada.includes(codigo)) return true;
  return a.includes(oficial) || oficial.includes(a) || a.includes(b) || b.includes(a);
}

export function linhasDescontoContratoNaCompetencia(
  contrato: Pick<ConsigfacilContrato, "instituicao" | "codigo_instituicao">,
  baseConciliada: BaseConciliadaLinha[],
  competencia: string,
): BaseConciliadaLinha[] {
  return baseConciliada.filter(
    (l) =>
      l.origem === "contracheque" &&
      l.competencia === competencia &&
      (l.natureza === "desconto" || l.natureza === "emprestimo" || l.natureza === "cartao") &&
      linhaEhRubricaConsignavel(l) &&
      bancoCompativelLinhaContrato(l, contrato),
  );
}

export function somaValoresDescontoLinhas(linhas: BaseConciliadaLinha[]): number {
  return Math.round(
    linhas.reduce((s, l) => s + Math.abs(l.valor), 0) * 100,
  ) / 100;
}

export function diffValorRelativo(a: number, b: number): number {
  if (a <= 0 || b <= 0) return Infinity;
  return Math.abs(a - b) / Math.max(a, b);
}

export function percentualDivergenciaFormatado(esperado: number, observado: number): number | null {
  const d = diffValorRelativo(esperado, observado);
  if (!Number.isFinite(d)) return null;
  return Math.round(d * 1000) / 10;
}

export function divergenciaParcelaDentroTolerancia(
  valorOficial: number,
  valorComparado: number,
  toleranciaPct = TOLERANCIA_DIVERGENCIA_PARCELA_PCT,
): boolean {
  return diffValorRelativo(valorOficial, valorComparado) <= toleranciaPct;
}

/** Extrai "7.9" de "Valor de parcela diverge em 7.9%." */
export function extrairPercentualDivergenciaDescricao(descricao: string | null | undefined): number | null {
  const m = (descricao ?? "").match(/diverge em\s+([\d,.]+)\s*%/i);
  if (!m?.[1]) return null;
  const n = Number.parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type AvaliacaoDivergenciaContratoCompetencia = {
  valorOficial: number;
  somaFolha: number;
  qtdLinhas: number;
  percentualDiferenca: number | null;
  somaFechaComOficial: boolean;
  /** Várias linhas na folha — candidato a desconto fracionado na triagem. */
  candidatoDescontoFracionado: boolean;
  desconto_fracionado_por_margem?: boolean;
  soma_descontos_mes?: number;
  linhas_compensatorias?: string;
  margem_reduzida_detectada?: boolean;
};

export function avaliarDivergenciaContratoCompetencia(
  contrato: Pick<
    ConsigfacilContrato,
    "valor_parcela" | "instituicao" | "codigo_instituicao" | "id_consignacao"
  > &
    Pick<
      Partial<ConsigfacilContrato>,
      "timeline_analise" | "classificacao_continuidade" | "contexto_margem" | "remover_da_conferencia"
    >,
  baseConciliada: BaseConciliadaLinha[],
  competencia: string,
): AvaliacaoDivergenciaContratoCompetencia {
  if (contratoIgnoraDivergenciaValorPorMargem(contrato)) {
    const linhas = linhasDescontoContratoNaCompetencia(contrato, baseConciliada, competencia);
    const somaFolha = somaValoresDescontoLinhas(linhas);
    return {
      valorOficial: Math.abs(contrato.valor_parcela),
      somaFolha,
      qtdLinhas: linhas.length,
      percentualDiferenca: percentualDivergenciaFormatado(
        Math.abs(contrato.valor_parcela),
        somaFolha,
      ),
      somaFechaComOficial: true,
      candidatoDescontoFracionado: false,
    };
  }

  if (contrato.timeline_analise && timelinePriorizaSobreValorIsolado(contrato.timeline_analise)) {
    const linhas = linhasDescontoContratoNaCompetencia(contrato, baseConciliada, competencia);
    const somaFolha = somaValoresDescontoLinhas(linhas);
    return {
      valorOficial: Math.abs(contrato.valor_parcela),
      somaFolha,
      qtdLinhas: linhas.length,
      percentualDiferenca: percentualDivergenciaFormatado(
        Math.abs(contrato.valor_parcela),
        somaFolha,
      ),
      somaFechaComOficial: true,
      candidatoDescontoFracionado: false,
    };
  }

  const linhas = linhasDescontoContratoNaCompetencia(contrato, baseConciliada, competencia);
  const valorOficial = Math.abs(contrato.valor_parcela);
  const somaFolha = somaValoresDescontoLinhas(linhas);
  const percentualDiferenca = percentualDivergenciaFormatado(valorOficial, somaFolha);

  const rubricaCanonica = assinaturaEstruturalContrato({
    descricao: contrato.instituicao,
    codigo_rubrica: contrato.codigo_instituicao,
  }).rubrica_canonica;

  const fracionado = detectarDescontoFracionadoPorMargem({
    competencia,
    banco: contrato.instituicao,
    codigo_rubrica: contrato.codigo_instituicao,
    rubrica_canonica: rubricaCanonica,
    contrato_id: contrato.id_consignacao,
    valor_oficial_parcela: valorOficial,
    linhas_folha_mes: baseConciliada
      .filter((l) => l.origem === "contracheque")
      .map(linhaFolhaMesDeBaseConciliada),
  });

  const somaFechaComOficial =
    fracionado.fracionado ||
    divergenciaParcelaDentroTolerancia(valorOficial, somaFolha);

  return {
    valorOficial,
    somaFolha: fracionado.fracionado ? fracionado.soma_descontos : somaFolha,
    qtdLinhas: linhas.length,
    percentualDiferenca: fracionado.fracionado
      ? fracionado.percentual_diferenca
      : percentualDiferenca,
    somaFechaComOficial,
    candidatoDescontoFracionado: linhas.length >= 2 && !somaFechaComOficial,
    desconto_fracionado_por_margem: fracionado.fracionado,
    soma_descontos_mes: fracionado.fracionado ? fracionado.soma_descontos : somaFolha,
    linhas_compensatorias: fracionado.fracionado
      ? fracionado.linhas_compensatorias.map((l) => l.id ?? "").filter(Boolean).join(", ")
      : undefined,
    margem_reduzida_detectada: fracionado.fracionado
      ? fracionado.margem_reduzida_detectada
      : undefined,
  };
}
