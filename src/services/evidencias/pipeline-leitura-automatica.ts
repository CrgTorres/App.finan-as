/**
 * Orquestra: OCR → extração → pontuação → sugestões de vínculo (sem persistência aqui).
 */

import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { auditarConfiabilidadeContrato } from "@/services/contratos/auditar-confiabilidade-contrato";
import { alertasTitularContrato } from "@/services/contratos/alertas-titular-contrato";
import { enriquecerContratoExtraido } from "@/services/contratos/enriquecer-contrato-extraido";
import { convergirDatasContrato } from "@/services/contratos/extrair-datas-contrato";
import { extrairContratoDeTextoBruto } from "@/services/contratos/extrair-contrato-de-texto";
import { aplicarSaneamentoContratoExtraido } from "@/services/contratos/saneamento-contrato-extraido";
import { validarPlausibilidadeContratoCredito } from "@/services/contratos/validar-plausibilidade-contrato-credito";
import type { PerfilTitularApp } from "@/lib/contratos/perfil-titular-app";
import {
  listarCamposContratoExtraidoAusentes,
  pontuarConfiancaLeitura,
} from "@/services/contratos/pontuar-confianca-leitura";
import { getTodosCandidatosSenhaPdfDocumento } from "@/lib/import/import-pdf-auto-password";
import type { ContrachequeFichaReadProgress } from "@/services/ocr/extrair-texto-documento";
import { extrairTextoDocumentoFinanceiro } from "@/services/ocr/extrair-texto-documento";
import {
  melhorFingerprintSeAltaConfianca,
  sugerirVinculosContrato,
} from "@/services/inferencias/sugerir-vinculos-contrato";
import {
  executarMotorAnaliseContrato,
  type ContextoMotorAnaliseContrato,
} from "@/services/contratos/motor-analise-contrato";
import type { AnaliseContratoEmprestimo } from "@/types/analise-contrato-emprestimo";
import type { ContratoExtraido, NivelConfiancaLeitura, SugestaoVinculoContrato } from "@/types/contrato-extraido";

export type ResultadoLeituraAutomaticaEvidencia = {
  ocrTextoBruto: string;
  extraido: ContratoExtraido;
  leituraConfiancaScore: number;
  leituraConfiancaNivel: NivelConfiancaLeitura;
  camposNaoEncontrados: (keyof ContratoExtraido)[];
  sugestoesVinculo: SugestaoVinculoContrato[];
  fingerprintSugeridoAuto: string | null;
  /** JSON único com dimensões padronizadas (juros, CET, seguro, margem, etc.). */
  analiseContratoEmprestimo: AnaliseContratoEmprestimo;
};

export async function executarPipelineLeituraAutomaticaEvidencia(
  file: File,
  contratosCandidatos: EmprestimoContratoAnalise[],
  options?: {
    onProgress?: (p: ContrachequeFichaReadProgress) => void;
    forceDeepOcr?: boolean;
    /** Se omitido, usa env + localStorage + CPF em `NEXT_PUBLIC_USER_CPF_DIGITS_FOR_PDF`. */
    pdfPasswordCandidates?: string[];
    /** Titular logado (env + folha) para alertas de contrato de terceiros. */
    titular?: PerfilTitularApp | null;
    /** Contexto do motor central (renda, contratos anteriores, taxa referência). */
    motorAnalise?: ContextoMotorAnaliseContrato;
    /** @deprecated Use `motorAnalise`. */
    analiseContrato?: ContextoMotorAnaliseContrato;
  },
): Promise<ResultadoLeituraAutomaticaEvidencia> {
  const pdfPasswordCandidates =
    options?.pdfPasswordCandidates ?? getTodosCandidatosSenhaPdfDocumento();
  const ocrTextoBruto = await extrairTextoDocumentoFinanceiro(file, {
    onProgress: options?.onProgress,
    forceDeepOcr: options?.forceDeepOcr,
    pdfPasswordCandidates,
  });
  const extraidoBruto = extrairContratoDeTextoBruto(ocrTextoBruto);
  const { extraido: aposDatas, alertas: alertasDatas } = convergirDatasContrato(extraidoBruto, ocrTextoBruto);
  const aposEnriquecimento = enriquecerContratoExtraido(aposDatas, options?.titular ?? null);
  const { extraido: aposSaneamento, notas: notasSaneamento } =
    aplicarSaneamentoContratoExtraido(aposEnriquecimento);
  const alertasValidacao = validarPlausibilidadeContratoCredito(aposSaneamento, ocrTextoBruto);
  const alertasTitular = alertasTitularContrato(aposSaneamento, options?.titular ?? null);
  const alertasPlausibilidade = [
    ...notasSaneamento,
    ...alertasDatas,
    ...alertasValidacao,
    ...alertasTitular,
  ];
  const comAlertas: ContratoExtraido = { ...aposSaneamento, alertasPlausibilidade };
  const { score: scoreBruto } = pontuarConfiancaLeitura(comAlertas);
  const preAudit: ContratoExtraido = {
    ...comAlertas,
    scoreConfianca: scoreBruto,
    textoExtraido: ocrTextoBruto,
  };
  const sintese = auditarConfiabilidadeContrato(preAudit);
  const extraido: ContratoExtraido = {
    ...preAudit,
    scoreConfianca: sintese.scoreAjustado,
    sinteseConfiabilidade: sintese,
  };
  const nivel = sintese.nivelGeral;
  const score = sintese.scoreAjustado;
  const camposNaoEncontrados = listarCamposContratoExtraidoAusentes(extraido);
  const sugestoesVinculo = sugerirVinculosContrato(extraido, contratosCandidatos);
  const fingerprintSugeridoAuto = melhorFingerprintSeAltaConfianca(sugestoesVinculo);
  const ctxMotor = options?.motorAnalise ?? options?.analiseContrato ?? {};
  const analiseContratoEmprestimo = executarMotorAnaliseContrato(extraido, {
    ...ctxMotor,
    textoBruto: ctxMotor.textoBruto ?? ocrTextoBruto,
  });

  return {
    ocrTextoBruto,
    extraido,
    leituraConfiancaScore: score,
    leituraConfiancaNivel: nivel,
    camposNaoEncontrados,
    sugestoesVinculo,
    fingerprintSugeridoAuto,
    analiseContratoEmprestimo,
  };
}
