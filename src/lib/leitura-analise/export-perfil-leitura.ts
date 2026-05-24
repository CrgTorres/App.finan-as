/**
 * Monta linhas da aba Perfil_Leitura para exportação Excel/CSV.
 */

import {
  CATALOGO_PERGUNTAS_LEITURA,
  CATALOGO_PERGUNTAS_LEITURA_VERSION,
} from "@/lib/leitura-analise/catalogo-perguntas-leitura";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import type { RespostasFormularioLeitura } from "@/lib/leitura-analise/types-perfil-leitura";
import { ROTULOS_NIVEL_LEITURA } from "@/lib/leitura-analise/types-perfil-leitura";

export type LinhaPerfilLeituraExport = {
  pergunta_id: string;
  pergunta: string;
  resposta: string;
  nivel_resultante: string;
  parametro_afetado: string;
  valor_aplicado: string;
  motivo: string;
  data_atualizacao: string;
};

function rotuloResposta(perguntaId: string, valor: string): string {
  const p = CATALOGO_PERGUNTAS_LEITURA.find((x) => x.id === perguntaId);
  const op = p?.opcoes.find((o) => o.valor === valor);
  return op?.rotulo ?? valor;
}

/** Parâmetros explícitos derivados do perfil resolvido (auditoria/exportação). */
export function parametrosAplicadosFlat(
  resolvido: ResultadoResolucaoPerfil,
): Record<string, string | number | boolean> {
  const c = resolvido.configAuditoria;
  return {
    perfil_leitura_ativo: resolvido.nivel,
    perfil_leitura_rotulo: ROTULOS_NIVEL_LEITURA[resolvido.nivel].titulo,
    versao_catalogo_perguntas: resolvido.catalogoVersion,
    "refinanciamento.exigir_indicio_oficial": c.refinanciamento.exigir_indicio_oficial,
    "refinanciamento.minimo_indicios": c.refinanciamento.minimo_indicios,
    "refinanciamento.min_indicios_fortes": c.refinanciamento.min_indicios_fortes,
    "refinanciamento.mesmo_banco_data_proxima_nao_basta":
      c.refinanciamento.mesmo_banco_data_proxima_nao_basta,
    "conciliacao.aceitar_desconto_fracionado": c.conciliacao.aceitar_desconto_fracionado,
    "conciliacao.tolerancia_valor": c.conciliacao.tolerancia_valor,
    "conciliacao.tolerancia_percentual": c.conciliacao.tolerancia_percentual,
    "conferencia.remover_desconto_fracionado_conciliado":
      c.conferencia.remover_desconto_fracionado_conciliado,
    score_match_minimo_automatico: resolvido.scoreMatchMinimoAutomatico,
    score_match_limite_pendencia: resolvido.scoreMatchLimitePendencia,
    modo_lista_conferencia: resolvido.modoListaConferencia,
    detectar_refinanciamento_automatico: resolvido.detectarRefinanciamentoAutomatico,
  };
}

export function montarLinhasPerfilLeituraExport(input: {
  respostas: RespostasFormularioLeitura;
  resolvido: ResultadoResolucaoPerfil;
  dataAtualizacao: string;
}): LinhaPerfilLeituraExport[] {
  const { respostas, resolvido, dataAtualizacao } = input;
  const nivelRotulo = ROTULOS_NIVEL_LEITURA[resolvido.nivel].titulo;
  const params = parametrosAplicadosFlat(resolvido);

  const linhasPerguntas: LinhaPerfilLeituraExport[] = CATALOGO_PERGUNTAS_LEITURA.map((p) => {
    const valor = respostas[p.id] ?? "";
    return {
      pergunta_id: p.id,
      pergunta: p.pergunta,
      resposta: rotuloResposta(p.id, valor),
      nivel_resultante: nivelRotulo,
      parametro_afetado: p.grupo,
      valor_aplicado: valor,
      motivo: p.origemSistema,
      data_atualizacao: dataAtualizacao,
    };
  });

  const linhasParametros: LinhaPerfilLeituraExport[] = Object.entries(params).map(([chave, val]) => ({
    pergunta_id: "_parametro",
    pergunta: "Parâmetro aplicado no processamento",
    resposta: String(val),
    nivel_resultante: nivelRotulo,
    parametro_afetado: chave,
    valor_aplicado: String(val),
    motivo: `Catálogo v${CATALOGO_PERGUNTAS_LEITURA_VERSION} — ativo na geração da base.`,
    data_atualizacao: dataAtualizacao,
  }));

  return [...linhasPerguntas, ...linhasParametros];
}

/** Linhas de auditoria (mesmo formato exportável) para rastreio do perfil ativo. */
export function montarAuditoriaPerfilLeitura(
  resolvido: ResultadoResolucaoPerfil,
  data: string,
): Array<{
  alvo_id: string;
  campo_alterado: string;
  valor_novo: string;
  origem: string;
  motivo: string;
  data: string;
  tipo: string;
}> {
  return Object.entries(resolvido.parametrosAplicados).map(([chave, val]) => ({
    alvo_id: "perfil_leitura",
    campo_alterado: chave,
    valor_novo: String(val),
    origem: "perfil_leitura",
    motivo: `Perfil ${resolvido.nivel} — catálogo v${resolvido.catalogoVersion}`,
    data,
    tipo: "config_perfil_leitura",
  }));
}
