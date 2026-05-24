/**
 * Reprocessamento da cadeia de vinculação após correção de regras de match.
 */

import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import type { Loan } from "@/types/contracheque";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import {
  consolidarSnapshotsConsigfacil,
  reparseSnapshotsBrutos,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import { atualizarBaseComConsigfacil } from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";
import type { ConfigAuditoriaConsigfacil } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import { CONFIG_AUDITORIA_CONSIGFACIL_PADRAO } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";

export type ResultadoReprocessamentoVinculacao = {
  avisos: string[];
  contratos: number;
  matches: number;
  refinanciamentos: number;
  refin_descartados: number;
  base_atualizada: ReturnType<typeof atualizarBaseComConsigfacil>;
};

/**
 * Reparse OCR/portal → consolidação → match folha × ConsigFácil.
 * Use após alterar regras de rubrica, parcela ou modo forense.
 */
export function reprocessarVinculacaoContratos(input: {
  snapshots: ConsigfacilSnapshot[];
  loans: Loan[];
  baseConciliada: BaseConciliadaLinha[];
  configAuditoria?: ConfigAuditoriaConsigfacil;
  reparseBruto?: boolean;
}): ResultadoReprocessamentoVinculacao {
  const config = input.configAuditoria ?? CONFIG_AUDITORIA_CONSIGFACIL_PADRAO;
  const snaps = input.reparseBruto !== false ? reparseSnapshotsBrutos(input.snapshots) : input.snapshots;
  const baseGov = consolidarSnapshotsConsigfacil(snaps, config);
  const base_atualizada = atualizarBaseComConsigfacil({
    baseConsignacoes: baseGov,
    loans: input.loans,
    baseConciliada: input.baseConciliada,
    configAuditoria: config,
  });

  return {
    avisos: [
      ...baseGov.avisos,
      `Vinculação reprocessada: ${baseGov.contratos.length} contrato(s), ${base_atualizada.matches.length} match(es).`,
      `Refin confirmados: ${baseGov.refinanciamentos.length}; descartados: ${baseGov.refinanciamentosDescartados.length}.`,
    ],
    contratos: baseGov.contratos.length,
    matches: base_atualizada.matches.length,
    refinanciamentos: baseGov.refinanciamentos.length,
    refin_descartados: baseGov.refinanciamentosDescartados.length,
    base_atualizada,
  };
}
