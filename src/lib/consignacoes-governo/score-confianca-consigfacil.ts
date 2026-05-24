import type { ConsigfacilContrato } from "@/types/consigfacil";

/**
 * Calcula um score 0..1 de confiança para um `ConsigfacilContrato` extraído.
 *
 * Quanto maior, mais campos obrigatórios estão preenchidos e mais coerentes
 * estão entre si (parcela_atual ≤ parcelas_total, data dentro do período, etc.).
 *
 * Usado para:
 *  - Ordenar candidatos de match contra `Loan`.
 *  - Decidir se o contrato pode sobrescrever inferências (>= 0.7 = canônico).
 *  - Sinalizar baixa qualidade na UI quando < 0.4.
 */
export function calcularConfiancaConsigfacil(c: ConsigfacilContrato): number {
  let pontos = 0;
  let max = 0;

  function somar(condicao: boolean, peso: number): void {
    max += peso;
    if (condicao) pontos += peso;
  }

  somar(c.id_consignacao.length >= 6, 2);
  somar(c.instituicao.length > 1, 2);
  somar(c.valor_parcela > 0, 2);
  somar(c.parcelas_total > 0, 1);
  const parcelaAtual = c.parcela_atual ?? 0;
  somar(parcelaAtual > 0, 1);
  somar(parcelaAtual <= c.parcelas_total || c.parcelas_total === 0, 1);
  somar(/^\d{4}-\d{2}-\d{2}$/.test(c.data_contrato), 1);
  somar(/^\d{4}-\d{2}$/.test(c.competencia), 1);
  somar(c.codigo_instituicao !== null && c.codigo_instituicao.length > 1, 1);
  somar(c.averbado_por !== null, 1);
  somar(c.tipo_margem != null && c.tipo_margem !== "desconhecida" && c.tipo_margem !== "outra", 1);
  somar(c.status !== "desconhecido", 1);

  if (max === 0) return 0;
  return Math.round((pontos / max) * 100) / 100;
}
