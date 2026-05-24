/**
 * Ao guardar contrato/anexo: OCR → extração → análise consolidada (não bloqueia se incompleto).
 */

import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import type { Loan } from "@/types/contracheque";
import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { TipoEvidenciaEmprestimo } from "@/types/loan-evidence";
import type { PerfilTitularApp } from "@/lib/contratos/perfil-titular-app";
import type { RendaReferenciaUsuario } from "@/lib/contratos/renda-referencia-usuario";
import type { ContrachequeFichaReadProgress } from "@/services/ocr/extrair-texto-documento";
import type { ContratosAnterioresCandidatos } from "@/services/contratos/comparar-contrato-anterior-mesmo-banco";
import {
  executarMotorAnaliseContrato,
  type ContextoMotorAnaliseContrato,
} from "@/services/contratos/motor-analise-contrato";
import { gerarAnaliseJuridicoFinanceiraContrato } from "@/services/contratos/analise-juridico-financeira-contrato";
import {
  analiseContratoConsideradaIncompleta,
  montarColunasLeituraEvidenciaContrato,
} from "@/services/evidencias/montar-colunas-leitura-evidencia-contrato";
import { recomputarLeituraDeExtraidoContrato } from "@/services/evidencias/recomputar-leitura-extraido-contrato";
import {
  executarPipelineLeituraAutomaticaEvidencia,
  type ResultadoLeituraAutomaticaEvidencia,
} from "@/services/evidencias/pipeline-leitura-automatica";

const TIPOS_COM_PIPELINE_FINANCEIRO = new Set<TipoEvidenciaEmprestimo>([
  "contrato_formal",
  "taxa_seguro",
]);

export type ProcessarContratoAnexoParaPersistenciaParams = {
  tipoEvidencia: TipoEvidenciaEmprestimo;
  leituraExistente?: ResultadoLeituraAutomaticaEvidencia | null;
  extraidoRevisado?: ContratoExtraido | null;
  contratosCandidatos: EmprestimoContratoAnalise[];
  titular?: PerfilTitularApp | null;
  renda?: RendaReferenciaUsuario | null;
  loans?: Loan[];
  loanIdVinculado?: string | null;
  conferenciaObservacao?: string | null;
  contratosAnteriores?: ContratosAnterioresCandidatos;
  /** Contexto completo do motor (sobrescreve montagem parcial de renda/loans). */
  motorAnalise?: ContextoMotorAnaliseContrato;
  onProgress?: (p: ContrachequeFichaReadProgress) => void;
  forceDeepOcr?: boolean;
};

export type ProcessarContratoAnexoParaPersistenciaResult = {
  leitura: ResultadoLeituraAutomaticaEvidencia | null;
  leituraCols: Record<string, unknown>;
  avisosPipeline: string[];
  analiseIncompleta: boolean;
};

function criarLeituraFallback(
  file: File,
  motivo: string,
  contratosCandidatos: EmprestimoContratoAnalise[],
): ResultadoLeituraAutomaticaEvidencia {
  const extraido: ContratoExtraido = {
    alertasPlausibilidade: [
      {
        severidade: "aviso",
        codigo: "pipeline_ocr_falhou",
        mensagem: `Leitura automática incompleta ao guardar: ${motivo}`,
      },
    ],
    scoreConfianca: 0,
  };
  const analiseContratoEmprestimo = executarMotorAnaliseContrato(extraido, { textoBruto: "" });
  return {
    ocrTextoBruto: "",
    extraido,
    leituraConfiancaScore: 0,
    leituraConfiancaNivel: "baixa",
    camposNaoEncontrados: [],
    sugestoesVinculo: [],
    fingerprintSugeridoAuto: null,
    analiseContratoEmprestimo,
  };
}

function contextoMotorDeParams(
  params: ProcessarContratoAnexoParaPersistenciaParams,
): ContextoMotorAnaliseContrato {
  if (params.motorAnalise) return params.motorAnalise;
  return {
    renda: params.renda ?? undefined,
    loans: params.loans,
    loanIdVinculado: params.loanIdVinculado ?? null,
    contratosAnteriores: params.contratosAnteriores,
    titular: params.titular,
  };
}

/**
 * Garante OCR, campos financeiros e `analisarContratoEmprestimo` antes do insert.
 * Erros de leitura não impedem o salvamento (payload mínimo + avisos).
 */
export async function processarContratoAnexoParaPersistencia(
  file: File,
  params: ProcessarContratoAnexoParaPersistenciaParams,
): Promise<ProcessarContratoAnexoParaPersistenciaResult> {
  const avisosPipeline: string[] = [];

  if (!TIPOS_COM_PIPELINE_FINANCEIRO.has(params.tipoEvidencia)) {
    return {
      leitura: null,
      leituraCols: {},
      avisosPipeline: [],
      analiseIncompleta: false,
    };
  }

  const ctxMotor = contextoMotorDeParams(params);
  let leitura: ResultadoLeituraAutomaticaEvidencia;

  try {
    const ocrExistente = params.leituraExistente?.ocrTextoBruto?.trim() ?? "";
    const extraidoBase = params.extraidoRevisado ?? params.leituraExistente?.extraido;

    if (extraidoBase && ocrExistente.length > 0) {
      leitura = recomputarLeituraDeExtraidoContrato(ocrExistente, extraidoBase, params.contratosCandidatos, {
        titular: params.titular,
        motorAnalise: ctxMotor,
      });
    } else {
      leitura = await executarPipelineLeituraAutomaticaEvidencia(file, params.contratosCandidatos, {
        onProgress: params.onProgress,
        forceDeepOcr: params.forceDeepOcr,
        titular: params.titular,
        motorAnalise: ctxMotor,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    avisosPipeline.push(
      `OCR/análise falhou (${msg}). O anexo será guardado para conferência manual.`,
    );
    leitura = criarLeituraFallback(file, msg, params.contratosCandidatos);
  }

  let analiseJuridica = null;
  if (params.renda && params.loans?.length) {
    try {
      analiseJuridica = gerarAnaliseJuridicoFinanceiraContrato(leitura.extraido, {
        loans: params.loans,
        renda: params.renda,
        loanIdVinculado: params.loanIdVinculado ?? null,
        usarParcelaDoContratoNaSoma: true,
      });
    } catch {
      avisosPipeline.push("Análise jurídico-financeira auxiliar não gerada — Radar consolidado mantido.");
    }
  }

  const extraidoDb = params.extraidoRevisado ?? leitura.extraido;
  const leituraCols = montarColunasLeituraEvidenciaContrato(leitura, {
    extraidoParaDb: extraidoDb,
    analiseJuridicaFinanceira: analiseJuridica,
    conferenciaObservacao: params.conferenciaObservacao,
  });

  const analiseIncompleta = analiseContratoConsideradaIncompleta(leitura);
  if (analiseIncompleta) {
    avisosPipeline.push(
      "Análise automática incompleta — anexo guardado com status pendente de conferência.",
    );
  }

  return {
    leitura,
    leituraCols,
    avisosPipeline,
    analiseIncompleta,
  };
}
