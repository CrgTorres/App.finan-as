/**
 * Regras para tratar consignações como contratos ÚNICOS e independentes,
 * descartando refinanciamento automático por indícios fracos (mesmo banco,
 * data próxima, parcela parecida).
 */

import type { ConsigfacilContrato, ConsigfacilRefinanciamento } from "@/types/consigfacil";
import {
  contratoIgnoraDivergenciaValorPorMargem,
  MOTIVO_DESCONTO_OPERACIONAL_MARGEM,
} from "@/lib/contratos/detectar-contexto-operacional-margem";
import {
  AVISO_CONTRATOS_UNICOS_CONSIGFACIL,
  MOTIVO_CONTRATO_UNICO_CONFIRMADO,
} from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import type { MotivoQuebraDesconto } from "@/lib/consigfacil/detectar-eventos-operacionais";
import { avaliarCompatibilidadeRubrica } from "@/lib/contratos/rubrica-identificador-forte";
import { contratosDistintosMesmoBanco } from "@/lib/contratos/vinculacao-contextual-contratos";

const TERMOS_REFIN_OFICIAL =
  /\b(refinanciamento|refinanc|portabilidade|portab|substitui[cç][aã]o|substituido|renegoci)/i;

function diffValorPct(a: number, b: number): number {
  if (a <= 0 || b <= 0) return Infinity;
  return Math.abs(a - b) / Math.max(a, b);
}

/** Indicação EXPRESSA no portal de refin/portabilidade/substituição. */
export function temIndicacaoOficialRefinanciamento(c: ConsigfacilContrato): boolean {
  if (c.contrato_substituido) return true;
  if (c.status === "refinanciado" || c.status === "substituido") return true;
  if (c.eh_refinanciamento && c.contrato_substituido) return true;
  const texto = [c.observacao, c.situacao_importacao].filter(Boolean).join(" ");
  return TERMOS_REFIN_OFICIAL.test(texto);
}

/**
 * Dois contratos são operações únicas e independentes quando TODOS os critérios
 * do usuário se aplicam.
 */
export function saoContratosUnicosIndependentes(
  a: ConsigfacilContrato,
  b: ConsigfacilContrato,
): boolean {
  if (a.id_consignacao === b.id_consignacao) return false;

  // Códigos oficiais diferentes.
  if (a.id_consignacao && b.id_consignacao && a.id_consignacao !== b.id_consignacao) {
    // ok
  } else {
    return false;
  }

  // Sem indicação oficial de refin em nenhum dos dois.
  if (temIndicacaoOficialRefinanciamento(a) || temIndicacaoOficialRefinanciamento(b)) {
    return false;
  }

  if (contratosDistintosMesmoBanco(a, b)) {
    return true;
  }

  const rub = avaliarCompatibilidadeRubrica(
    a.texto_bruto,
    b.texto_bruto,
    a.codigo_instituicao,
    b.codigo_instituicao,
  );
  if (!rub.compativel) {
    return true;
  }

  // Número de parcelas diferente OU sequência própria.
  const parcelasOuSequenciaPropria =
    a.parcelas_total !== b.parcelas_total ||
    Math.abs((a.parcela_atual ?? 0) - (b.parcela_atual ?? 0)) > 2;
  if (!parcelasOuSequenciaPropria) return false;

  // Valor de parcela próprio (não "parecido" — diferença > 5%).
  if (
    a.valor_parcela > 0 &&
    b.valor_parcela > 0 &&
    diffValorPct(a.valor_parcela, b.valor_parcela) <= 0.05
  ) {
    return false;
  }

  return true;
}

export type ContratoUnicoConfirmado = {
  banco: string;
  codigo_oficial: string;
  valor_parcela: number;
  parcelas_total: number;
  parcela_atual: number;
  status: string;
  motivo: typeof MOTIVO_CONTRATO_UNICO_CONFIRMADO;
  aviso: string;
  id_consignacao: string;
  refinanciamento_descartado_por_consigfacil: boolean;
  motivo_refinanciamento_descartado: string;
};

export type RefinanciamentoDescartado = {
  contrato_origem: string;
  contrato_destino: string;
  banco: string;
  indicios_fracos: string[];
  indicios_fortes_ausentes: boolean;
  motivo: typeof MOTIVO_CONTRATO_UNICO_CONFIRMADO;
  motivo_texto: string;
  aviso: string;
};

export type ContratoComAuditoria = ConsigfacilContrato & {
  refinanciamento_descartado_por_consigfacil: boolean;
  motivo_refinanciamento_descartado: string | null;
  nao_refinanciamento_confirmado: boolean;
  desconto_fracionado_por_margem: boolean;
  soma_descontos_fracionados: number;
  valor_parcela_oficial_consigfacil: number;
  diferenca_conciliacao_fracionada: number;
  pendencia_real: boolean;
  /** Por que o desconto não apareceu / divergiu — justificativa operacional oficial. */
  motivo_quebra_desconto: MotivoQuebraDesconto;
  /** true quando suspensão/bloqueio/inadimplência explicam a quebra (não é refin). */
  justificativa_operacional_oficial: boolean;
};

/**
 * Filtra refinanciamentos detectados: remove pares que são contratos únicos.
 */
export function filtrarRefinanciamentosComContratosUnicos(input: {
  contratos: ConsigfacilContrato[];
  refinanciamentos: ConsigfacilRefinanciamento[];
}): {
  refinanciamentosConfirmados: ConsigfacilRefinanciamento[];
  refinanciamentosDescartados: RefinanciamentoDescartado[];
  contratosUnicosConfirmados: ContratoUnicoConfirmado[];
  idsContratosUnicos: Set<string>;
} {
  const { contratos, refinanciamentos } = input;
  const porId = new Map(contratos.map((c) => [c.id_consignacao, c]));
  const confirmados: ConsigfacilRefinanciamento[] = [];
  const descartados: RefinanciamentoDescartado[] = [];
  const idsUnicos = new Set<string>();

  for (const r of refinanciamentos) {
    const antigo = porId.get(r.contrato_origem);
    const novo = porId.get(r.contrato_destino);
    if (!antigo || !novo) {
      confirmados.push(r);
      continue;
    }

    if (
      contratoIgnoraDivergenciaValorPorMargem(antigo) ||
      contratoIgnoraDivergenciaValorPorMargem(novo)
    ) {
      descartados.push({
        contrato_origem: r.contrato_origem,
        contrato_destino: r.contrato_destino,
        banco: r.banco,
        indicios_fracos: r.evidencias_refinanciamento,
        indicios_fortes_ausentes: true,
        motivo: MOTIVO_CONTRATO_UNICO_CONFIRMADO,
        motivo_texto: MOTIVO_DESCONTO_OPERACIONAL_MARGEM,
        aviso: AVISO_CONTRATOS_UNICOS_CONSIGFACIL,
      });
      idsUnicos.add(antigo.id_consignacao);
      idsUnicos.add(novo.id_consignacao);
      continue;
    }

    if (saoContratosUnicosIndependentes(antigo, novo)) {
      const indiciosFracos = r.evidencias_refinanciamento.filter((e) =>
        /mesmo banco|datas próximas|valor novo|parcela reiniciada|parecido/i.test(e),
      );
      descartados.push({
        contrato_origem: r.contrato_origem,
        contrato_destino: r.contrato_destino,
        banco: r.banco,
        indicios_fracos: indiciosFracos,
        indicios_fortes_ausentes: true,
        motivo: MOTIVO_CONTRATO_UNICO_CONFIRMADO,
        motivo_texto: MOTIVO_CONTRATO_UNICO_CONFIRMADO,
        aviso: AVISO_CONTRATOS_UNICOS_CONSIGFACIL,
      });
      idsUnicos.add(antigo.id_consignacao);
      idsUnicos.add(novo.id_consignacao);
    } else {
      confirmados.push(r);
    }
  }

  const contratosUnicosConfirmados: ContratoUnicoConfirmado[] = [];
  for (const id of idsUnicos) {
    const c = porId.get(id);
    if (!c) continue;
    contratosUnicosConfirmados.push({
      banco: c.instituicao,
      codigo_oficial: c.id_consignacao,
      valor_parcela: c.valor_parcela,
      parcelas_total: c.parcelas_total,
      parcela_atual: c.parcela_atual ?? 0,
      status: "nao_refinanciamento_confirmado",
      motivo: MOTIVO_CONTRATO_UNICO_CONFIRMADO,
      aviso: AVISO_CONTRATOS_UNICOS_CONSIGFACIL,
      id_consignacao: c.id_consignacao,
      refinanciamento_descartado_por_consigfacil: true,
      motivo_refinanciamento_descartado: MOTIVO_CONTRATO_UNICO_CONFIRMADO,
    });
  }

  return {
    refinanciamentosConfirmados: confirmados,
    refinanciamentosDescartados: descartados,
    contratosUnicosConfirmados,
    idsContratosUnicos: idsUnicos,
  };
}

export function aplicarAuditoriaNosContratos(
  contratos: ConsigfacilContrato[],
  idsUnicos: Set<string>,
): ContratoComAuditoria[] {
  return contratos.map((c) => {
    const unico = idsUnicos.has(c.id_consignacao);
    return {
      ...c,
      refinanciamento_descartado_por_consigfacil: unico,
      motivo_refinanciamento_descartado: unico ? MOTIVO_CONTRATO_UNICO_CONFIRMADO : null,
      nao_refinanciamento_confirmado: unico,
      desconto_fracionado_por_margem: false,
      soma_descontos_fracionados: 0,
      valor_parcela_oficial_consigfacil: c.valor_parcela,
      diferenca_conciliacao_fracionada: 0,
      pendencia_real: false,
      motivo_quebra_desconto: "desconhecido",
      justificativa_operacional_oficial: false,
      ...(unico
        ? {
            eh_refinanciamento: false,
            contrato_substituido: null,
            status:
              c.status === "refinanciado" || c.status === "substituido"
                ? ("nao_refinanciamento_confirmado" as ConsigfacilContrato["status"])
                : c.status,
          }
        : {}),
    };
  });
}
