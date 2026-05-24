/**
 * Pipeline OFICIAL ConsigFácil — 9 etapas.
 *
 *   1. Parse
 *   2. Normalização
 *   3. Matching interno
 *   4. Conciliação
 *   5. Correção automática (score ≥ 90)
 *   6. Atualização da base normalizada (caller: `buildBaseFinanceiraNormalizada`)
 *   7. Atualização dos gráficos (derivado da base — evento `DASHBOARD_DATA_UPDATED`)
 *   8. Persistência (opcional — `persistir`)
 *   9. Auditoria
 *
 * Use `processarSnapshotConsigfacil` ao IMPORTAR um snapshot ou ao
 * REPROCESSAR toda a base após mudança de catálogo/regras.
 */

import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import type { Loan } from "@/types/contracheque";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import {
  consolidarSnapshotsConsigfacil,
  reparseSnapshotsBrutos,
  type BaseConsignacoesGoverno,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import {
  atualizarBaseComConsigfacil,
  type ResultadoAtualizacaoBaseComConsigfacil,
} from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";
import {
  montarHistoricoContratoEventos,
  type HistoricoContratoEvento,
} from "@/lib/consignacoes-governo/historico-contrato-eventos";
import {
  montarAuditoriaConciliacaoConsigfacil,
  type AuditoriaConciliacaoConsigfacil,
} from "@/lib/consignacoes-governo/auditoria-conciliacao";
import {
  montarMargemHistoricaUnificada,
  type MargemHistorica,
} from "@/lib/consignacoes-governo/margem-historica-unificada";
import { parseConsigfacilTexto } from "@/lib/consignacoes-governo/parser-consigfacil-print";

export type EtapaPipelineConsigfacil = {
  etapa: number;
  nome: string;
  ok: boolean;
  detalhe: string;
};

export type ResultadoPipelineConsigfacil = {
  snapshotProcessado: ConsigfacilSnapshot;
  baseConsignacoes: BaseConsignacoesGoverno;
  conciliacao: ResultadoAtualizacaoBaseComConsigfacil;
  historicoEventos: HistoricoContratoEvento[];
  auditoria: AuditoriaConciliacaoConsigfacil[];
  margemHistorica: MargemHistorica[];
  etapas: EtapaPipelineConsigfacil[];
  /** Resumo para toast/UI. */
  resumo: {
    contratos_oficiais: number;
    matches_confirmados: number;
    loans_corrigidos: number;
    divergencias: number;
    refinanciamentos: number;
  };
};

export type EntradaPipelineConsigfacil = {
  /** Snapshot recém-importado (pode conter `texto_bruto` para reparse). */
  snapshot: ConsigfacilSnapshot;
  /** Snapshots já existentes (para consolidar histórico). */
  snapshotsExistentes?: ConsigfacilSnapshot[];
  loans: Loan[];
  baseConciliada: BaseConciliadaLinha[];
  usuario?: string;
  /** Se informado, executa etapa 8 (persistência). */
  persistir?: (snapshot: ConsigfacilSnapshot, base: BaseConsignacoesGoverno) => Promise<void>;
};

function etapa(
  n: number,
  nome: string,
  ok: boolean,
  detalhe: string,
): EtapaPipelineConsigfacil {
  return { etapa: n, nome, ok, detalhe };
}

/**
 * Executa o pipeline completo para UM snapshot novo (ou reprocessado).
 */
export async function processarSnapshotConsigfacil(
  input: EntradaPipelineConsigfacil,
): Promise<ResultadoPipelineConsigfacil> {
  const etapas: EtapaPipelineConsigfacil[] = [];
  const { loans, baseConciliada, usuario, persistir } = input;

  // -----------------------------------------------------------------------
  // 1. PARSE
  // -----------------------------------------------------------------------
  let snapshotProcessado = input.snapshot;
  if (snapshotProcessado.bruto?.trim()) {
    try {
      const reparsed = parseConsigfacilTexto({
        texto: snapshotProcessado.bruto,
        documentoOrigem: snapshotProcessado.documento_origem ?? "reparse",
        origem: snapshotProcessado.origem,
        capturadoEm: snapshotProcessado.capturado_em,
      });
      snapshotProcessado = {
        ...reparsed,
        capturado_em: snapshotProcessado.capturado_em,
        bruto: snapshotProcessado.bruto,
      };
      etapas.push(
        etapa(1, "Parse", true, `${reparsed.contratos.length} contrato(s) extraído(s).`),
      );
    } catch (e) {
      etapas.push(
        etapa(
          1,
          "Parse",
          false,
          e instanceof Error ? e.message : "Falha no parse — usando snapshot pré-parseado.",
        ),
      );
    }
  } else {
    etapas.push(
      etapa(1, "Parse", true, "Snapshot já parseado (sem bruto ou com conteúdo)."),
    );
  }

  // -----------------------------------------------------------------------
  // 2. NORMALIZAÇÃO (consolida N snapshots)
  // -----------------------------------------------------------------------
  const todosSnapshots = reparseSnapshotsBrutos([
    ...(input.snapshotsExistentes ?? []).filter(
      (s) => s.capturado_em !== snapshotProcessado.capturado_em,
    ),
    snapshotProcessado,
  ]);
  const baseConsignacoes = consolidarSnapshotsConsigfacil(todosSnapshots);
  etapas.push(
    etapa(
      2,
      "Normalização",
      true,
      `${baseConsignacoes.contratos.length} contrato(s) canônico(s), ${baseConsignacoes.refinanciamentos.length} refin(s).`,
    ),
  );

  // -----------------------------------------------------------------------
  // 3–5. MATCHING + CONCILIAÇÃO + CORREÇÃO AUTOMÁTICA
  // -----------------------------------------------------------------------
  const conciliacao = atualizarBaseComConsigfacil({
    baseConsignacoes,
    loans,
    baseConciliada,
  });
  const matchesConfirmados = conciliacao.matches.filter((m) => m.faixa === "match_confirmado").length;
  const matchesProvaveis = conciliacao.matches.filter((m) => m.faixa === "match_provavel").length;
  etapas.push(
    etapa(
      3,
      "Matching interno",
      true,
      `${conciliacao.matches.length} par(es) avaliado(s): ${matchesConfirmados} confirmado(s), ${matchesProvaveis} provável(is).`,
    ),
  );
  etapas.push(
    etapa(
      4,
      "Conciliação",
      true,
      `${conciliacao.ajustes.length} ajuste(s), ${conciliacao.divergenciasFolhaExtrato.length} divergência(s) folha/extrato.`,
    ),
  );
  etapas.push(
    etapa(
      5,
      "Correção automática",
      conciliacao.loansCorrigidos.length > 0 || matchesConfirmados === 0,
      `${conciliacao.loansCorrigidos.length} loan(s) corrigido(s) (score ≥ 90).`,
    ),
  );

  // -----------------------------------------------------------------------
  // 6–7. Base normalizada + gráficos — responsabilidade do caller após
  //       `buildBaseFinanceiraNormalizada` + `DASHBOARD_DATA_UPDATED`.
  // -----------------------------------------------------------------------
  etapas.push(
    etapa(
      6,
      "Atualização base normalizada",
      true,
      "Pronta — execute `buildBaseFinanceiraNormalizada` com `consigfacil` atualizado.",
    ),
  );
  etapas.push(
    etapa(
      7,
      "Atualização gráficos",
      true,
      "Dispare `DASHBOARD_DATA_UPDATED` após rebuild da base.",
    ),
  );

  // -----------------------------------------------------------------------
  // 8. PERSISTÊNCIA (opcional)
  // -----------------------------------------------------------------------
  if (persistir) {
    try {
      await persistir(snapshotProcessado, baseConsignacoes);
      etapas.push(etapa(8, "Persistência", true, "Snapshot e base persistidos."));
    } catch (e) {
      etapas.push(
        etapa(
          8,
          "Persistência",
          false,
          e instanceof Error ? e.message : "Falha na persistência.",
        ),
      );
    }
  } else {
    etapas.push(etapa(8, "Persistência", true, "Ignorada (sem callback `persistir`)."));
  }

  // -----------------------------------------------------------------------
  // 9. AUDITORIA + HISTÓRICO + MARGEM
  // -----------------------------------------------------------------------
  const historicoEventos = montarHistoricoContratoEventos({
    loans,
    loansComConfirmacao: conciliacao.loansComConfirmacao,
    contratosConsigfacil: baseConsignacoes.contratos,
    refinanciamentosConsigfacil: baseConsignacoes.refinanciamentos,
    ajustes: conciliacao.ajustes,
    instituicaoOficialPorIdConsignacao: conciliacao.instituicaoOficialPorIdConsignacao,
  });
  const auditoria = montarAuditoriaConciliacaoConsigfacil({
    ajustes: conciliacao.ajustes,
    loansCorrigidos: conciliacao.loansCorrigidos,
    matches: conciliacao.matches,
    usuario,
  });
  const margemHistorica = montarMargemHistoricaUnificada({
    margensConsigfacil: baseConsignacoes.margensSerieTemporal,
  });
  etapas.push(
    etapa(
      9,
      "Auditoria",
      true,
      `${auditoria.length} linha(s) de auditoria, ${historicoEventos.length} evento(s).`,
    ),
  );

  return {
    snapshotProcessado,
    baseConsignacoes,
    conciliacao,
    historicoEventos,
    auditoria,
    margemHistorica,
    etapas,
    resumo: {
      contratos_oficiais: baseConsignacoes.contratos.length,
      matches_confirmados: matchesConfirmados,
      loans_corrigidos: conciliacao.loansCorrigidos.length,
      divergencias: conciliacao.ajustes.filter((a) => a.tipo_ajuste === "divergencia").length,
      refinanciamentos: baseConsignacoes.refinanciamentos.length,
    },
  };
}

/** Loans efetivos para gráficos/tabelas: aplica correções ConsigFácil sem apagar originais. */
export function loansEfetivosComConsigfacil(
  loansBruto: Loan[],
  loansCorrigidos: ResultadoAtualizacaoBaseComConsigfacil["loansCorrigidos"],
): Loan[] {
  const mapa = new Map(loansCorrigidos.map((lc) => [lc.id, lc]));
  return loansBruto.map((l) => {
    const c = mapa.get(l.id);
    if (!c) return l;
    const {
      loan_original_snapshot: _s,
      campos_corrigidos: _c,
      score_match: _sc,
      id_consignacao_origem: _id,
      corrigido_em: _em,
      fonte_principal: _fp,
      ...loan
    } = c;
    return loan;
  });
}
