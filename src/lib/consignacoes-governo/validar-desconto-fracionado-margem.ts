/**
 * Valida descontos quebrados no contracheque (margem reduzida, etc.)
 * — delega ao detector estrutural em `contratos/detectar-desconto-fracionado-margem`.
 */

import type { ConsigfacilContrato } from "@/types/consigfacil";
import {
  CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
  type ConfigAuditoriaConsigfacil,
  OBSERVACAO_DESCONTO_FRACIONADO,
} from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import {
  detectarDescontoFracionadoPorMargem,
  MENSAGEM_DESCONTO_FRACIONADO_MARGEM,
  type LinhaFolhaMes,
} from "@/lib/contratos/detectar-desconto-fracionado-margem";

export type DescontoFolhaEntrada = {
  valor: number;
  rubrica?: string | null;
  descricao?: string | null;
  linha_id?: string | null;
  codigo_rubrica?: string | null;
  banco?: string | null;
  competencia?: string | null;
};

export type ResultadoValidacaoDescontoFracionado = {
  conciliado: boolean;
  tipo: "desconto_fracionado_por_margem" | "pendencia_real";
  valor_parcela_oficial: number;
  soma_descontos_folha: number;
  diferenca: number;
  percentual_diferenca: number;
  motivo: string;
  margem_reduzida_detectada?: boolean;
  linhas_compensatorias?: string;
  removido_da_conferencia?: boolean;
};

function descontosParaLinhasFolha(
  descontos: DescontoFolhaEntrada[],
  competencia: string,
  banco: string,
  contratoId: string,
): LinhaFolhaMes[] {
  return descontos.map((d) => ({
    id: d.linha_id,
    competencia: d.competencia ?? competencia,
    banco: d.banco ?? banco,
    codigo_rubrica: d.codigo_rubrica,
    descricao: d.descricao ?? d.rubrica,
    rubrica_canonica: d.rubrica,
    valor: d.valor,
    natureza: "desconto",
    origem: "contracheque",
    contrato_id: contratoId,
  }));
}

/**
 * Verifica se múltiplos descontos no mesmo mês somam a parcela oficial.
 */
export function validarDescontoFracionadoPorMargem(input: {
  descontosFolha: DescontoFolhaEntrada[];
  contratoConsigfacil: Pick<
    ConsigfacilContrato,
    "valor_parcela" | "instituicao" | "id_consignacao" | "codigo_instituicao"
  >;
  competencia: string;
  config?: Partial<ConfigAuditoriaConsigfacil>;
  rubrica_canonica?: string | null;
}): ResultadoValidacaoDescontoFracionado {
  const valorOficial = Math.abs(input.contratoConsigfacil.valor_parcela);
  const linhas = descontosParaLinhasFolha(
    input.descontosFolha,
    input.competencia,
    input.contratoConsigfacil.instituicao,
    input.contratoConsigfacil.id_consignacao,
  );

  const deteccao = detectarDescontoFracionadoPorMargem({
    competencia: input.competencia,
    banco: input.contratoConsigfacil.instituicao,
    codigo_rubrica: input.contratoConsigfacil.codigo_instituicao,
    rubrica_canonica: input.rubrica_canonica ?? null,
    contrato_id: input.contratoConsigfacil.id_consignacao,
    valor_oficial_parcela: valorOficial,
    linhas_folha_mes: linhas,
    config: input.config,
  });

  if (deteccao.fracionado) {
    return {
      conciliado: true,
      tipo: "desconto_fracionado_por_margem",
      valor_parcela_oficial: deteccao.valor_oficial,
      soma_descontos_folha: deteccao.soma_descontos,
      diferenca: deteccao.diferenca,
      percentual_diferenca: deteccao.percentual_diferenca,
      motivo: MENSAGEM_DESCONTO_FRACIONADO_MARGEM,
      margem_reduzida_detectada: deteccao.margem_reduzida_detectada,
      linhas_compensatorias: deteccao.linhas_compensatorias
        .map((l) => l.id ?? l.descricao)
        .filter(Boolean)
        .join(", "),
      removido_da_conferencia: deteccao.remover_da_conferencia,
    };
  }

  const soma = linhas.reduce((s, l) => s + Math.abs(l.valor), 0);
  const diferenca = Math.abs(soma - valorOficial);
  const percentual_diferenca =
    valorOficial > 0 ? Math.round((diferenca / valorOficial) * 1000) / 10 : 0;
  const config = {
    ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
    ...input.config,
  };

  return {
    conciliado: false,
    tipo: "pendencia_real",
    valor_parcela_oficial: valorOficial,
    soma_descontos_folha: soma,
    diferenca,
    percentual_diferenca,
    motivo:
      diferenca > config.conciliacao.tolerancia_valor
        ? `Soma dos descontos (R$ ${soma.toFixed(2)}) diverge da parcela oficial (R$ ${valorOficial.toFixed(2)}) — Δ R$ ${diferenca.toFixed(2)} (${percentual_diferenca}%).`
        : "Não há padrão de desconto fracionado por margem.",
  };
}

export { OBSERVACAO_DESCONTO_FRACIONADO };
