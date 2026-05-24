/**
 * Reprocessa extração/auditoria/análise a partir de extraído já revisado (sem novo OCR).
 */

import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { auditarConfiabilidadeContrato } from "@/services/contratos/auditar-confiabilidade-contrato";
import { alertasTitularContrato } from "@/services/contratos/alertas-titular-contrato";
import { enriquecerContratoExtraido } from "@/services/contratos/enriquecer-contrato-extraido";
import { convergirDatasContrato } from "@/services/contratos/extrair-datas-contrato";
import { aplicarSaneamentoContratoExtraido } from "@/services/contratos/saneamento-contrato-extraido";
import { validarPlausibilidadeContratoCredito } from "@/services/contratos/validar-plausibilidade-contrato-credito";
import type { PerfilTitularApp } from "@/lib/contratos/perfil-titular-app";
import {
  listarCamposContratoExtraidoAusentes,
  pontuarConfiancaLeitura,
} from "@/services/contratos/pontuar-confianca-leitura";
import {
  executarMotorAnaliseContrato,
  type ContextoMotorAnaliseContrato,
} from "@/services/contratos/motor-analise-contrato";
import {
  melhorFingerprintSeAltaConfianca,
  sugerirVinculosContrato,
} from "@/services/inferencias/sugerir-vinculos-contrato";
import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { ResultadoLeituraAutomaticaEvidencia } from "@/services/evidencias/pipeline-leitura-automatica";

export function recomputarLeituraDeExtraidoContrato(
  ocrTextoBruto: string,
  extraidoEntrada: ContratoExtraido,
  contratosCandidatos: EmprestimoContratoAnalise[],
  options?: {
    titular?: PerfilTitularApp | null;
    motorAnalise?: ContextoMotorAnaliseContrato;
  },
): ResultadoLeituraAutomaticaEvidencia {
  const texto = ocrTextoBruto || extraidoEntrada.textoExtraido || "";
  const comTexto: ContratoExtraido = { ...extraidoEntrada, textoExtraido: texto };
  const { extraido: aposDatas, alertas: alertasDatas } = convergirDatasContrato(comTexto, texto);
  const aposEnriquecimento = enriquecerContratoExtraido(aposDatas, options?.titular ?? null);
  const { extraido: aposSaneamento, notas: notasSaneamento } =
    aplicarSaneamentoContratoExtraido(aposEnriquecimento);
  const alertasValidacao = validarPlausibilidadeContratoCredito(aposSaneamento, texto);
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
    textoExtraido: texto,
  };
  const sintese = auditarConfiabilidadeContrato(preAudit);
  const extraido: ContratoExtraido = {
    ...preAudit,
    scoreConfianca: sintese.scoreAjustado,
    sinteseConfiabilidade: sintese,
  };
  const camposNaoEncontrados = listarCamposContratoExtraidoAusentes(extraido);
  const sugestoesVinculo = sugerirVinculosContrato(extraido, contratosCandidatos);
  const fingerprintSugeridoAuto = melhorFingerprintSeAltaConfianca(sugestoesVinculo);
  const analiseContratoEmprestimo = executarMotorAnaliseContrato(extraido, {
    ...options?.motorAnalise,
    textoBruto: texto,
  });

  return {
    ocrTextoBruto: texto,
    extraido,
    leituraConfiancaScore: sintese.scoreAjustado,
    leituraConfiancaNivel: sintese.nivelGeral,
    camposNaoEncontrados,
    sugestoesVinculo,
    fingerprintSugeridoAuto,
    analiseContratoEmprestimo,
  };
}
