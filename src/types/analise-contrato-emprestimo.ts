import type { AnaliseJuridicoFinanceiraContrato } from "@/types/analise-juridico-financeira-contrato";

/** Aviso exibido no Radar do Contrato e fluxos de análise automática. */
export const AVISO_TRIAGEM_ANALISE_CONTRATO =
  "Esta análise é uma triagem financeira e documental. Ela não afirma ilegalidade automaticamente. O objetivo é identificar indícios de juros excessivos, venda casada, seguro embutido, refinanciamento sucessivo, redução artificial de parcela, comprometimento de renda e possível superendividamento.";
import type {
  AlertaPlausibilidadeContrato,
  ContratoExtraido,
  SinteseConfiabilidadeContrato,
} from "@/types/contrato-extraido";

export type RiscoGeralContratoEmprestimo = "baixo" | "medio" | "alto" | "revisao_juridica";

export type SeveridadeAlertaContratoEmprestimo = "info" | "atencao" | "alto" | "critico";

export type CategoriaAlertaContratoEmprestimo =
  | "juros_acima_referencia_bacen"
  | "juros_abusivos"
  | "cet_incompativel"
  | "seguro_embutido"
  | "venda_casada"
  | "refinanciamento_sucessivo"
  | "reducao_artificial_parcela"
  | "alongamento_excessivo_prazo"
  | "superendividamento"
  | "margem_comprometida"
  | "total_pago_elevado"
  | "contrato_sem_dados_essenciais"
  | "outro";

export type AlertaContratoEmprestimo = {
  codigo: string;
  severidade: SeveridadeAlertaContratoEmprestimo;
  titulo: string;
  mensagem: string;
  categoria: CategoriaAlertaContratoEmprestimo;
  base_legal?: string;
  /** Preenchido no alerta de referência BACEN / usuário. */
  taxa_contrato?: number;
  taxa_referencia?: number;
  diferenca_percentual?: number;
  classificacao?: ClassificacaoComparacaoTaxaContrato;
};

export type ClassificacaoComparacaoTaxaContrato = "normal" | "atencao" | "alto_risco";

/** Comparação custo efetivo vs referência (usuário ou BCB). */
export type ComparacaoTaxaReferenciaContrato = {
  taxa_contrato: number;
  taxa_referencia: number;
  diferenca_percentual: number;
  classificacao: ClassificacaoComparacaoTaxaContrato;
};

export type ComparacaoContratoAnteriorResumo = {
  parcela_nova: number;
  parcela_anterior: number;
  prazo_novo: number;
  prazo_anterior: number;
  total_pago_novo: number;
  total_pago_anterior: number;
  banco: string;
  rotulo_contrato_anterior: string;
};

export type ComparacaoRefinanciamentoResumo = ComparacaoContratoAnteriorResumo & {
  meses_entre_contratos: number | null;
  sinais: string[];
};

/** Cruzamento contrato × renda líquida do mês (contracheque + parcelas ativas). */
export type CruzamentoRendaLiquidaResumo = {
  renda_liquida_mensal: number | null;
  fonte_renda: string | null;
  soma_parcelas_ativas: number;
  parcela_este_contrato_incluida: number;
  percentual_renda_comprometida: number | null;
  percentual_somente_este_contrato: number | null;
  renda_restante_apos_descontos: number | null;
  limiar_atingido: 30 | 35 | 40 | 50 | null;
};

/** valor_novo − saldo_quitado ≈ troco_liberado (refinanciamento). */
export type CalculoTrocoQuitacaoResumo = {
  valor_novo_contrato: number;
  saldo_quitado: number;
  troco_liberado: number;
  diferenca_equacao: number;
  equacao_fecha: boolean;
  percentual_troco_sobre_novo: number;
  percentual_quitacao_sobre_novo: number;
};

export type CalculosAnaliseContratoEmprestimo = {
  valor_liberado: number;
  valor_parcela: number;
  quantidade_parcelas: number;
  total_pago_estimado: number;
  diferenca_total: number;
  multiplicador_divida: number;
  percentual_acrescimo: number;
  renda_liquida: number | null;
  percentual_renda_comprometida: number | null;
  comparacao_taxa_referencia: ComparacaoTaxaReferenciaContrato | null;
  comparacao_contrato_anterior: ComparacaoContratoAnteriorResumo | null;
  comparacao_refinanciamento: ComparacaoRefinanciamentoResumo | null;
  calculo_troco_quitacao: CalculoTrocoQuitacaoResumo | null;
  cruzamento_renda_liquida: CruzamentoRendaLiquidaResumo | null;
};

export type PontoJuridicoContratoEmprestimo = {
  codigo: string;
  tema: string;
  descricao: string;
  base_legal?: string;
};

export type RecomendacaoContratoEmprestimo = {
  id: string;
  prioridade: "baixa" | "media" | "alta";
  texto: string;
};

export type PendenciaConferenciaContratoEmprestimo = {
  id: string;
  tipo: string;
  descricao: string;
  prioridade: "baixa" | "media" | "alta";
};

/** Alerta resumido para listagens / badges na UI (gravado com a análise). */
export type AlertaVisualContratoEmprestimo = {
  codigo: string;
  severidade: AlertaContratoEmprestimo["severidade"] | "aviso" | "critico";
  titulo: string;
  mensagem: string;
  origem: "analise_consolidada" | "plausibilidade_ocr";
};

/** Formato público consolidado da análise do contrato. */
export type AnaliseContratoEmprestimo = {
  versao: 2;
  geradaEm: string;
  risco_geral: RiscoGeralContratoEmprestimo;
  score: number;
  alertas: AlertaContratoEmprestimo[];
  /** Preenchido ao persistir evidência — espelho para UI sem recomputar. */
  alertas_visuais?: AlertaVisualContratoEmprestimo[];
  calculos: CalculosAnaliseContratoEmprestimo;
  pontos_juridicos: PontoJuridicoContratoEmprestimo[];
  recomendacoes: RecomendacaoContratoEmprestimo[];
  pendencias_conferencia: PendenciaConferenciaContratoEmprestimo[];
  /** Análises legadas preservadas (não apagar). */
  fontes?: {
    extraido_resumo: Partial<ContratoExtraido>;
    alertas_plausibilidade: AlertaPlausibilidadeContrato[];
    analise_juridico_financeira: AnaliseJuridicoFinanceiraContrato | null;
    auditoria_confiabilidade: SinteseConfiabilidadeContrato | null;
    campos_ausentes_leitura: (keyof import("@/types/contrato-extraido").ContratoExtraido)[];
    /** Rótulos dos 11 campos obrigatórios ainda ausentes (valor, CET, datas, etc.). */
    campos_obrigatorios_ausentes?: string[];
  };
};

export type SeveridadeDimensaoAnaliseContrato = "nenhum" | "info" | "atencao" | "alto" | "critico";

/** Detalhe interno por dimensão (uso interno do consolidador). */
export type DimensaoAnaliseContratoEmprestimo = {
  ativo: boolean;
  severidade: SeveridadeDimensaoAnaliseContrato;
  resumo: string | null;
  codigos: string[];
};
