/**
 * Prontidão operacional: para qual público e uso a análise já é confiável.
 */

import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import type { Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import { catalogoDesatualizado } from "@/lib/leitura-analise/perfil-leitura-storage";
import { listarAtualizacoesJuridicas } from "@/lib/juridico/base-atualizacoes-juridicas";
import type {
  AlertaIntegracao,
  ResultadoAuditoriaIntegracao,
  ResultadoFonteIntegracao,
} from "@/lib/auditoria/auditoria-integracao-fontes";
import { isPayslipFichaFinanceira } from "@/lib/contracheque/payslip-classificacao-fonte";

export type NivelProntidaoAnalise =
  | "incompleto"
  | "pronto_basico"
  | "pronto_ia"
  | "pronto_orientador"
  | "pronto_juridico"
  | "pronto_contabil"
  | "pronto_pericial";

export type NivelProntidaoOperacional = Exclude<NivelProntidaoAnalise, "incompleto">;

export type CriterioProntidao = {
  id: string;
  descricao: string;
  atendido: boolean;
  nivel: NivelProntidaoOperacional;
};

export type ResultadoProntidaoAnalise = {
  nivel_prontidao_analise: NivelProntidaoAnalise;
  niveis_atingidos: Record<NivelProntidaoOperacional, boolean>;
  proximos_requisitos: string[];
  publico_indicado: string;
  publicos_disponiveis: string[];
  acoes_recomendadas: string[];
  criterios: CriterioProntidao[];
  auditado_em: string;
};

const ORDEM: NivelProntidaoAnalise[] = [
  "incompleto",
  "pronto_basico",
  "pronto_ia",
  "pronto_orientador",
  "pronto_juridico",
  "pronto_contabil",
  "pronto_pericial",
];

const LABEL_NIVEL: Record<NivelProntidaoAnalise, string> = {
  incompleto: "Incompleto",
  pronto_basico: "Básico (usuário comum)",
  pronto_ia: "IA",
  pronto_orientador: "Orientador financeiro",
  pronto_juridico: "Jurídico (advogado)",
  pronto_contabil: "Contábil",
  pronto_pericial: "Pericial / especialista",
};

const PUBLICO_POR_NIVEL: Record<NivelProntidaoAnalise, string> = {
  incompleto: "Ainda não indicado — complete a folha e a base normalizada.",
  pronto_basico: "Usuário comum — resumo de folha, receitas e descontos sem decisões críticas.",
  pronto_ia: "Análise assistida por IA — OCR e perfil de leitura estruturados.",
  pronto_orientador:
    "Orientador financeiro — receitas, empréstimos, gráficos e margem para orientação.",
  pronto_juridico:
    "Advogado — contratos/ConsigFácil, indícios jurídicos, decisões e divergências exportáveis.",
  pronto_contabil:
    "Contador — conciliação folha × extrato, exportação tabular e dicionário de colunas.",
  pronto_pericial:
    "Perito ou especialista — trilha ConsigFácil, eventos, auditoria e alta confiabilidade.",
};

const PROXIMO_NIVEL: Partial<Record<NivelProntidaoAnalise, NivelProntidaoOperacional>> = {
  incompleto: "pronto_basico",
  pronto_basico: "pronto_ia",
  pronto_ia: "pronto_orientador",
  pronto_orientador: "pronto_juridico",
  pronto_juridico: "pronto_contabil",
  pronto_contabil: "pronto_pericial",
};

function fonteStatus(
  fontes: ResultadoFonteIntegracao[] | undefined,
  id: string,
): string | undefined {
  return fontes?.find((f) => f.fonte === id)?.status;
}

function fonteIntegrada(fontes: ResultadoFonteIntegracao[] | undefined, id: string): boolean {
  return fonteStatus(fontes, id) === "integrada";
}

export function labelNivelProntidao(nivel: NivelProntidaoAnalise): string {
  return LABEL_NIVEL[nivel];
}

export function seloPublicosProntidao(
  niveis: Record<NivelProntidaoOperacional, boolean>,
): string {
  const partes: string[] = [];
  if (niveis.pronto_basico) partes.push("básico");
  if (niveis.pronto_ia) partes.push("IA");
  if (niveis.pronto_orientador) partes.push("orientador");
  if (niveis.pronto_juridico) partes.push("jurídico");
  if (niveis.pronto_contabil) partes.push("contábil");
  if (niveis.pronto_pericial) partes.push("pericial");
  return partes.length > 0 ? partes.join(" · ") : "em preparação";
}

type ContextoProntidao = {
  base?: BaseFinanceiraNormalizada;
  payslips: Payslip[];
  evidencias: LoanEvidence[];
  fontes: ResultadoFonteIntegracao[];
  alertas: AlertaIntegracao[];
  indiceConfiabilidade: number;
};

function avaliarCriterios(ctx: ContextoProntidao): CriterioProntidao[] {
  const { base, payslips, evidencias, fontes, alertas, indiceConfiabilidade } = ctx;
  const fichas = payslips.filter((p) => isPayslipFichaFinanceira(p, payslips));
  const contracheques = payslips.filter((p) => !isPayslipFichaFinanceira(p, payslips));
  const temFolha = fichas.length > 0 || contracheques.length > 0;
  const errosCriticos = alertas.filter((a) => a.severidade === "critico");
  const semErroCritico =
    errosCriticos.length === 0 ||
    errosCriticos.every((a) => a.id === "confiabilidade-baixa" && temFolha);

  const ocrEvidencias = evidencias.filter((e) => (e.ocr_texto_bruto?.length ?? 0) > 50);
  const ocrFolha = payslips.filter((p) => (p.raw_text?.length ?? 0) > 50);
  const ocrOk =
    ocrEvidencias.length > 0 ||
    ocrFolha.length > 0 ||
    (fonteStatus(fontes, "evidencia_ocr") ?? "") !== "ausente";

  const perfilOk =
    !catalogoDesatualizado() &&
    (base?.perfilLeitura?.nivel != null || fonteIntegrada(fontes, "perfil_leitura"));

  const pendencias = base?.pendenciasConferenciaReais.length ?? 0;
  const classificadas =
    pendencias <= 8 ||
    ((base?.classificacoesLoans.length ?? 0) + (base?.classificacoesBaseConciliada.length ?? 0) >
      0 &&
      pendencias < 20);

  const receitasOk = (base?.receitas.length ?? 0) > 0;
  const descontosOk = (base?.descontos.length ?? 0) > 0;
  const emprestimosOk = (base?.emprestimos.length ?? 0) > 0;
  const graficosOk =
    (base?.resumoMensal.length ?? 0) > 0 ||
    (base?.series_temporais.resumo_mensal?.length ?? 0) > 0;
  const margemOk =
    (base?.margemHistorica.length ?? 0) > 0 ||
    (base?.consigfacil.margens.length ?? 0) > 0 ||
    fonteIntegrada(fontes, "margem_consignavel");

  const contratosOuConsig =
    fonteIntegrada(fontes, "contrato_emprestimo") || fonteIntegrada(fontes, "consigfacil");
  const indiciosJuridicos =
    (base?.auditoriaFinanceira.length ?? 0) > 0 ||
    (base?.riscoRefinForcado.length ?? 0) > 0 ||
    (base?.eventosOperacionaisConsignado.length ?? 0) > 0;
  const decisoesOk =
    evidencias.some((e) => e.tipo_evidencia === "decisao_judicial") ||
    listarAtualizacoesJuridicas().some((a) => a.ativo);
  const divergenciasExportaveis =
    (base?.consigfacilConciliacao.divergenciasFolhaExtrato.length ?? 0) > 0 ||
    (base?.consigfacilConciliacao.ajustes.filter((a) => a.tipo_ajuste === "divergencia").length ??
      0) > 0 ||
    (base?.auditoriaConciliacaoConsigfacil.length ?? 0) > 0;

  const extratosConciliados =
    fonteIntegrada(fontes, "extrato_bancario") &&
    (base?.baseConciliada.length ?? 0) > 0 &&
    (base?.conciliacaoFolhaExtrato.filter((c) => c.status === "conciliado").length ?? 0) >=
      Math.max(1, Math.floor((base?.conciliacaoFolhaExtrato.length ?? 0) * 0.5));

  const exportOk = (base?.baseNormalizada.length ?? 0) > 0;
  const dicionarioOk = (base?.dicionarioColunas.length ?? 0) > 0;

  const consigOk = fonteIntegrada(fontes, "consigfacil");
  const contratosMaster = (base?.contratosUnicosConfirmados.length ?? 0) > 0;
  const historicoOk = (base?.historicoContratoEventos.length ?? 0) > 0;
  const auditoriaConcOk = (base?.auditoriaConciliacaoConsigfacil.length ?? 0) > 0;
  const fontesIntegradas = fontes.filter((f) => f.status === "integrada").length;
  const rastreioOk = fontesIntegradas >= 7 && exportOk;
  const confiabilidadeAlta = indiceConfiabilidade >= 71;

  return [
    {
      id: "folha_ou_ficha",
      descricao: "Contracheque ou ficha financeira presente",
      atendido: temFolha,
      nivel: "pronto_basico",
    },
    {
      id: "base_normalizada",
      descricao: "Base normalizada gerada",
      atendido: (base?.baseNormalizada.length ?? 0) > 0,
      nivel: "pronto_basico",
    },
    {
      id: "sem_erro_critico",
      descricao: "Sem erro crítico bloqueante",
      atendido: semErroCritico,
      nivel: "pronto_basico",
    },
    {
      id: "ocr_processado",
      descricao: "OCR processado (folha ou evidências)",
      atendido: ocrOk,
      nivel: "pronto_ia",
    },
    {
      id: "perfil_leitura",
      descricao: "Perfil de leitura atualizado",
      atendido: perfilOk,
      nivel: "pronto_ia",
    },
    {
      id: "pendencias_classificadas",
      descricao: "Pendências principais classificadas",
      atendido: classificadas,
      nivel: "pronto_ia",
    },
    {
      id: "receitas_descontos_emprestimos",
      descricao: "Receitas, descontos e empréstimos organizados",
      atendido: receitasOk && descontosOk && emprestimosOk,
      nivel: "pronto_orientador",
    },
    {
      id: "graficos",
      descricao: "Gráficos e resumo mensal prontos",
      atendido: graficosOk,
      nivel: "pronto_orientador",
    },
    {
      id: "margem",
      descricao: "Margem estimada ou oficial disponível",
      atendido: margemOk,
      nivel: "pronto_orientador",
    },
    {
      id: "contratos_ou_consig",
      descricao: "Contratos anexados ou ConsigFácil integrado",
      atendido: contratosOuConsig,
      nivel: "pronto_juridico",
    },
    {
      id: "indicios_juridicos",
      descricao: "Indícios jurídicos classificados",
      atendido: indiciosJuridicos,
      nivel: "pronto_juridico",
    },
    {
      id: "decisoes_juris",
      descricao: "Decisões ou jurisprudências vinculadas",
      atendido: decisoesOk,
      nivel: "pronto_juridico",
    },
    {
      id: "divergencias_export",
      descricao: "Divergências auditáveis e exportáveis",
      atendido: divergenciasExportaveis || consigOk,
      nivel: "pronto_juridico",
    },
    {
      id: "conciliacao_contabil",
      descricao: "Receitas, descontos e extratos conciliados",
      atendido: receitasOk && descontosOk && extratosConciliados,
      nivel: "pronto_contabil",
    },
    {
      id: "exportacao_disponivel",
      descricao: "Exportação Excel/CSV/JSON disponível",
      atendido: exportOk,
      nivel: "pronto_contabil",
    },
    {
      id: "dicionario_colunas",
      descricao: "Dicionário de colunas presente",
      atendido: dicionarioOk,
      nivel: "pronto_contabil",
    },
    {
      id: "consig_integrado",
      descricao: "ConsigFácil integrado",
      atendido: consigOk,
      nivel: "pronto_pericial",
    },
    {
      id: "contratos_master",
      descricao: "Contratos master confirmados",
      atendido: contratosMaster,
      nivel: "pronto_pericial",
    },
    {
      id: "historico_eventos",
      descricao: "Histórico de eventos por contrato",
      atendido: historicoOk,
      nivel: "pronto_pericial",
    },
    {
      id: "auditoria_conciliacao",
      descricao: "Auditoria de conciliação registrada",
      atendido: auditoriaConcOk,
      nivel: "pronto_pericial",
    },
    {
      id: "rastreabilidade",
      descricao: "Rastreabilidade completa (fontes + exportação)",
      atendido: rastreioOk,
      nivel: "pronto_pericial",
    },
    {
      id: "confiabilidade_alta",
      descricao: "Índice de confiabilidade alto (≥ 71)",
      atendido: confiabilidadeAlta,
      nivel: "pronto_pericial",
    },
  ];
}

function nivelAtingido(criterios: CriterioProntidao[], nivel: NivelProntidaoOperacional): boolean {
  const doNivel = criterios.filter((c) => c.nivel === nivel);
  return doNivel.length > 0 && doNivel.every((c) => c.atendido);
}

function resolverNivel(
  niveis: Record<NivelProntidaoOperacional, boolean>,
): NivelProntidaoAnalise {
  if (niveis.pronto_pericial) return "pronto_pericial";
  if (niveis.pronto_contabil) return "pronto_contabil";
  if (niveis.pronto_juridico) return "pronto_juridico";
  if (niveis.pronto_orientador) return "pronto_orientador";
  if (niveis.pronto_ia) return "pronto_ia";
  if (niveis.pronto_basico) return "pronto_basico";
  return "incompleto";
}

function acoesParaProximo(
  criterios: CriterioProntidao[],
  proximo: NivelProntidaoOperacional | undefined,
): string[] {
  if (!proximo) return ["Manter fontes sincronizadas e revisar pendências periodicamente."];
  const pendentes = criterios.filter((c) => c.nivel === proximo && !c.atendido);
  const acoes: string[] = [];
  for (const c of pendentes) {
    acoes.push(c.descricao);
  }
  if (proximo === "pronto_basico") {
    if (!acoes.some((a) => a.includes("ficha"))) acoes.push("Anexe contracheque ou ficha na aba Anexos.");
  }
  if (proximo === "pronto_ia") {
    acoes.push("Revise OCR e atualize o Perfil de Leitura em Configuração.");
  }
  if (proximo === "pronto_orientador") {
    acoes.push("Importe folhas completas e sincronize margem (ConsigFácil ou estimativa).");
  }
  if (proximo === "pronto_juridico") {
    acoes.push("Vincule contratos, snapshots ConsigFácil e decisões judiciais.");
  }
  if (proximo === "pronto_contabil") {
    acoes.push("Conclua conciliação folha × extrato e gere exportação em /dashboard/exportacao.");
  }
  if (proximo === "pronto_pericial") {
    acoes.push("Integre ConsigFácil oficial, confirme contratos master e reprocesse auditoria.");
  }
  return [...new Set(acoes)].slice(0, 8);
}

export function avaliarProntidaoAnalise(input: {
  base?: BaseFinanceiraNormalizada;
  payslips?: Payslip[];
  evidencias?: LoanEvidence[];
  integracao: Pick<
    ResultadoAuditoriaIntegracao,
    "fontes" | "alertas" | "indice_confiabilidade"
  >;
}): ResultadoProntidaoAnalise {
  const ctx: ContextoProntidao = {
    base: input.base,
    payslips: input.payslips ?? [],
    evidencias: input.evidencias ?? [],
    fontes: input.integracao.fontes,
    alertas: input.integracao.alertas,
    indiceConfiabilidade: input.integracao.indice_confiabilidade.indice,
  };

  const criterios = avaliarCriterios(ctx);
  const basico = nivelAtingido(criterios, "pronto_basico");
  const ia = basico && nivelAtingido(criterios, "pronto_ia");
  const orientador = ia && nivelAtingido(criterios, "pronto_orientador");
  const juridico = orientador && nivelAtingido(criterios, "pronto_juridico");
  const contabil = juridico && nivelAtingido(criterios, "pronto_contabil");
  const pericial = contabil && nivelAtingido(criterios, "pronto_pericial");

  const niveis_atingidos: Record<NivelProntidaoOperacional, boolean> = {
    pronto_basico: basico,
    pronto_ia: ia,
    pronto_orientador: orientador,
    pronto_juridico: juridico,
    pronto_contabil: contabil,
    pronto_pericial: pericial,
  };

  const nivel_prontidao_analise = resolverNivel(niveis_atingidos);
  const proximo = PROXIMO_NIVEL[nivel_prontidao_analise];
  const proximos_requisitos = proximo
    ? criterios.filter((c) => c.nivel === proximo && !c.atendido).map((c) => c.descricao)
    : [];

  const publicos_disponiveis: string[] = [];
  if (niveis_atingidos.pronto_basico) publicos_disponiveis.push("Usuário comum");
  if (niveis_atingidos.pronto_ia) publicos_disponiveis.push("Análise IA");
  if (niveis_atingidos.pronto_orientador) publicos_disponiveis.push("Orientador financeiro");
  if (niveis_atingidos.pronto_juridico) publicos_disponiveis.push("Advogado");
  if (niveis_atingidos.pronto_contabil) publicos_disponiveis.push("Contador");
  if (niveis_atingidos.pronto_pericial) publicos_disponiveis.push("Perito / especialista");

  return {
    nivel_prontidao_analise,
    niveis_atingidos,
    proximos_requisitos,
    publico_indicado: PUBLICO_POR_NIVEL[nivel_prontidao_analise],
    publicos_disponiveis,
    acoes_recomendadas: acoesParaProximo(criterios, proximo),
    criterios,
    auditado_em: new Date().toISOString(),
  };
}

export function linhasExportacaoProntidao(
  prontidao: ResultadoProntidaoAnalise,
): Array<Record<string, string | number | boolean>> {
  const linhas: Array<Record<string, string | number | boolean>> = [
    {
      tipo_linha: "resumo",
      nivel_prontidao_analise: prontidao.nivel_prontidao_analise,
      nivel_label: labelNivelProntidao(prontidao.nivel_prontidao_analise),
      publico_indicado: prontidao.publico_indicado,
      publicos_disponiveis: prontidao.publicos_disponiveis.join("; "),
      proximos_requisitos: prontidao.proximos_requisitos.join(" | "),
      acoes_recomendadas: prontidao.acoes_recomendadas.join(" | "),
      pronto_basico: prontidao.niveis_atingidos.pronto_basico,
      pronto_ia: prontidao.niveis_atingidos.pronto_ia,
      pronto_orientador: prontidao.niveis_atingidos.pronto_orientador,
      pronto_juridico: prontidao.niveis_atingidos.pronto_juridico,
      pronto_contabil: prontidao.niveis_atingidos.pronto_contabil,
      pronto_pericial: prontidao.niveis_atingidos.pronto_pericial,
      auditado_em: prontidao.auditado_em,
    },
  ];
  for (const c of prontidao.criterios) {
    linhas.push({
      tipo_linha: "criterio",
      criterio_id: c.id,
      nivel: c.nivel,
      descricao: c.descricao,
      atendido: c.atendido,
      nivel_prontidao_analise: prontidao.nivel_prontidao_analise,
    });
  }
  return linhas;
}

export { ORDEM as ORDEM_NIVEL_PRONTIDAO };
