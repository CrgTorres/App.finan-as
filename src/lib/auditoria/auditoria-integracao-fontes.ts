/**
 * Auditoria de integração: cada fonte deve existir, normalizar, vincular e alimentar análises.
 */

import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import type { Transaction } from "@/types";
import { transactionIsExtratoImport } from "@/lib/utils/transaction-source";
import { CATALOGO_PERGUNTAS_LEITURA_VERSION } from "@/lib/leitura-analise/catalogo-perguntas-leitura";
import { carregarPerfilLeituraPersistido } from "@/lib/leitura-analise/perfil-leitura-storage";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import {
  sugerirPerguntasDinamicas,
  type PerguntaSugeridaDinamica,
} from "@/lib/leitura-analise/sugerir-perguntas-dinamicas";
import { listarAtualizacoesJuridicas } from "@/lib/juridico/base-atualizacoes-juridicas";
import type { ResultadoVerificacaoDiaria } from "@/lib/auditoria/verificar-atualizacao-diaria-sistema";
import {
  avaliarProntidaoAnalise,
  type ResultadoProntidaoAnalise,
} from "@/lib/auditoria/prontidao-analise";
import { particionarPayslipsFichaContracheque } from "@/lib/contracheque/payslip-classificacao-fonte";
import { partitionPayslipsFichaContracheque } from "@/lib/anexos/payslip-fonte-integracao";

export type FonteIntegracaoId =
  | "ficha_financeira"
  | "contracheque"
  | "extrato_bancario"
  | "nota_fiscal"
  | "contrato_emprestimo"
  | "margem_consignavel"
  | "consigfacil"
  | "decisao_judicial"
  | "evidencia_ocr"
  | "perfil_leitura";

export type StatusIntegracaoFonte =
  | "integrada"
  | "parcial"
  | "ausente"
  | "com_erro"
  | "desatualizada";

export type ResultadoFonteIntegracao = {
  fonte: FonteIntegracaoId;
  status: StatusIntegracaoFonte;
  ultima_atualizacao: string | null;
  quantidade_registros: number;
  usada_em: string[];
  pendencias: string[];
  recomendacoes: string[];
  precisa_reprocessar: boolean;
};

export type ClassificacaoConfiabilidadeDados =
  | "baixo"
  | "medio"
  | "alto"
  | "excelente";

export type IndiceConfiabilidadeDados = {
  indice: number;
  classificacao: ClassificacaoConfiabilidadeDados;
  fatores: string[];
};

export type AlertaIntegracao = {
  id: string;
  severidade: "info" | "aviso" | "critico";
  titulo: string;
  descricao: string;
  fonte?: FonteIntegracaoId;
  acao?: string;
};

export type ResultadoAuditoriaIntegracao = {
  auditado_em: string;
  fontes: ResultadoFonteIntegracao[];
  indice_confiabilidade: IndiceConfiabilidadeDados;
  alertas: AlertaIntegracao[];
  perguntas_sugeridas: PerguntaSugeridaDinamica[];
  verificacao_diaria?: ResultadoVerificacaoDiaria;
  pronto_para: {
    usuario_comum: boolean;
    ia: boolean;
    orientador: boolean;
    advogado: boolean;
    contador: boolean;
    especialista: boolean;
  };
  prontidao: ResultadoProntidaoAnalise;
};

export type SnapshotSistemaIntegracao = {
  transactions: Transaction[];
  loans: Loan[];
  payslips: Payslip[];
  evidencias: LoanEvidence[];
  snapshotsConsigfacil: ConsigfacilSnapshot[];
  base?: BaseFinanceiraNormalizada;
  perfilLeitura?: ResultadoResolucaoPerfil;
  verificacaoDiaria?: ResultadoVerificacaoDiaria;
};

const FONTES_OBRIGATORIAS: FonteIntegracaoId[] = [
  "ficha_financeira",
  "contracheque",
  "extrato_bancario",
  "nota_fiscal",
  "contrato_emprestimo",
  "margem_consignavel",
  "consigfacil",
  "decisao_judicial",
  "evidencia_ocr",
  "perfil_leitura",
];

const LABEL_FONTE: Record<FonteIntegracaoId, string> = {
  ficha_financeira: "Ficha financeira histórica",
  contracheque: "Contracheques",
  extrato_bancario: "Extratos bancários",
  nota_fiscal: "Notas fiscais",
  contrato_emprestimo: "Contratos de empréstimo",
  margem_consignavel: "Margem consignável",
  consigfacil: "ConsigFácil",
  decisao_judicial: "Decisões judiciais",
  evidencia_ocr: "Evidências OCR",
  perfil_leitura: "Perfil de leitura",
};

function maxIso(dates: (string | null | undefined)[]): string | null {
  let max: string | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!max || d > max) max = d;
  }
  return max;
}

function usadaEmBase(base: BaseFinanceiraNormalizada | undefined): {
  base_normalizada: boolean;
  base_conciliada: boolean;
  graficos: boolean;
  exportacao: boolean;
  score_financeiro: boolean;
  score_juridico: boolean;
} {
  if (!base) {
    return {
      base_normalizada: false,
      base_conciliada: false,
      graficos: false,
      exportacao: false,
      score_financeiro: false,
      score_juridico: false,
    };
  }
  return {
    base_normalizada: base.baseNormalizada.length > 0,
    base_conciliada: base.baseConciliada.length > 0,
    graficos:
      (base.series_temporais.resumo_mensal?.length ?? 0) > 0 ||
      base.resumoMensal.length > 0,
    exportacao: true,
    score_financeiro: base.scoreRiscoFinanceiro.indice_risco_financeiro > 0,
    score_juridico:
      base.auditoriaFinanceira.length > 0 ||
      base.riscoRefinForcado.length > 0 ||
      base.eventosOperacionaisConsignado.length > 0,
  };
}

function montarUsadaEm(flags: ReturnType<typeof usadaEmBase>, extras: string[] = []): string[] {
  const u: string[] = [...extras];
  if (flags.base_normalizada) u.push("Base_Normalizada");
  if (flags.base_conciliada) u.push("Base_Conciliada");
  if (flags.graficos) u.push("graficos_dashboard");
  if (flags.exportacao) u.push("exportacao_xlsx");
  if (flags.score_financeiro) u.push("score_risco_financeiro");
  if (flags.score_juridico) u.push("score_juridico_auditoria");
  return u;
}

function criarResultado(
  fonte: FonteIntegracaoId,
  partial: Partial<ResultadoFonteIntegracao> & Pick<ResultadoFonteIntegracao, "status" | "quantidade_registros">,
): ResultadoFonteIntegracao {
  return {
    fonte,
    ultima_atualizacao: null,
    usada_em: [],
    pendencias: [],
    recomendacoes: [],
    precisa_reprocessar: false,
    ...partial,
  };
}

export function auditarIntegracaoFontes(
  snapshot: SnapshotSistemaIntegracao,
): ResultadoAuditoriaIntegracao {
  const { transactions, loans, payslips, evidencias, snapshotsConsigfacil, base } = snapshot;
  const flags = usadaEmBase(base);
  const fontes: ResultadoFonteIntegracao[] = [];

  const { fichas, contracheques } = particionarPayslipsFichaContracheque(payslips);
  const extratosTx = transactions.filter((t) => transactionIsExtratoImport(t));
  const notas = transactions.filter(
    (t) =>
      (t.source_ref ?? "").toLowerCase().includes("nota") ||
      (t.description ?? "").toLowerCase().includes("nf-e") ||
      (t.category ?? "").toLowerCase().includes("nota fiscal"),
  );
  const contratosEv = evidencias.filter((e) => e.tipo_evidencia === "contrato_formal");
  const decisoes = evidencias.filter((e) => e.tipo_evidencia === "decisao_judicial");
  const ocrEv = evidencias.filter((e) => (e.ocr_texto_bruto?.length ?? 0) > 50);
  const ocrFolha = payslips.filter((p) => (p.raw_text?.length ?? 0) > 50);

  // ---- Ficha financeira ----
  {
    const qtd = fichas.length;
    const ultima = maxIso(fichas.map((p) => p.created_at ?? `${p.year}-${String(p.month).padStart(2, "0")}-01`));
    const pend: string[] = [];
    if (qtd === 0) pend.push("Nenhuma ficha financeira importada (histórico desde 2012).");
    else if (qtd < 12) pend.push("Cobertura histórica parcial — menos de 12 competências na ficha.");
    const usada = montarUsadaEm(flags, qtd > 0 ? ["contracheque_analise"] : []);
    const status: StatusIntegracaoFonte =
      qtd === 0 ? "ausente" : usada.includes("Base_Normalizada") ? "integrada" : "parcial";
    fontes.push(
      criarResultado("ficha_financeira", {
        status,
        ultima_atualizacao: ultima,
        quantidade_registros: qtd,
        usada_em: usada,
        pendencias: pend,
        recomendacoes:
          qtd === 0
            ? ["Importe a ficha financeira na aba Anexos (folha)."]
            : ["Mantenha fichas anuais para série histórica completa."],
        precisa_reprocessar: snapshot.verificacaoDiaria?.itens.some((i) => i.tipo === "payslips") ?? false,
      }),
    );
  }

  // ---- Contracheque ----
  {
    const qtd = contracheques.length;
    const ultima = maxIso(
      contracheques.map((p) => p.created_at ?? `${p.year}-${String(p.month).padStart(2, "0")}-01`),
    );
    const pend: string[] = [];
    if (qtd === 0) pend.push("Sem contracheques na base.");
    const usada = montarUsadaEm(flags);
    fontes.push(
      criarResultado("contracheque", {
        status: qtd === 0 ? "ausente" : flags.base_normalizada ? "integrada" : "parcial",
        ultima_atualizacao: ultima,
        quantidade_registros: qtd,
        usada_em: usada,
        pendencias: pend,
        recomendacoes: qtd === 0 ? ["Anexe contracheques mensais."] : [],
        precisa_reprocessar: false,
      }),
    );
  }

  // ---- Extrato ----
  {
    const qtd = extratosTx.length;
    const ultima = maxIso(extratosTx.map((t) => t.created_at ?? t.date));
    const pend: string[] = [];
    if (qtd === 0) pend.push("Nenhuma transação de extrato importada.");
    if (base && base.extratosBancarios.length === 0 && qtd > 0) {
      pend.push("Extrato importado mas não refletido na Base_Conciliada.");
    }
    const naoConc = base?.conciliacaoFolhaExtrato.filter((c) => c.status !== "conciliado").length ?? 0;
    if (naoConc > 2) pend.push(`${naoConc} competência(s) folha × extrato não conciliadas.`);
    fontes.push(
      criarResultado("extrato_bancario", {
        status:
          qtd === 0 ? "ausente" : flags.base_conciliada ? "integrada" : qtd > 0 ? "parcial" : "ausente",
        ultima_atualizacao: ultima,
        quantidade_registros: qtd,
        usada_em: montarUsadaEm(flags),
        pendencias: pend,
        recomendacoes: qtd === 0 ? ["Importe extratos em Importar Extrato."] : ["Revise conciliação folha × extrato."],
        precisa_reprocessar: naoConc > 0,
      }),
    );
  }

  // ---- Nota fiscal ----
  {
    const qtd = notas.length;
    const ultima = maxIso(notas.map((t) => t.created_at ?? t.date));
    fontes.push(
      criarResultado("nota_fiscal", {
        status: qtd === 0 ? "ausente" : flags.base_normalizada ? "integrada" : "parcial",
        ultima_atualizacao: ultima,
        quantidade_registros: qtd,
        usada_em: montarUsadaEm(flags, qtd > 0 ? ["transacoes"] : []),
        pendencias: qtd === 0 ? ["Nenhuma nota fiscal lida no fluxo dedicado."] : [],
        recomendacoes: qtd === 0 ? ["Use a página Nota Fiscal para OCR de NF-e."] : [],
        precisa_reprocessar: false,
      }),
    );
  }

  // ---- Contrato empréstimo ----
  {
    const qtd = loans.length + contratosEv.length;
    const ultima = maxIso([
      ...loans.map((l) => l.created_at ?? l.start_date),
      ...evidencias.map((e) => e.created_at),
    ]);
    const semAnexo =
      base?.contratosAnexados.filter((c) => (c.evidencias_vinculadas as number) === 0).length ?? 0;
    const pend: string[] = [];
    if (loans.length === 0 && contratosEv.length === 0) {
      pend.push("Sem contratos cadastrados ou anexados.");
    }
    if (semAnexo > 0) pend.push(`${semAnexo} contrato(s) sem vínculo de evidência.`);
    fontes.push(
      criarResultado("contrato_emprestimo", {
        status:
          qtd === 0 ? "ausente" : semAnexo === 0 && flags.base_conciliada ? "integrada" : "parcial",
        ultima_atualizacao: ultima,
        quantidade_registros: qtd,
        usada_em: montarUsadaEm(flags, ["loans", "loan_evidences"]),
        pendencias: pend,
        recomendacoes:
          semAnexo > 0
            ? ["Vincule PDFs em Contrato empréstimo / evidências."]
            : ["Mantenha contratos com leitura automática conferida."],
        precisa_reprocessar: semAnexo > 0,
      }),
    );
  }

  // ---- Margem consignável ----
  {
    const margens = base?.consigfacil.margens ?? [];
    const qtd = margens.length;
    const ultima = maxIso(margens.map((m) => m.capturado_em));
    fontes.push(
      criarResultado("margem_consignavel", {
        status: qtd === 0 ? "ausente" : flags.graficos ? "integrada" : "parcial",
        ultima_atualizacao: ultima,
        quantidade_registros: qtd,
        usada_em: montarUsadaEm(flags, qtd > 0 ? ["Margem_Historica", "Resumo_Mensal"] : []),
        pendencias: qtd === 0 ? ["Margem oficial não capturada no ConsigFácil."] : [],
        recomendacoes: ["Importe cards de margem do portal ConsigFácil."],
        precisa_reprocessar: false,
      }),
    );
  }

  // ---- ConsigFácil ----
  {
    const contratos = base?.consigfacil.contratos ?? [];
    const qtdSnapshots = snapshotsConsigfacil.length;
    const qtdContratos = contratos.length;
    const temDadosConsig = qtdContratos > 0 || qtdSnapshots > 0;
    const ultima = maxIso([
      ...snapshotsConsigfacil.map((s) => s.capturado_em),
      ...(base?.consigfacil.margens.map((m) => m.capturado_em) ?? []),
    ]);
    const pend: string[] = [];
    if (!temDadosConsig) pend.push("ConsigFácil não importado.");
    if (qtdSnapshots > 0 && qtdContratos === 0) {
      pend.push("Snapshot capturado — contratos ainda não consolidados na base.");
    }
    if (base && base.pendenciasConferenciaReais.length > 5) {
      pend.push(`${base.pendenciasConferenciaReais.length} pendências de conferência abertas.`);
    }
    const diverg = base?.consigfacilConciliacao.divergenciasFolhaExtrato.length ?? 0;
    if (diverg > 0) pend.push(`${diverg} divergência(s) ConsigFácil × folha.`);
    const consigIntegrada =
      qtdContratos > 0 &&
      (flags.base_normalizada || flags.base_conciliada);
    fontes.push(
      criarResultado("consigfacil", {
        status: !temDadosConsig ? "ausente" : consigIntegrada ? "integrada" : "parcial",
        ultima_atualizacao: ultima,
        quantidade_registros: Math.max(qtdContratos, qtdSnapshots),
        usada_em: montarUsadaEm(flags, [
          "Consigfacil_Contratos",
          "Consignacoes_Ordenadas",
          "Eventos_Operacionais_Consignado",
        ]),
        pendencias: pend,
        recomendacoes: !temDadosConsig
          ? ["Cole HTML/print do ConsigFácil na Conciliação ou Consignações."]
          : ["Sincronize após cada captura nova do portal."],
        precisa_reprocessar:
          (snapshot.verificacaoDiaria?.itens.some((i) => i.tipo === "consigfacil") ?? false) ||
          diverg > 3,
      }),
    );
  }

  // ---- Decisão judicial ----
  {
    const qtd = decisoes.length;
    const ultima = maxIso(decisoes.map((e) => e.data_documento ?? e.created_at));
    const jurCadastro = listarAtualizacoesJuridicas().filter((j) => j.tipo === "decisao_pessoal");
    fontes.push(
      criarResultado("decisao_judicial", {
        status:
          qtd === 0 && jurCadastro.length === 0
            ? "ausente"
            : flags.score_juridico
              ? "integrada"
              : "parcial",
        ultima_atualizacao: ultima ?? maxIso(jurCadastro.map((j) => j.data)),
        quantidade_registros: qtd + jurCadastro.length,
        usada_em: montarUsadaEm(flags, ["Atualizacoes_Juridicas", "loan_evidences"]),
        pendencias:
          qtd === 0 ? ["Nenhuma evidência tipo decisão judicial anexada."] : [],
        recomendacoes: ["Anexe decisões em evidências do empréstimo relacionado."],
        precisa_reprocessar: jurCadastro.some((j) => j.impacto_no_sistema === "aumenta_score"),
      }),
    );
  }

  // ---- OCR ----
  {
    const qtd = ocrEv.length + ocrFolha.length;
    const ultima = maxIso([
      ...evidencias.map((e) => e.created_at),
      ...payslips.map((p) => p.created_at),
    ]);
    const pendOcr = evidencias.filter(
      (e) =>
        e.status_conferencia === "pendente" ||
        e.status_conferencia === "pendente_conferencia",
    );
    const pend: string[] = [];
    if (pendOcr.length > 0) pend.push(`${pendOcr.length} evidência(s) OCR sem conferência.`);
    if ((base?.ocrTecnicoJson.length ?? 0) === 0 && qtd > 0) {
      pend.push("OCR executado mas aba OCR_Tecnico_JSON vazia — reprocessar base.");
    }
    fontes.push(
      criarResultado("evidencia_ocr", {
        status:
          qtd === 0
            ? "ausente"
            : pendOcr.length === 0 && (base?.ocrTecnicoJson.length ?? 0) > 0
              ? "integrada"
              : "parcial",
        ultima_atualizacao: ultima,
        quantidade_registros: qtd,
        usada_em: montarUsadaEm(flags, ["OCR_Tecnico_JSON", "leitura_automatica"]),
        pendencias: pend,
        recomendacoes: ["Conferir leituras pendentes no Radar do contrato."],
        precisa_reprocessar: pendOcr.length > 0,
      }),
    );
  }

  // ---- Perfil leitura ----
  {
    const perfilPersist = carregarPerfilLeituraPersistido();
    const perfil = snapshot.perfilLeitura ?? base?.perfilLeitura;
    const qtd = perfil ? 1 : 0;
    const ultima = perfilPersist?.atualizadoEm ?? null;
    const pend: string[] = [];
    let status: StatusIntegracaoFonte = perfil ? "integrada" : "ausente";
    if (
      perfilPersist &&
      perfilPersist.catalogoVersion !== CATALOGO_PERGUNTAS_LEITURA_VERSION
    ) {
      status = "desatualizada";
      pend.push("Catálogo de perguntas mais novo que o perfil salvo.");
    }
    if (!perfil) pend.push("Perfil de leitura não configurado — usando padrão.");
    fontes.push(
      criarResultado("perfil_leitura", {
        status,
        ultima_atualizacao: ultima,
        quantidade_registros: qtd,
        usada_em: montarUsadaEm(flags, ["Perfil_Leitura", "config_auditoria_consigfacil"]),
        pendencias: pend,
        recomendacoes: ["Atualize respostas em Configuração de leitura."],
        precisa_reprocessar: status === "desatualizada",
      }),
    );
  }

  // Garantir ordem estável
  const fontesOrdenadas = FONTES_OBRIGATORIAS.map(
    (id) => fontes.find((f) => f.fonte === id)!,
  ).filter(Boolean);

  const indice = calcularIndiceConfiabilidadeDados(fontesOrdenadas, base);
  const perguntas_sugeridas = base
    ? sugerirPerguntasDinamicas({
        base,
        perfilLeitura: snapshot.perfilLeitura ?? base.perfilLeitura,
      })
    : [];

  const alertas = gerarAlertasIntegracao(fontesOrdenadas, indice, perguntas_sugeridas, snapshot);

  const prontidao = avaliarProntidaoAnalise({
    base,
    payslips,
    evidencias,
    integracao: {
      fontes: fontesOrdenadas,
      alertas,
      indice_confiabilidade: indice,
    },
  });

  return {
    auditado_em: new Date().toISOString(),
    fontes: fontesOrdenadas,
    indice_confiabilidade: indice,
    alertas,
    perguntas_sugeridas,
    verificacao_diaria: snapshot.verificacaoDiaria,
    prontidao,
    pronto_para: {
      usuario_comum: prontidao.niveis_atingidos.pronto_basico,
      ia: prontidao.niveis_atingidos.pronto_ia,
      orientador: prontidao.niveis_atingidos.pronto_orientador,
      advogado: prontidao.niveis_atingidos.pronto_juridico,
      contador: prontidao.niveis_atingidos.pronto_contabil,
      especialista: prontidao.niveis_atingidos.pronto_pericial,
    },
  };
}

export function calcularIndiceConfiabilidadeDados(
  fontes: ResultadoFonteIntegracao[],
  base?: BaseFinanceiraNormalizada,
): IndiceConfiabilidadeDados {
  let score = 0;
  const fatores: string[] = [];

  const integradas = fontes.filter((f) => f.status === "integrada").length;
  score += Math.min(35, integradas * 3.5);
  fatores.push(`${integradas}/10 fontes integradas`);

  if (fontes.find((f) => f.fonte === "consigfacil")?.status === "integrada") {
    score += 12;
    fatores.push("ConsigFácil oficial integrado");
  }
  if (fontes.find((f) => f.fonte === "contrato_emprestimo")?.status === "integrada") {
    score += 10;
    fatores.push("Contratos anexados e vinculados");
  }
  if (fontes.find((f) => f.fonte === "extrato_bancario")?.status === "integrada") {
    score += 8;
    fatores.push("Extrato conciliado");
  }
  if (fontes.find((f) => f.fonte === "decisao_judicial")?.status !== "ausente") {
    score += 5;
    fatores.push("Decisões judiciais presentes");
  }

  const parciais = fontes.filter((f) => f.status === "parcial" || f.status === "desatualizada").length;
  score -= parciais * 2;

  const ausentes = fontes.filter((f) => f.status === "ausente").length;
  score -= ausentes * 4;

  if (base) {
    const pend = base.pendenciasConferenciaReais.length;
    score -= Math.min(15, pend);
    if (pend > 0) fatores.push(`${pend} pendências de conferência`);

    const ocrPend = fontes.find((f) => f.fonte === "evidencia_ocr")?.pendencias.length ?? 0;
    if (ocrPend > 0) {
      score -= 5;
      fatores.push("OCR aguardando revisão");
    }

    if (base.perfilLeitura.nivel !== "padrao") {
      score += 3;
      fatores.push(`Perfil de leitura: ${base.perfilLeitura.nivel}`);
    }
  }

  const indice = Math.max(0, Math.min(100, Math.round(score)));
  const classificacao: ClassificacaoConfiabilidadeDados =
    indice <= 40 ? "baixo" : indice <= 70 ? "medio" : indice <= 90 ? "alto" : "excelente";

  return { indice, classificacao, fatores };
}

export function gerarAlertasIntegracao(
  fontes: ResultadoFonteIntegracao[],
  indice: IndiceConfiabilidadeDados,
  perguntas: PerguntaSugeridaDinamica[],
  snapshot: SnapshotSistemaIntegracao,
): AlertaIntegracao[] {
  const alertas: AlertaIntegracao[] = [];

  for (const f of fontes) {
    if (f.status === "ausente") {
      alertas.push({
        id: `ausente-${f.fonte}`,
        severidade: "aviso",
        titulo: "Fonte não integrada",
        descricao: `${LABEL_FONTE[f.fonte]}: ausente na base.`,
        fonte: f.fonte,
        acao: f.recomendacoes[0],
      });
    }
    if (f.precisa_reprocessar) {
      alertas.push({
        id: `reprocess-${f.fonte}`,
        severidade: "aviso",
        titulo: "Documento novo ainda não reprocessado",
        descricao: `${LABEL_FONTE[f.fonte]} marcado para reprocessar.`,
        fonte: f.fonte,
        acao: "Reprocessar na Saúde dos Dados",
      });
    }
    if (f.status === "desatualizada") {
      alertas.push({
        id: `desat-${f.fonte}`,
        severidade: "info",
        titulo: "Perfil de leitura desatualizado",
        descricao: f.pendencias.join(" "),
        fonte: f.fonte,
        acao: "/dashboard/configuracao-leitura",
      });
    }
  }

  const snapshotsConsig = snapshot.snapshotsConsigfacil ?? [];
  const contratosConsig = snapshot.base?.consigfacil.contratos ?? [];
  if (snapshotsConsig.length > 0 && contratosConsig.length === 0) {
    alertas.push({
      id: "consig-desync",
      severidade: "aviso",
      titulo: "ConsigFácil pendente de consolidação",
      descricao:
        "Há captura do portal, mas os contratos ainda não entraram na base. Abra Consignações e use Sincronizar.",
      fonte: "consigfacil",
      acao: "/dashboard/consignacoes",
    });
  }

  const extrato = fontes.find((f) => f.fonte === "extrato_bancario");
  if (extrato?.pendencias.some((p) => p.includes("não conciliad"))) {
    alertas.push({
      id: "extrato-nao-conciliado",
      severidade: "aviso",
      titulo: "Extrato não conciliado",
      descricao: extrato.pendencias.find((p) => p.includes("conciliad")) ?? "",
      fonte: "extrato_bancario",
    });
  }

  const contrato = fontes.find((f) => f.fonte === "contrato_emprestimo");
  if (contrato?.pendencias.some((p) => p.includes("sem vínculo"))) {
    alertas.push({
      id: "contrato-sem-vinculo",
      severidade: "aviso",
      titulo: "Contrato sem vínculo",
      descricao: contrato.pendencias.find((p) => p.includes("vínculo")) ?? "",
      fonte: "contrato_emprestimo",
    });
  }

  const decisao = fontes.find((f) => f.fonte === "decisao_judicial");
  if (decisao?.precisa_reprocessar) {
    alertas.push({
      id: "decisao-score",
      severidade: "info",
      titulo: "Decisão judicial nova impacta score",
      descricao: "Recalcule a base para aplicar atualização jurídica.",
      fonte: "decisao_judicial",
    });
  }

  for (const p of perguntas.slice(0, 3)) {
    alertas.push({
      id: `pergunta-${p.chave}`,
      severidade: "info",
      titulo: "Pergunta sugerida pelo sistema",
      descricao: p.pergunta_sugerida,
      acao: "/dashboard/configuracao-leitura",
    });
  }

  if (snapshot.verificacaoDiaria?.precisa_reprocessar_global) {
    alertas.push({
      id: "diaria-reprocess",
      severidade: "aviso",
      titulo: "Atualização diária pendente",
      descricao: snapshot.verificacaoDiaria.avisos.join(" ") || "Novos documentos detectados.",
      acao: "Recalcular análise",
    });
  }

  if (indice.indice < 41) {
    alertas.push({
      id: "confiabilidade-baixa",
      severidade: "critico",
      titulo: "Confiabilidade dos dados baixa",
      descricao: `Índice ${indice.indice}/100 — complete fontes obrigatórias antes de decisões críticas.`,
    });
  }

  return alertas;
}

export function linhasExportacaoSaudeDados(
  resultado: ResultadoAuditoriaIntegracao,
): Array<Record<string, string | number | boolean | null>> {
  return resultado.fontes.map((f) => ({
    fonte: f.fonte,
    fonte_label: LABEL_FONTE[f.fonte],
    status: f.status,
    ultima_atualizacao: f.ultima_atualizacao,
    quantidade_registros: f.quantidade_registros,
    usada_em: f.usada_em.join("; "),
    pendencias: f.pendencias.join(" | "),
    recomendacoes: f.recomendacoes.join(" | "),
    precisa_reprocessar: f.precisa_reprocessar,
  }));
}

export function linhaExportacaoConfiabilidade(
  resultado: ResultadoAuditoriaIntegracao,
): Array<Record<string, string | number | boolean>> {
  const { indice_confiabilidade: i, pronto_para: p, prontidao: pr } = resultado;
  return [
    {
      indice_confiabilidade_dados: i.indice,
      classificacao: i.classificacao,
      fatores: i.fatores.join("; "),
      nivel_prontidao_analise: pr.nivel_prontidao_analise,
      pronto_usuario_comum: p.usuario_comum,
      pronto_ia: p.ia,
      pronto_orientador: p.orientador,
      pronto_advogado: p.advogado,
      pronto_contador: p.contador,
      pronto_especialista: p.especialista,
      auditado_em: resultado.auditado_em,
    },
  ];
}
