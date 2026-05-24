import type { ConfigAuditoriaConsigfacil } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";

/** Nível de rigor da leitura/conciliação (do mais permissivo ao mais exigente). */
export type NivelLeituraAnalise =
  | "basico"
  | "padrao"
  | "consignado"
  | "auditoria_oficial"
  | "avancado";

export const NIVEIS_LEITURA_ORDEM: NivelLeituraAnalise[] = [
  "basico",
  "padrao",
  "consignado",
  "auditoria_oficial",
  "avancado",
];

export const ROTULOS_NIVEL_LEITURA: Record<
  NivelLeituraAnalise,
  { titulo: string; descricao: string }
> = {
  basico: {
    titulo: "Básico",
    descricao:
      "Contracheque e cadastro manual. Tolerâncias amplas; pouca inferência automática de refinanciamento ou duplicidade.",
  },
  padrao: {
    titulo: "Padrão",
    descricao:
      "Cruzamento folha + empréstimos cadastrados. Adequado quando ainda não há base oficial ConsigFácil.",
  },
  consignado: {
    titulo: "Consignado",
    descricao:
      "Com ConsigFácil: aceita descontos fracionados por margem e exige mais cuidado antes de marcar refinanciamento.",
  },
  auditoria_oficial: {
    titulo: "Auditoria oficial",
    descricao:
      "ConsigFácil como fonte principal; contratos únicos confirmados; refin só com indício oficial (regra Carlos Torres).",
  },
  avancado: {
    titulo: "Avançado",
    descricao:
      "Máximo rigor: tolerâncias mínimas, match alto obrigatório, conferência manual para casos atípicos.",
  },
};

/** Parâmetros derivados das respostas — usados em conciliação e ConsigFácil. */
export type ParametrosLeituraAnalise = {
  nivel: NivelLeituraAnalise;
  configAuditoria: ConfigAuditoriaConsigfacil;
  /** Score mínimo para correção automática loan ↔ ConsigFácil (0–100). */
  scoreMatchMinimoAutomatico: number;
  /** Score abaixo do qual entra em pendência de conferência. */
  scoreMatchLimitePendencia: number;
  exigirConsigfacilParaFecharPendencia: boolean;
  tratarDescontoFracionado: boolean;
  detectarRefinanciamentoAutomatico: boolean;
  aceitarInferenciaOcrFraca: boolean;
  alertarDuplicidadeRubrica: boolean;
  priorizarExtratoBancario: boolean;
  /** Como montar a tabela de conferência na conciliação. */
  modoListaConferencia: "pendencias_reais" | "linhas_revisao" | "todas";
  /** Agrupa cards repetidos na triagem resolutiva (contextos automáticos). */
  visualizacaoConsolidadaInteligente: boolean;
};

export type RespostasFormularioLeitura = Record<string, string>;

export type PerfilLeituraPersistido = {
  version: number;
  catalogoVersion: number;
  respostas: RespostasFormularioLeitura;
  atualizadoEm: string;
  nivelResolvido: NivelLeituraAnalise;
};
