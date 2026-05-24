/**
 * Tipos da Triagem Inteligente Resolutiva — classificações, origem e filtros.
 */

import type { EventoOperacionalConsignado } from "@/lib/consigfacil/detectar-eventos-operacionais";
import type { PendenciaConferenciaReal } from "@/lib/consignacoes-governo/aplicar-auditoria-consigfacil";
import type { RiscoRefinForcado } from "@/lib/juridico/detectar-risco-refin-forcado";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import type { Payslip } from "@/types/contracheque";

export const CLASSIFICACOES_RESOLUCAO_DIVERGENCIA = [
  "divergencia_operacional",
  "desconto_fracionado",
  "quebra_temporaria",
  "margem_insuficiente",
  "bloqueio_governo",
  "suspensao_operacional",
  "desconto_recuperado",
  "refinanciamento_real",
  "risco_refin_induzido",
  "revisar_manual",
  "pendente_usuario",
] as const;

export type ClassificacaoResolucaoDivergencia =
  (typeof CLASSIFICACOES_RESOLUCAO_DIVERGENCIA)[number];

export const ROTULOS_CLASSIFICACAO_RESOLUCAO: Record<ClassificacaoResolucaoDivergencia, string> = {
  divergencia_operacional: "Divergência operacional (explicada)",
  desconto_fracionado: "Desconto fracionado conciliado",
  quebra_temporaria: "Quebra temporária de margem",
  margem_insuficiente: "Margem insuficiente",
  bloqueio_governo: "Bloqueio governamental",
  suspensao_operacional: "Suspensão operacional",
  desconto_recuperado: "Desconto recuperado",
  refinanciamento_real: "Refinanciamento real",
  risco_refin_induzido: "Risco de refin induzido",
  revisar_manual: "Revisar manualmente",
  pendente_usuario: "Aguardando resposta",
};

export type OrigemResolucaoDivergencia =
  | "automatica_motor"
  | "aprendizado"
  | "pergunta_usuario"
  | "perfil_leitura"
  | "nao_resolvido";

export type EtapaMotorResolucao =
  | "evento_operacional"
  | "desconto_fracionado"
  | "comportamento_recorrente"
  | "quebra_margem"
  | "risco_real"
  | "perguntas_guiadas";

export type NivelRiscoResolucao = "baixo" | "medio" | "alto" | "critico";

export type DivergenciaTriagemEntrada = {
  pendencia_id: string;
  banco: string | null;
  contrato: string | null;
  id_consignacao: string | null;
  competencia: string | null;
  valor_previsto: number;
  valor_descontado: number;
  percentual_divergencia: number | null;
  descricao: string | null;
  tipo_pendencia: string;
  motivo_quebra_desconto?: string | null;
};

export type HistoricoContratoTriagem = {
  competencias: string[];
  valores_descontados: number[];
  valores_previstos: number[];
  quebras_percentual: number[];
};

export type ContextoDivergenciaGuiada = {
  divergencia: DivergenciaTriagemEntrada;
  historico_contrato: HistoricoContratoTriagem;
  eventos_operacionais: EventoOperacionalConsignado[];
  eventos_competencia: EventoOperacionalConsignado[];
  margem_consignavel: number | null;
  margem_ultrapassada: boolean;
  perfil_leitura: ResultadoResolucaoPerfil;
  consigfacil: ConsigfacilContrato | null;
  linhas_folha_competencia: BaseConciliadaLinha[];
  fragmentos_desconto: Array<{ valor: number; descricao: string; linha_id: string }>;
  soma_fragmentos: number;
  riscos_refin: RiscoRefinForcado[];
  refin_detectado: boolean;
  parcela_mudou: boolean;
  prazo_aumentou: boolean;
  novo_contrato_mesmo_banco: boolean;
  compensacao_mes_seguinte: boolean;
  comportamento_recorrente: boolean;
  percentual_quebra_recorrente: number | null;
};

export type PerguntaResolutivaDivergencia = {
  id: string;
  etapa: EtapaMotorResolucao;
  pergunta: string;
  ajuda?: string;
  opcoes: Array<{ id: string; label: string }>;
  obrigatoria: boolean;
};

export type ResultadoResolucaoGuiada = {
  resolvido: boolean;
  remover_conferencia: boolean;
  classificacao: ClassificacaoResolucaoDivergencia;
  explicacao: string;
  origem: OrigemResolucaoDivergencia;
  etapa_aplicada: EtapaMotorResolucao | null;
  etapas_verificadas: EtapaMotorResolucao[];
  nivel_risco: NivelRiscoResolucao;
  acao_tomada: string;
  aprendizado_sugerido: boolean;
  perguntas_pendentes: PerguntaResolutivaDivergencia[];
  campos_aplicados: Record<string, unknown>;
  confianca: number;
};

export type ItemTriagemResolutiva = {
  pendencia: PendenciaConferenciaReal;
  contexto: ContextoDivergenciaGuiada;
  motor: ResultadoResolucaoGuiada;
  resolucao_usuario: {
    resultado: {
      remover_pendencia: boolean;
      nova_classificacao: string;
      motivo?: string;
      nivel_confianca?: number;
    };
    respostas: Record<string, string>;
  } | null;
  aprendizado_aplicado: boolean;
  filtro_tags: FiltroTriagemResolutiva[];
};

export type FiltroTriagemResolutiva =
  | "todas"
  | "abertas"
  | "resolvidas_auto"
  | "resolvidas_pergunta"
  | "aprendidas"
  | "operacionais"
  | "refin_reais"
  | "risco_alto";

export type LinhaExportacaoTriagemResolutiva = {
  banco: string;
  contrato: string;
  competencia: string;
  divergencia: string;
  motivo: string;
  resolucao: string;
  origem_resolucao: string;
  pergunta_utilizada: string;
  resposta_usuario: string;
  aprendizado_aplicado: string;
  risco: string;
  removido_conferencia: string;
  confianca_pct: number;
  explicacao: string;
  desconto_fracionado_por_margem?: string;
  soma_descontos_mes?: number | string;
  linhas_compensatorias?: string;
  margem_reduzida_detectada?: string;
  removido_da_conferencia?: string;
  contexto_id?: string;
  consolidado_em_contexto?: string;
  oculto_por_visualizacao_consolidada?: string;
  motivo_ocultacao?: string;
};

export type EntradaMontarTriagemResolutiva = {
  pendencias: PendenciaConferenciaReal[];
  baseConciliada: BaseConciliadaLinha[];
  contratosConsigfacil: ConsigfacilContrato[];
  eventosOperacionais: EventoOperacionalConsignado[];
  riscoRefinForcado: RiscoRefinForcado[];
  margemHistorica: Array<{ competencia: string; percentual_comprometido?: number | null }>;
  perfilLeitura: ResultadoResolucaoPerfil;
  payslips?: Payslip[];
};
