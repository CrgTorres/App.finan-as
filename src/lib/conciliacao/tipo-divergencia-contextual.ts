/**
 * Semântica de divergências ConsigFácil × folha/OCR — separa erro real de contexto independente.
 */

import type { TipoCorrelacaoInstituicao } from "@/lib/conciliacao/contexto-instituicao-folha-consigfacil";
import type { ConsigfacilAjusteBase } from "@/types/consigfacil";
import type { MetadadosChaveConsolidacaoDivergencia } from "@/lib/conciliacao/consolidar-divergencias-contextuais";
import {
  MENSAGEM_DESCONTO_FRACIONADO_MARGEM,
  TITULO_BADGE_DESCONTO_FRACIONADO_MARGEM,
} from "@/lib/contratos/detectar-desconto-fracionado-margem";

export type TipoDivergenciaContextual =
  | "divergencia_estrutural_real"
  | "estrutura_incompativel"
  | "desconto_fracionado_margem"
  | "contexto_independente"
  | "monitoramento_contextual"
  | "correlacao_bloqueada"
  | "sem_relacao_confirmada";

export const DESCRICAO_CONTEXTO_INDEPENDENTE =
  "Contrato moderno encontrado no ConsigFácil sem evidência documental de continuidade com a rubrica histórica.";

export const TITULO_CONTEXTO_INDEPENDENTE = "Contextos institucionais independentes";

export const TITULO_ESTRUTURA_INCOMPATIVEL = "Estrutura incompatível";

export const DESCRICAO_ESTRUTURA_INCOMPATIVEL =
  "Contrato ConsigFácil não possui continuidade estrutural com a rubrica observada.";

const PADROES_CONTINUIDADE_BLOQUEADA =
  /sem\s+evid[eê]ncia\s+institucional|sem\s+rela[cç][aã]o\s+confirmada|continuidade\s+institucional|correla[cç][aã]o\s+bloqueada|valor\s+semelhante.*sem\s+evid/i;

export type EntradaClassificacaoDivergenciaContextual = {
  meta?: MetadadosChaveConsolidacaoDivergencia;
  chave: string;
  ajuste: ConsigfacilAjusteBase;
  ehCriticoBruto: boolean;
  ehContextoMonitorado: boolean;
};

export function inferirContinuidadeComprovada(
  meta?: MetadadosChaveConsolidacaoDivergencia,
): boolean | undefined {
  if (meta?.continuidade_institucional_comprovada !== undefined) {
    return meta.continuidade_institucional_comprovada;
  }
  if (meta?.correlacao_institucional_valida === true) return true;
  if (meta?.correlacao_institucional_valida === false) return false;
  return undefined;
}

export function classificarTipoDivergenciaContextual(
  input: EntradaClassificacaoDivergenciaContextual,
): TipoDivergenciaContextual {
  if (input.meta?.desconto_fracionado_margem === true) {
    return "desconto_fracionado_margem";
  }

  if (input.meta?.estrutura_incompativel === true) {
    return "estrutura_incompativel";
  }

  const semVinculoChave = /sem_vinculo_institucional/.test(input.chave);
  const tipoCorrelacao: TipoCorrelacaoInstituicao | null =
    input.meta?.tipo_correlacao ??
    (semVinculoChave ? "sem_relacao_confirmada" : null);
  const bloquearValor = input.meta?.bloquear_correlacao_por_valor === true;
  const continuidadeComprovada = inferirContinuidadeComprovada(input.meta);
  const motivoSugereBloqueio = PADROES_CONTINUIDADE_BLOQUEADA.test(
    `${input.ajuste.motivo_ajuste} ${input.ajuste.campo}`,
  );

  const semContinuidadeInstitucional =
    tipoCorrelacao === "sem_relacao_confirmada" ||
    bloquearValor ||
    continuidadeComprovada === false ||
    semVinculoChave ||
    (continuidadeComprovada === undefined && motivoSugereBloqueio);

  if (semContinuidadeInstitucional) {
    if (tipoCorrelacao === "sem_relacao_confirmada") return "sem_relacao_confirmada";
    if (bloquearValor) return "correlacao_bloqueada";
    return "contexto_independente";
  }

  if (input.ehContextoMonitorado) return "monitoramento_contextual";
  if (input.ehCriticoBruto) return "divergencia_estrutural_real";
  return "monitoramento_contextual";
}

export function ehDivergenciaEstruturalReal(tipo: TipoDivergenciaContextual): boolean {
  return tipo === "divergencia_estrutural_real" || tipo === "estrutura_incompativel";
}

export function ehEstruturaIncompativel(tipo: TipoDivergenciaContextual): boolean {
  return tipo === "estrutura_incompativel";
}

export function ehDescontoFracionadoMargem(tipo: TipoDivergenciaContextual): boolean {
  return tipo === "desconto_fracionado_margem";
}

export function ehContextoInstitucionalIndependente(tipo: TipoDivergenciaContextual): boolean {
  return (
    tipo === "contexto_independente" ||
    tipo === "sem_relacao_confirmada" ||
    tipo === "correlacao_bloqueada"
  );
}

export function resolverTituloBadgeContextual(tipo: TipoDivergenciaContextual): string {
  if (tipo === "desconto_fracionado_margem") return TITULO_BADGE_DESCONTO_FRACIONADO_MARGEM;
  if (tipo === "estrutura_incompativel") return TITULO_ESTRUTURA_INCOMPATIVEL;
  if (ehContextoInstitucionalIndependente(tipo)) return TITULO_CONTEXTO_INDEPENDENTE;
  if (tipo === "monitoramento_contextual") {
    return "Contexto conciliado com diferença monitorada";
  }
  return "Divergência estrutural prioritária";
}

export function resolverDescricaoContextual(
  tipo: TipoDivergenciaContextual,
  motivoResumo: string,
): string {
  if (tipo === "desconto_fracionado_margem") return MENSAGEM_DESCONTO_FRACIONADO_MARGEM;
  if (tipo === "estrutura_incompativel") return DESCRICAO_ESTRUTURA_INCOMPATIVEL;
  if (ehContextoInstitucionalIndependente(tipo)) return DESCRICAO_CONTEXTO_INDEPENDENTE;
  return motivoResumo;
}
