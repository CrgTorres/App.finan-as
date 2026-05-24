/**
 * Autoridade temporal do ConsigFácil: fonte oficial atual vs. referência contextual
 * para competências anteriores à implantação do portal.
 */

import type { ConsigfacilContrato, ConsigfacilStatus } from "@/types/consigfacil";

export const CONSIGFACIL_DATA_IMPLANTACAO_PADRAO = "2026-01-01";

export type AutoridadeTemporalConsigfacil =
  | "oficial_atual"
  | "contextual_historica"
  | "migracao_carga_inicial"
  | "sem_autoridade_retroativa";

export type TipoCorrelacaoTemporal =
  | "oficial_atual"
  | "correlacao_historica"
  | "migracao_carga_inicial"
  | "sem_correlacao";

export type EntradaAutoridadeTemporalConsigfacil = {
  competencia?: string | null;
  dataContratoConsigfacil?: string | null;
  periodoConsigfacil?: string | null;
  statusConsigfacil?: ConsigfacilStatus | string | null;
  origem?: string | null;
  contratoEmAndamento?: boolean;
  /** Há vínculo/correlação com linha ConsigFácil (match, confirmação, etc.). */
  existeCorrelacaoConsigfacil?: boolean;
  dataImplantacao?: string;
  idConsignacao?: string | null;
  bancoHistorico?: string | null;
  bancoConsigfacil?: string | null;
};

export type ResultadoAutoridadeTemporalConsigfacil = {
  autoridade_temporal: AutoridadeTemporalConsigfacil;
  tipo_correlacao_temporal: TipoCorrelacaoTemporal;
  contrato_migrado_para_consigfacil: boolean;
  data_implantacao_fonte: string;
  competencia_analisada: string | null;
  mensagem_autoridade_temporal: string;
  permite_juizo_estrutural_retroativo: boolean;
  permite_divergencia_estrutural: boolean;
  permite_refin_automatico: boolean;
  permite_alerta_financeiro_critico: boolean;
};

export function competenciaIsoMes(v: string | null | undefined): string | null {
  if (!v?.trim()) return null;
  const m = /^(\d{4}-\d{2})/.exec(v.trim());
  return m?.[1] ?? null;
}

export function dataImplantacaoCompetencia(dataImplantacao?: string): string {
  return competenciaIsoMes(dataImplantacao ?? CONSIGFACIL_DATA_IMPLANTACAO_PADRAO) ?? "2026-01";
}

export function contratoEmAndamentoConsigfacil(
  status?: ConsigfacilStatus | string | null,
  situacaoImportacao?: string | null,
): boolean {
  const s = String(status ?? "").toLowerCase();
  const sit = String(situacaoImportacao ?? "").toLowerCase();
  return (
    s === "ativo" ||
    /andamento|em\s*andamento|vigente|carregad/.test(sit) ||
    /andamento|em\s*andamento/.test(s)
  );
}

export function classificarAutoridadeTemporalConsigfacil(
  input: EntradaAutoridadeTemporalConsigfacil,
): ResultadoAutoridadeTemporalConsigfacil {
  const data_implantacao_fonte = input.dataImplantacao ?? CONSIGFACIL_DATA_IMPLANTACAO_PADRAO;
  const impl = dataImplantacaoCompetencia(data_implantacao_fonte);
  const competencia_analisada =
    competenciaIsoMes(input.competencia) ??
    competenciaIsoMes(input.periodoConsigfacil) ??
    competenciaIsoMes(input.dataContratoConsigfacil);

  let autoridade: AutoridadeTemporalConsigfacil = "sem_autoridade_retroativa";
  let tipo_correlacao_temporal: TipoCorrelacaoTemporal = "sem_correlacao";
  let contrato_migrado_para_consigfacil = false;
  let mensagem = "";

  if (!competencia_analisada) {
    autoridade = "oficial_atual";
    tipo_correlacao_temporal = "oficial_atual";
    mensagem = "Competência não informada — aplica regra de fonte oficial atual.";
  } else if (competencia_analisada >= impl) {
    autoridade = "oficial_atual";
    tipo_correlacao_temporal = "oficial_atual";
    mensagem = `Competência ${competencia_analisada} na vigência do ConsigFácil (implantação ${impl}).`;
  } else if (input.contratoEmAndamento) {
    autoridade = "migracao_carga_inicial";
    tipo_correlacao_temporal = "migracao_carga_inicial";
    contrato_migrado_para_consigfacil = true;
    mensagem =
      "Contrato histórico em andamento foi carregado no ConsigFácil após implantação do portal.";
  } else if (input.existeCorrelacaoConsigfacil) {
    autoridade = "contextual_historica";
    tipo_correlacao_temporal = "correlacao_historica";
    mensagem =
      "Contrato anterior à implantação do ConsigFácil. Dados atuais indicam provável migração/carga inicial, não divergência estrutural.";
  } else {
    autoridade = "sem_autoridade_retroativa";
    tipo_correlacao_temporal = "sem_correlacao";
    mensagem =
      "Competência anterior à implantação sem correlação ConsigFácil — sem juízo estrutural retroativo.";
  }

  const oficial = autoridade === "oficial_atual";

  const resultado: ResultadoAutoridadeTemporalConsigfacil = {
    autoridade_temporal: autoridade,
    tipo_correlacao_temporal,
    contrato_migrado_para_consigfacil,
    data_implantacao_fonte,
    competencia_analisada,
    mensagem_autoridade_temporal: mensagem,
    permite_juizo_estrutural_retroativo: oficial,
    permite_divergencia_estrutural: oficial,
    permite_refin_automatico: oficial,
    permite_alerta_financeiro_critico: oficial,
  };

  logTemporalConsigfacil({
    competencia: competencia_analisada,
    contrato: input.idConsignacao ?? null,
    banco_historico: input.bancoHistorico ?? null,
    banco_consigfacil: input.bancoConsigfacil ?? null,
    autoridade_temporal: autoridade,
    acao: oficial ? "juizo_oficial" : "correlacao_contextual",
  });

  return resultado;
}

export function autoridadePermiteJuizoEstrutural(
  autoridade: AutoridadeTemporalConsigfacil,
): boolean {
  return autoridade === "oficial_atual";
}

export function rotuloBadgeAutoridadeTemporal(
  autoridade: AutoridadeTemporalConsigfacil,
): string {
  switch (autoridade) {
    case "oficial_atual":
      return "Oficial atual";
    case "migracao_carga_inicial":
      return "Migração carga inicial";
    case "contextual_historica":
      return "Correlação histórica";
    default:
      return "Sem autoridade retroativa";
  }
}

export function tituloCorrelacaoPorAutoridade(
  autoridade: AutoridadeTemporalConsigfacil,
): string {
  if (autoridade === "oficial_atual") return "Divergência encontrada";
  return "Correlação histórica detectada";
}

export function entradaTemporalDeContrato(
  contrato: ConsigfacilContrato,
  competenciaFolha?: string | null,
  extras?: Partial<EntradaAutoridadeTemporalConsigfacil>,
): EntradaAutoridadeTemporalConsigfacil {
  return {
    competencia: competenciaFolha ?? contrato.competencia,
    dataContratoConsigfacil: contrato.data_contrato,
    periodoConsigfacil: contrato.competencia,
    statusConsigfacil: contrato.status,
    origem: contrato.origem,
    contratoEmAndamento: contratoEmAndamentoConsigfacil(
      contrato.status,
      contrato.situacao_importacao,
    ),
    existeCorrelacaoConsigfacil: true,
    idConsignacao: contrato.id_consignacao,
    bancoConsigfacil: contrato.instituicao,
    ...extras,
  };
}

export function logTemporalConsigfacil(payload: {
  competencia: string | null;
  contrato: string | null;
  banco_historico: string | null;
  banco_consigfacil: string | null;
  autoridade_temporal: AutoridadeTemporalConsigfacil;
  acao: string;
}): void {
  console.log("[TEMPORAL_CONSIGFACIL]", payload);
}
