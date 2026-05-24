import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import { montarItensTriagemResolutiva } from "@/lib/triagem/montar-contexto-divergencia-guiada";
import { linhasExportacaoTriagemResolutiva } from "@/lib/triagem/exportacao-triagem-resolutiva";
import {
  agruparDivergenciasLogicas,
  criarContextoAgrupamento,
  linhasExportacaoClustersLogicos,
} from "@/lib/triagem/agrupar-divergencias-logicas";
import { consolidarContextosResolutivos } from "@/lib/triagem/consolidar-contextos-resolutivos";
import { priorizarFilaTriagem } from "@/lib/triagem/calcular-prioridade-risco-triagem";
import { aplicarSaneamentoNaturezaTriagemResolutiva } from "@/lib/triagem/classificar-natureza-estrutural-pendencia";
import {
  montarRastreabilidadeTriagemConsolidada,
  linhasExportacaoContextosResolutivos,
  linhasExportacaoAuditoriaTriagemConsolidada,
  linhasMetricasSaudeTriagemConsolidada,
} from "@/lib/triagem/rastreabilidade-triagem-consolidada";
import {
  montarFilaTrabalhoPerfil,
  linhasExportacaoFilaTrabalho,
} from "@/lib/triagem/montar-fila-trabalho-perfil";
import {
  linhaExportacaoConfiabilidade,
  linhasExportacaoSaudeDados,
} from "@/lib/auditoria/auditoria-integracao-fontes";
import { linhasExportacaoProntidao } from "@/lib/auditoria/prontidao-analise";
import { linhasExportacaoAtualizacoesJuridicas } from "@/lib/juridico/base-atualizacoes-juridicas";
import { linhasExportacaoSaneamentoEstrutural } from "@/lib/contratos/normalizar-estrutura-contratos-historicos";
import { linhasExportacaoPowerBiConsumoEstrutural } from "@/lib/consignacoes-governo/consumo-estrutural-margem";
import { linhasExportacaoBaseConsignavelReal } from "@/lib/consignacoes-governo/calcular-base-consignavel-real";
import { linhasExportacaoPowerBiMargemAvancada } from "@/lib/consignacoes-governo/calcular-margem-historica-avancada";

export const EXPORTACAO_FINANCEIRA_VERSION = 1 as const;

export const EXPORTACAO_FINANCEIRA_SHEETS = [
  "Base_Normalizada",
  "Receitas",
  "Recebidos_Normalizados",
  "Descontos",
  "Emprestimos",
  "Parcelas",
  "Contratos_Anexados",
  "Alertas",
  "Cartao_Saque",
  "Seguro_Venda_Casada",
  "Juros_CET",
  "Refinanciamentos",
  "Resumo_Mensal",
  // Camada de conciliação extrato vs. folha vs. contrato
  "Base_Conciliada",
  "Extratos_Bancarios",
  "Emprestimos_Extrato",
  "Pagamentos_Emprestimos_Extrato",
  "Duplicidades_Provaveis",
  "Conciliacao_Folha_Extrato",
  "Conciliacao_Contrato_Extrato",
  "Auditoria_Financeira",
  // Camada oficial ConsigFácil
  "Consigfacil_Contratos",
  "Consigfacil_Margens",
  "Consigfacil_Refinanciamentos",
  "Consigfacil_Cartoes",
  "Consigfacil_Status",
  "Consigfacil_Historico",
  "Consigfacil_Ajustes_Base",
  "Consigfacil_Classificacoes",
  "Consigfacil_Qualidade_Classificacao",
  // Visão final ordenada — pronta para Power BI / pivôs por banco/mês
  "Consignacoes_Ordenadas",
  // Pipeline oficial ConsigFácil (conciliação de verdade)
  "Refinanciamentos_Detectados",
  "Divergencias_Oficiais",
  "Auditoria_Conciliacao",
  "Match_Contratos",
  "Historico_Contrato_Eventos",
  "Eventos_Operacionais_Consignado",
  "Risco_Refin_Forcado",
  "Margem_Historica",
  "Margem_Historica_Detalhe",
  "Margem_Historica_Insights",
  "MARGEM_HISTORICA",
  "MARGEM_EVENTOS",
  "MARGEM_ALERTAS",
  "MARGEM_INSIGHTS",
  "MARGEM_PRESSAO",
  "MARGEM_CONSUMO_ESTRUTURAL",
  "MARGEM_CONSUMO_RESUMO",
  "MARGEM_CONSUMO_INSIGHTS",
  "BASE_CONSIGNAVEL_REAL",
  "Contratos_Unicos_Confirmados",
  "Descontos_Fracionados_Conciliados",
  "Refinanciamentos_Descartados",
  "Pendencias_Conferencia_Reais",
  "Perfil_Leitura",
  "Dicionario_Colunas",
  "OCR_Tecnico_JSON",
  "Saude_Dados",
  "Fontes_Integradas",
  "Atualizacoes_Juridicas",
  "Perguntas_Sugeridas",
  "Confiabilidade_Dados",
  "Prontidao_Analise",
  "Triagem_Resolutiva",
  "Triagem_Clusters_Logicos",
  "Triagem_Contextos_Resolutivos",
  "Triagem_Auditoria_Consolidada",
  "Triagem_Fila_Trabalho",
  "Saneamento_Estrutural",
] as const;

export type ExportacaoFinanceiraSheetName = (typeof EXPORTACAO_FINANCEIRA_SHEETS)[number];

export type ExportacaoFinanceiraPayload = {
  version: typeof EXPORTACAO_FINANCEIRA_VERSION;
  gerado_em: string;
  meta: Record<string, string | number | null>;
  sheets: Record<ExportacaoFinanceiraSheetName, Array<Record<string, unknown>>>;
  json_tecnico: Omit<BaseFinanceiraNormalizada, "snapshot">;
};

export function buildExportacaoFinanceiraPayload(base: BaseFinanceiraNormalizada): ExportacaoFinanceiraPayload {
  const jsonTecnico = { ...base } as Omit<BaseFinanceiraNormalizada, "snapshot"> & { snapshot?: unknown };
  delete jsonTecnico.snapshot;

  const itensTriagem = montarItensTriagemResolutiva({
    pendencias: base.pendenciasConferenciaReais,
    baseConciliada: base.baseConciliada,
    contratosConsigfacil: base.consigfacil.contratos,
    eventosOperacionais: base.eventosOperacionaisConsignado,
    riscoRefinForcado: base.riscoRefinForcado,
    margemHistorica: base.margemHistorica,
    perfilLeitura: base.perfilLeitura,
  });

  const contextoClusters = criarContextoAgrupamento(itensTriagem, base.perfilLeitura);
  const { grupos: gruposClusters, metricas: metricasClusters } = agruparDivergenciasLogicas(
    base.pendenciasConferenciaReais,
    contextoClusters,
  );

  const consolidacaoCtx = consolidarContextosResolutivos(itensTriagem);
  const idsCluster = new Set(gruposClusters.flatMap((g) => g.linhas_ids));
  const saneamentoNatureza = aplicarSaneamentoNaturezaTriagemResolutiva({
    itens: itensTriagem,
    matches: base.consigfacilConciliacao.matches,
    idsEmCluster: idsCluster,
    idsContextoConsolidado: consolidacaoCtx.idsOcultosFila,
  });
  const priorizacao = priorizarFilaTriagem(saneamentoNatureza.itens, {
    idsEmCluster: idsCluster,
    idsContextoConsolidado: consolidacaoCtx.idsOcultosFila,
  });
  const rastreabilidade = montarRastreabilidadeTriagemConsolidada({
    itens: itensTriagem,
    visualizacaoConsolidada: base.perfilLeitura.visualizacaoConsolidadaInteligente,
    gruposCluster: gruposClusters,
    consolidacao: consolidacaoCtx,
    priorizacao,
    persistirAuditoria: false,
  });

  const filaTrabalho = montarFilaTrabalhoPerfil({
    filaPrincipal: priorizacao.fila_principal,
    riscosRefin: base.riscoRefinForcado,
    incluirFontesAuxiliares: false,
  });

  const saudeComTriagem = [
    ...linhasExportacaoSaudeDados(base.integracaoFontes),
    ...linhasMetricasSaudeTriagemConsolidada(rastreabilidade.metricas),
  ];

  const margemPowerBi = linhasExportacaoPowerBiMargemAvancada(base.margemHistoricaAvancada);
  const consumoPowerBi = linhasExportacaoPowerBiConsumoEstrutural(base.consumoEstruturalMargem);
  const baseConsignavelPowerBi = linhasExportacaoBaseConsignavelReal(base.baseConsignavelReal);

  return {
    version: EXPORTACAO_FINANCEIRA_VERSION,
    gerado_em: base.gerado_em,
    meta: {
      ...base.exportacao_meta,
      triagem_linhas_consolidadas: rastreabilidade.metricas.triagem_linhas_consolidadas,
      triagem_contextos_resolvidos: rastreabilidade.metricas.triagem_contextos_resolvidos,
      triagem_reducao_ruido_percentual: rastreabilidade.metricas.triagem_reducao_ruido_percentual,
    },
    sheets: {
      Base_Normalizada: base.registros,
      Receitas: base.receitas,
      Recebidos_Normalizados: base.recebidosNormalizados,
      Descontos: base.descontos,
      Emprestimos: base.emprestimos,
      Parcelas: base.parcelas,
      Contratos_Anexados: base.contratosAnexados,
      Alertas: base.alertas,
      Cartao_Saque: base.cartaoSaque,
      Seguro_Venda_Casada: base.seguroVendaCasada,
      Juros_CET: base.jurosCet,
      Refinanciamentos: base.refinanciamentos,
      Resumo_Mensal: base.resumoMensal,
      Base_Conciliada: base.baseConciliada,
      Extratos_Bancarios: base.extratosBancarios,
      Emprestimos_Extrato: base.emprestimosExtrato,
      Pagamentos_Emprestimos_Extrato: base.pagamentosEmprestimosExtrato,
      Duplicidades_Provaveis: base.duplicidadesProvaveis,
      Conciliacao_Folha_Extrato: base.conciliacaoFolhaExtrato,
      Conciliacao_Contrato_Extrato: base.conciliacaoContratoExtrato,
      Auditoria_Financeira: base.auditoriaFinanceira,
      Consigfacil_Contratos: base.consigfacil.contratos as unknown as Array<Record<string, unknown>>,
      Consigfacil_Margens: base.consigfacil.margens as unknown as Array<Record<string, unknown>>,
      Consigfacil_Refinanciamentos:
        base.consigfacil.refinanciamentos as unknown as Array<Record<string, unknown>>,
      Consigfacil_Cartoes: base.consigfacil.cartoes as unknown as Array<Record<string, unknown>>,
      Consigfacil_Status: base.consigfacilConciliacao.fontesPorContrato as unknown as Array<
        Record<string, unknown>
      >,
      Consigfacil_Historico: base.consigfacil.historico as unknown as Array<Record<string, unknown>>,
      Consigfacil_Ajustes_Base: base.consigfacilConciliacao.ajustes as unknown as Array<
        Record<string, unknown>
      >,
      // Classificação canônica de TODAS as linhas (loans + base conciliada).
      // Preserva `*_original` ao lado de `*_oficial`.
      Consigfacil_Classificacoes: [
        ...base.classificacoesLoans.map((c) => ({
          alvo_tipo: "loan",
          alvo_id: c.loan_id,
          ...c,
        })),
        ...base.classificacoesBaseConciliada.map((c) => ({
          alvo_tipo: "base_conciliada",
          alvo_id: c.linha_id,
          ...c,
        })),
      ] as unknown as Array<Record<string, unknown>>,
      // Snapshot agregado da qualidade — uma única linha com totais por fonte/grupo.
      Consigfacil_Qualidade_Classificacao: [
        {
          total_linhas: base.qualidadeClassificacao.total_linhas,
          total_linhas_consignavel: base.qualidadeClassificacao.total_linhas_consignavel,
          total_linhas_fora_consignavel: base.qualidadeClassificacao.total_linhas_fora_consignavel,
          confianca_media: base.qualidadeClassificacao.confianca_media,
          total_aliases_utilizados: base.qualidadeClassificacao.total_aliases_utilizados,
          total_divergencias: base.qualidadeClassificacao.total_divergencias,
          total_sem_correspondencia: base.qualidadeClassificacao.total_sem_correspondencia,
          ...base.qualidadeClassificacao.por_fonte,
          ...base.qualidadeClassificacao.por_grupo,
        },
      ] as unknown as Array<Record<string, unknown>>,
      // Aba Power BI-ready: serializa `competencias_detectadas` como string
      // (separador ", "), porque Excel/Power BI lidam mal com arrays nativos.
      Consignacoes_Ordenadas: base.consignacoesOrdenadas.map((c) => ({
        ...c,
        competencias_detectadas: c.competencias_detectadas.join(", "),
        parcela_exibicao:
          c.tipo_estrutura === "historico"
            ? `${c.meses_detectados} meses detectados`
            : c.parcelas_total > 0
              ? `${c.parcela_atual}/${c.parcelas_total}`
              : "",
      })) as unknown as Array<Record<string, unknown>>,
      Refinanciamentos_Detectados: base.consigfacil.refinanciamentos.map((r) => ({
        ...r,
        evidencias: r.evidencias_refinanciamento.join("; "),
      })) as unknown as Array<Record<string, unknown>>,
      Divergencias_Oficiais: [
        ...base.consigfacilConciliacao.ajustes
          .filter((a) => a.tipo_ajuste === "divergencia")
          .map((a) => ({
            categoria: "ajuste_campo",
            id_consignacao: a.id_consignacao,
            alvo_id: a.alvo_id,
            alvo_tipo: a.alvo_tipo,
            campo: a.campo,
            valor_original: a.valor_original,
            valor_oficial: a.valor_oficial,
            diferenca_pct: a.diferenca_pct,
            motivo: a.motivo_ajuste,
          })),
        ...base.consigfacilConciliacao.divergenciasFolhaExtrato.map((d) => ({
          categoria: "folha_extrato",
          ...d,
        })),
      ] as unknown as Array<Record<string, unknown>>,
      Auditoria_Conciliacao:
        base.auditoriaConciliacaoConsigfacil as unknown as Array<Record<string, unknown>>,
      Match_Contratos: base.consigfacilConciliacao.matches.map((m) => ({
        id_consignacao: m.id_consignacao,
        loan_id: m.loan_id,
        instituicao_oficial: m.instituicao_oficial,
        banco: m.match_debug.banco,
        rubrica: m.match_debug.rubrica,
        contrato: m.match_debug.contrato,
        parcela: m.match_debug.parcela,
        total: m.match_debug.total,
        score: m.score,
        faixa: m.faixa,
        acao_aplicada: m.acao_aplicada,
        rubrica_identificador_forte: m.rubrica_identificador_forte,
        motivo_match: m.motivo_match,
        motivo_bloqueio_match: m.motivo_bloqueio_match,
        componentes: m.componentes.map((c) => `${c.criterio}:${c.obtido}/${c.peso}`).join("; "),
        autoridade_temporal_consigfacil: m.autoridade_temporal_consigfacil,
        contrato_migrado_para_consigfacil: m.contrato_migrado_para_consigfacil,
        tipo_correlacao_temporal: m.tipo_correlacao_temporal,
        data_implantacao_fonte: m.data_implantacao_fonte,
        mensagem_autoridade_temporal: m.mensagem_autoridade_temporal,
        competencia_referencia: m.competencia_referencia,
      })) as unknown as Array<Record<string, unknown>>,
      Historico_Contrato_Eventos:
        base.historicoContratoEventos as unknown as Array<Record<string, unknown>>,
      Eventos_Operacionais_Consignado:
        base.eventosOperacionaisConsignado as unknown as Array<Record<string, unknown>>,
      Risco_Refin_Forcado:
        base.riscoRefinForcado as unknown as Array<Record<string, unknown>>,
      Margem_Historica: base.margemHistorica as unknown as Array<Record<string, unknown>>,
      Margem_Historica_Detalhe:
        base.margemHistoricaDetalhes as unknown as Array<Record<string, unknown>>,
      Margem_Historica_Insights: base.margemHistoricaAnalise.insights.map((i) => ({
        severidade: i.severidade,
        titulo: i.titulo,
        mensagem: i.mensagem,
        competencias: i.competencias?.join(", ") ?? "",
      })) as unknown as Array<Record<string, unknown>>,
      MARGEM_HISTORICA: margemPowerBi.MARGEM_HISTORICA,
      MARGEM_EVENTOS: margemPowerBi.MARGEM_EVENTOS,
      MARGEM_ALERTAS: margemPowerBi.MARGEM_ALERTAS,
      MARGEM_INSIGHTS: margemPowerBi.MARGEM_INSIGHTS,
      MARGEM_PRESSAO: margemPowerBi.MARGEM_PRESSAO,
      MARGEM_CONSUMO_ESTRUTURAL: consumoPowerBi.MARGEM_CONSUMO_ESTRUTURAL,
      MARGEM_CONSUMO_RESUMO: consumoPowerBi.MARGEM_CONSUMO_RESUMO,
      MARGEM_CONSUMO_INSIGHTS: consumoPowerBi.MARGEM_CONSUMO_INSIGHTS,
      BASE_CONSIGNAVEL_REAL: baseConsignavelPowerBi,
      Contratos_Unicos_Confirmados:
        base.contratosUnicosConfirmados as unknown as Array<Record<string, unknown>>,
      Descontos_Fracionados_Conciliados:
        base.descontosFracionadosConciliados as unknown as Array<Record<string, unknown>>,
      Refinanciamentos_Descartados:
        base.refinanciamentosDescartados as unknown as Array<Record<string, unknown>>,
      Pendencias_Conferencia_Reais:
        base.pendenciasConferenciaReais as unknown as Array<Record<string, unknown>>,
      Perfil_Leitura: base.perfilLeituraExport as unknown as Array<Record<string, unknown>>,
      Dicionario_Colunas: base.dicionarioColunas,
      OCR_Tecnico_JSON: base.ocrTecnicoJson,
      Saude_Dados: saudeComTriagem as unknown as Array<Record<string, unknown>>,
      Fontes_Integradas: linhasExportacaoSaudeDados(base.integracaoFontes) as unknown as Array<
        Record<string, unknown>
      >,
      Atualizacoes_Juridicas: linhasExportacaoAtualizacoesJuridicas() as unknown as Array<
        Record<string, unknown>
      >,
      Perguntas_Sugeridas: base.integracaoFontes.perguntas_sugeridas.map((p) => ({
        pergunta_sugerida: p.pergunta_sugerida,
        motivo: p.motivo,
        tipo_problema: p.tipo_problema,
        nivel: p.nivel,
        parametro_afetado: p.parametro_afetado,
        chave: p.chave,
      })) as unknown as Array<Record<string, unknown>>,
      Confiabilidade_Dados: linhaExportacaoConfiabilidade(base.integracaoFontes) as unknown as Array<
        Record<string, unknown>
      >,
      Prontidao_Analise: linhasExportacaoProntidao(base.integracaoFontes.prontidao) as unknown as Array<
        Record<string, unknown>
      >,
      Triagem_Resolutiva: rastreabilidade.linhas_resolutiva as unknown as Array<
        Record<string, unknown>
      >,
      Triagem_Clusters_Logicos: linhasExportacaoClustersLogicos(
        gruposClusters,
        metricasClusters,
      ) as unknown as Array<Record<string, unknown>>,
      Triagem_Contextos_Resolutivos: linhasExportacaoContextosResolutivos(
        rastreabilidade.contextos,
      ) as unknown as Array<Record<string, unknown>>,
      Triagem_Auditoria_Consolidada: linhasExportacaoAuditoriaTriagemConsolidada(
        rastreabilidade.auditorias,
      ) as unknown as Array<Record<string, unknown>>,
      Triagem_Fila_Trabalho: linhasExportacaoFilaTrabalho(filaTrabalho) as unknown as Array<
        Record<string, unknown>
      >,
      Saneamento_Estrutural: base.saneamentoEstrutural
        ? (linhasExportacaoSaneamentoEstrutural(
            base.saneamentoEstrutural.linhas,
          ) as unknown as Array<Record<string, unknown>>)
        : [],
    },
    json_tecnico: jsonTecnico,
  };
}

