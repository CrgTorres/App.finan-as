/**
 * Perfil de leitura serializável para Web Worker (postMessage não aceita funções).
 */

import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";

/** Campos extras do hook `usePerfilLeituraAnalise` — não enviar ao worker. */
type PerfilLeituraComExtras = ResultadoResolucaoPerfil & {
  recarregar?: unknown;
  rotuloNivel?: unknown;
};

/** Copia explícita dos campos usados no pipeline da base financeira. */
export function perfilLeituraParaWorker(
  perfil: PerfilLeituraComExtras,
): ResultadoResolucaoPerfil {
  return {
    nivel: perfil.nivel,
    configAuditoria: perfil.configAuditoria,
    scoreMatchMinimoAutomatico: perfil.scoreMatchMinimoAutomatico,
    scoreMatchLimitePendencia: perfil.scoreMatchLimitePendencia,
    exigirConsigfacilParaFecharPendencia: perfil.exigirConsigfacilParaFecharPendencia,
    tratarDescontoFracionado: perfil.tratarDescontoFracionado,
    detectarRefinanciamentoAutomatico: perfil.detectarRefinanciamentoAutomatico,
    aceitarInferenciaOcrFraca: perfil.aceitarInferenciaOcrFraca,
    alertarDuplicidadeRubrica: perfil.alertarDuplicidadeRubrica,
    priorizarExtratoBancario: perfil.priorizarExtratoBancario,
    modoListaConferencia: perfil.modoListaConferencia,
    visualizacaoConsolidadaInteligente: perfil.visualizacaoConsolidadaInteligente,
    catalogoVersion: perfil.catalogoVersion,
    resumo: [...perfil.resumo],
    perguntasPendentes: [...perfil.perguntasPendentes],
    parametrosAplicados: { ...perfil.parametrosAplicados },
    respostas: { ...perfil.respostas },
  };
}
