import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { ResultadoDeteccaoCartaoSaqueEmbutido } from "@/types/cartao-saque-embutido";

import { AVISO_TRIAGEM_ANALISE_CONTRATO } from "@/types/analise-contrato-emprestimo";

export const AVISO_ANALISE_JURIDICA_FINANCEIRA = AVISO_TRIAGEM_ANALISE_CONTRATO;

export type StatusAnaliseJuridicaFinanceira =
  | "sem_alerta"
  | "atencao"
  | "alto_risco"
  | "revisao_juridica";

export type StatusConferenciaAnaliseJuridica =
  | "pendente"
  | "conferido"
  | "ignorado"
  | "contrato_anterior_localizado"
  | "possivel_refinanciamento"
  | "acao_revisao_sugerida";

export type ClassificacaoRiscoMargem = "baixo" | "atencao" | "alto" | "critico";

export type TipoProdutoCreditoInferido =
  | "emprestimo_pessoal"
  | "consignado"
  | "veiculo"
  | "imobiliario"
  | "refinanciamento"
  | "portabilidade"
  | "indefinido";

export type IndicadoresAnaliseJuridicaFinanceira = {
  totalPagoEstimado: number;
  valorBaseLiberado: number;
  diferencaTotalPagoVsBase: number;
  percentualAcrescimoSobreBase: number | null;
  parcelaMensalContrato: number | null;
  rendaMensalReferencia: number | null;
  fonteRenda: string | null;
  somaParcelasAtivasMes: number;
  parcelaDesteContratoIncluida: number;
  percentualRendaParcelaContrato: number | null;
  percentualRendaTotalComprometida: number | null;
  limiarMargemAtingido: 30 | 35 | 40 | 50 | null;
};

export type AlertaAnaliseJuridicaFinanceira = {
  codigo: string;
  severidade: "info" | "atencao" | "alto" | "critico";
  titulo: string;
  mensagem: string;
  baseLegal?: string;
};

export type RecomendacaoPraticaAnalise = {
  id: string;
  prioridade: "baixa" | "media" | "alta";
  texto: string;
};

export type AnaliseJuridicoFinanceiraContrato = {
  versao: 1;
  geradaEm: string;
  status: StatusAnaliseJuridicaFinanceira;
  classificacaoMargem: ClassificacaoRiscoMargem;
  tipoProduto: TipoProdutoCreditoInferido;
  resumoContrato: string;
  indicadores: IndicadoresAnaliseJuridicaFinanceira;
  alertas: AlertaAnaliseJuridicaFinanceira[];
  recomendacoes: RecomendacaoPraticaAnalise[];
  avisoLegal: string;
  extraidoResumo: Partial<ContratoExtraido>;
  camposEssenciaisAusentes: string[];
  cartaoSaqueEmbutido?: ResultadoDeteccaoCartaoSaqueEmbutido | null;
};
