import {
  CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
  type ConfigAuditoriaConsigfacil,
} from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import {
  CATALOGO_PERGUNTAS_LEITURA,
  CATALOGO_PERGUNTAS_LEITURA_VERSION,
  respostasPadraoFormulario,
} from "@/lib/leitura-analise/catalogo-perguntas-leitura";
import { parametrosAplicadosFlat } from "@/lib/leitura-analise/export-perfil-leitura";
import type {
  NivelLeituraAnalise,
  ParametrosLeituraAnalise,
  RespostasFormularioLeitura,
} from "@/lib/leitura-analise/types-perfil-leitura";

export type { ParametrosLeituraAnalise };

export type ResultadoResolucaoPerfil = ParametrosLeituraAnalise & {
  catalogoVersion: number;
  resumo: string[];
  perguntasPendentes: string[];
  parametrosAplicados: Record<string, string | number | boolean>;
  respostas: RespostasFormularioLeitura;
};

function r(respostas: RespostasFormularioLeitura, id: string): string {
  return respostas[id] ?? respostasPadraoFormulario()[id] ?? "";
}

function pontuarNivel(respostas: RespostasFormularioLeitura): number {
  let pts = 0;
  const consig = r(respostas, "fonte_consigfacil");
  if (consig === "sim_regular") pts += 3;
  else if (consig === "sim_parcial") pts += 2;

  const quebrados = r(respostas, "descontos_quebrados_folha");
  if (quebrados === "frequente") pts += 2;
  else if (quebrados === "as_vezes") pts += 1;

  if (r(respostas, "refin_mesmo_banco_indicio_oficial") === "sim_exigir_oficial") pts += 2;
  if (r(respostas, "desconto_fracionado_soma_parcela") === "sim_auto") pts += 1;
  if (r(respostas, "multiplos_contratos_mesmo_banco") === "sim_oficiais_distintos") pts += 2;
  if (r(respostas, "refin_sem_texto_portal") === "sim_gerou_erro") pts += 2;
  if (r(respostas, "ocr_rubricas") === "grave") pts += 2;
  else if (r(respostas, "ocr_rubricas") === "leve") pts += 1;
  if (r(respostas, "cartao_rmc_rcc") !== "nao") pts += 1;
  if (r(respostas, "margem_acima_30") === "sim") pts += 1;
  if (r(respostas, "extrato_bancario") === "sim_completo") pts += 1;
  if (r(respostas, "tolerancia_valor") === "0") pts += 2;
  if (r(respostas, "modo_conferencia") === "manual_total") pts += 2;
  if (r(respostas, "evidencias_contrato") === "sim") pts += 1;

  return pts;
}

function nivelPorPontos(pts: number, respostas: RespostasFormularioLeitura): NivelLeituraAnalise {
  const consig = r(respostas, "fonte_consigfacil");
  if (r(respostas, "refin_mesmo_banco_indicio_oficial") === "sim_exigir_oficial" && consig.startsWith("sim")) {
    return "auditoria_oficial";
  }
  if (consig === "nao" && pts <= 2) return "basico";
  if (pts >= 10 || r(respostas, "modo_conferencia") === "manual_total") return "avancado";
  if (
    pts >= 6 ||
    (consig.startsWith("sim") && r(respostas, "multiplos_contratos_mesmo_banco") === "sim_oficiais_distintos")
  ) {
    return "auditoria_oficial";
  }
  if (consig.startsWith("sim")) return "consignado";
  return "padrao";
}

function buildConfigAuditoria(
  nivel: NivelLeituraAnalise,
  respostas: RespostasFormularioLeitura,
): ConfigAuditoriaConsigfacil {
  const base: ConfigAuditoriaConsigfacil = {
    refinanciamento: { ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO.refinanciamento },
    conciliacao: { ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO.conciliacao },
    conferencia: { ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO.conferencia },
    modo_forense_contratos: CONFIG_AUDITORIA_CONSIGFACIL_PADRAO.modo_forense_contratos,
  };

  const refinMesmoBanco = r(respostas, "refin_mesmo_banco_indicio_oficial");
  if (refinMesmoBanco === "sim_exigir_oficial") {
    base.refinanciamento.exigir_indicio_oficial = true;
    base.refinanciamento.minimo_indicios = 3;
    base.refinanciamento.min_indicios_fortes = 1;
    base.refinanciamento.mesmo_banco_data_proxima_nao_basta = true;
  } else if (refinMesmoBanco === "nao_inferencia") {
    base.refinanciamento.exigir_indicio_oficial = false;
    base.refinanciamento.minimo_indicios = 2;
    base.refinanciamento.min_indicios_fortes = 0;
    base.refinanciamento.mesmo_banco_data_proxima_nao_basta = false;
  } else if (refinMesmoBanco === "sempre_conferencia") {
    base.refinanciamento.exigir_indicio_oficial = true;
    base.refinanciamento.minimo_indicios = 99;
    base.refinanciamento.mesmo_banco_data_proxima_nao_basta = true;
  }

  const descFrac = r(respostas, "desconto_fracionado_soma_parcela");
  if (descFrac === "sim_auto") {
    base.conciliacao.aceitar_desconto_fracionado = true;
    base.conciliacao.tolerancia_valor = 2;
    base.conciliacao.tolerancia_percentual = 1;
    base.conferencia.remover_desconto_fracionado_conciliado = true;
  } else if (descFrac === "nao_conferencia") {
    base.conciliacao.aceitar_desconto_fracionado = false;
    base.conferencia.remover_desconto_fracionado_conciliado = false;
  } else if (descFrac === "so_tolerancia") {
    base.conciliacao.aceitar_desconto_fracionado = true;
    base.conferencia.remover_desconto_fracionado_conciliado = true;
    base.conciliacao.tolerancia_valor = Number(r(respostas, "tolerancia_valor")) || 2;
    base.conciliacao.tolerancia_percentual =
      nivel === "avancado" ? 0.5 : nivel === "basico" ? 2 : 1;
  }

  if (descFrac !== "sim_auto" && descFrac !== "so_tolerancia") {
    const tolValor = Number(r(respostas, "tolerancia_valor"));
    if (tolValor >= 0) base.conciliacao.tolerancia_valor = tolValor;
    base.conciliacao.tolerancia_percentual =
      nivel === "avancado" ? 0.5 : nivel === "basico" ? 2 : 1;
    const aceitarFracionadoLegacy =
      r(respostas, "descontos_quebrados_folha") !== "nunca" && nivel !== "basico";
    if (descFrac === "nao_conferencia") {
      base.conciliacao.aceitar_desconto_fracionado = false;
    } else {
      base.conciliacao.aceitar_desconto_fracionado = aceitarFracionadoLegacy;
    }
  }

  if (refinMesmoBanco !== "sim_exigir_oficial") {
    const exigirOficialLegacy =
      nivel === "auditoria_oficial" ||
      nivel === "avancado" ||
      r(respostas, "refin_sem_texto_portal") === "sim_gerou_erro" ||
      r(respostas, "multiplos_contratos_mesmo_banco") === "sim_oficiais_distintos";
    if (!base.refinanciamento.exigir_indicio_oficial && exigirOficialLegacy) {
      base.refinanciamento.exigir_indicio_oficial = true;
    }
    if (base.refinanciamento.minimo_indicios === CONFIG_AUDITORIA_CONSIGFACIL_PADRAO.refinanciamento.minimo_indicios) {
      base.refinanciamento.minimo_indicios =
        nivel === "basico" ? 4 : nivel === "padrao" ? 3 : 3;
    }
  }

  return base;
}

export function resolverPerfilLeitura(
  respostas: RespostasFormularioLeitura,
): ResultadoResolucaoPerfil {
  const perguntasPendentes: string[] = [];
  for (const p of CATALOGO_PERGUNTAS_LEITURA) {
    if (p.obrigatoria && !respostas[p.id]) {
      perguntasPendentes.push(p.pergunta);
    }
  }

  const pts = pontuarNivel(respostas);
  const nivel = nivelPorPontos(pts, respostas);
  const configAuditoria = buildConfigAuditoria(nivel, respostas);

  let scoreMatchMinimoAutomatico = 90;
  let scoreMatchLimitePendencia = 50;
  if (nivel === "basico") {
    scoreMatchMinimoAutomatico = 95;
    scoreMatchLimitePendencia = 40;
  } else if (nivel === "padrao") {
    scoreMatchMinimoAutomatico = 90;
    scoreMatchLimitePendencia = 50;
  } else if (nivel === "consignado") {
    scoreMatchMinimoAutomatico = 90;
    scoreMatchLimitePendencia = 60;
  } else if (nivel === "auditoria_oficial") {
    scoreMatchMinimoAutomatico = 90;
    scoreMatchLimitePendencia = 70;
  } else {
    scoreMatchMinimoAutomatico = 95;
    scoreMatchLimitePendencia = 80;
  }

  const refinMesmoBanco = r(respostas, "refin_mesmo_banco_indicio_oficial");
  const detectarRefin =
    refinMesmoBanco !== "sempre_conferencia" &&
    nivel !== "basico" &&
    r(respostas, "multiplos_contratos_mesmo_banco") !== "sim_oficiais_distintos" &&
    r(respostas, "refin_sem_texto_portal") !== "sim_gerou_erro";

  const modoConf = r(respostas, "modo_conferencia");
  const modoListaConferencia: ParametrosLeituraAnalise["modoListaConferencia"] =
    modoConf === "todas_linhas"
      ? "linhas_revisao"
      : modoConf === "manual_total"
        ? "todas"
        : "pendencias_reais";

  const parcial: ParametrosLeituraAnalise = {
    nivel,
    configAuditoria,
    scoreMatchMinimoAutomatico,
    scoreMatchLimitePendencia,
    exigirConsigfacilParaFecharPendencia: r(respostas, "fonte_consigfacil") === "sim_regular",
    tratarDescontoFracionado: configAuditoria.conciliacao.aceitar_desconto_fracionado,
    detectarRefinanciamentoAutomatico: detectarRefin,
    aceitarInferenciaOcrFraca: r(respostas, "ocr_rubricas") !== "grave",
    alertarDuplicidadeRubrica:
      r(respostas, "folhas_multiplas") === "sim" || r(respostas, "descontos_quebrados_folha") !== "nunca",
    priorizarExtratoBancario: r(respostas, "extrato_bancario").startsWith("sim"),
    modoListaConferencia,
    visualizacaoConsolidadaInteligente:
      r(respostas, "visualizacao_triagem_consolidada") !== "nao",
  };

  const parametrosAplicados = parametrosAplicadosFlat({
    ...parcial,
    catalogoVersion: CATALOGO_PERGUNTAS_LEITURA_VERSION,
    resumo: [],
    perguntasPendentes,
    parametrosAplicados: {} as Record<string, string | number | boolean>,
    respostas,
  });

  const resumo: string[] = [
    `Nível: ${nivel} (pontuação interna ${pts}).`,
    configAuditoria.conciliacao.aceitar_desconto_fracionado
      ? `Descontos fracionados: aceitos (±R$ ${configAuditoria.conciliacao.tolerancia_valor} ou ${configAuditoria.conciliacao.tolerancia_percentual}%).`
      : "Descontos fracionados: cada linha tratada separadamente.",
    configAuditoria.refinanciamento.exigir_indicio_oficial
      ? `Refinanciamento: exige ≥${configAuditoria.refinanciamento.min_indicios_fortes} indício forte + ${configAuditoria.refinanciamento.minimo_indicios} indícios totais; mesmo banco/data próxima não basta sozinhos.`
      : `Refinanciamento: mínimo ${configAuditoria.refinanciamento.minimo_indicios} indícios.`,
    `Match automático a partir de score ${scoreMatchMinimoAutomatico}; pendência abaixo de ${scoreMatchLimitePendencia}.`,
  ];

  return {
    ...parcial,
    catalogoVersion: CATALOGO_PERGUNTAS_LEITURA_VERSION,
    resumo,
    perguntasPendentes,
    parametrosAplicados,
    respostas,
  };
}

export function parametrosLeituraPadrao(): ResultadoResolucaoPerfil {
  return resolverPerfilLeitura(respostasPadraoFormulario());
}
