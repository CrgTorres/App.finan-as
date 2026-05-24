/**
 * Resultado de extração heurística de contrato / orçamento (CCB, proposta Daycoval, etc.).
 * Campos opcionais: OCR e layout variam; nada aqui substitui revisão humana.
 */

export type NivelConfiancaLeitura = "alta" | "media" | "baixa";

/** Aviso pós-extração (ordem de grandeza, coerência CET, etc.); não replica calculadora oficial do BC. */
export type AlertaPlausibilidadeContrato = {
  severidade: "critico" | "aviso";
  codigo: string;
  mensagem: string;
};

export type ConfiancaCampo = "alta" | "media" | "baixa" | "ausente";

export type SituacaoSeguroAuditada =
  | "sem_premio_financiado"
  | "premio_no_quadro"
  | "so_mencao_contratual"
  | "incerto";

export type CampoAuditado = {
  chave: string;
  rotulo: string;
  valorExibicao: string;
  confianca: ConfiancaCampo;
  fonte: string;
};

export type SinteseConfiabilidadeContrato = {
  nivelGeral: NivelConfiancaLeitura;
  scoreAjustado: number;
  veredito: string;
  pontosFortes: string[];
  pendencias: string[];
  bloqueiosConfirmacao: string[];
  podeConfirmar: boolean;
  seguro: { situacao: SituacaoSeguroAuditada; resumo: string };
  datas: { coerentes: boolean; resumo: string };
  campos: CampoAuditado[];
};

export type ContratoExtraido = {
  banco?: string;
  cnpj?: string;
  cliente?: string;
  cpf?: string;
  parcela?: number;
  parcelas?: number;
  valorSolicitado?: number;
  valorFinanciado?: number;
  /** Saldo devedor quitado no refinanciamento (OCR / quadro). */
  saldoQuitado?: number;
  /** Valor líquido liberado ao cliente (troco). */
  trocoLiberado?: number;
  valorTotalPago?: number;
  cetAnual?: number;
  cetMensal?: number;
  jurosMensal?: number;
  jurosAnual?: number;
  iof?: number;
  dataContratacao?: string;
  /** Data do documento (cabeçalho CCB / «cidade, 20 de Fevereiro de 2026») — distinta do 1º vencimento. */
  dataDocumento?: string;
  /** Cidade no rodapé («Local e data» / assinatura), quando lida. */
  localContratacao?: string;
  /** Data junto à assinatura ou secção G (prioridade para data do negócio jurídico). */
  dataAssinatura?: string;
  /** Correspondente / atendente / agente (rastreio em eventual ação). */
  atendenteNome?: string;
  atendenteCpf?: string;
  atendenteMatricula?: string;
  primeiroVencimento?: string;
  /** Data do último vencimento (sec. E.2), quando lida. */
  ultimoVencimento?: string;
  /** Taxa efetiva mensal (E.4), para quitação antecipada. */
  jurosEfetivoMensal?: number;
  jurosEfetivoAnual?: number;
  /** Todas as datas lidas no OCR com papel inferido (convergência automática). */
  datasExtraidas?: {
    papel: string;
    data: string;
    confianca: number;
    origem: string;
  }[];
  numeroProposta?: string;
  tipoContrato?: string;
  refinanciamento?: boolean;
  portabilidade?: boolean;
  seguro?: number;
  /** Texto do contrato menciona seguro prestamista / proteção financeira ligada ao crédito. */
  seguroPrestamistaMencionado?: boolean;
  tarifas?: number;
  scoreConfianca?: number;
  /** Alertas de plausibilidade (heurísticos); conferir simulador/educação BC no site do Banco Central. */
  alertasPlausibilidade?: AlertaPlausibilidadeContrato[];
  /** Auditoria final: veredito, bloqueios e confiança por campo. */
  sinteseConfiabilidade?: SinteseConfiabilidadeContrato;
  textoExtraido?: string;
};

export type SugestaoVinculoContrato = {
  fingerprint: string;
  score: number;
  motivos: string[];
  resumoContrato: string;
};
