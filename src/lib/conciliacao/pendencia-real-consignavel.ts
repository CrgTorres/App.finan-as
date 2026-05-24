import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type { PendenciaConferenciaReal } from "@/lib/consignacoes-governo/aplicar-auditoria-consigfacil";
import { classificarTipoPassivo } from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";
import { rubricaEhContaConsumo } from "@/lib/conciliacao/regras-natureza-consignavel";
import type { ResultadoClassificacaoFinanceira } from "@/types/consigfacil";

export type EntradaLinhaPendenciaReal = {
  tipo_passivo?: string | null;
  grupo_canonico?: string | null;
  natureza?: string | null;
  categoria?: string | null;
  descricao?: string | null;
  rubrica?: string | null;
  nome?: string | null;
  fora_conciliacao_consignavel?: boolean | null;
  rubrica_folha_nao_consignavel?: boolean | null;
  conta_consumo?: boolean | null;
};

const TIPOS_FORA = new Set([
  "folha_salarial",
  "receita",
  "previdenciario",
  "tributario",
  "manutencao_judicial",
  "despesa_fixa",
  "conta_consumo",
]);

const GRUPOS_FORA = new Set([
  "rubrica_folha_nao_consignavel",
  "rubrica_vantagem",
  "folha_salarial",
  "receita",
  "previdenciario",
  "tributario",
  "conta_consumo",
  "despesa_fixa",
  "remuneracao_bruta",
  "descontos_oficiais",
]);

const TERMOS_FORA = [
  "SOLDO",
  "ETAPAS",
  "GRATIF",
  "DIF.REAJ",
  "DIFERENCA SALARIAL",
  "IMPOSTO DE RENDA",
  "AMAZONPREV",
  "PREVID",
  "13O",
  "13º",
  "FERIAS",
  "FÉRIAS",
  "AMAZONAS ENERGIA",
] as const;

const TERMOS_CONSIGNAVEIS = [
  "EMP",
  "EMPRESTIMO",
  "EMPRÉSTIMO",
  "CONSIGNADO",
  "BANCO",
  "DAYCOVAL",
  "BANCOOB",
  "SICOOB",
  "BB-EMP",
  "BIB",
  "BMG",
  "PAN",
  "PANAMERICANO",
  "CREDICESTA",
  "CAIXA",
  "RMC",
  "RCC",
  "CARTAO",
  "CARTÃO",
  "SAQUE",
] as const;

function textoElegibilidade(linha: EntradaLinhaPendenciaReal): string {
  return [
    linha.descricao,
    linha.rubrica,
    linha.nome,
    linha.categoria,
    linha.grupo_canonico,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

/** Linha elegível à fila "Conferência — pendências reais" (somente passivo consignável). */
export function linhaElegivelPendenciaRealConsignavel(linha: EntradaLinhaPendenciaReal): boolean {
  const tipo = String(linha.tipo_passivo ?? "").toLowerCase();
  const grupo = String(linha.grupo_canonico ?? "").toLowerCase();
  const natureza = String(linha.natureza ?? "").toLowerCase();
  const categoria = String(linha.categoria ?? "").toLowerCase();

  if (linha.fora_conciliacao_consignavel === true) return false;
  if (linha.rubrica_folha_nao_consignavel === true) return false;
  if (linha.conta_consumo === true) return false;

  if (TIPOS_FORA.has(tipo)) return false;
  if (natureza === "receita" || natureza === "vantagem") return false;
  if (GRUPOS_FORA.has(grupo)) return false;
  if (categoria === "rubrica_vantagem") return false;

  const texto = textoElegibilidade(linha);
  if (TERMOS_FORA.some((termo) => texto.includes(termo))) return false;

  return TERMOS_CONSIGNAVEIS.some((termo) => texto.includes(termo));
}

export function entradaPendenciaDeBaseConciliada(
  linha: BaseConciliadaLinha,
  classif?: ResultadoClassificacaoFinanceira | null,
): EntradaLinhaPendenciaReal {
  const grupo = classif?.grupo_canonico ?? linha.grupo_canonico;
  const descricao = linha.descricao_normalizada || linha.descricao_original;
  const contaConsumo =
    grupo === "conta_consumo" || rubricaEhContaConsumo(descricao);
  const rubricaFolha = grupo === "rubrica_folha_nao_consignavel";
  const tipoPassivo = classificarTipoPassivo(descricao, {
    temParcelaNm: /\d{1,3}\s*[/|]\s*\d{1,3}/.test(descricao),
  });

  return {
    tipo_passivo: tipoPassivo,
    grupo_canonico: grupo,
    natureza: linha.natureza,
    categoria: linha.categoria_canonica,
    descricao,
    rubrica: linha.descricao_original,
    nome: linha.banco_origem || linha.instituicao_original_folha,
    fora_conciliacao_consignavel:
      rubricaFolha || contaConsumo || linha.natureza === "receita",
    rubrica_folha_nao_consignavel: rubricaFolha,
    conta_consumo: contaConsumo,
  };
}

export function entradaPendenciaDePendencia(
  pendencia: PendenciaConferenciaReal,
  ctx?: {
    linha?: BaseConciliadaLinha | null;
    classif?: ResultadoClassificacaoFinanceira | null;
  },
): EntradaLinhaPendenciaReal {
  const base = ctx?.linha
    ? entradaPendenciaDeBaseConciliada(ctx.linha, ctx.classif)
    : {};
  return {
    ...base,
    descricao: pendencia.descricao,
    nome: pendencia.instituicao_oficial ?? base.nome ?? null,
    rubrica: base.rubrica ?? pendencia.descricao,
  };
}

/** Pendência de contrato ConsigFácil (não ligada a rubrica salarial isolada). */
function pendenciaEhDeContratoConsignavel(p: PendenciaConferenciaReal): boolean {
  return Boolean(p.id_consignacao) && !p.id.startsWith("p-linha-");
}

export function pendenciaElegivelPendenciaRealConsignavel(
  pendencia: PendenciaConferenciaReal,
  ctx?: {
    linha?: BaseConciliadaLinha | null;
    classif?: ResultadoClassificacaoFinanceira | null;
  },
): boolean {
  const entrada = entradaPendenciaDePendencia(pendencia, ctx);
  const texto = textoElegibilidade(entrada);
  if (TERMOS_FORA.some((termo) => texto.includes(termo))) return false;

  if (pendenciaEhDeContratoConsignavel(pendencia)) {
    return !TIPOS_FORA.has(String(entrada.tipo_passivo ?? "").toLowerCase()) &&
      !GRUPOS_FORA.has(String(entrada.grupo_canonico ?? "").toLowerCase());
  }

  return linhaElegivelPendenciaRealConsignavel(entrada);
}

export type ContextoPendenciasReais = {
  baseConciliada?: BaseConciliadaLinha[];
  classificacoesPorLinhaId?: Map<string, ResultadoClassificacaoFinanceira>;
};

function resolverContextoLinha(
  pendencia: PendenciaConferenciaReal,
  ctx?: ContextoPendenciasReais,
): { linha?: BaseConciliadaLinha; classif?: ResultadoClassificacaoFinanceira } {
  if (!ctx?.baseConciliada) return {};
  const linhaId = pendencia.id.startsWith("p-linha-")
    ? pendencia.id.replace("p-linha-", "")
    : null;
  if (!linhaId) return {};
  const linha = ctx.baseConciliada.find((l) => l.id === linhaId);
  const classif = ctx.classificacoesPorLinhaId?.get(linhaId);
  return { linha, classif };
}

/** Filtra pendências catalogadas mantendo apenas itens consignáveis reais. */
export function buildPendenciasReais(
  pendencias: PendenciaConferenciaReal[],
  ctx?: ContextoPendenciasReais,
): PendenciaConferenciaReal[] {
  return pendencias.filter((p) =>
    pendenciaElegivelPendenciaRealConsignavel(p, resolverContextoLinha(p, ctx)),
  );
}

export function filtrarLinhasElegiveisPendenciaRealConsignavel(
  linhas: BaseConciliadaLinha[],
  classificacoesPorLinhaId?: Map<string, ResultadoClassificacaoFinanceira>,
): BaseConciliadaLinha[] {
  return linhas.filter((l) =>
    linhaElegivelPendenciaRealConsignavel(
      entradaPendenciaDeBaseConciliada(l, classificacoesPorLinhaId?.get(l.id)),
    ),
  );
}
