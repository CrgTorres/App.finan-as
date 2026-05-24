/** Risco por rubrica ou análise agregada. */
export type NivelRiscoCartaoSaqueEmbutido = "baixo" | "medio" | "alto";

export type TipoCartaoSaqueDetectado =
  | "cartao_consignado"
  | "cartao_beneficio"
  | "rmc"
  | "rcc"
  | "saque_complementar"
  | "desconhecido";

export type StatusConferenciaCartaoSaqueEmbutido =
  | "pendente_conferencia"
  | "pendente"
  | "confirmado"
  | "falso_positivo"
  | "contrato_localizado"
  | "precisa_revisao_juridica"
  | "ignorado";

export const ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE =
  "Possível cartão consignado, saque embutido, RMC/RCC ou desconto de cartão localizado no contracheque.";

export const RECOMENDACAO_CARTAO_SAQUE_CONTRACHEQUE =
  "Conferir se existe contrato de cartão consignado, saque complementar, RMC/RCC ou cartão benefício vinculado a este desconto.";

export const AVISO_CARTAO_SAQUE_EMBUTIDO =
  "Este alerta não afirma ilegalidade automaticamente. Ele indica que há sinais de cartão consignado, saque complementar, RMC, RCC ou operação semelhante que precisa ser conferida com o contrato original, extrato do banco e contracheques do período.";

export const TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE = "Cartão/Saque no Contracheque";

export const TITULO_ALERTA_CARTAO_SAQUE_EMBUTIDO = TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE;

export const TEXTO_ALERTA_CARTAO_SAQUE_EMBUTIDO = ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE;

/** Uma rubrica de desconto com indício de cartão/saque/RMC/RCC. */
export type RubricaCartaoSaqueContracheque = {
  mes: number;
  ano: number;
  nomeRubrica: string;
  codigoRubrica: string | null;
  valorDescontado: number;
  termoEncontrado: string;
  bancoPossivel: string | null;
  risco: NivelRiscoCartaoSaqueEmbutido;
  descontoRecorrente: boolean;
  mesesRecorrencia: number;
  status: "pendente_conferencia";
  chaveRecorrencia: string;
  /** Não deve entrar no cadastro automático de empréstimo comum. */
  naoTratarComoEmprestimoComum: true;
};

/** Análise v2 — foco em rubricas do contracheque. */
export type AnaliseCartaoSaqueContracheque = {
  versao: 2;
  foco: "rubricas_desconto_contracheque";
  encontrado: boolean;
  nivel_risco_global: NivelRiscoCartaoSaqueEmbutido;
  alerta: string | null;
  recomendacao: string | null;
  rubricas: RubricaCartaoSaqueContracheque[];
  competencia: { mes: number; ano: number };
  status: "pendente_conferencia" | null;
};

/** Legado v1 — agregado (contratos/OCR geral). */
export type ResultadoDeteccaoCartaoSaqueEmbutido = {
  versao?: 1;
  encontrado: boolean;
  nivel_risco: NivelRiscoCartaoSaqueEmbutido;
  tipo_detectado: TipoCartaoSaqueDetectado;
  termos_encontrados: string[];
  linhas_suspeitas: string[];
  valor_mensal_estimado: number | null;
  banco_possivel: string | null;
  justificativa: string;
  recomendacao: string;
  desconto_recorrente: boolean;
  meses_consecutivos_com_termo: number;
  sem_contrato_vinculado: boolean;
  competencia?: { mes: number; ano: number } | null;
  aviso_legal: string;
  analiseContracheque?: AnaliseCartaoSaqueContracheque;
};

export type LancamentoContrachequeDeteccao = {
  descricao: string;
  valor?: number;
  codigo?: string;
  banco?: string | null;
  mes?: number;
  ano?: number;
  tipo?: "desconto" | "vantagem" | "ganho";
  parcelaAtual?: number | null;
  parcelaTotal?: number | null;
};

export type ContextoDeteccaoCartaoSaqueEmbutido = {
  competencia?: { mes: number; ano: number };
  payslipsHistorico?: {
    mes: number;
    ano: number;
    raw_text?: string;
    items?: PayslipItemMin[];
  }[];
  textosContratosAnexados?: string[];
  temContratoFormalVinculado?: boolean;
  contratoComDadosEssenciais?: boolean;
};

export type PayslipItemMin = {
  description: string;
  value: number;
  type: string;
  code?: string;
};

export type CamposCartaoSaqueEmbutidoPayslip = {
  cartao_saque_embutido_detectado: boolean;
  cartao_saque_tipo: string | null;
  cartao_saque_risco: string | null;
  cartao_saque_termos: string[] | null;
  cartao_saque_linhas: string[] | null;
  cartao_saque_valor_mensal: number | null;
  cartao_saque_banco_possivel: string | null;
  cartao_saque_observacao: string | null;
  cartao_saque_status_conferencia: StatusConferenciaCartaoSaqueEmbutido | null;
  cartao_saque_analise_json: AnaliseCartaoSaqueContracheque | ResultadoDeteccaoCartaoSaqueEmbutido | null;
};
