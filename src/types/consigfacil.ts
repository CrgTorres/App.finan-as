/**
 * Tipos canônicos para dados oficiais do portal ConsigFácil
 * (Governo do Estado do Amazonas — faciltecnologia.com.br/consigfacil).
 *
 * Importante: estes registros têm PRIORIDADE OFICIAL sobre OCR, inferência,
 * extrato e contracheque para parcelas, status, refinanciamentos, margem,
 * cartões consignados e averbações. A camada de inferência continua sendo
 * preservada para histórico e auditoria (campo `fonte_secundaria`).
 */

/** Status oficiais de uma consignação no ConsigFácil. */
export type ConsigfacilStatus =
  | "ativo"
  | "suspenso"
  | "importado"
  | "quitado"
  | "refinanciado"
  | "substituido"
  | "cartao_beneficio"
  | "rmc"
  | "rcc"
  | "em_averbacao"
  | "desconhecido"
  /** Contrato confirmado como operação única — não é refinanciamento. */
  | "nao_refinanciamento_confirmado";

/**
 * Tipo da margem usada pela consignação.
 *
 * `null` é permitido para modalidades que NÃO consomem margem (ex.: Contribuição
 * sindical — débito direto em folha sem reserva de margem consignável).
 *
 * `outra` / `desconhecida` ficam reservadas para parsing intermediário onde
 * ainda não foi possível resolver a categoria.
 */
export type ConsigfacilTipoMargem =
  | "margem_consignavel"
  | "margem_cartao"
  | "margem_cartao_beneficio"
  | "outra"
  | "desconhecida"
  | null;

// ---------------------------------------------------------------------------
// Catálogo oficial de MODALIDADES e INSTITUIÇÕES (ConsigFácil AM)
// ---------------------------------------------------------------------------

/** Slug interno (estável) das 4 modalidades oficiais do ConsigFácil AM. */
export type ConsigfacilModalidadeSlug =
  | "cartao_beneficio_compra"
  | "cartao_credito"
  | "contribuicao"
  | "emprestimo_consignado";

/**
 * Grupo canônico para gráficos/agregações. Diferente do `slug` quando duas
 * modalidades pertencem ao mesmo "balde" analítico (hoje 1:1, reservado para
 * o caso de o portal adicionar nova modalidade que agregue ao mesmo grupo).
 */
export type ConsigfacilGrupoCanonico =
  | "cartao_beneficio"
  | "cartao_credito"
  | "contribuicao"
  | "emprestimo_consignado";

export type ConsigfacilModalidade = {
  slug: ConsigfacilModalidadeSlug;
  nome_oficial: string;
  grupo_canonico: ConsigfacilGrupoCanonico;
  tipo_margem: ConsigfacilTipoMargem;
  eh_emprestimo: boolean;
  eh_cartao: boolean;
  eh_cartao_beneficio: boolean;
  eh_contribuicao: boolean;
  ativo: boolean;
  fonte: "consigfacil";
};

export type ConsigfacilInstituicao = {
  nome_oficial: string;
  nome_normalizado: string;
  modalidade_slug: ConsigfacilModalidadeSlug | null;
  grupo_canonico: ConsigfacilGrupoCanonico | null;
  ativo: boolean;
  fonte: "consigfacil";
};

export type ConsigfacilModalidadeInstituicao = {
  modalidade_slug: ConsigfacilModalidadeSlug;
  instituicao_normalizada: string;
  ativo: boolean;
  fonte: "consigfacil";
};

/**
 * Classificação NÃO-DESTRUTIVA aplicada por contrato quando o catálogo oficial
 * reclassifica um registro. Sempre mantém `*_original` ao lado de `*_oficial`.
 */
export type ConsigfacilClassificacaoOficial = {
  modalidade_original: string | null;
  modalidade_oficial: ConsigfacilModalidadeSlug | null;
  instituicao_original: string | null;
  instituicao_oficial: string | null;
  classificacao_anterior: string | null;
  classificacao_oficial: ConsigfacilGrupoCanonico | null;
  divergencia_classificacao: boolean;
};

export const classificacaoOficialVazia: ConsigfacilClassificacaoOficial = {
  modalidade_original: null,
  modalidade_oficial: null,
  instituicao_original: null,
  instituicao_oficial: null,
  classificacao_anterior: null,
  classificacao_oficial: null,
  divergencia_classificacao: false,
};

// ---------------------------------------------------------------------------
// Catálogo: alias + classificação canônica global
// ---------------------------------------------------------------------------

export type ConsigfacilInstituicaoAlias = {
  /** Lookup-key (normalizado: minúsculas, sem acento). */
  alias_normalizado: string;
  /** Texto original como apareceu em algum documento. */
  alias_original: string;
  /** Aponta para `consigfacil_instituicoes.nome_normalizado`. */
  instituicao_normalizada: string;
  fonte: "consigfacil" | "manual" | "inferencia";
};

/**
 * Categoria canônica agregada. Cobre todos os agrupamentos pedidos para
 * análise financeira do app (não só o ConsigFácil — inclui saídas comuns
 * de OCR/extrato como seguros e saques complementares).
 */
export type GrupoFinanceiroCanonico =
  | "emprestimo_consignado"
  | "cartao_beneficio"
  | "cartao_credito"
  | "contribuicao"
  | "seguros"
  | "refinanciamentos"
  | "saque_complementar"
  | "rmc"
  | "rcc"
  | "outros"
  | "rubrica_folha_nao_consignavel"
  | "conta_consumo";

/**
 * Como a classificação foi obtida. Ordem do mais oficial ao mais frágil.
 * O `indice_confianca_classificacao` é calculado a partir disto.
 */
export type FonteClassificacao =
  | "consigfacil_oficial"
  | "alias_oficial"
  | "match_exato_catalogo"
  | "match_alias_catalogo"
  | "match_fuzzy_catalogo"
  | "ocr_contracheque"
  | "heuristica_descricao"
  | "inferencia"
  | "sem_correspondencia";

/**
 * Score de confiança da classificação (0..100). 100 = ConsigFácil oficial
 * confirmou; 0 = sem correspondência no catálogo.
 */
export type IndiceConfiancaClassificacao = number;

/**
 * Resultado canônico da classificação de uma linha financeira (loan,
 * transação, rubrica…). Contém TUDO que a UI/relatório precisa para mostrar
 * "original × oficial" sem destruir histórico.
 */
export type ResultadoClassificacaoFinanceira = {
  // Instituição
  instituicao_original: string | null;
  instituicao_normalizada: string | null;
  instituicao_oficial: string | null;
  // Modalidade
  modalidade_original: string | null;
  modalidade_normalizada: string | null;
  modalidade_oficial: ConsigfacilModalidadeSlug | null;
  // Grupo / margem (deriva da modalidade quando há)
  grupo_canonico: GrupoFinanceiroCanonico;
  tipo_margem: ConsigfacilTipoMargem;
  // Flags derivadas
  eh_cartao: boolean;
  eh_cartao_beneficio: boolean;
  eh_emprestimo: boolean;
  eh_contribuicao: boolean;
  // Metadados de classificação
  fonte_classificacao: FonteClassificacao;
  /** Lista de aliases que vieram a casar (ordenados — alias_normalizado primeiro). */
  aliases_utilizados: string[];
  indice_confianca_classificacao: IndiceConfiancaClassificacao;
  /** True quando `instituicao_original` != `instituicao_oficial` (ou um deles é nulo). */
  divergencia_classificacao: boolean;
  /** Texto humano explicando como chegou neste resultado. */
  motivo_classificacao: string;
  /** Rubrica resolvida pelo catálogo local de aliases (sem divergência crítica). */
  resolvido_por_catalogo_rubrica?: boolean;
  /** Houve match no catálogo local (pode coexistir com pendência oficial). */
  catalogo_rubrica_local?: boolean;
  catalogo_rubrica_entrada_id?: string | null;
};

export const resultadoClassificacaoVazio: ResultadoClassificacaoFinanceira = {
  instituicao_original: null,
  instituicao_normalizada: null,
  instituicao_oficial: null,
  modalidade_original: null,
  modalidade_normalizada: null,
  modalidade_oficial: null,
  grupo_canonico: "outros",
  tipo_margem: null,
  eh_cartao: false,
  eh_cartao_beneficio: false,
  eh_emprestimo: false,
  eh_contribuicao: false,
  fonte_classificacao: "sem_correspondencia",
  aliases_utilizados: [],
  indice_confianca_classificacao: 0,
  divergencia_classificacao: false,
  motivo_classificacao: "Sem entrada para classificar.",
};

/** Categoria normalizada do cartão consignado quando `eh_cartao = true`. */
export type ConsigfacilTipoCartao =
  | "compra"
  | "saque"
  | "beneficio"
  | "rmc"
  | "rcc"
  | "desconhecido";

/** Origem do dado dentro do ConsigFácil (print, html, OCR de PDF, etc.). */
export type ConsigfacilOrigemDado =
  | "consigfacil_html"
  | "consigfacil_print"
  | "consigfacil_pdf_ocr"
  | "consigfacil_api"
  | "manual";

/**
 * Uma consignação ativa/histórica vinda do portal oficial.
 * 1:1 com cada linha da tela "Consignações em andamento" / "Contratos antigos".
 */
export type ConsigfacilContrato = {
  /** Código da consignação no portal (ex.: "1236837"). */
  id_consignacao: string;
  /** Nome da instituição como aparece na linha. */
  instituicao: string;
  /** Identificador interno do banco (compe / número quando disponível). */
  codigo_instituicao: string | null;
  /** Data do contrato (yyyy-mm-dd), quando o portal mostra "Data: dd/mm/aaaa". */
  data_contrato: string;
  /** Competência reportada — "Período: Maio de 2026" => "2026-05". */
  competencia: string;
  valor_parcela: number;
  /** Null quando o portal não informa parcela corrente (ex.: suspenso sem «6/72»). */
  parcela_atual: number | null;
  parcelas_total: number;
  tipo_margem: ConsigfacilTipoMargem;
  status: ConsigfacilStatus;
  /** "Averbado por: …" — pode ser igual à instituição (ex.: Banco Daycoval). */
  averbado_por: string | null;
  origem: ConsigfacilOrigemDado;
  /**
   * Situação da importação no portal — pode ser:
   *  - "importado": linha vinda do FGTS/eSocial/SIAPE
   *  - "manual": cadastrada por servidor da consignatária
   *  - "suspenso", "ativo" — duplicados do `status` quando o portal traz a tag
   *
   * Mantemos texto livre porque o portal varia.
   */
  situacao_importacao: string | null;
  /** Quando a linha pertence a uma faixa de cartão (compra / saque). */
  eh_cartao: boolean;
  /** RMC (Reserva de Margem Consignável — cartão de crédito consignado). */
  eh_rmc: boolean;
  /** RCC (Reserva de Cartão Consignado de Benefício). */
  eh_rcc: boolean;
  /**
   * Cartão Benefício (Compra/Saque/Crédito). Marcado quando `tipo_margem` for
   * `margem_cartao_beneficio` OU quando o status for `cartao_beneficio`.
   *
   * IMPORTANTE: nunca somar com empréstimos consignados comuns. Agregações de
   * "contratos consignados" devem filtrar `eh_cartao_beneficio === false`.
   */
  eh_cartao_beneficio: boolean;
  /** Marcação do detector de refinanciamento. */
  eh_refinanciamento: boolean;
  /** ID interno (`Loan.id` ou `ConsigfacilContrato.id_consignacao`) que foi substituído. */
  contrato_substituido: string | null;
  /** Score 0..1 calculado por `score-confianca-consigfacil`. */
  confianca: number;
  /** Sempre `true` — origem oficial. Existe para deixar explícito no Power BI. */
  fonte_oficial: true;
  /** Arquivo/print de onde o registro foi extraído. */
  documento_origem: string;
  /** Bloco de texto bruto capturado para auditoria. */
  texto_bruto: string;
  /** Observações livres (ex.: "Suspenso desde 11/2025"). */
  observacao: string | null;
  /** Banco/instituição atual no portal (alias de `instituicao` quando enriquecido). */
  banco_atual?: string | null;
  /** Evidência documental de migração de carteira (HTML/anexo/observação). */
  possui_documento_migracao?: boolean;
  /** Histórico de transição institucional detectado (carga inicial, correlato temporal). */
  possui_historico_transicao?: boolean;
  // -------------------------------------------------------------------------
  // Catálogo oficial (preenchido após `aplicarCatalogoOficial`).
  // -------------------------------------------------------------------------
  /** Modalidade oficial reconhecida (`emprestimo_consignado`, `cartao_beneficio_compra`…). */
  modalidade_slug: ConsigfacilModalidadeSlug | null;
  /** Grupo canônico para gráficos/agregações. */
  grupo_canonico: ConsigfacilGrupoCanonico | null;
  /** Classificação não-destrutiva: original vs oficial. */
  classificacao: ConsigfacilClassificacaoOficial;
  /**
   * Série temporal de parcelas na folha (competência × N/M × valor).
   * Preenchido por `timeline-estrutural-contrato.ts` — prioridade sobre valor isolado.
   */
  timeline_parcelas?: import("@/lib/conciliacao/timeline-estrutural-contrato").TimelineParcelaContrato[];
  classificacao_continuidade?: import("@/lib/conciliacao/timeline-estrutural-contrato").ClassificacaoContinuidadeTimeline;
  timeline_analise?: import("@/lib/conciliacao/timeline-estrutural-contrato").ResultadoAnaliseTimelineEstrutural;
  /** Contexto operacional de margem (fragmentação / limite / reserva). */
  contexto_margem?: import("@/lib/contratos/detectar-contexto-operacional-margem").ContextoOperacionalMargem | null;
  /** Prioridade estrutural quando `contexto_margem.desconto_operacional_por_margem`. */
  status_estrutural?: string | null;
  /** Suprime divergência de valor na conferência. */
  divergencia_valor?: boolean;
  /** Remove da fila de conferência manual. */
  remover_da_conferencia?: boolean;
};

/**
 * Snapshot de margem reportado pelo portal — uma linha por tipo de margem
 * presente nos cards da tela inicial (Consignável / Cartão / Cartão Benefício).
 */
export type ConsigfacilMargem = {
  competencia: string;
  tipo_margem: ConsigfacilTipoMargem;
  margem_total: number;
  margem_utilizada: number;
  margem_disponivel: number;
  percentual_comprometido: number;
  /** Documento de onde a margem foi lida (print / html). */
  documento_origem: string;
  /** Carimbo da leitura — yyyy-mm-dd'T'HH:mm:ss. */
  capturado_em: string;
  fonte_oficial: true;
};

/**
 * Linha histórica — `consignacao` (referência ao contrato), ação registrada
 * e a competência. Útil para rastrear "importado em 03/2025", "suspenso em
 * 11/2025", "averbação em 04/2026", etc.
 */
export type ConsigfacilHistorico = {
  id_consignacao: string;
  competencia: string;
  evento:
    | "averbacao"
    | "importacao"
    | "suspensao"
    | "reativacao"
    | "quitacao"
    | "refinanciamento"
    | "substituicao"
    | "alteracao_parcela"
    | "outro";
  detalhe: string;
  documento_origem: string;
  capturado_em: string;
};

/** Cartões consignados (compra, saque, benefício, RMC, RCC). Estrutura denormalizada
 * para exportação por tipo e para o painel de auditoria. */
export type ConsigfacilCartao = {
  id_consignacao: string;
  tipo_cartao: ConsigfacilTipoCartao;
  consignataria: string;
  /** Valor mensal cobrado / parcela (R$). */
  valor_mensal: number;
  parcelas_total: number | null;
  parcela_atual: number | null;
  competencia_inicio: string | null;
  /** "Sem lançamento", "Em andamento", "Suspenso", "Quitado". */
  situacao: string;
  documento_origem: string;
  fonte_oficial: true;
};

/**
 * Snapshot completo de uma captura do ConsigFácil (1 print, 1 dump HTML).
 * Estrutura que alimenta a UI e a integração com a `BaseFinanceiraNormalizada`.
 */
export type ConsigfacilSnapshot = {
  capturado_em: string;
  documento_origem: string;
  origem: ConsigfacilOrigemDado;
  margens: ConsigfacilMargem[];
  contratos: ConsigfacilContrato[];
  cartoes: ConsigfacilCartao[];
  historico: ConsigfacilHistorico[];
  /** Bloco bruto do texto/HTML — preservado para diff e nova extração. */
  bruto: string;
  /** Erros não-fatais que aconteceram durante o parse (ex.: linha ignorada). */
  avisos: string[];
};

/**
 * Detecção de refinanciamento entre dois contratos. Quando `eh_refinanciamento`
 * é `true`, o sistema deve marcar o `contrato_origem` como `substituido` e o
 * `contrato_destino` como `refinanciado`.
 */
export type ConsigfacilRefinanciamento = {
  contrato_origem: string;
  contrato_destino: string;
  banco: string;
  /** Distância em dias entre data do contrato substituído e o novo. */
  distancia_dias: number;
  /** Quando a soma das parcelas reduziu, sugere portabilidade; quando aumentou, refin "novo dinheiro". */
  tipo_refinanciamento: "portabilidade" | "refinanciamento_novo_credito" | "renegociacao" | "indefinido";
  evidencias_refinanciamento: string[];
  grau_confianca: number;
};

/**
 * Estrutura usada por todos os componentes que somam/agregam margem ao longo
 * do tempo (gráfico de comprometimento, painel jurídico).
 */
export type BaseMargemConsignavel = {
  competencia: string;
  tipo_margem: ConsigfacilTipoMargem;
  margem_total: number;
  margem_utilizada: number;
  margem_disponivel: number;
  percentual_comprometido: number;
};

/**
 * Marcação canônica de origem do dado para QUALQUER linha financeira.
 * Aplicada como campo opcional em `Loan`, `BaseConciliadaLinha`, etc., para que
 * tooltips/exportação mostrem "esta linha veio do ConsigFácil oficial".
 */
export type FonteCanonicaFinanceira =
  | "consigfacil_oficial"
  | "contrato_anexado"
  | "contracheque"
  | "extrato_bancario"
  | "ocr"
  | "inferencia"
  | "manual";

/** Ordem de prioridade: menor índice = maior confiança. */
export const ORDEM_FONTES_CANONICAS: ReadonlyArray<FonteCanonicaFinanceira> = [
  "consigfacil_oficial",
  "contrato_anexado",
  "contracheque",
  "extrato_bancario",
  "ocr",
  "inferencia",
  "manual",
];

export function fontePrincipalMaisConfiavel(
  fontes: ReadonlyArray<FonteCanonicaFinanceira>,
): FonteCanonicaFinanceira | null {
  for (const f of ORDEM_FONTES_CANONICAS) if (fontes.includes(f)) return f;
  return null;
}

// ---------------------------------------------------------------------------
// Estruturas reservadas para automação futura — ainda sem implementação
// ---------------------------------------------------------------------------

/**
 * Stub para automação web / captura periódica. NÃO há crawler implementado —
 * estas interfaces existem para o resto do app já ser tipado contra elas.
 */
export type ConsigfacilCapturaAutomatica = {
  /** Identificador único da execução (ex.: cron-id ou job-id). */
  execucao_id: string;
  /** Janela tentada (yyyy-mm-dd). */
  inicio: string;
  fim: string;
  /** "manual_paste" enquanto não há crawler; depois "playwright", "gov_oauth", "open_finance". */
  modo: "manual_paste" | "playwright" | "gov_oauth" | "open_finance";
  status: "agendado" | "executando" | "ok" | "falha" | "parcial";
  snapshot_id: string | null;
  mensagem: string | null;
  capturado_em: string;
};

/** Vínculo entre múltiplas fontes oficiais (ConsigFácil, futuro Open Finance, gov_oauth). */
export type ConsigfacilVinculoExterno = {
  fonte: "consigfacil" | "open_finance" | "gov_amazonas_oauth";
  identificador_externo: string;
  apelido: string;
  ativo: boolean;
  observacao: string | null;
};

// ---------------------------------------------------------------------------
// Camada de CONFIRMAÇÃO (não-destrutiva)
// ---------------------------------------------------------------------------

/**
 * Campo da base que pode ser confirmado/divergente entre fontes.
 * Mantemos granular para que a UI mostre EXATAMENTE onde está o conflito.
 */
export type ConsigfacilCampoAjustavel =
  | "instituicao"
  | "valor_parcela"
  | "parcelas_total"
  | "parcela_atual"
  | "status"
  | "tipo_margem"
  | "data_contrato"
  | "averbado_por"
  | "rubrica_code"
  | "natureza_cartao_beneficio"
  | "refinanciamento";

/**
 * Linha da aba `Consigfacil_Ajustes_Base`. Cada item é UM ajuste — ou
 * "confirmou" (sem divergência), ou "divergência" (valores diferentes preservados).
 *
 * Nunca destrói o valor antigo: `valor_original` + `fonte_original` permanecem.
 */
export type ConsigfacilAjusteBase = {
  /** ID lógico no app (loan.id, base_conciliada.id, payslip:idx, etc.). */
  alvo_id: string;
  /** Que tipo de alvo é. Para Power BI/UI. */
  alvo_tipo: "loan" | "base_conciliada" | "contracheque_item" | "transacao";
  /** ConsigFácil envolvido (sempre presente — esta é a fonte oficial). */
  id_consignacao: string;
  campo: ConsigfacilCampoAjustavel;
  /** Status do ajuste: confirmou ou divergiu. */
  tipo_ajuste: "confirmado" | "divergencia";
  /** Valor que o sistema já tinha (OCR, contracheque, contrato anexado, inferência). */
  valor_original: string | number | null;
  /** Valor oficial vindo do ConsigFácil. */
  valor_oficial: string | number | null;
  /** Quem produziu o `valor_original`. */
  fonte_original: FonteCanonicaFinanceira;
  /** Sempre `consigfacil_oficial` na linha — explícito para Power BI. */
  fonte_oficial: "consigfacil_oficial";
  /** Diferença percentual (apenas para valores numéricos). */
  diferenca_pct: number | null;
  /** Texto humano descrevendo o ajuste (vai para tooltip e exportação). */
  motivo_ajuste: string;
  /** Carimbo da confirmação/divergência. */
  registrado_em: string;
};

/** Como a rubrica se relaciona ao contrato oficial (folha ≠ ConsigFácil semanticamente). */
export type TipoCorrelacaoConsigfacil =
  | "confirmacao_forte"
  | "match_historico_correlato"
  | "divergencia_instituicao"
  | "sem_relacao_confirmada";

/** Marcação que o app aplica em `Loan` / `BaseConciliada` SEM apagar nada. */
export type ConsigfacilConfirmacao = {
  confirmado_consigfacil: boolean;
  divergencia_consigfacil: boolean;
  id_consignacao_confirmada: string | null;
  campos_confirmados: ConsigfacilCampoAjustavel[];
  campos_divergentes: ConsigfacilCampoAjustavel[];
  /** Instituição lida na rubrica/ficha (época do desconto). */
  instituicao_original_folha: string | null;
  instituicao_oficial_consigfacil: string | null;
  instituicao_correlata: string | null;
  banco_vinculado: string | null;
  banco_original: string | null;
  banco_atual_consigfacil: string | null;
  banco_normalizado_folha: string | null;
  banco_normalizado_consigfacil: string | null;
  banco_consolidado: string | null;
  possivel_migracao_carteira: boolean;
  match_historico_correlato: boolean;
  tipo_correlacao: TipoCorrelacaoConsigfacil | null;
  score_correlacao: number | null;
  /** Autoridade temporal (portal implantado após competências antigas). */
  autoridade_temporal_consigfacil: import("@/lib/consigfacil/autoridade-temporal-consigfacil").AutoridadeTemporalConsigfacil | null;
  contrato_migrado_para_consigfacil: boolean;
  tipo_correlacao_temporal: import("@/lib/consigfacil/autoridade-temporal-consigfacil").TipoCorrelacaoTemporal | null;
  data_implantacao_fonte: string | null;
  mensagem_autoridade_temporal: string | null;
  /** ID do contrato correlato (null quando continuidade institucional não comprovada). */
  contrato_correlato: string | null;
  mensagem_correlacao: string | null;
};

export const confirmacaoVazia: ConsigfacilConfirmacao = {
  confirmado_consigfacil: false,
  divergencia_consigfacil: false,
  id_consignacao_confirmada: null,
  campos_confirmados: [],
  campos_divergentes: [],
  instituicao_original_folha: null,
  instituicao_oficial_consigfacil: null,
  instituicao_correlata: null,
  banco_vinculado: null,
  banco_original: null,
  banco_atual_consigfacil: null,
  banco_normalizado_folha: null,
  banco_normalizado_consigfacil: null,
  banco_consolidado: null,
  possivel_migracao_carteira: false,
  match_historico_correlato: false,
  tipo_correlacao: null,
  score_correlacao: null,
  autoridade_temporal_consigfacil: null,
  contrato_migrado_para_consigfacil: false,
  tipo_correlacao_temporal: null,
  data_implantacao_fonte: null,
  mensagem_autoridade_temporal: null,
  contrato_correlato: null,
  mensagem_correlacao: null,
};

// ---------------------------------------------------------------------------
// Resumo de margem (Resumo_Mensal estendido)
// ---------------------------------------------------------------------------

/**
 * Bloco oficial de margem por competência. Sai como colunas extras no
 * `Resumo_Mensal` quando há snapshots ConsigFácil para o período.
 *
 * Os seis campos nomeados são literais: o usuário/Power BI pode plotar
 * "margem_consignavel_disponivel" sem precisar pivotar `tipo_margem`.
 */
export type ConsigfacilResumoMensalMargem = {
  competencia: string;
  margem_consignavel_total: number;
  margem_consignavel_disponivel: number;
  margem_consignavel_utilizada: number;
  margem_consignavel_percentual: number;
  margem_cartao_total: number;
  margem_cartao_disponivel: number;
  margem_cartao_utilizada: number;
  margem_cartao_percentual: number;
  margem_cartao_beneficio_total: number;
  margem_cartao_beneficio_disponivel: number;
  margem_cartao_beneficio_utilizada: number;
  margem_cartao_beneficio_percentual: number;
};
