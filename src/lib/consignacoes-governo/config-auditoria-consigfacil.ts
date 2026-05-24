/**
 * Configuração geral da auditoria ConsigFácil.
 * Evita falsos positivos (ex.: caso Carlos Torres) sem hardcode de nome.
 */

export type ConfigAuditoriaConsigfacil = {
  refinanciamento: {
    /** Exige ≥1 indício forte oficial (suspenso/quitado/vínculo/texto portal). */
    exigir_indicio_oficial: boolean;
    /** Mínimo de indícios (fortes + fracos) para marcar refin automático. */
    minimo_indicios: number;
    /** Mínimo de indícios fortes exigidos quando `exigir_indicio_oficial`. */
    min_indicios_fortes: number;
    /** Mesmo banco + data próxima + parcela parecida não caracterizam refin sozinhos. */
    mesmo_banco_data_proxima_nao_basta: boolean;
  };
  conciliacao: {
    aceitar_desconto_fracionado: boolean;
    tolerancia_valor: number;
    tolerancia_percentual: number;
  };
  conferencia: {
    /** Remove descontos fracionados já conciliados da lista de conferência. */
    remover_desconto_fracionado_conciliado: boolean;
  };
  /**
   * Quando true, nunca funde contratos automaticamente se houver divergência
   * estrutural (rubrica forte, parcela OCR inválida, códigos distintos).
   */
  modo_forense_contratos: boolean;
};

export const CONFIG_AUDITORIA_CONSIGFACIL_PADRAO: ConfigAuditoriaConsigfacil = {
  refinanciamento: {
    exigir_indicio_oficial: true,
    minimo_indicios: 3,
    min_indicios_fortes: 1,
    mesmo_banco_data_proxima_nao_basta: true,
  },
  conciliacao: {
    aceitar_desconto_fracionado: true,
    tolerancia_valor: 2,
    /** Soma folha × parcela ConsigFácil (desconto fracionado / arredondamento). */
    tolerancia_percentual: 8,
  },
  conferencia: {
    remover_desconto_fracionado_conciliado: true,
  },
  modo_forense_contratos: true,
};

/** Texto padrão exibido na UI e exportação. */
export const AVISO_CONTRATOS_UNICOS_CONSIGFACIL =
  "Após comparação com a base oficial ConsigFácil, estes contratos foram tratados como operações únicas e independentes. A proximidade de datas, mesmo banco ou valores semelhantes não foi considerada suficiente para caracterizar refinanciamento, pois os códigos oficiais, quantidades de parcelas e sequências de desconto indicam contratos distintos.";

export const MOTIVO_CONTRATO_UNICO_CONFIRMADO = "contrato_unico_confirmado_consigfacil";

export const OBSERVACAO_DESCONTO_FRACIONADO =
  "Descontos fracionados no contracheque somam o valor oficial da parcela ConsigFácil. Tratado como ajuste operacional/margem, não como duplicidade ou novo contrato.";
