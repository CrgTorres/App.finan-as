import type { Transaction } from "@/types";
import type { Loan, Payslip, PayslipItem } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import {
  buildAnaliseNormalizadaSnapshot,
  type AnaliseNormalizadaSnapshot,
} from "@/lib/analise/build-analise-normalizada-snapshot";
import { normalizarInstituicaoLogica } from "@/lib/anexos/consolidacao-logica-emprestimos";
import {
  buildReceitasCanonicas,
  dicionarioColunasRecebidos,
  enriquecimentoReceitaVazio,
  type EnriquecimentoReceitaBase,
  type ReceitaCanonicaRow,
  type ResumoMensalRecebidosRow,
} from "@/lib/receitas/normalizar-recebidos";
import {
  buildBaseConciliada,
  dicionarioColunasConciliacao,
  type BaseConciliadaLinha,
  type EntradaStatusManualBaseConciliada,
  type ResultadoConciliacaoContratoExtrato,
  type ResultadoConciliacaoFolhaExtrato,
} from "@/lib/conciliacao/conciliacao-financeira";
import {
  calcularScoreRiscoFinanceiro,
  type ResultadoScoreRiscoFinanceiro,
} from "@/lib/conciliacao/score-risco-financeiro";
import {
  buildAbaAuditoriaFinanceira,
  type LinhaAuditoriaFinanceira,
} from "@/lib/conciliacao/auditoria-financeira-aba";
import {
  baseConsignacoesGovernoVazia,
  dicionarioColunasConsigfacil,
  type BaseConsignacoesGoverno,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import {
  atualizarBaseComConsigfacil,
  type ResultadoAtualizacaoBaseComConsigfacil,
} from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";
import {
  classificarLinhaFinanceira,
} from "@/lib/consignacoes-governo/classificacao-canonica";
import { ehDivergenciaClassificacaoReal } from "@/lib/conciliacao/catalogo-rubricas-financeiras";
import { buildPendenciasReais } from "@/lib/conciliacao/pendencia-real-consignavel";
import type {
  FonteClassificacao,
  GrupoFinanceiroCanonico,
  ResultadoClassificacaoFinanceira,
} from "@/types/consigfacil";
import {
  consolidarConsignacoesOrdenadas,
  dicionarioColunasConsignacoesOrdenadas,
  type ConsignacaoOrdenadaLinha,
} from "@/lib/consignacoes-governo/consolidar-consignacoes-ordenadas";
import { loansEfetivosComConsigfacil } from "@/lib/consignacoes-governo/pipeline-consigfacil";
import { enriquecerContratosComTimelineEstrutural } from "@/lib/conciliacao/timeline-estrutural-contrato";
import {
  aplicarContextoOperacionalMargemEmContratos,
  contratoIgnoraDivergenciaValorPorMargem,
  snapshotMargemDeBaseGovernanca,
} from "@/lib/contratos/detectar-contexto-operacional-margem";
import {
  montarHistoricoContratoEventos,
  type HistoricoContratoEvento,
} from "@/lib/consignacoes-governo/historico-contrato-eventos";
import {
  montarAuditoriaConciliacaoConsigfacil,
  type AuditoriaConciliacaoConsigfacil,
} from "@/lib/consignacoes-governo/auditoria-conciliacao";
import {
  montarPacoteMargemHistorica,
  type AnaliseMargemHistorica,
  type MargemHistorica,
} from "@/lib/consignacoes-governo/margem-historica-unificada";
import {
  calcularMargemHistoricaAvancada,
  type PacoteMargemHistoricaAvancada,
} from "@/lib/consignacoes-governo/calcular-margem-historica-avancada";
import {
  montarPacoteConsumoEstruturalMargem,
  type PacoteConsumoEstruturalMargem,
} from "@/lib/consignacoes-governo/consumo-estrutural-margem";
import {
  baseConsignavelVigente,
  type BaseConsignavelReal,
} from "@/lib/consignacoes-governo/calcular-base-consignavel-real";
import type { MargemHistoricaDetalhe } from "@/lib/consignacoes-governo/margem-historica-unificada";
import {
  aplicarAuditoriaConsigfacil,
  type ResultadoAuditoriaConsigfacil,
  type PendenciaConferenciaReal,
  type DescontoFracionadoConciliado,
} from "@/lib/consignacoes-governo/aplicar-auditoria-consigfacil";
import type {
  ContratoUnicoConfirmado,
  RefinanciamentoDescartado,
} from "@/lib/consignacoes-governo/auditoria-contratos-unicos";
import {
  parametrosLeituraPadrao,
  type ResultadoResolucaoPerfil,
} from "@/lib/leitura-analise/resolver-perfil-leitura";
import {
  montarAuditoriaPerfilLeitura,
  montarLinhasPerfilLeituraExport,
} from "@/lib/leitura-analise/export-perfil-leitura";
import type { LoanCorrigidoConsigfacil } from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import {
  auditarIntegracaoFontes,
  type ResultadoAuditoriaIntegracao,
} from "@/lib/auditoria/auditoria-integracao-fontes";
import { verificarAtualizacaoDiariaSistema } from "@/lib/auditoria/verificar-atualizacao-diaria-sistema";
import {
  bloquearInferenciaBancariaHistorica,
  filtrarTransacoesBancariasReais,
  possuiFonteBancariaReal,
} from "@/lib/conciliacao/validar-fonte-bancaria-real";
import {
  detectarEventosOperacionais,
  type EventoOperacionalConsignado,
} from "@/lib/consigfacil/detectar-eventos-operacionais";
import {
  detectarRiscoRefinForcado,
  type RiscoRefinForcado,
} from "@/lib/juridico/detectar-risco-refin-forcado";
import {
  normalizarEstruturaContratosHistoricos,
  filtrarPendenciasFinanceirasPosSaneamento,
  type ResultadoNormalizacaoEstrutural,
  type PendenciaSaneamentoEstrutural,
} from "@/lib/contratos/normalizar-estrutura-contratos-historicos";
import {
  classificarContratosConsigfacil,
  classificarLoansEstrutura,
} from "@/lib/contratos/classificar-estrutura-contrato";

export { buildAnaliseNormalizadaSnapshot, type AnaliseNormalizadaSnapshot };

/**
 * Resumo agregado de classificações para o painel `Qualidade da classificação`.
 *
 * Conta linhas por fonte (oficial / alias / fuzzy / heurística / inferência /
 * sem correspondência) e por grupo canônico. A média da confiança é exposta
 * para o cabeçalho do painel.
 */
export type ResumoQualidadeClassificacao = {
  /** Todas as linhas inspecionadas (consignáveis + fora da conciliação). */
  total_linhas: number;
  /** Linhas elegíveis à conciliação consignável. */
  total_linhas_consignavel: number;
  /** Rubricas de folha excluídas da conciliação consignável. */
  total_linhas_fora_consignavel: number;
  por_fonte: Record<FonteClassificacao, number>;
  por_grupo: Record<GrupoFinanceiroCanonico, number>;
  total_aliases_utilizados: number;
  total_divergencias: number;
  total_sem_correspondencia: number;
  confianca_media: number;
};

function resumoQualidadeClassificacaoVazio(): ResumoQualidadeClassificacao {
  return {
    total_linhas: 0,
    total_linhas_consignavel: 0,
    total_linhas_fora_consignavel: 0,
    por_fonte: {
      consigfacil_oficial: 0,
      alias_oficial: 0,
      match_exato_catalogo: 0,
      match_alias_catalogo: 0,
      match_fuzzy_catalogo: 0,
      ocr_contracheque: 0,
      heuristica_descricao: 0,
      inferencia: 0,
      sem_correspondencia: 0,
    },
    por_grupo: {
      emprestimo_consignado: 0,
      cartao_beneficio: 0,
      cartao_credito: 0,
      contribuicao: 0,
      seguros: 0,
      refinanciamentos: 0,
      saque_complementar: 0,
      rmc: 0,
      rcc: 0,
      outros: 0,
      rubrica_folha_nao_consignavel: 0,
      conta_consumo: 0,
    },
    total_aliases_utilizados: 0,
    total_divergencias: 0,
    total_sem_correspondencia: 0,
    confianca_media: 0,
  };
}

function montarResumoQualidade(
  classificacoes: ResultadoClassificacaoFinanceira[],
): ResumoQualidadeClassificacao {
  const r = resumoQualidadeClassificacaoVazio();
  if (classificacoes.length === 0) return r;
  let somaConfianca = 0;
  for (const c of classificacoes) {
    r.total_linhas += 1;
    r.por_grupo[c.grupo_canonico] += 1;
    if (
      c.grupo_canonico === "rubrica_folha_nao_consignavel" ||
      c.grupo_canonico === "conta_consumo"
    ) {
      r.total_linhas_fora_consignavel += 1;
      continue;
    }
    r.total_linhas_consignavel += 1;
    r.por_fonte[c.fonte_classificacao] += 1;
    if (c.aliases_utilizados.length > 0) r.total_aliases_utilizados += 1;
    if (ehDivergenciaClassificacaoReal(c)) r.total_divergencias += 1;
    if (c.fonte_classificacao === "sem_correspondencia") r.total_sem_correspondencia += 1;
    somaConfianca += c.indice_confianca_classificacao;
  }
  r.confianca_media =
    r.total_linhas_consignavel > 0
      ? Math.round((somaConfianca / r.total_linhas_consignavel) * 10) / 10
      : 0;
  return r;
}

export type BaseFinanceiraTipoEvento =
  | "receita"
  | "desconto"
  | "emprestimo"
  | "parcela"
  | "contrato_anexado"
  | "alerta"
  | "cartao_saque"
  | "seguro_venda_casada"
  | "juros_cet"
  | "refinanciamento";

export type FiltrosBaseFinanceiraNormalizada = {
  dataInicio?: string;
  dataFim?: string;
  banco?: string;
  tipo?: string;
  risco?: string;
  categoria?: string;
};

export type BaseFinanceiraEvento = {
  evento_id: string;
  data: string;
  competencia: string;
  origem: "transacao" | "contracheque" | "emprestimo" | "evidencia" | "analise";
  tipo_evento: BaseFinanceiraTipoEvento;
  categoria: string;
  banco: string;
  codigo_folha: string;
  descricao_padronizada: string;
  valor: number;
  entrada_saida: "entrada" | "saida" | "neutro";
  risco: string;
  status: string;
  documento_origem: string;
  referencia_origem: string;
} & EnriquecimentoReceitaBase;

export type BaseFinanceiraNormalizada = {
  version: 1;
  gerado_em: string;
  snapshot: AnaliseNormalizadaSnapshot;
  registros: BaseFinanceiraEvento[];
  contratos: Array<Record<string, string | number | null>>;
  eventos: BaseFinanceiraEvento[];
  baseNormalizada: BaseFinanceiraEvento[];
  receitas: BaseFinanceiraEvento[];
  descontos: BaseFinanceiraEvento[];
  emprestimos: BaseFinanceiraEvento[];
  parcelas: BaseFinanceiraEvento[];
  contratosAnexados: Array<Record<string, string | number | null>>;
  alertas: Array<Record<string, string | number | null>>;
  cartaoSaque: Array<Record<string, string | number | null>>;
  /** Espelha campos do BaseFinanceiraEvento (booleanos de receita_*) + critério textual. */
  seguroVendaCasada: Array<Record<string, string | number | boolean | null>>;
  jurosCet: Array<Record<string, string | number | null>>;
  refinanciamentos: Array<Record<string, string | number | null>>;
  resumoMensal: Array<Record<string, string | number | null>>;
  /**
   * Aba paralela à `Receitas`. Linhas com receita canônica + grupo + tipo_calculo
   * + flag de duplicidade salário-transação vs. rubricas de contracheque.
   */
  recebidosNormalizados: ReceitaCanonicaRow[];
  /** Bloco de Resumo_Mensal específico para recebidos (compatível com Power BI). */
  resumoMensalRecebidos: ResumoMensalRecebidosRow[];
  // ---- Camada de CONCILIAÇÃO (extrato vs. folha vs. contrato) ----
  baseConciliada: BaseConciliadaLinha[];
  extratosBancarios: BaseConciliadaLinha[];
  emprestimosExtrato: BaseConciliadaLinha[];
  pagamentosEmprestimosExtrato: BaseConciliadaLinha[];
  duplicidadesProvaveis: BaseConciliadaLinha[];
  conciliacaoFolhaExtrato: ResultadoConciliacaoFolhaExtrato[];
  conciliacaoContratoExtrato: ResultadoConciliacaoContratoExtrato[];
  /** Score 0..100 + componentes do `indice_risco_financeiro`. */
  scoreRiscoFinanceiro: ResultadoScoreRiscoFinanceiro;
  /** Linhas da aba `Auditoria_Financeira` (achados, recomendações). */
  auditoriaFinanceira: LinhaAuditoriaFinanceira[];
  // ---- Camada ConsigFácil (governo do Amazonas) ----
  /**
   * Base oficial de consignações importadas do portal ConsigFácil. Sempre
   * presente — vazia quando o usuário ainda não importou nenhum snapshot.
   * Tem PRIORIDADE OFICIAL sobre OCR, inferência, extrato e contracheque
   * para parcelas, status, refinanciamentos, margem, cartões e averbações.
   */
  consigfacil: BaseConsignacoesGoverno;
  /** Resultado do cruzamento ConsigFácil × Loan/BaseConciliada. */
  consigfacilConciliacao: ResultadoAtualizacaoBaseComConsigfacil;
  /**
   * Classificação CANÔNICA (catálogo oficial) das linhas financeiras.
   * NÃO destrutivo: `instituicao_original` / `modalidade_original` ficam
   * preservados em cada item; o resultado oficial é exposto ao lado.
   */
  classificacoesLoans: Array<{ loan_id: string } & ResultadoClassificacaoFinanceira>;
  classificacoesBaseConciliada: Array<{ linha_id: string } & ResultadoClassificacaoFinanceira>;
  /**
   * Resumo da "qualidade da classificação" — agregado para o painel
   * `Qualidade da classificação` e para a aba `Consigfacil_Classificacoes`.
   */
  qualidadeClassificacao: ResumoQualidadeClassificacao;
  /**
   * VISÃO FINAL ordenada por (primeiro_desconto, instituicao_oficial, modalidade_oficial).
   * É a fonte canônica para a página `/dashboard/consignacoes` e para a aba
   * `Consignacoes_Ordenadas` da exportação.
   */
  consignacoesOrdenadas: ConsignacaoOrdenadaLinha[];
  /** Loans com correção automática ConsigFácil (score ≥ 90) — snapshot original preservado. */
  loansCorrigidosConsigfacil: LoanCorrigidoConsigfacil[];
  /** Timeline de eventos por contrato (oficial + cadastro). */
  historicoContratoEventos: HistoricoContratoEvento[];
  /** Trilha de auditoria da conciliação ConsigFácil. */
  auditoriaConciliacaoConsigfacil: AuditoriaConciliacaoConsigfacil[];
  /** Margem histórica unificada (consignável / cartão / cartão benefício). */
  margemHistorica: MargemHistorica[];
  /** Detalhe por competência (base da folha + cruzamento portal). */
  margemHistoricaDetalhes: MargemHistoricaDetalhe[];
  /** Insights, lacunas e resumo vigente da margem. */
  margemHistoricaAnalise: AnaliseMargemHistorica;
  /** Motor avançado: pressão, sufocamento, ciclos, projeções e eventos. */
  margemHistoricaAvancada: PacoteMargemHistoricaAvancada;
  /** Consumo por camada (consignável / cartão / benefício — nunca somadas). */
  consumoEstruturalMargem: PacoteConsumoEstruturalMargem;
  /** Base consignável real por competência (não é líquido bancário). */
  baseConsignavelReal: BaseConsignavelReal[];
  /** Competência vigente da base consignável. */
  baseConsignavelRealVigente: BaseConsignavelReal | null;
  /** Auditoria ConsigFácil: contratos únicos, descontos fracionados, pendências reais. */
  auditoriaConsigfacil: ResultadoAuditoriaConsigfacil;
  contratosUnicosConfirmados: ContratoUnicoConfirmado[];
  descontosFracionadosConciliados: DescontoFracionadoConciliado[];
  refinanciamentosDescartados: RefinanciamentoDescartado[];
  pendenciasConferenciaReais: PendenciaConferenciaReal[];
  /** Pendências técnicas de saneamento (OCR, fusão) — não são divergência financeira. */
  pendenciasSaneamentoEstrutural: PendenciaSaneamentoEstrutural[];
  /** Último resultado do saneamento estrutural aplicado nesta base. */
  saneamentoEstrutural: ResultadoNormalizacaoEstrutural | null;
  /** Suspensão, bloqueio, inadimplência, descontos recuperados (trilha operacional). */
  eventosOperacionaisConsignado: EventoOperacionalConsignado[];
  /** Padrão suspensão → quebra → novo contrato (refin induzido). */
  riscoRefinForcado: RiscoRefinForcado[];
  /** Parâmetros derivados do formulário de perfil de leitura. */
  perfilLeitura: ResultadoResolucaoPerfil;
  perfilLeituraExport: Array<Record<string, string>>;
  dicionarioColunas: Array<Record<string, string>>;
  ocrTecnicoJson: Array<Record<string, string>>;
  metricas: Record<string, string | number | null>;
  series_temporais: Record<string, Array<Record<string, string | number | null>>>;
  exportacao_meta: Record<string, string | number | null>;
  /** Auditoria de integração das 10 fontes obrigatórias. */
  integracaoFontes: ResultadoAuditoriaIntegracao;
};

function competencia(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function dataCompetencia(year: number, month: number): string {
  return `${competencia(year, month)}-01`;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

export function mascararCpfFinanceiro(texto: string): string {
  return texto.replace(/\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g, "***.$2.$3-**");
}

export function normalizarDescricaoFinanceira(texto: string | null | undefined): string {
  return mascararCpfFinanceiro((texto ?? "").replace(/\s+/g, " ").trim());
}

export function normalizarInstituicaoFinanceira(texto: string | null | undefined): string {
  return (texto ?? "").trim() || "Nao identificado";
}

export function classificarNaturezaFinanceira(input: {
  descricao?: string | null;
  tipo?: "receita" | "despesa" | "vantagem" | "desconto" | null;
}): string {
  const d = (input.descricao ?? "").toUpperCase();
  if (/\bCART|RCC|RMC\b|CRED\s*CESTA|CREDCESTA|SAQUE/.test(d)) return "cartao_saque";
  if (/\bSEGURO|VENDA\s+CASADA|PROTECAO|PROTEÇÃO|TARIFA/.test(d)) return "seguro_venda_casada";
  if (/\bEMP|EMPREST|CONSIG|PARCELA/.test(d)) return "emprestimo";
  if (input.tipo === "receita" || input.tipo === "vantagem") return "receita";
  return "desconto";
}

function categoriaItem(it: PayslipItem): string {
  const natureza = classificarNaturezaFinanceira({ descricao: it.description, tipo: it.type });
  if (natureza === "receita") return "receita_contracheque";
  if (natureza === "desconto") return "desconto_contracheque";
  return natureza;
}

function tipoEventoItem(it: PayslipItem): BaseFinanceiraTipoEvento {
  const d = it.description.toUpperCase();
  const cat = classificarNaturezaFinanceira({ descricao: d, tipo: it.type });
  if (cat === "emprestimo") return "emprestimo";
  if (cat === "cartao_saque") return "cartao_saque";
  if (cat === "seguro_venda_casada") return "seguro_venda_casada";
  return it.type === "vantagem" ? "receita" : "desconto";
}

function eventoTransacao(t: Transaction): BaseFinanceiraEvento {
  return {
    evento_id: `transacao:${t.id}`,
    data: String(t.date).slice(0, 10),
    competencia: String(t.date).slice(0, 7),
    origem: "transacao",
    tipo_evento: t.type === "receita" ? "receita" : "desconto",
    categoria: t.category,
    banco: "Nao aplicavel",
    codigo_folha: "",
    descricao_padronizada: normalizarDescricaoFinanceira(t.description),
    valor: num(t.amount),
    entrada_saida: t.type === "receita" ? "entrada" : "saida",
    risco: "",
    status: "",
    documento_origem: t.source_file_name ?? "",
    referencia_origem: t.source_ref ?? t.id,
    ...enriquecimentoReceitaVazio(),
  };
}

function eventoPayslip(p: Payslip, it: PayslipItem, idx: number): BaseFinanceiraEvento {
  const tipo = tipoEventoItem(it);
  return {
    evento_id: `contracheque:${p.id}:${idx}`,
    data: dataCompetencia(p.year, p.month),
    competencia: competencia(p.year, p.month),
    origem: "contracheque",
    tipo_evento: tipo,
    categoria: categoriaItem(it),
    banco: normalizarInstituicaoFinanceira(it.bancoConfirmacao?.nome ?? it.banco?.nome ?? p.cartao_saque_banco_possivel),
    codigo_folha: (it.code ?? "").replace(/\D/g, ""),
    descricao_padronizada: normalizarDescricaoFinanceira(it.description),
    valor: num(it.value),
    entrada_saida: it.type === "vantagem" ? "entrada" : "saida",
    risco: tipo === "cartao_saque" ? normalizarInstituicaoFinanceira(p.cartao_saque_risco) : "",
    status: "",
    documento_origem: p.file_name ?? "",
    referencia_origem: p.id,
    ...enriquecimentoReceitaVazio(),
  };
}

function aplicarFiltros(eventos: BaseFinanceiraEvento[], filtros?: FiltrosBaseFinanceiraNormalizada): BaseFinanceiraEvento[] {
  if (!filtros) return eventos;
  return eventos.filter((e) => {
    if (filtros.dataInicio && e.data < filtros.dataInicio) return false;
    if (filtros.dataFim && e.data > filtros.dataFim) return false;
    if (filtros.banco && filtros.banco !== "__todos__" && e.banco !== filtros.banco) return false;
    if (filtros.tipo && filtros.tipo !== "__todos__" && e.tipo_evento !== filtros.tipo) return false;
    if (filtros.risco && filtros.risco !== "__todos__" && e.risco !== filtros.risco) return false;
    if (filtros.categoria && filtros.categoria !== "__todos__" && e.categoria !== filtros.categoria) return false;
    return true;
  });
}

function dicionarioColunas(): Array<Record<string, string>> {
  const base: Array<[string, string]> = [
    ["evento_id", "Identificador estável do evento financeiro."],
    ["data", "Data em formato yyyy-mm-dd."],
    ["competencia", "Competência yyyy-mm."],
    ["origem", "Origem da linha: transacao, contracheque, emprestimo, evidencia ou analise."],
    ["tipo_evento", "Classificação principal do evento financeiro."],
    ["categoria", "Categoria padronizada para filtro e Power BI."],
    ["banco", "Instituição financeira normalizada quando identificada."],
    ["codigo_folha", "Código da rubrica no contracheque, apenas dígitos."],
    ["descricao_padronizada", "Descrição limpa; CPF mascarado quando detectado."],
    ["valor", "Valor numérico sem símbolo R$."],
    ["entrada_saida", "entrada, saida ou neutro."],
    ["risco", "Risco analítico quando aplicável."],
    ["status", "Status do contrato, alerta ou evidência quando aplicável."],
    ["documento_origem", "Nome do arquivo/documento de origem quando disponível."],
    ["referencia_origem", "ID técnico de origem para auditoria."],
  ];
  const classificacao: Array<[string, string]> = [
    ["instituicao_original", "Nome da instituição como apareceu no documento original."],
    ["instituicao_normalizada", "Mesmo nome em forma canônica (minúsculas, sem acento)."],
    ["instituicao_oficial", "Nome oficial reconhecido no catálogo ConsigFácil."],
    ["modalidade_original", "Modalidade conforme apareceu na fonte (rubrica/seção/descrição)."],
    ["modalidade_normalizada", "Mesma modalidade em forma canônica."],
    ["modalidade_oficial", "Slug da modalidade oficial (cartao_beneficio_compra, emprestimo_consignado…)."],
    ["grupo_canonico", "Agrupamento canônico (emprestimo_consignado, cartao_beneficio, seguros…)."],
    ["tipo_margem", "margem_consignavel | margem_cartao | margem_cartao_beneficio | null."],
    ["fonte_classificacao", "Como a classificação foi obtida: consigfacil_oficial, alias, fuzzy, ocr, heurística…"],
    ["aliases_utilizados", "Aliases do catálogo que casaram com a linha."],
    ["indice_confianca_classificacao", "0..100 — quanto mais oficial a fonte, maior."],
    ["divergencia_classificacao", "true quando catálogo e fonte original não coincidem."],
    ["motivo_classificacao", "Texto humano explicando o resultado."],
    ["classificacao_anterior", "Categorização que o app tinha antes do catálogo."],
    ["classificacao_oficial", "Grupo canônico final aplicado pelo catálogo."],
  ];
  return [
    ...base.map(([coluna, descricao]) => ({ coluna, descricao })),
    ...dicionarioColunasRecebidos(),
    ...dicionarioColunasConciliacao(),
    ...dicionarioColunasConsigfacil(),
    ...classificacao.map(([coluna, descricao]) => ({ coluna, descricao })),
    ...dicionarioColunasConsignacoesOrdenadas(),
  ];
}

function deduplicarRefinanciamentosDescartados(
  itens: RefinanciamentoDescartado[],
): RefinanciamentoDescartado[] {
  const vistos = new Set<string>();
  return itens.filter((r) => {
    const chave = `${r.contrato_origem}|${r.contrato_destino}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

export function buildBaseFinanceiraNormalizada(input: {
  transactions?: Transaction[];
  loans?: Loan[];
  payslips?: Payslip[];
  evidencias?: LoanEvidence[];
  filtros?: FiltrosBaseFinanceiraNormalizada;
  /** Status manuais aplicados nas linhas da Base_Conciliada (override do usuário). */
  statusManualConciliacao?: ReadonlyArray<EntradaStatusManualBaseConciliada>;
  /** Base oficial de consignações importadas do portal ConsigFácil (Governo AM). */
  consigfacil?: BaseConsignacoesGoverno;
  /** Perfil de leitura (formulário). Se omitido, usa padrão do catálogo. */
  perfilLeitura?: ResultadoResolucaoPerfil;
  /** Snapshots brutos ConsigFácil (para auditoria de atualização). */
  snapshotsConsigfacilRaw?: ConsigfacilSnapshot[];
}): BaseFinanceiraNormalizada {
  const perfilLeitura = input.perfilLeitura ?? parametrosLeituraPadrao();
  const transactionsBruto = input.transactions ?? [];
  const fonteBancariaReal = possuiFonteBancariaReal(transactionsBruto);
  const transacoesBancariasReais = filtrarTransacoesBancariasReais(transactionsBruto);
  bloquearInferenciaBancariaHistorica(fonteBancariaReal);
  const loansBruto = input.loans ?? [];
  const payslips = input.payslips ?? [];
  const evidencias = input.evidencias ?? [];
  let consigfacilBase = input.consigfacil ?? baseConsignacoesGovernoVazia;

  const saneamentoEstrutural = normalizarEstruturaContratosHistoricos({
    contratos: consigfacilBase.contratos,
    loans: loansBruto,
    refinanciamentos: consigfacilBase.refinanciamentos,
    configAuditoria: perfilLeitura.configAuditoria,
  });

  const contratosClassificados = classificarContratosConsigfacil(
    saneamentoEstrutural.contratos,
  );
  const loansParaConciliacao = classificarLoansEstrutura({
    loans: saneamentoEstrutural.loans,
    consigfacilPorId: new Map(contratosClassificados.map((c) => [c.id_consignacao, c])),
    vinculoLoanConsigfacil: new Map<string, string>(),
    payslips,
  });

  const timelinePack = enriquecerContratosComTimelineEstrutural({
    payslips,
    contratos: contratosClassificados,
    loans: loansParaConciliacao,
  });

  consigfacilBase = {
    ...consigfacilBase,
    contratos: timelinePack.contratos,
    contratosConsignadosComuns: timelinePack.contratos.filter((c) => !c.eh_cartao_beneficio),
    cartoesBeneficio: timelinePack.contratos.filter((c) => c.eh_cartao_beneficio),
    refinanciamentos: saneamentoEstrutural.refinanciamentos,
  };

  const loansParaConciliacaoComTimeline = timelinePack.loans;

  const conciliacaoBruta = buildBaseConciliada({
    transactions: transactionsBruto,
    payslips,
    loans: loansBruto,
    evidencias,
    statusManual: input.statusManualConciliacao,
  });

  const snapshotMargemOperacional = snapshotMargemDeBaseGovernanca(consigfacilBase);
  consigfacilBase = {
    ...consigfacilBase,
    contratos: aplicarContextoOperacionalMargemEmContratos({
      contratos: consigfacilBase.contratos,
      baseConciliada: conciliacaoBruta.baseConciliada,
      snapshot: snapshotMargemOperacional,
    }),
  };

  // ConsigFácil CONFIRMA (não sobrescreve). Cadastro original do `Loan` é
  // preservado; cada loan ganha um objeto `confirmacao_consigfacil` ao lado.
  // Divergências viram linhas na aba `Consigfacil_Ajustes_Base`.
  const consigfacilConciliacaoPreAuditoria = atualizarBaseComConsigfacil({
    baseConsignacoes: consigfacilBase,
    loans: loansParaConciliacaoComTimeline,
    baseConciliada: conciliacaoBruta.baseConciliada,
    configAuditoria: perfilLeitura.configAuditoria,
  });

  const eventosOperacionaisCompletos = detectarEventosOperacionais({
    contratos: consigfacilBase.contratos,
    historico: consigfacilBase.historico,
    divergenciasFolhaExtrato: consigfacilConciliacaoPreAuditoria.divergenciasFolhaExtrato,
    baseConciliada: conciliacaoBruta.baseConciliada,
  });

  const auditoriaConsigfacil = aplicarAuditoriaConsigfacil({
    contratos: consigfacilBase.contratos,
    refinanciamentosDetectados: consigfacilBase.refinanciamentos,
    baseConciliada: consigfacilConciliacaoPreAuditoria.baseConciliadaEnriquecida,
    consigfacilConciliacao: consigfacilConciliacaoPreAuditoria,
    loans: loansParaConciliacao,
    eventosOperacionais: eventosOperacionaisCompletos,
    config: perfilLeitura.configAuditoria,
  });

  consigfacilBase = {
    ...consigfacilBase,
    eventosOperacionais: eventosOperacionaisCompletos,
  };

  const riscoRefinForcado = detectarRiscoRefinForcado({
    contratos: consigfacilBase.contratos,
    eventosOperacionais: eventosOperacionaisCompletos,
    refinanciamentos: consigfacilBase.refinanciamentos,
  });

  consigfacilBase = {
    ...consigfacilBase,
    contratos: auditoriaConsigfacil.contratos,
    refinanciamentos: auditoriaConsigfacil.refinanciamentosConfirmados,
    refinanciamentosDescartados: [
      ...consigfacilBase.refinanciamentosDescartados,
      ...auditoriaConsigfacil.refinanciamentosDescartados,
    ],
  };

  const baseConciliadaPosAuditoria: typeof consigfacilConciliacaoPreAuditoria.baseConciliadaEnriquecida =
    auditoriaConsigfacil.baseConciliadaEnriquecida.map((l) => {
      const orig = consigfacilConciliacaoPreAuditoria.baseConciliadaEnriquecida.find(
        (x) => x.id === l.id,
      );
      if (!orig) return l as (typeof consigfacilConciliacaoPreAuditoria.baseConciliadaEnriquecida)[number];
      return { ...orig, ...l, confirmacao_consigfacil: orig.confirmacao_consigfacil };
    });

  let consigfacilConciliacao = {
    ...consigfacilConciliacaoPreAuditoria,
    baseConciliadaEnriquecida: baseConciliadaPosAuditoria,
  };

  const matchLoanPorIdConsignacao = new Map<string, string>();
  for (const m of consigfacilConciliacao.matches) {
    if (m.loan_id) matchLoanPorIdConsignacao.set(m.id_consignacao, m.loan_id);
  }
  const timelinePosMatch = enriquecerContratosComTimelineEstrutural({
    payslips,
    contratos: consigfacilBase.contratos,
    loans: loansParaConciliacaoComTimeline,
    matchesLoanPorIdConsignacao: matchLoanPorIdConsignacao,
  });
  const contratosPosTimelineMargem = aplicarContextoOperacionalMargemEmContratos({
    contratos: timelinePosMatch.contratos,
    baseConciliada: baseConciliadaPosAuditoria,
    snapshot: snapshotMargemOperacional,
  });
  consigfacilBase = {
    ...consigfacilBase,
    contratos: contratosPosTimelineMargem,
    contratosConsignadosComuns: contratosPosTimelineMargem.filter(
      (c) => !c.eh_cartao_beneficio,
    ),
    cartoesBeneficio: contratosPosTimelineMargem.filter((c) => c.eh_cartao_beneficio),
  };

  const divergenciasFolhaPosMargem =
    consigfacilConciliacao.divergenciasFolhaExtrato.filter((d) => {
      const c = consigfacilBase.contratos.find((x) => x.id_consignacao === d.id_consignacao);
      return !contratoIgnoraDivergenciaValorPorMargem(c ?? {});
    });
  consigfacilConciliacao = {
    ...consigfacilConciliacao,
    divergenciasFolhaExtrato: divergenciasFolhaPosMargem,
  };

  // Loans EFETIVOS: aplica correções automáticas ConsigFácil (score ≥ 90) para
  // gráficos, resumo e exportação — sem apagar o cadastro original (fica em
  // `consigfacilConciliacao.loansComConfirmacao` + `loansCorrigidosConsigfacil`).
  const loans = loansEfetivosComConsigfacil(
    loansBruto,
    consigfacilConciliacao.loansCorrigidos,
  );
  const historicoContratoEventos = montarHistoricoContratoEventos({
    loans: loansBruto,
    loansComConfirmacao: consigfacilConciliacao.loansComConfirmacao,
    contratosConsigfacil: consigfacilBase.contratos,
    refinanciamentosConsigfacil: consigfacilBase.refinanciamentos,
    ajustes: consigfacilConciliacao.ajustes,
    instituicaoOficialPorIdConsignacao:
      consigfacilConciliacao.instituicaoOficialPorIdConsignacao,
    eventosOperacionais: eventosOperacionaisCompletos,
  });
  const auditoriaConciliacaoConsigfacil = montarAuditoriaConciliacaoConsigfacil({
    ajustes: consigfacilConciliacao.ajustes,
    loansCorrigidos: consigfacilConciliacao.loansCorrigidos,
    matches: consigfacilConciliacao.matches,
  });
  const pacoteMargemHistorica = montarPacoteMargemHistorica({
    margensConsigfacil: consigfacilBase.margensSerieTemporal,
    resumoMargemMensal: consigfacilBase.resumoMargemMensal,
    payslips,
  });
  const margemHistorica = pacoteMargemHistorica.historico;
  const margemHistoricaDetalhes = pacoteMargemHistorica.detalhes;
  const margemHistoricaAnalise = pacoteMargemHistorica.analise;

  const margemHistoricaAvancada = calcularMargemHistoricaAvancada({
    payslips,
    margensConsigfacil: consigfacilBase.margensSerieTemporal,
    resumoMargemMensal: consigfacilBase.resumoMargemMensal,
    contratos: consigfacilBase.contratos,
    refinanciamentos: consigfacilBase.refinanciamentos,
    baseConciliada: conciliacaoBruta.baseConciliada,
    descontosFracionados: auditoriaConsigfacil.descontosFracionadosConciliados,
    historicoEventos: historicoContratoEventos,
    chunkSize: payslips.length > 100 ? 6 : 12,
  });

  const baseConsignavelReal = margemHistoricaAvancada.bases_consignavel_real;
  const baseConsignavelRealVigente = baseConsignavelVigente(baseConsignavelReal);

  const consumoEstruturalMargem = montarPacoteConsumoEstruturalMargem({
    baseConciliada: conciliacaoBruta.baseConciliada,
    contratos: consigfacilBase.contratos,
    competenciasMargem: margemHistoricaAvancada.competencias,
    chunkSize: payslips.length > 100 ? 6 : 12,
  });

  // -------------------------------------------------------------------------
  // CLASSIFICAÇÃO CANÔNICA — passa cada loan e cada linha conciliada pelo
  // catálogo oficial ConsigFácil. SEMPRE preserva `*_original`.
  //
  // Cada `Loan` traz seu próprio `institution_name` + `description`. Para
  // baseConciliada, usamos `descricao_normalizada`/`descricao_original` como
  // proxy de modalidade quando aplicável.
  // -------------------------------------------------------------------------
  const idConsigfacilPorLoan = new Map<string, string>();
  for (const r of consigfacilConciliacao.resultadosConciliacao) {
    if (r.loan_id) idConsigfacilPorLoan.set(r.loan_id, r.id_consignacao);
  }
  const classificacoesLoans = loans.map((l) => {
    const instituicao = l.institution_name ?? l.description;
    const descricao = l.description ?? null;
    const textoModalidade =
      descricao && descricao.trim() !== (instituicao ?? "").trim() ? descricao : descricao;
    return {
      loan_id: l.id,
      ...classificarLinhaFinanceira({
        instituicao,
        descricao,
        modalidade: textoModalidade,
        id_consignacao_consigfacil: idConsigfacilPorLoan.get(l.id) ?? null,
      }),
    };
  });
  // Para linhas da baseConciliada vinculadas a um Loan, herdamos sua classificação.
  const classifPorLoanId = new Map(
    classificacoesLoans.map((c) => [c.loan_id, c] as const),
  );
  const classificacoesBaseConciliada = consigfacilConciliacao.baseConciliadaEnriquecida.map((linha) => {
    if (linha.vinculo_contrato_id) {
      const herdada = classifPorLoanId.get(linha.vinculo_contrato_id);
      if (herdada) {
        return { linha_id: linha.id, ...herdada };
      }
    }
    const instituicao = linha.banco_origem ?? linha.descricao_normalizada;
    const descricao = linha.descricao_original ?? linha.descricao_normalizada;
    const modalidade =
      descricao.trim() !== (instituicao ?? "").trim() ? descricao : null;
    return {
      linha_id: linha.id,
      ...classificarLinhaFinanceira({
        instituicao,
        descricao,
        modalidade,
      }),
    };
  });
  const qualidadeClassificacao = montarResumoQualidade([
    ...classificacoesLoans,
    ...classificacoesBaseConciliada,
  ]);

  // ----------------------------------------------------------------------
  // Visão final ORDENADA de consignações — usa os mesmos dados já
  // computados (loans + baseConciliada + consigfacil + classificações) para
  // produzir UMA linha por contrato/desconto ordenada por timeline.
  // ----------------------------------------------------------------------
  const loansConfirmadosConsigfacilIds = new Set<string>(
    consigfacilConciliacao.loansComConfirmacao
      .filter((l) => l.confirmacao_consigfacil.confirmado_consigfacil)
      .map((l) => l.id),
  );
  const loansComDivergenciaConsigfacilIds = new Set<string>(
    consigfacilConciliacao.loansComConfirmacao
      .filter((l) => l.confirmacao_consigfacil.divergencia_consigfacil)
      .map((l) => l.id),
  );
  const consignacoesOrdenadas = consolidarConsignacoesOrdenadas({
    loans,
    baseConciliada: consigfacilConciliacao.baseConciliadaEnriquecida,
    consigfacilContratos: consigfacilBase.contratos,
    classificacoesLoans,
    vinculosConsigfacilPorLoanId: idConsigfacilPorLoan,
    loansConfirmadosConsigfacilIds,
    loansComDivergenciaConsigfacilIds,
    payslips,
  });

  const snapshot = buildAnaliseNormalizadaSnapshot(payslips);

  const conciliacao = {
    ...conciliacaoBruta,
    baseConciliada: consigfacilConciliacao.baseConciliadaEnriquecida,
    extratosBancarios: consigfacilConciliacao.baseConciliadaEnriquecida.filter(
      (l) => l.origem === "extrato_bancario",
    ),
    emprestimosExtrato: consigfacilConciliacao.baseConciliadaEnriquecida.filter(
      (l) => l.categoria_canonica === "emprestimo_pessoal_creditado",
    ),
    pagamentosEmprestimosExtrato: consigfacilConciliacao.baseConciliadaEnriquecida.filter(
      (l) => l.categoria_canonica === "pagamento_emprestimo_extrato",
    ),
    duplicidadesProvaveis: consigfacilConciliacao.baseConciliadaEnriquecida.filter(
      (l) => l.possivel_duplicidade,
    ),
  };

  const eventos = [
    ...(fonteBancariaReal ? transacoesBancariasReais.map(eventoTransacao) : []),
    ...snapshot.payslipsFolha.flatMap((p) => (p.items ?? []).map((it, idx) => eventoPayslip(p, it, idx))),
  ].sort((a, b) => a.data.localeCompare(b.data) || a.evento_id.localeCompare(b.evento_id));

  // Recebidos: duplicidade salário×extrato só com fonte bancária real importada
  const recebidos = buildReceitasCanonicas(eventos, { possuiFonteBancariaReal: fonteBancariaReal });
  for (const e of eventos) {
    const enriq = recebidos.enriquecimentoPorEventoId.get(e.evento_id);
    if (enriq) Object.assign(e, enriq);
  }

  const baseNormalizada = aplicarFiltros(eventos, input.filtros);

  const parcelas: BaseFinanceiraEvento[] = snapshot.contratosCanonico.flatMap((c) =>
    (c.mesesDetectados.length ? c.mesesDetectados : [c.primeiraAparicao]).map((mes, idx) => ({
      evento_id: `parcela:${c.codigo}:${c.descricao}:${mes}:${idx}`,
      data: `${mes}-01`,
      competencia: mes,
      origem: "analise" as const,
      tipo_evento: "parcela" as const,
      categoria: "parcela_emprestimo",
      banco: normalizarInstituicaoFinanceira(c.instituicaoDetectada ?? normalizarInstituicaoLogica(c)),
      codigo_folha: c.codigo,
      descricao_padronizada: normalizarDescricaoFinanceira(c.descricao),
      valor: num(c.valorParcela),
      entrada_saida: "saida" as const,
      risco: c.risco,
      status: c.status,
      documento_origem: "contracheque",
      referencia_origem: `${c.primeiraAparicao}:${c.ultimaAparicao}`,
      ...enriquecimentoReceitaVazio(),
    })),
  );

  const contratosAnexados = loans.map((l) => ({
    loan_id: l.id,
    descricao: normalizarDescricaoFinanceira(l.description),
    instituicao: normalizarInstituicaoFinanceira(l.institution_name),
    valor_total: num(l.total_amount),
    valor_parcela: num(l.installment_amount),
    total_parcelas: l.total_installments,
    parcelas_pagas: l.paid_installments,
    data_inicio: String(l.start_date).slice(0, 10),
    status: l.status,
    evidencias_vinculadas: evidencias.filter((e) => e.loan_id === l.id).length,
  }));

  const alertas = [
    ...(snapshot.resultadoContracheque?.alertas ?? []).map((a) => ({
      alerta_id: a.id,
      nivel: a.nivel,
      titulo: a.titulo,
      detalhe: normalizarDescricaoFinanceira(a.detalhe),
      categoria: "analise_financeira",
    })),
    ...snapshot.emprestimosAnalise.pendencias.map((p, idx) => ({
      alerta_id: `pendencia:${idx + 1}`,
      nivel: "pendencia",
      titulo: "Pendência de base",
      detalhe: normalizarDescricaoFinanceira(p),
      categoria: "qualidade_base",
    })),
  ];

  const cartaoSaque = snapshot.payslipsFolha
    .filter((p) => p.cartao_saque_embutido_detectado || p.cartao_saque_tipo || p.cartao_saque_valor_mensal)
    .map((p) => ({
      competencia: competencia(p.year, p.month),
      tipo: p.cartao_saque_tipo ?? "",
      risco: p.cartao_saque_risco ?? "",
      banco: p.cartao_saque_banco_possivel ?? "",
      valor_mensal: num(p.cartao_saque_valor_mensal),
      termos: (p.cartao_saque_termos ?? []).join(", "),
      status_conferencia: p.cartao_saque_status_conferencia ?? "",
      documento: p.file_name ?? "",
    }));

  const seguroVendaCasada = baseNormalizada
    .filter((e) => e.tipo_evento === "seguro_venda_casada")
    .map((e) => ({ ...e, criterio: "Rubrica compatível com seguro/tarifa/proteção" }));

  const jurosCet = loans.map((l) => ({
    loan_id: l.id,
    descricao: normalizarDescricaoFinanceira(l.description),
    instituicao: normalizarInstituicaoFinanceira(l.institution_name),
    valor_total: num(l.total_amount),
    valor_parcela: num(l.installment_amount),
    total_parcelas: l.total_installments,
    total_parcelas_estimado: num(l.installment_amount * l.total_installments),
    diferenca_total_vs_parcelas: num(l.installment_amount * l.total_installments - l.total_amount),
    observacao: "CET/juros dependem do contrato anexado; esta aba deixa valores preparados para conferência externa.",
  }));

  const refinanciamentos = snapshot.contratosCanonico
    .filter((c) => c.observacoes.some((o) => /refin|renegocia|portabilidade/i.test(o)))
    .map((c) => ({
      codigo_folha: c.codigo,
      instituicao: normalizarInstituicaoFinanceira(c.instituicaoDetectada ?? normalizarInstituicaoLogica(c)),
      descricao: normalizarDescricaoFinanceira(c.descricao),
      valor_parcela: num(c.valorParcela),
      primeira_competencia: c.primeiraAparicao,
      ultima_competencia: c.ultimaAparicao,
      status: c.status,
      observacoes: c.observacoes.join(" | "),
    }));

  // Cruza `padroesParaGraficos.porMes` (contracheque) com o resumo de recebidos para que cada
  // competência traga as colunas separadas pedidas pela normalização de recebidos. Meses que
  // só aparecem em recebidos (ex.: extrato sem contracheque) também entram no resumo final.
  const recebidosResumoPorCompetencia = new Map(
    recebidos.resumoMensal.map((r) => [r.competencia, r] as const),
  );
  const resumoMensalContracheque = snapshot.padroesParaGraficos?.porMes ?? [];
  const consigfacilMargemPorCompetencia = new Map(
    consigfacilBase.resumoMargemMensal.map((m) => [m.competencia, m] as const),
  );
  const competenciasResumo = new Set<string>([
    ...resumoMensalContracheque.map((m) => m.competencia),
    ...recebidosResumoPorCompetencia.keys(),
    ...consigfacilMargemPorCompetencia.keys(),
  ]);
  const resumoMensal = Array.from(competenciasResumo)
    .sort()
    .map((competencia) => {
      const m = resumoMensalContracheque.find((x) => x.competencia === competencia);
      const r = recebidosResumoPorCompetencia.get(competencia);
      const mg = consigfacilMargemPorCompetencia.get(competencia);
      return {
        competencia,
        ganhos: m ? num(m.ganhos) : null,
        descontos: m ? num(m.descontos) : null,
        emprestimos: m ? num(m.emprestimos) : null,
        liquido: m ? num(m.liquido) : null,
        pct_emprestimo_ganhos:
          m?.pctEmprestimoGanhos == null ? null : num(m.pctEmprestimoGanhos),
        pct_desconto_ganhos:
          m?.pctDescontoGanhos == null ? null : num(m.pctDescontoGanhos),
        contratos_simultaneos: m?.contratosSimultaneos ?? null,
        recebido_bruto_contracheque: r?.recebido_bruto_contracheque ?? 0,
        recebido_liquido_contracheque: r?.recebido_liquido_contracheque ?? 0,
        entrada_bancaria_salario: r?.entrada_bancaria_salario ?? 0,
        outras_entradas_bancarias: r?.outras_entradas_bancarias ?? 0,
        pix_recebido: r?.pix_recebido ?? 0,
        transferencias_recebidas: r?.transferencias_recebidas ?? 0,
        total_recebido_para_grafico: r?.total_recebido_para_grafico ?? 0,
        total_recebido_para_fluxo_caixa: r?.total_recebido_para_fluxo_caixa ?? 0,
        // 6 colunas oficiais de margem (consignavel/cartão/cartão benefício).
        margem_consignavel_total: mg?.margem_consignavel_total ?? null,
        margem_consignavel_disponivel: mg?.margem_consignavel_disponivel ?? null,
        margem_cartao_total: mg?.margem_cartao_total ?? null,
        margem_cartao_disponivel: mg?.margem_cartao_disponivel ?? null,
        margem_cartao_beneficio_total: mg?.margem_cartao_beneficio_total ?? null,
        margem_cartao_beneficio_disponivel: mg?.margem_cartao_beneficio_disponivel ?? null,
      };
    });

  const ocrTecnicoJson = snapshot.payslipsFolha.map((p) => ({
    competencia: competencia(p.year, p.month),
    documento: p.file_name ?? "",
    raw_text_mascarado: mascararCpfFinanceiro(p.raw_text ?? ""),
    cartao_saque_json: mascararCpfFinanceiro(JSON.stringify(p.cartao_saque_analise_json ?? null)),
  }));

  const contratos = snapshot.linhasContratos.map((l) => ({
    codigo_folha: l.contrato.codigo,
    instituicao: normalizarInstituicaoFinanceira(l.contrato.instituicaoDetectada ?? normalizarInstituicaoLogica(l.contrato)),
    descricao_padronizada: normalizarDescricaoFinanceira(l.titulo),
    valor_parcela: num(l.contrato.valorParcela),
    total_pago: num(l.contrato.totalPago),
    saldo_estimado: l.contrato.saldoEstimado == null ? null : num(l.contrato.saldoEstimado),
    status: l.contrato.status,
    risco: l.contrato.risco,
    primeira_competencia: l.contrato.primeiraAparicao,
    ultima_competencia: l.contrato.ultimaAparicao,
    variantes_ocr: l.origensOCRBruta.length,
  }));

  // Score de risco financeiro + aba de auditoria — montados depois das outras agregações
  // porque dependem de Base_Conciliada (já com status manual aplicado), de `loans` e
  // dos refinanciamentos/seguros calculados acima.
  const scoreRiscoFinanceiro = calcularScoreRiscoFinanceiro({
    baseConciliada: conciliacao.baseConciliada,
    loans,
    refinanciamentos,
    seguroVendaCasada,
    cartaoSaque,
    consigfacil: consigfacilBase,
    consigfacilConciliacao,
  });
  const auditoriaFinanceira = buildAbaAuditoriaFinanceira({
    score: scoreRiscoFinanceiro,
    baseConciliada: conciliacao.baseConciliada,
    loans,
    consigfacil: consigfacilBase,
    consigfacilConciliacao,
  });

  const metricas = {
    total_registros: baseNormalizada.length,
    total_receitas: num(baseNormalizada.filter((e) => e.entrada_saida === "entrada").reduce((s, e) => s + e.valor, 0)),
    total_saidas: num(baseNormalizada.filter((e) => e.entrada_saida === "saida").reduce((s, e) => s + e.valor, 0)),
    contratos_canonicos: snapshot.contratosCanonico.length,
    alertas: alertas.length,
    cartao_saque_alertas: cartaoSaque.length,
    indice_risco_financeiro: scoreRiscoFinanceiro.indice_risco_financeiro,
    classificacao_risco_financeiro: scoreRiscoFinanceiro.classificacao,
    possui_fonte_bancaria_real: fonteBancariaReal ? 1 : 0,
    transacoes_bancarias_reais: transacoesBancariasReais.length,
    transacoes_folha_excluidas: transactionsBruto.length - transacoesBancariasReais.length,
  };

  const series_temporais = {
    resumo_mensal: resumoMensal,
    emprestimos_por_ano:
      snapshot.padroesParaGraficos?.evolucaoAnualEmprestimos.map((a) => ({
        ano: a.ano,
        total_emprestimos: num(a.total),
      })) ?? [],
    instituicoes_recorrentes:
      snapshot.padroesParaGraficos?.instituicoesMaisRecorrentes.map((i) => ({
        instituicao: i.nome,
        aparicoes: i.aparicoes,
        valor_total: num(i.valorTotalSomado),
      })) ?? [],
  };

  const dataPerfil = new Date().toISOString();

  const exportacao_meta: Record<string, string | number | null> = {
    versao_base: 1,
    gerado_em: dataPerfil,
    datas_formato: "yyyy-mm-dd",
    valores: "numericos_sem_moeda",
    cpf: "mascarado_quando_detectado",
    power_bi: "compatível",
    perfil_leitura_ativo: perfilLeitura.nivel,
    perfil_leitura_rotulo: String(perfilLeitura.parametrosAplicados.perfil_leitura_rotulo ?? perfilLeitura.nivel),
    versao_catalogo_perguntas: perfilLeitura.catalogoVersion,
    parametros_aplicados: JSON.stringify(perfilLeitura.parametrosAplicados),
    perfil_leitura_atualizado_em: dataPerfil,
  };

  const perfilLeituraExport = montarLinhasPerfilLeituraExport({
    respostas: perfilLeitura.respostas,
    resolvido: perfilLeitura,
    dataAtualizacao: dataPerfil,
  });

  const baseParcial = {
    version: 1,
    gerado_em: String(exportacao_meta.gerado_em),
    snapshot,
    registros: baseNormalizada,
    contratos,
    eventos,
    baseNormalizada,
    receitas: baseNormalizada.filter((e) => e.tipo_evento === "receita"),
    descontos: baseNormalizada.filter((e) => e.entrada_saida === "saida" && e.tipo_evento !== "emprestimo"),
    emprestimos: baseNormalizada.filter((e) => e.tipo_evento === "emprestimo"),
    parcelas,
    contratosAnexados,
    alertas,
    cartaoSaque,
    seguroVendaCasada,
    jurosCet,
    refinanciamentos,
    resumoMensal,
    recebidosNormalizados: recebidos.rows,
    resumoMensalRecebidos: recebidos.resumoMensal,
    baseConciliada: conciliacao.baseConciliada,
    extratosBancarios: conciliacao.extratosBancarios,
    emprestimosExtrato: conciliacao.emprestimosExtrato,
    pagamentosEmprestimosExtrato: conciliacao.pagamentosEmprestimosExtrato,
    duplicidadesProvaveis: conciliacao.duplicidadesProvaveis,
    conciliacaoFolhaExtrato: conciliacao.conciliacaoFolhaExtrato,
    conciliacaoContratoExtrato: conciliacao.conciliacaoContratoExtrato,
    scoreRiscoFinanceiro,
    auditoriaFinanceira,
    consigfacil: consigfacilBase,
    consigfacilConciliacao,
    classificacoesLoans,
    classificacoesBaseConciliada,
    qualidadeClassificacao,
    consignacoesOrdenadas,
    loansCorrigidosConsigfacil: consigfacilConciliacao.loansCorrigidos,
    historicoContratoEventos,
    auditoriaConciliacaoConsigfacil: [
      ...(montarAuditoriaPerfilLeitura(
        perfilLeitura,
        String(exportacao_meta.perfil_leitura_atualizado_em ?? exportacao_meta.gerado_em),
      ) as unknown as typeof auditoriaConciliacaoConsigfacil),
      ...auditoriaConciliacaoConsigfacil,
    ],
    margemHistorica,
    margemHistoricaDetalhes,
    margemHistoricaAnalise,
    margemHistoricaAvancada,
    consumoEstruturalMargem,
    baseConsignavelReal,
    baseConsignavelRealVigente,
    auditoriaConsigfacil,
    contratosUnicosConfirmados: [
      ...consigfacilBase.contratosUnicosConfirmados,
      ...auditoriaConsigfacil.contratosUnicosConfirmados.filter(
        (c) => !consigfacilBase.contratosUnicosConfirmados.some((x) => x.id_consignacao === c.id_consignacao),
      ),
    ],
    descontosFracionadosConciliados: auditoriaConsigfacil.descontosFracionadosConciliados,
    refinanciamentosDescartados: deduplicarRefinanciamentosDescartados(
      consigfacilBase.refinanciamentosDescartados,
    ),
    pendenciasConferenciaReais: (() => {
      const filtrado = filtrarPendenciasFinanceirasPosSaneamento(
        auditoriaConsigfacil.pendenciasReais,
        saneamentoEstrutural,
      );
      saneamentoEstrutural.resumo.pendencias_financeiras_removidas = filtrado.removidas;
      const classificacoesPorLinhaId = new Map(
        classificacoesBaseConciliada.map((c) => [c.linha_id, c] as const),
      );
      return buildPendenciasReais(filtrado.financeiras, {
        baseConciliada: conciliacao.baseConciliada,
        classificacoesPorLinhaId,
      });
    })(),
    pendenciasSaneamentoEstrutural: saneamentoEstrutural.pendenciasTecnicas,
    saneamentoEstrutural,
    eventosOperacionaisConsignado: eventosOperacionaisCompletos,
    riscoRefinForcado,
    perfilLeitura,
    perfilLeituraExport: perfilLeituraExport as unknown as Array<Record<string, string>>,
    dicionarioColunas: dicionarioColunas(),
    ocrTecnicoJson,
    metricas,
    series_temporais,
    exportacao_meta,
  };

  const verificacaoDiaria = verificarAtualizacaoDiariaSistema({
    transactions: transactionsBruto,
    payslips,
    loans: loansBruto,
    evidencias,
    snapshotsConsigfacil: input.snapshotsConsigfacilRaw ?? [],
  });

  const integracaoFontes = auditarIntegracaoFontes({
    transactions: transactionsBruto,
    loans: loansBruto,
    payslips,
    evidencias,
    snapshotsConsigfacil: input.snapshotsConsigfacilRaw ?? [],
    base: baseParcial as unknown as BaseFinanceiraNormalizada,
    perfilLeitura,
    verificacaoDiaria,
  });

  const resultado: BaseFinanceiraNormalizada = {
    ...(baseParcial as unknown as BaseFinanceiraNormalizada),
    integracaoFontes,
    metricas: {
      ...baseParcial.metricas,
      indice_confiabilidade_dados: integracaoFontes.indice_confiabilidade.indice,
      classificacao_confiabilidade_dados: integracaoFontes.indice_confiabilidade.classificacao,
      nivel_prontidao_analise: integracaoFontes.prontidao.nivel_prontidao_analise,
    },
  };
  return resultado;
}
