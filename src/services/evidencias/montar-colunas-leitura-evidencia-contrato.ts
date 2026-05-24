/**
 * Colunas Supabase para leitura automática + Radar do Contrato ao guardar evidência.
 */

import type { AnaliseContratoEmprestimo } from "@/types/analise-contrato-emprestimo";
import type { AnaliseJuridicoFinanceiraContrato } from "@/types/analise-juridico-financeira-contrato";
import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { ResultadoLeituraAutomaticaEvidencia } from "@/services/evidencias/pipeline-leitura-automatica";
import type { AlertaContratoEmprestimo } from "@/types/analise-contrato-emprestimo";

export type AlertaVisualEvidenciaContrato = {
  codigo: string;
  severidade: AlertaContratoEmprestimo["severidade"] | "aviso" | "critico";
  titulo: string;
  mensagem: string;
  origem: "analise_consolidada" | "plausibilidade_ocr";
};

const MAPA_RISCO_ANALISE_JURIDICA: Record<
  AnaliseContratoEmprestimo["risco_geral"],
  string
> = {
  baixo: "sem_alerta",
  medio: "atencao",
  alto: "alto_risco",
  revisao_juridica: "revisao_juridica",
};

/** Status inicial após upload — aguarda conferência humana (Radar / PDF). */
export const STATUS_CONFERENCIA_PENDENTE_INICIAL = "pendente_conferencia" as const;

export function montarAlertasVisuaisContrato(
  leitura: ResultadoLeituraAutomaticaEvidencia,
): AlertaVisualEvidenciaContrato[] {
  const out: AlertaVisualEvidenciaContrato[] = [];
  const codigos = new Set<string>();

  for (const a of leitura.analiseContratoEmprestimo.alertas) {
    if (codigos.has(a.codigo)) continue;
    codigos.add(a.codigo);
    out.push({
      codigo: a.codigo,
      severidade: a.severidade,
      titulo: a.titulo,
      mensagem: a.mensagem,
      origem: "analise_consolidada",
    });
  }

  for (const a of leitura.extraido.alertasPlausibilidade ?? []) {
    const codigo = `plaus_${a.codigo}`;
    if (codigos.has(codigo)) continue;
    codigos.add(codigo);
    out.push({
      codigo,
      severidade: a.severidade === "critico" ? "critico" : "atencao",
      titulo: a.codigo,
      mensagem: a.mensagem,
      origem: "plausibilidade_ocr",
    });
  }

  const peso = (s: AlertaVisualEvidenciaContrato["severidade"]) =>
    s === "critico" ? 4 : s === "alto" ? 3 : s === "atencao" || s === "aviso" ? 2 : 1;

  return out.sort((a, b) => peso(b.severidade) - peso(a.severidade));
}

export function montarColunasLeituraEvidenciaContrato(
  leitura: ResultadoLeituraAutomaticaEvidencia,
  opts?: {
    extraidoParaDb?: ContratoExtraido;
    analiseJuridicaFinanceira?: AnaliseJuridicoFinanceiraContrato | null;
    conferenciaObservacao?: string | null;
  },
): Record<string, unknown> {
  const fonte = opts?.extraidoParaDb ?? leitura.extraido;
  const { textoExtraido: _txt, ...extraidoDb } = fonte;
  void _txt;

  const alertasVisuais = montarAlertasVisuaisContrato(leitura);
  const analise = leitura.analiseContratoEmprestimo;

  const cols: Record<string, unknown> = {
    ocr_texto_bruto: leitura.ocrTextoBruto,
    contrato_extraido: extraidoDb,
    leitura_confianca_nivel: leitura.leituraConfiancaNivel,
    leitura_confianca_score: leitura.leituraConfiancaScore,
    vinculo_sugestoes: leitura.sugestoesVinculo,
    leitura_processada_em: new Date().toISOString(),
    status_conferencia: STATUS_CONFERENCIA_PENDENTE_INICIAL,
    conferencia_realizada_em: null,
    conferencia_observacao: opts?.conferenciaObservacao?.trim() || null,
    analise_contrato_emprestimo: {
      ...analise,
      alertas_visuais: alertasVisuais,
    },
    analise_juridica_status: MAPA_RISCO_ANALISE_JURIDICA[analise.risco_geral] ?? "atencao",
    analise_juridica_conferencia: "pendente",
    analise_juridica_observacao: null,
  };

  if (opts?.analiseJuridicaFinanceira) {
    cols.analise_juridica_financeira = opts.analiseJuridicaFinanceira;
  }

  return cols;
}

export function analiseContratoConsideradaIncompleta(
  leitura: ResultadoLeituraAutomaticaEvidencia,
): boolean {
  const pendencias = leitura.analiseContratoEmprestimo.pendencias_conferencia.length;
  const camposObrigatorios =
    leitura.analiseContratoEmprestimo.fontes?.campos_obrigatorios_ausentes?.length ?? 0;
  const ocrVazio = !leitura.ocrTextoBruto.trim();
  return pendencias > 0 || camposObrigatorios >= 4 || ocrVazio || leitura.leituraConfiancaNivel === "baixa";
}
