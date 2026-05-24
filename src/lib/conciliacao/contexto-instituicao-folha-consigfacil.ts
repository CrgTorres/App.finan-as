/**
 * Separação semântica: instituição observada na folha (época) vs. estado oficial ConsigFácil (posterior).
 */

import type { ConsigfacilConfirmacao, ConsigfacilContrato } from "@/types/consigfacil";
import { confirmacaoVazia } from "@/types/consigfacil";
import {
  classificarAutoridadeTemporalConsigfacil,
  entradaTemporalDeContrato,
  type ResultadoAutoridadeTemporalConsigfacil,
} from "@/lib/consigfacil/autoridade-temporal-consigfacil";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import { normalizarNomeBanco } from "@/lib/auditoria/normalizar-banco";
import { detectarInstituicaoNaDescricao } from "@/lib/reading/instituicoes-financeiras";
import {
  continuidadeBloqueiaCorrelacaoExibida,
  logContinuidadeInstitucional,
  validarContinuidadeInstitucional,
  type ValidacaoContinuidadeInstitucional,
} from "@/lib/consigfacil/regras-correlacao-institucional";
import { ehRubricaElegivelCorrelacaoConsigfacil } from "@/lib/conciliacao/regras-natureza-consignavel";

export type TipoCorrelacaoInstituicao =
  | "confirmacao_forte"
  | "match_historico_correlato"
  | "divergencia_instituicao"
  | "sem_relacao_confirmada";

export type ContextoInstituicaoConciliacao = {
  instituicao_original_folha: string | null;
  instituicao_oficial_consigfacil: string | null;
  instituicao_correlata: string | null;
  banco_vinculado: string | null;
  banco_original: string | null;
  banco_atual_consigfacil: string | null;
  banco_normalizado_folha: string | null;
  banco_normalizado_consigfacil: string | null;
  banco_consolidado: string | null;
  possivel_migracao_carteira: boolean;
  conflito_instituicao_historica: boolean;
  tipo_correlacao: TipoCorrelacaoInstituicao | null;
  score_correlacao: number | null;
  match_historico_correlato: boolean;
  rotulo_badge: string | null;
  temporal: ResultadoAutoridadeTemporalConsigfacil;
  continuidade_institucional: ValidacaoContinuidadeInstitucional;
};

export type ConflitoInstituicaoHistoricaLog = {
  banco_original: string | null;
  banco_consigfacil: string | null;
  contrato: string;
  score: number | null;
  tipo_correlacao: TipoCorrelacaoInstituicao | null;
  descricao_folha: string;
};

function normalizarChaveBanco(nome: string | null | undefined): string {
  if (!nome?.trim()) return "";
  const oficial = resolverInstituicaoOficial(nome);
  if (oficial?.nome_normalizado) return oficial.nome_normalizado;
  return normalizarNomeBanco(nome)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Extrai banco da rubrica/ficha — nunca usa ConsigFácil. */
export function extrairInstituicaoOriginalFolha(
  descricao: string,
  bancoItem?: string | null,
): Pick<
  ContextoInstituicaoConciliacao,
  "instituicao_original_folha" | "banco_original" | "banco_normalizado_folha"
> {
  const detectado = detectarInstituicaoNaDescricao(descricao);
  const banco_original =
    detectado?.nome ?? (bancoItem?.trim() ? normalizarNomeBanco(bancoItem) : null);
  const instituicao_original_folha = banco_original;
  const banco_normalizado_folha = banco_original
    ? normalizarChaveBanco(banco_original)
    : null;
  return { instituicao_original_folha, banco_original, banco_normalizado_folha };
}

export function logConflitoInstituicaoHistorica(payload: ConflitoInstituicaoHistoricaLog): void {
  console.log("[CONFLITO_INSTITUICAO_HISTORICA]", payload);
}

function montarContextoSemCorrelacaoInstitucional(input: {
  folha: ReturnType<typeof extrairInstituicaoOriginalFolha>;
  temporal: ResultadoAutoridadeTemporalConsigfacil;
  continuidade: ValidacaoContinuidadeInstitucional;
}): ContextoInstituicaoConciliacao {
  return {
    ...input.folha,
    instituicao_oficial_consigfacil: null,
    instituicao_correlata: null,
    banco_vinculado: null,
    banco_atual_consigfacil: null,
    banco_normalizado_consigfacil: null,
    banco_consolidado: input.folha.banco_original,
    possivel_migracao_carteira: false,
    conflito_instituicao_historica: false,
    tipo_correlacao: "sem_relacao_confirmada",
    score_correlacao: null,
    match_historico_correlato: false,
    rotulo_badge: null,
    temporal: input.temporal,
    continuidade_institucional: input.continuidade,
  };
}

export function montarContextoInstituicaoCorrelacao(input: {
  descricaoFolha: string;
  bancoOrigemLinha?: string | null;
  competenciaFolha?: string | null;
  contrato: ConsigfacilContrato;
  scoreMatch?: number | null;
  valorConfirmado?: boolean;
}): ContextoInstituicaoConciliacao | null {
  if (!ehRubricaElegivelCorrelacaoConsigfacil(input.descricaoFolha, { natureza: "desconto" })) {
    return null;
  }

  const folha = extrairInstituicaoOriginalFolha(input.descricaoFolha, input.bancoOrigemLinha);

  const temporal = classificarAutoridadeTemporalConsigfacil(
    entradaTemporalDeContrato(input.contrato, input.competenciaFolha, {
      bancoHistorico: folha.banco_original,
      bancoConsigfacil: input.contrato.instituicao,
    }),
  );
  const oficialConsig = resolverInstituicaoOficial(input.contrato.instituicao);
  const banco_atual_consigfacil = input.contrato.instituicao?.trim() || null;
  const instituicao_oficial_consigfacil = oficialConsig?.nome_oficial ?? banco_atual_consigfacil;
  const banco_normalizado_consigfacil = normalizarChaveBanco(
    instituicao_oficial_consigfacil ?? banco_atual_consigfacil,
  );
  const banco_consolidado = instituicao_oficial_consigfacil;

  const chaveFolha = folha.banco_normalizado_folha ?? "";
  const chaveConsig = banco_normalizado_consigfacil;
  const conflito_instituicao_historica =
    Boolean(chaveFolha && chaveConsig && chaveFolha !== chaveConsig);

  const continuidade = validarContinuidadeInstitucional({
    bancoHistorico: folha.banco_original,
    bancoConsigfacil: banco_atual_consigfacil,
    possuiDocumentoMigracao:
      input.contrato.possui_documento_migracao ??
      (temporal.contrato_migrado_para_consigfacil ||
        temporal.autoridade_temporal === "migracao_carga_inicial"),
    possuiHistoricoTransicao: input.contrato.possui_historico_transicao ?? false,
    competencia: input.competenciaFolha,
    dataImplantacaoConsigfacil: temporal.data_implantacao_fonte,
  });

  if (continuidadeBloqueiaCorrelacaoExibida(continuidade)) {
    return montarContextoSemCorrelacaoInstitucional({ folha, temporal, continuidade });
  }

  if (conflito_instituicao_historica) {
    logContinuidadeInstitucional({
      bancoHistorico: folha.banco_original,
      bancoConsigfacil: banco_atual_consigfacil,
      possuiDocumentoMigracao:
        temporal.contrato_migrado_para_consigfacil ||
        temporal.autoridade_temporal === "migracao_carga_inicial",
      possuiHistoricoTransicao: input.contrato.possui_historico_transicao ?? false,
      competencia: input.competenciaFolha,
      dataImplantacaoConsigfacil: temporal.data_implantacao_fonte,
      ...continuidade,
    });
  }

  const possivel_migracao_carteira =
    conflito_instituicao_historica &&
    continuidade.motivo === "migracao_documentada" &&
    !continuidade.bloquear_migracao_carteira;

  let tipo_correlacao: TipoCorrelacaoInstituicao | null = null;
  if (conflito_instituicao_historica && continuidade.motivo === "migracao_documentada") {
    tipo_correlacao = "match_historico_correlato";
  } else if (conflito_instituicao_historica) {
    tipo_correlacao = "divergencia_instituicao";
  } else if (input.valorConfirmado) {
    tipo_correlacao = "confirmacao_forte";
  } else if (input.valorConfirmado === false) {
    tipo_correlacao = "divergencia_instituicao";
  }

  const match_historico_correlato =
    !continuidade.bloquear_match_estrutural &&
    tipo_correlacao === "match_historico_correlato";

  const rotulo_badge =
    match_historico_correlato && continuidade.motivo === "migracao_documentada"
      ? "Contrato correlato encontrado no ConsigFácil"
      : input.valorConfirmado && !continuidade.bloquear_confirmacao_consigfacil
        ? "Confirmado por ConsigFácil"
        : null;

  if (conflito_instituicao_historica) {
    logConflitoInstituicaoHistorica({
      banco_original: folha.banco_original,
      banco_consigfacil: banco_atual_consigfacil,
      contrato: input.contrato.id_consignacao,
      score: input.scoreMatch ?? null,
      tipo_correlacao,
      descricao_folha: input.descricaoFolha.slice(0, 120),
    });
  }

  return {
    ...folha,
    instituicao_oficial_consigfacil,
    instituicao_correlata: instituicao_oficial_consigfacil,
    banco_vinculado: banco_atual_consigfacil,
    banco_atual_consigfacil,
    banco_normalizado_consigfacil: chaveConsig || null,
    banco_consolidado,
    possivel_migracao_carteira,
    conflito_instituicao_historica,
    tipo_correlacao,
    score_correlacao: input.scoreMatch ?? null,
    match_historico_correlato,
    rotulo_badge,
    temporal,
    continuidade_institucional: continuidade,
  };
}

export function textoObservacaoCorrelacaoInstituicao(
  ctx: ContextoInstituicaoConciliacao,
  idConsignacao: string,
): string {
  const partes: string[] = [];
  if (ctx.rotulo_badge) {
    partes.push(`${ctx.rotulo_badge} ${idConsignacao}.`);
  }
  if (ctx.banco_atual_consigfacil) {
    partes.push(`Banco atual (ConsigFácil): ${ctx.banco_atual_consigfacil}.`);
  }
  if (ctx.instituicao_original_folha) {
    partes.push(
      `Rubrica histórica: ${ctx.instituicao_original_folha} (folha na época do desconto).`,
    );
  }
  if (ctx.possivel_migracao_carteira) {
    partes.push("Possível migração de carteira — não tratar como confirmação automática.");
  }
  if (ctx.temporal.autoridade_temporal !== "oficial_atual") {
    partes.push(ctx.temporal.mensagem_autoridade_temporal);
    partes.push(
      "ConsigFácil posterior à competência analisada. Usado apenas como referência contextual.",
    );
  }
  return partes.join(" ");
}

/** ConsigFácil não substitui a instituição exibida na rubrica original. */
export function bloquearSobrescritaInstituicaoFolha(): true {
  return true;
}

export function montarConfirmacaoConsigfacilComContexto(input: {
  ctx: ContextoInstituicaoConciliacao;
  idConsignacao: string;
  camposConfirmados: ConsigfacilConfirmacao["campos_confirmados"];
  camposDivergentes: ConsigfacilConfirmacao["campos_divergentes"];
}): ConsigfacilConfirmacao {
  const { ctx, idConsignacao, camposConfirmados, camposDivergentes } = input;
  const valorOk =
    camposConfirmados.length > 0 && camposDivergentes.length === 0;
  const juizoOficial = ctx.temporal.permite_juizo_estrutural_retroativo;
  const confirmado_forte =
    juizoOficial &&
    valorOk &&
    !ctx.conflito_instituicao_historica &&
    !ctx.match_historico_correlato &&
    !ctx.continuidade_institucional.bloquear_confirmacao_consigfacil;

  const divergenciaEstrutural =
    ctx.tipo_correlacao !== "sem_relacao_confirmada" &&
    juizoOficial &&
    (camposDivergentes.length > 0 || ctx.conflito_instituicao_historica);

  const mensagemCorrelacao =
    ctx.tipo_correlacao === "sem_relacao_confirmada"
      ? (ctx.continuidade_institucional.mensagem ??
        "Sem evidência institucional de continuidade.")
      : ctx.rotulo_badge;

  return {
    ...confirmacaoVazia,
    confirmado_consigfacil: confirmado_forte,
    divergencia_consigfacil: divergenciaEstrutural,
    campos_confirmados: camposConfirmados,
    campos_divergentes: camposDivergentes,
    instituicao_original_folha: ctx.instituicao_original_folha,
    instituicao_oficial_consigfacil: ctx.instituicao_oficial_consigfacil,
    instituicao_correlata: ctx.instituicao_correlata,
    banco_vinculado: ctx.banco_vinculado,
    banco_original: ctx.banco_original,
    banco_atual_consigfacil: ctx.banco_atual_consigfacil,
    banco_normalizado_folha: ctx.banco_normalizado_folha,
    banco_normalizado_consigfacil: ctx.banco_normalizado_consigfacil,
    banco_consolidado: ctx.banco_consolidado,
    possivel_migracao_carteira: ctx.possivel_migracao_carteira,
    match_historico_correlato: ctx.match_historico_correlato,
    tipo_correlacao: ctx.tipo_correlacao,
    score_correlacao: ctx.score_correlacao,
    autoridade_temporal_consigfacil: ctx.temporal.autoridade_temporal,
    contrato_migrado_para_consigfacil: ctx.temporal.contrato_migrado_para_consigfacil,
    tipo_correlacao_temporal: ctx.temporal.tipo_correlacao_temporal,
    data_implantacao_fonte: ctx.temporal.data_implantacao_fonte,
    mensagem_autoridade_temporal: ctx.temporal.mensagem_autoridade_temporal,
    contrato_correlato:
      ctx.tipo_correlacao === "sem_relacao_confirmada" ? null : idConsignacao,
    mensagem_correlacao: mensagemCorrelacao,
    id_consignacao_confirmada:
      ctx.tipo_correlacao === "sem_relacao_confirmada" ? null : idConsignacao,
  };
}

export function mesclarConfirmacaoConsigfacil(
  a: ConsigfacilConfirmacao,
  b: ConsigfacilConfirmacao,
): ConsigfacilConfirmacao {
  if (
    a.tipo_correlacao === "sem_relacao_confirmada" ||
    b.tipo_correlacao === "sem_relacao_confirmada"
  ) {
    return a.tipo_correlacao === "sem_relacao_confirmada" ? a : b;
  }
  return {
    confirmado_consigfacil:
      a.confirmado_consigfacil || b.confirmado_consigfacil,
    divergencia_consigfacil:
      a.divergencia_consigfacil || b.divergencia_consigfacil,
    id_consignacao_confirmada:
      a.id_consignacao_confirmada ?? b.id_consignacao_confirmada,
    campos_confirmados: Array.from(
      new Set([...a.campos_confirmados, ...b.campos_confirmados]),
    ),
    campos_divergentes: Array.from(
      new Set([...a.campos_divergentes, ...b.campos_divergentes]),
    ),
    instituicao_original_folha:
      a.instituicao_original_folha ?? b.instituicao_original_folha,
    instituicao_oficial_consigfacil:
      b.instituicao_oficial_consigfacil ?? a.instituicao_oficial_consigfacil,
    instituicao_correlata: b.instituicao_correlata ?? a.instituicao_correlata,
    banco_vinculado: b.banco_vinculado ?? a.banco_vinculado,
    banco_original: a.banco_original ?? b.banco_original,
    banco_atual_consigfacil: b.banco_atual_consigfacil ?? a.banco_atual_consigfacil,
    banco_normalizado_folha: a.banco_normalizado_folha ?? b.banco_normalizado_folha,
    banco_normalizado_consigfacil:
      b.banco_normalizado_consigfacil ?? a.banco_normalizado_consigfacil,
    banco_consolidado: b.banco_consolidado ?? a.banco_consolidado,
    possivel_migracao_carteira:
      a.possivel_migracao_carteira || b.possivel_migracao_carteira,
    match_historico_correlato:
      a.match_historico_correlato || b.match_historico_correlato,
    tipo_correlacao: b.tipo_correlacao ?? a.tipo_correlacao,
    score_correlacao: b.score_correlacao ?? a.score_correlacao,
    autoridade_temporal_consigfacil:
      b.autoridade_temporal_consigfacil ?? a.autoridade_temporal_consigfacil,
    contrato_migrado_para_consigfacil:
      a.contrato_migrado_para_consigfacil || b.contrato_migrado_para_consigfacil,
    tipo_correlacao_temporal: b.tipo_correlacao_temporal ?? a.tipo_correlacao_temporal,
    data_implantacao_fonte: b.data_implantacao_fonte ?? a.data_implantacao_fonte,
    mensagem_autoridade_temporal:
      b.mensagem_autoridade_temporal ?? a.mensagem_autoridade_temporal,
    contrato_correlato: b.contrato_correlato ?? a.contrato_correlato,
    mensagem_correlacao: b.mensagem_correlacao ?? a.mensagem_correlacao,
  };
}
