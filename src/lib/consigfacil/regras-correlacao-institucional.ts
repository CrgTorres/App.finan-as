/**
 * Regras de continuidade institucional folha × ConsigFácil.
 * ConsigFácil moderno não prova continuidade sem evidência documentada.
 */

import type { ConsigfacilContrato } from "@/types/consigfacil";
import { confirmacaoVazia, type ConsigfacilConfirmacao } from "@/types/consigfacil";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import { normalizarNomeBanco } from "@/lib/auditoria/normalizar-banco";
import {
  classificarAutoridadeTemporalConsigfacil,
  entradaTemporalDeContrato,
} from "@/lib/consigfacil/autoridade-temporal-consigfacil";

export interface ValidacaoContinuidadeInstitucional {
  permitir_correlacao: boolean;
  motivo:
    | "mesma_instituicao"
    | "migracao_documentada"
    | "correlacao_fraca"
    | "sem_evidencia_continuidade";
  bloquear_migracao_carteira: boolean;
  bloquear_match_estrutural: boolean;
  bloquear_confirmacao_consigfacil: boolean;
  /** Valor parecido não vincula sem instituição/código/migração compatível. */
  bloquear_correlacao_por_valor?: boolean;
  remover_consigfacil_do_contexto?: boolean;
  bloquear_correlacao_fraca?: boolean;
  bloquear_agrupamento_contextual?: boolean;
  remover_contexto_monitorado?: boolean;
  mensagem?: string;
}

export const MENSAGEM_SEM_EVIDENCIA_CONTINUIDADE_INSTITUCIONAL =
  "Sem evidência institucional de continuidade.";

export function competenciaAnteriorImplantacaoConsigfacil(
  competencia?: string | null,
  dataImplantacaoConsigfacil?: string | null,
): boolean {
  if (!competencia?.trim() || !dataImplantacaoConsigfacil?.trim()) return false;
  return competencia.slice(0, 7) < dataImplantacaoConsigfacil.slice(0, 7);
}

export type ResultadoBloqueioCorrelacaoPorValor = {
  bloquear_correlacao_por_valor: boolean;
  remover_consigfacil_do_contexto: boolean;
  tipo_correlacao: "sem_relacao_confirmada";
  contrato_correlato: null;
  motivo_log: "valor_sem_instituicao_nao_vincula";
  mensagem_ui: string;
  continuidade: ValidacaoContinuidadeInstitucional;
};

export const MENSAGEM_VALOR_SEM_INSTITUICAO =
  "Valor semelhante encontrado no ConsigFácil, mas sem evidência institucional de continuidade. Correlação bloqueada.";

export interface EntradaContinuidadeInstitucional {
  bancoHistorico?: string | null;
  bancoConsigfacil?: string | null;
  possuiDocumentoMigracao?: boolean;
  possuiHistoricoTransicao?: boolean;
  competencia?: string | null;
  dataImplantacaoConsigfacil?: string | null;
}

export function validarContinuidadeInstitucional(
  input: EntradaContinuidadeInstitucional,
): ValidacaoContinuidadeInstitucional {
  const historico = normalizarInstituicaoContinuidade(input.bancoHistorico);
  const consig = normalizarInstituicaoContinuidade(input.bancoConsigfacil);

  if (!historico || !consig) {
    return bloqueioSemEvidencia();
  }

  if (historico === consig) {
    return {
      permitir_correlacao: true,
      motivo: "mesma_instituicao",
      bloquear_migracao_carteira: false,
      bloquear_match_estrutural: false,
      bloquear_confirmacao_consigfacil: false,
    };
  }

  if (input.possuiDocumentoMigracao || input.possuiHistoricoTransicao) {
    return {
      permitir_correlacao: true,
      motivo: "migracao_documentada",
      bloquear_migracao_carteira: false,
      bloquear_match_estrutural: false,
      bloquear_confirmacao_consigfacil: false,
      bloquear_correlacao_fraca: false,
      bloquear_agrupamento_contextual: false,
      remover_contexto_monitorado: false,
    };
  }

  const competenciaAnteriorImplantacao = competenciaAnteriorImplantacaoConsigfacil(
    input.competencia,
    input.dataImplantacaoConsigfacil,
  );

  if (
    competenciaAnteriorImplantacao &&
    historico !== consig &&
    !input.possuiDocumentoMigracao &&
    !input.possuiHistoricoTransicao
  ) {
    return bloqueioPreImplantacaoSemContinuidade(MENSAGEM_VALOR_SEM_INSTITUICAO);
  }

  return bloqueioSemEvidencia();
}

function bloqueioPreImplantacaoSemContinuidade(
  mensagem: string = MENSAGEM_VALOR_SEM_INSTITUICAO,
): ValidacaoContinuidadeInstitucional {
  return {
    permitir_correlacao: false,
    motivo: "sem_evidencia_continuidade",
    bloquear_migracao_carteira: true,
    bloquear_match_estrutural: true,
    bloquear_confirmacao_consigfacil: true,
    bloquear_correlacao_por_valor: true,
    remover_consigfacil_do_contexto: true,
    bloquear_correlacao_fraca: true,
    bloquear_agrupamento_contextual: true,
    remover_contexto_monitorado: true,
    mensagem,
  };
}

function bloqueioSemEvidencia(
  mensagem: string = MENSAGEM_SEM_EVIDENCIA_CONTINUIDADE_INSTITUCIONAL,
): ValidacaoContinuidadeInstitucional {
  return bloqueioPreImplantacaoSemContinuidade(mensagem);
}

/** Contexto/confirmacao zerados quando correlação fraca ou por valor está bloqueada. */
export function continuidadeBloqueiaCorrelacaoExibida(
  c: ValidacaoContinuidadeInstitucional,
): boolean {
  return Boolean(
    c.bloquear_correlacao_fraca ||
      c.bloquear_correlacao_por_valor ||
      c.remover_consigfacil_do_contexto ||
      !c.permitir_correlacao,
  );
}

function normalizarInstituicaoContinuidade(valor?: string | null): string {
  if (!valor?.trim()) return "";
  const oficial = resolverInstituicaoOficial(valor);
  if (oficial?.nome_normalizado) return oficial.nome_normalizado;
  return normalizarNomeBanco(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const MENSAGEM_CORRELACAO_SEM_CONTINUIDADE =
  [
    "Contrato moderno encontrado",
    "mas sem evidência documental",
    "de continuidade institucional.",
  ].join(" ");

export function extrairFlagsContinuidadeContrato(
  contrato: ConsigfacilContrato,
  competenciaFolha?: string | null,
  bancoHistorico?: string | null,
): EntradaContinuidadeInstitucional & { banco_atual: string | null } {
  const banco_atual = contrato.banco_atual ?? contrato.instituicao ?? null;
  const temporal = classificarAutoridadeTemporalConsigfacil(
    entradaTemporalDeContrato(contrato, competenciaFolha ?? contrato.competencia, {
      bancoHistorico: bancoHistorico ?? null,
      bancoConsigfacil: banco_atual,
    }),
  );
  return {
    bancoHistorico: bancoHistorico ?? null,
    bancoConsigfacil: banco_atual,
    banco_atual,
    possuiDocumentoMigracao:
      contrato.possui_documento_migracao ??
      (temporal.contrato_migrado_para_consigfacil ||
        temporal.autoridade_temporal === "migracao_carga_inicial"),
    /** Só evidência explícita — pré-implantação NÃO conta como transição. */
    possuiHistoricoTransicao: contrato.possui_historico_transicao ?? false,
    competencia: competenciaFolha ?? contrato.competencia,
    dataImplantacaoConsigfacil: temporal.data_implantacao_fonte,
  };
}

export function montarEntradaContinuidadeLinhaContrato(input: {
  linha: {
    instituicao_original_folha?: string | null;
    banco_origem?: string | null;
    competencia?: string | null;
  };
  contrato: ConsigfacilContrato;
}): EntradaContinuidadeInstitucional {
  const flags = extrairFlagsContinuidadeContrato(
    input.contrato,
    input.linha.competencia,
    input.linha.instituicao_original_folha ?? input.linha.banco_origem,
  );
  return {
    bancoHistorico: input.linha.instituicao_original_folha ?? input.linha.banco_origem,
    bancoConsigfacil: flags.banco_atual,
    possuiDocumentoMigracao: flags.possuiDocumentoMigracao,
    possuiHistoricoTransicao: flags.possuiHistoricoTransicao,
    competencia: flags.competencia,
    dataImplantacaoConsigfacil: flags.dataImplantacaoConsigfacil,
  };
}

export function possuiCodigoContratoExplicito(
  texto: string | null | undefined,
  idConsignacao: string | null | undefined,
  codigoInstituicao?: string | null,
): boolean {
  const t = (texto ?? "").toLowerCase();
  if (!t) return false;
  if (idConsignacao?.trim()) {
    const id = idConsignacao.trim();
    if (t.includes(id.toLowerCase())) return true;
    const dig = id.replace(/\D/g, "");
    if (dig.length >= 4 && t.includes(dig)) return true;
  }
  const cod = codigoInstituicao?.replace(/\D/g, "") ?? "";
  if (cod.length >= 4 && t.includes(cod)) return true;
  return false;
}

export type EntradaBloqueioCorrelacaoPorValor = EntradaContinuidadeInstitucional & {
  rubricaOriginal?: string | null;
  descricaoFolha?: string | null;
  idConsignacao?: string | null;
  codigoInstituicao?: string | null;
  textoContrato?: string | null;
  valorObservado?: number | null;
  valorConsigfacil?: number | null;
};

/** Nunca correlacionar contrato somente por valor. */
export function avaliarBloqueioCorrelacaoPorValor(
  input: EntradaBloqueioCorrelacaoPorValor,
): ResultadoBloqueioCorrelacaoPorValor {
  const continuidade = validarContinuidadeInstitucional(input);
  const historico = normalizarInstituicaoContinuidade(input.bancoHistorico);
  const consig = normalizarInstituicaoContinuidade(input.bancoConsigfacil);

  const codigoExplicito = possuiCodigoContratoExplicito(
    [input.descricaoFolha, input.rubricaOriginal, input.textoContrato].filter(Boolean).join(" "),
    input.idConsignacao,
    input.codigoInstituicao,
  );

  const liberado =
    continuidade.motivo === "mesma_instituicao" ||
    continuidade.motivo === "migracao_documentada" ||
    codigoExplicito;

  const bloquear =
    !liberado &&
    (historico !== consig ||
      !continuidade.permitir_correlacao ||
      Boolean(continuidade.bloquear_correlacao_por_valor));

  return {
    bloquear_correlacao_por_valor: bloquear,
    remover_consigfacil_do_contexto: bloquear,
    tipo_correlacao: "sem_relacao_confirmada",
    contrato_correlato: null,
    motivo_log: "valor_sem_instituicao_nao_vincula",
    mensagem_ui: bloquear
      ? (continuidade.mensagem ?? MENSAGEM_VALOR_SEM_INSTITUICAO)
      : "",
    continuidade,
  };
}

export function metadadosChaveConsolidacaoPorContinuidade(
  continuidade: ValidacaoContinuidadeInstitucional,
  base: {
    banco_original?: string | null;
    rubrica_original?: string | null;
    modalidade_original?: string | null;
    competencia?: string | null;
    contrato_consigfacil?: string | null;
  },
): import("@/lib/conciliacao/consolidar-divergencias-contextuais").MetadadosChaveConsolidacaoDivergencia {
  const bloquearAgrupamento = Boolean(continuidade.bloquear_agrupamento_contextual);
  return {
    banco_original: base.banco_original,
    rubrica_original: base.rubrica_original,
    modalidade_original: base.modalidade_original,
    competencia: base.competencia,
    correlacao_institucional_valida: !bloquearAgrupamento,
    contrato_consigfacil: bloquearAgrupamento ? null : base.contrato_consigfacil,
  };
}

export function logCorrelacaoBloqueadaPorValor(payload: {
  rubrica_original: string | null;
  banco_original: string | null;
  valor_observado: number | null;
  contrato_consigfacil: string | null;
  banco_consigfacil: string | null;
  valor_consigfacil: number | null;
  motivo: "valor_sem_instituicao_nao_vincula";
}): void {
  console.log("[CORRELACAO_BLOQUEADA_POR_VALOR]", payload);
}

export function criarConfirmacaoSemContinuidadeInstitucional(
  instituicaoFolha?: string | null,
  mensagemCorrelacao?: string | null,
): ConsigfacilConfirmacao {
  const instFolha = instituicaoFolha?.trim() || null;
  return {
    ...confirmacaoVazia,
    instituicao_original_folha: instFolha,
    banco_original: instFolha,
    tipo_correlacao: "sem_relacao_confirmada",
    contrato_correlato: null,
    mensagem_correlacao:
      mensagemCorrelacao?.trim() || MENSAGEM_CORRELACAO_SEM_CONTINUIDADE,
    possivel_migracao_carteira: false,
    confirmado_consigfacil: false,
    divergencia_consigfacil: false,
    match_historico_correlato: false,
  };
}

/** Remove vínculo/confirmacao ConsigFácil quando não há continuidade institucional. */
export function removerContextoConsigfacil<
  T extends BaseConciliadaLinha & {
    confirmacao_consigfacil?: ConsigfacilConfirmacao;
    contexto_instituicao?: unknown;
  },
>(linha: T): T & { confirmacao_consigfacil: ConsigfacilConfirmacao } {
  const instFolha =
    linha.instituicao_original_folha ??
    linha.confirmacao_consigfacil?.instituicao_original_folha ??
    null;

  return {
    ...linha,
    contexto_instituicao: null,
    vinculo_contrato_id: null,
    confirmacao_consigfacil: criarConfirmacaoSemContinuidadeInstitucional(instFolha),
    observacao: linha.observacao
      ? `${linha.observacao} ${MENSAGEM_CORRELACAO_SEM_CONTINUIDADE}`
      : MENSAGEM_CORRELACAO_SEM_CONTINUIDADE,
  };
}

export function removerContextoConsigfacilPorValor<
  T extends BaseConciliadaLinha & {
    confirmacao_consigfacil?: ConsigfacilConfirmacao;
    contexto_instituicao?: unknown;
  },
>(linha: T, bloqueio: ResultadoBloqueioCorrelacaoPorValor): T & {
  confirmacao_consigfacil: ConsigfacilConfirmacao;
} {
  const instFolha =
    linha.instituicao_original_folha ??
    linha.confirmacao_consigfacil?.instituicao_original_folha ??
    null;
  const msg = bloqueio.mensagem_ui || MENSAGEM_VALOR_SEM_INSTITUICAO;
  return {
    ...linha,
    contexto_instituicao: null,
    vinculo_contrato_id: null,
    confirmacao_consigfacil: criarConfirmacaoSemContinuidadeInstitucional(instFolha, msg),
    observacao: linha.observacao ? `${linha.observacao} ${msg}` : msg,
  };
}

export function logContinuidadeInstitucional(
  payload: EntradaContinuidadeInstitucional & ValidacaoContinuidadeInstitucional,
): void {
  console.log("[CONTINUIDADE_INSTITUCIONAL]", {
    banco_historico: payload.bancoHistorico,
    banco_consigfacil: payload.bancoConsigfacil,
    motivo: payload.motivo,
    permitir_correlacao: payload.permitir_correlacao,
    bloquear_migracao_carteira: payload.bloquear_migracao_carteira,
    bloquear_match_estrutural: payload.bloquear_match_estrutural,
    bloquear_confirmacao_consigfacil: payload.bloquear_confirmacao_consigfacil,
  });
}
