/**
 * Orquestra leitura automática de contracheque: OCR → parser SEAD → detecção cartão/saque nas rubricas.
 * O texto OCR é persistido em `payslips.raw_text` ao gravar (equivalente a `ocr_texto_bruto` em evidências).
 */

import type { ParsedPayslipPayload } from "@/lib/anexos/sead-payslip-parse";
import { parseSeadPayslipText } from "@/lib/anexos/sead-payslip-parse";
import { anexarCartaoSaqueAoPayloadParsed, historicoRubricaDePayslips } from "@/lib/contracheque/campos-cartao-saque-ao-gravar-payslip";
import type { PayslipHistoricoRubricaMin } from "@/lib/contracheque/detectar-cartao-saque-em-rubricas-contracheque";
import {
  resolverCompetenciaParaUpload,
  type CompetenciaSugestao,
} from "@/lib/anexos/competencia";
import { inferContrachequeEmitSugestao } from "@/lib/anexos/infer-contracheque-emit";
import {
  readContrachequeFichaDocumentText,
  type ContrachequeReadMetadata,
} from "@/lib/reading/contracheque-ficha-document-text";
import type { ContrachequeFichaReadProgress } from "@/services/ocr/extrair-texto-documento";
import { getTodosCandidatosSenhaPdfDocumento } from "@/lib/import/import-pdf-auto-password";
import type { Payslip } from "@/types/contracheque";
import type { PayslipFolhaEmitKind } from "@/types/contracheque";
import type { AnaliseCartaoSaqueContracheque } from "@/types/cartao-saque-embutido";

export type ResultadoLeituraAutomaticaContracheque = {
  /** Texto integral do OCR / camada PDF (gravado em `payslips.raw_text`). */
  ocrTextoBruto: string;
  parsed: ParsedPayslipPayload;
  metaCompetencia: CompetenciaSugestao;
  emitKind: Extract<PayslipFolhaEmitKind, "mensal_principal" | "folha_especial">;
  ocrReforcoRealizado: boolean;
  readMetadata?: ContrachequeReadMetadata;
  analiseCartaoSaque: AnaliseCartaoSaqueContracheque;
};

export type OpcoesPipelineLeituraContracheque = {
  fileName: string;
  onProgress?: (p: ContrachequeFichaReadProgress) => void;
  forceDeepOcr?: boolean;
  pdfPasswordCandidates?: string[];
  /** Folhas já na base — recorrência cartão/RMC/RCC. */
  historicoPayslips?: Payslip[];
  /** Se já conhece competência (ex.: edição manual na UI). */
  competencia?: { month: number; year: number };
};

function historicoParaCompetencia(
  historico: PayslipHistoricoRubricaMin[],
  month: number,
  year: number,
): PayslipHistoricoRubricaMin[] {
  return historico.filter((h) => !(h.mes === month && h.ano === year));
}

/**
 * Aplica parser + detecção cartão/saque sobre payload já parseado (ficha multi-mês, releitura parcial).
 */
export function finalizarLeituraContrachequeParsed(
  ocrTextoBruto: string,
  parsedBase: ParsedPayslipPayload,
  opts: {
    fileName: string;
    month: number;
    year: number;
    historicoPayslips?: Payslip[];
    metaCompetencia?: CompetenciaSugestao;
    ocrReforcoRealizado?: boolean;
    readMetadata?: ContrachequeReadMetadata;
  },
): ResultadoLeituraAutomaticaContracheque {
  const historico = historicoRubricaDePayslips(opts.historicoPayslips ?? []);
  const parsed = anexarCartaoSaqueAoPayloadParsed(
    parsedBase,
    opts.month,
    opts.year,
    historicoParaCompetencia(historico, opts.month, opts.year),
  );
  const meta =
    opts.metaCompetencia ?? resolverCompetenciaParaUpload(ocrTextoBruto, opts.fileName);
  const emitGuess = inferContrachequeEmitSugestao(opts.fileName, ocrTextoBruto, parsed);

  return {
    ocrTextoBruto,
    parsed,
    metaCompetencia: meta,
    emitKind: emitGuess === "folha_especial" ? "folha_especial" : "mensal_principal",
    ocrReforcoRealizado: opts.ocrReforcoRealizado ?? !parsed.leituraPossivelmenteIncompleta,
    readMetadata: opts.readMetadata,
    analiseCartaoSaque: parsed.cartaoSaqueContracheque!,
  };
}

/**
 * OCR já obtido (ficha corrida, releitura parcial): parse + cartão/saque + metadados de competência.
 */
export function executarPipelineLeituraAutomaticaContrachequeDeTexto(
  ocrTextoBruto: string,
  options: Omit<OpcoesPipelineLeituraContracheque, "forceDeepOcr" | "onProgress" | "pdfPasswordCandidates">,
): ResultadoLeituraAutomaticaContracheque {
  const parsedBase = parseSeadPayslipText(ocrTextoBruto);
  const meta =
    options.competencia != null
      ? {
          month: options.competencia.month,
          year: options.competencia.year,
          confiavel: true,
          origem: "periodo_padrao" as const,
        }
      : resolverCompetenciaParaUpload(ocrTextoBruto, options.fileName);

  return finalizarLeituraContrachequeParsed(ocrTextoBruto, parsedBase, {
    fileName: options.fileName,
    month: meta.month,
    year: meta.year,
    metaCompetencia: meta,
    historicoPayslips: options.historicoPayslips,
    ocrReforcoRealizado: !parsedBase.leituraPossivelmenteIncompleta,
  });
}

/**
 * Lê ficheiro (PDF/imagem), extrai rubricas e corre detecção de cartão/saque embutido nas descontos.
 */
export async function executarPipelineLeituraAutomaticaContracheque(
  file: File,
  options: OpcoesPipelineLeituraContracheque,
): Promise<ResultadoLeituraAutomaticaContracheque> {
  const pdfPasswordCandidates =
    options.pdfPasswordCandidates ?? getTodosCandidatosSenhaPdfDocumento();

  let readMetadata: ContrachequeReadMetadata | undefined;
  const ocrTextoBruto = await readContrachequeFichaDocumentText(file, {
    forceDeepOcr: options.forceDeepOcr === true,
    pdfPasswordCandidates,
    onReadMetadata: (m) => {
      readMetadata = m;
    },
    onProgress: options.onProgress,
  });

  const base = executarPipelineLeituraAutomaticaContrachequeDeTexto(ocrTextoBruto, {
    fileName: options.fileName,
    competencia: options.competencia,
    historicoPayslips: options.historicoPayslips,
  });
  return {
    ...base,
    ocrReforcoRealizado: options.forceDeepOcr === true || base.ocrReforcoRealizado,
    readMetadata,
  };
}
