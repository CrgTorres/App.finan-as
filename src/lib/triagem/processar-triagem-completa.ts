/**
 * Orquestrador único da Triagem Inteligente Resolutiva.
 * Pipeline determinístico: cache → dados → saneamento → base → triagem → persistência → evento.
 */

import { createClient } from "@/lib/supabase/client";
import { hydrateConsigfacilCatalogoCache } from "@/lib/consignacoes-governo/consigfacil-catalogo-cache";
import { listarSnapshotsConsigfacil } from "@/lib/consignacoes-governo/consigfacil-service";
import {
  consolidarSnapshotsConsigfacil,
  reparseSnapshotsBrutos,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import { listarStatusManualConciliacao } from "@/lib/conciliacao/status-manual-conciliacao-service";
import type { EntradaStatusManualBaseConciliada } from "@/lib/conciliacao/conciliacao-financeira";
import {
  buildBaseFinanceiraNormalizada,
  type BaseFinanceiraNormalizada,
} from "@/lib/dashboard/base-financeira-normalizada";
import {
  emitDashboardDataUpdated,
  beginTriagemPipelineEmitSuppression,
} from "@/lib/dashboard-data-events";
import {
  limparCachesTriagemContratos,
  reprocessarSaneamentoCompleto,
  type ResumoSaneamentoEstrutural,
} from "@/lib/contratos/normalizar-estrutura-contratos-historicos";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import {
  montarItensTriagemResolutiva,
} from "@/lib/triagem/montar-contexto-divergencia-guiada";
import {
  agruparDivergenciasLogicas,
  criarContextoAgrupamento,
  type ResultadoAgrupamentoTriagem,
} from "@/lib/triagem/agrupar-divergencias-logicas";
import { consolidarContextosResolutivos, type ResultadoConsolidacaoContextual } from "@/lib/triagem/consolidar-contextos-resolutivos";
import {
  priorizarFilaTriagem,
  type ResultadoPriorizacaoFila,
} from "@/lib/triagem/calcular-prioridade-risco-triagem";
import {
  aplicarSaneamentoNaturezaTriagemResolutiva,
  deveFecharAutomaticamenteTriagem,
  type ResultadoSaneamentoTriagemResolutiva,
} from "@/lib/triagem/classificar-natureza-estrutural-pendencia";
import {
  montarRastreabilidadeTriagemConsolidada,
  type ResultadoRastreabilidadeTriagem,
} from "@/lib/triagem/rastreabilidade-triagem-consolidada";
import {
  pendenciaOcultaPorTriagem,
  aplicarRespostasTriagem,
} from "@/lib/triagem/aplicar-respostas-triagem";
import { contextoDePendencia } from "@/lib/triagem/triagem-service";
import type { ItemTriagemResolutiva } from "@/lib/triagem/triagem-resolutiva-tipos";
import {
  acquireTriagemProcessingLock,
  releaseTriagemProcessingLock,
} from "@/lib/triagem/triagem-processing-lock";

const LOG_PIPELINE = "[TRIAGEM_PIPELINE]";
const LOG_CACHE = "[TRIAGEM_CACHE]";
const LOG_FINAL = "[TRIAGEM_FINAL]";

export type TriagemPipelineModo =
  | "recarregar"
  | "reprocessar_vinculacao"
  | "saneamento_estrutural"
  | "aplicar_auto"
  | "recalcular_derivados";

export type DadosBrutosTriagem = {
  transactions: Transaction[];
  loans: Loan[];
  payslips: Payslip[];
  evidencias: LoanEvidence[];
  statusManual: EntradaStatusManualBaseConciliada[];
  snapshotsConsigfacil: ConsigfacilSnapshot[];
};

/** KPIs oficiais da triagem — calculados uma vez no snapshot final do pipeline. */
export type MetricasSnapshotTriagem = {
  total_processado: number;
  total_resolvido: number;
  total_monitoramento: number;
  fila_humana: number;
  ganho_triagem_pct: number;
};

export type TriagemPipelineSnapshot = DadosBrutosTriagem & {
  version: number;
  base: BaseFinanceiraNormalizada;
  itensTriagem: ItemTriagemResolutiva[];
  agrupamento: ResultadoAgrupamentoTriagem;
  consolidacaoContextual: ResultadoConsolidacaoContextual;
  saneamentoNatureza: ResultadoSaneamentoTriagemResolutiva;
  priorizacao: ResultadoPriorizacaoFila;
  rastreabilidade: ResultadoRastreabilidadeTriagem;
  ultimoSaneamentoResumo: ResumoSaneamentoEstrutural | null;
  metricas: MetricasSnapshotTriagem;
};

export type ResultadoProcessarTriagemCompleta = {
  ok: true;
  modo: TriagemPipelineModo;
  snapshot: TriagemPipelineSnapshot;
  mensagem?: string;
  autoFechados?: { motor: number; natureza: number };
  saneamentoCaches?: number;
};

export type ResultadoProcessarTriagemRejeitado = {
  ok: false;
  motivo: "lock_ocupado";
};

export async function carregarDadosBrutosTriagem(): Promise<DadosBrutosTriagem> {
  const supabase = createClient();
  void hydrateConsigfacilCatalogoCache(supabase);

  const [{ data: tx }, { data: ln }, { data: ps }, { data: ev }, statusRes, consigfacilRes] =
    await Promise.all([
      supabase.from("transactions").select("*").order("date", { ascending: true }),
      supabase.from("loans").select("*"),
      supabase.from("payslips").select("*"),
      supabase.from("loan_evidences").select("*"),
      (async () => {
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) return { data: [], origem: "local" as const, error: null };
        return listarStatusManualConciliacao(supabase, user.user.id);
      })(),
      (async () => {
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) return { snapshots: [], origem: "local" as const };
        return listarSnapshotsConsigfacil(supabase, user.user.id);
      })(),
    ]);

  return {
    transactions: (tx as Transaction[]) ?? [],
    loans: (ln as Loan[]) ?? [],
    payslips: (ps as Payslip[]) ?? [],
    evidencias: (ev as LoanEvidence[]) ?? [],
    statusManual: statusRes.data,
    snapshotsConsigfacil: reparseSnapshotsBrutos(consigfacilRes.snapshots),
  };
}

/**
 * KPIs alinhados ao saneamento serializado (não usar pendencias.length / clusters brutos na UI).
 */
export function montarMetricasSnapshotTriagem(
  itensTriagem: ItemTriagemResolutiva[],
  priorizacao: ResultadoPriorizacaoFila,
): MetricasSnapshotTriagem {
  const total_processado = itensTriagem.length;
  const fila_humana = priorizacao.fila_principal.length;
  const total_monitoramento = priorizacao.monitoramento.length;
  const total_resolvido = itensTriagem.filter((i) =>
    pendenciaOcultaPorTriagem(i.pendencia.id),
  ).length;

  const ganho_triagem_pct =
    total_processado > 0
      ? Math.max(0, Math.round((1 - fila_humana / total_processado) * 100))
      : 0;

  const metricas: MetricasSnapshotTriagem = {
    total_processado,
    total_resolvido,
    total_monitoramento,
    fila_humana,
    ganho_triagem_pct,
  };

  console.log("[TRIAGEM_KPI]", metricas);

  return metricas;
}

/** Recalcula base + triagem a partir de dados brutos (sem I/O). */
export function montarSnapshotTriagemCompleto(input: {
  brutos: DadosBrutosTriagem;
  perfilLeitura: ResultadoResolucaoPerfil;
  ultimoSaneamentoResumo?: ResumoSaneamentoEstrutural | null;
  version?: number;
}): TriagemPipelineSnapshot {
  const { brutos, perfilLeitura } = input;
  const baseConsigfacil = consolidarSnapshotsConsigfacil(
    brutos.snapshotsConsigfacil ?? [],
    perfilLeitura.configAuditoria,
  );

  const base = buildBaseFinanceiraNormalizada({
    transactions: brutos.transactions,
    loans: brutos.loans,
    payslips: brutos.payslips,
    evidencias: brutos.evidencias,
    statusManualConciliacao: brutos.statusManual,
    consigfacil: baseConsigfacil,
    perfilLeitura,
  });

  const itensTriagem = montarItensTriagemResolutiva({
    pendencias: base.pendenciasConferenciaReais,
    baseConciliada: base.baseConciliada,
    contratosConsigfacil: base.consigfacil.contratos,
    eventosOperacionais: base.eventosOperacionaisConsignado,
    riscoRefinForcado: base.riscoRefinForcado,
    margemHistorica: base.margemHistorica,
    perfilLeitura,
  });

  const contextoAgrupamento = criarContextoAgrupamento(itensTriagem, perfilLeitura);
  const agrupamento = agruparDivergenciasLogicas(
    base.pendenciasConferenciaReais,
    contextoAgrupamento,
  );
  const consolidacaoContextual = consolidarContextosResolutivos(itensTriagem);
  const idsCtx = new Set(consolidacaoContextual.idsOcultosFila);

  const saneamentoNatureza = aplicarSaneamentoNaturezaTriagemResolutiva({
    itens: itensTriagem,
    matches: base.consigfacilConciliacao.matches,
    idsEmCluster: agrupamento.idsEmCluster,
    idsContextoConsolidado: idsCtx,
  });

  const priorizacao = priorizarFilaTriagem(saneamentoNatureza.itens, {
    idsEmCluster: agrupamento.idsEmCluster,
    idsContextoConsolidado: idsCtx,
  });

  const rastreabilidade = montarRastreabilidadeTriagemConsolidada({
    itens: saneamentoNatureza.itens,
    visualizacaoConsolidada: perfilLeitura.visualizacaoConsolidadaInteligente,
    gruposCluster: agrupamento.grupos,
    consolidacao: consolidacaoContextual,
    priorizacao,
    usuario: "usuario_local",
    persistirAuditoria: true,
  });

  const version = input.version ?? Date.now();
  const metricas = montarMetricasSnapshotTriagem(itensTriagem, priorizacao);

  return {
    ...brutos,
    version,
    base,
    itensTriagem,
    agrupamento,
    consolidacaoContextual,
    saneamentoNatureza,
    priorizacao,
    rastreabilidade,
    ultimoSaneamentoResumo:
      input.ultimoSaneamentoResumo ?? base.saneamentoEstrutural?.resumo ?? null,
    metricas,
  };
}

function aplicarAutoFechamentos(snapshot: TriagemPipelineSnapshot): {
  motor: number;
  natureza: number;
} {
  let nMotor = 0;
  let nNatureza = 0;
  const porId = new Map(snapshot.saneamentoNatureza.itens.map((i) => [i.pendencia.id, i]));

  for (const item of snapshot.itensTriagem) {
    if (pendenciaOcultaPorTriagem(item.pendencia.id)) continue;

    const comNatureza = porId.get(item.pendencia.id);
    if (comNatureza?.natureza && deveFecharAutomaticamenteTriagem(comNatureza.natureza)) {
      aplicarRespostasTriagem({
        contexto: contextoDePendencia(item.pendencia),
        respostas: { motor_lote: "auto_natureza_estrutural" },
        resultado: {
          resolvido: true,
          nova_classificacao: item.motor.classificacao,
          nivel_confianca: item.motor.confianca,
          remover_pendencia: true,
          manter_pendencia: false,
          motivo: comNatureza.natureza.motivo_natureza,
          campos_corrigidos: {},
          proxima_acao: "nenhuma",
        },
      });
      nNatureza++;
      continue;
    }

    if (!item.motor.resolvido || !item.motor.remover_conferencia) continue;
    aplicarRespostasTriagem({
      contexto: contextoDePendencia(item.pendencia),
      respostas: { motor_lote: "auto" },
      resultado: {
        resolvido: true,
        nova_classificacao: item.motor.classificacao,
        nivel_confianca: item.motor.confianca,
        remover_pendencia: true,
        manter_pendencia: false,
        motivo: item.motor.explicacao,
        campos_corrigidos: item.motor.campos_aplicados,
        proxima_acao: "nenhuma",
      },
    });
    nMotor++;
  }

  return { motor: nMotor, natureza: nNatureza };
}

function deveLimparCache(modo: TriagemPipelineModo): boolean {
  return (
    modo === "saneamento_estrutural" ||
    modo === "reprocessar_vinculacao" ||
    modo === "aplicar_auto"
  );
}

/**
 * Pipeline serializado da triagem. Retorna null-equivalente se lock ocupado (caller mostra toast).
 */
export async function processarTriagemCompleta(input: {
  modo: TriagemPipelineModo;
  perfilLeitura: ResultadoResolucaoPerfil;
  snapshotAtual?: TriagemPipelineSnapshot | null;
}): Promise<ResultadoProcessarTriagemCompleta | ResultadoProcessarTriagemRejeitado> {
  const release = acquireTriagemProcessingLock(input.modo);
  if (!release) {
    return { ok: false, motivo: "lock_ocupado" };
  }

  const endSuppress = beginTriagemPipelineEmitSuppression();
  console.log(`${LOG_PIPELINE} início modo=${input.modo}`);

  try {
    let brutos: DadosBrutosTriagem;
    let ultimoSaneamentoResumo: ResumoSaneamentoEstrutural | null =
      input.snapshotAtual?.ultimoSaneamentoResumo ?? null;
    let saneamentoCaches = 0;
    let autoFechados: { motor: number; natureza: number } | undefined;

    if (input.modo === "recalcular_derivados" && input.snapshotAtual) {
      brutos = {
        transactions: input.snapshotAtual.transactions,
        loans: input.snapshotAtual.loans,
        payslips: input.snapshotAtual.payslips,
        evidencias: input.snapshotAtual.evidencias,
        statusManual: input.snapshotAtual.statusManual,
        snapshotsConsigfacil: input.snapshotAtual.snapshotsConsigfacil,
      };
    } else {
      if (deveLimparCache(input.modo)) {
        console.log(`${LOG_CACHE} limpar caches triagem`);
        const cache = limparCachesTriagemContratos();
        saneamentoCaches = cache.removidos.length;
      }

      console.log(`${LOG_PIPELINE} carregar dados brutos`);
      brutos = await carregarDadosBrutosTriagem();

      if (input.modo === "saneamento_estrutural") {
        console.log(`${LOG_PIPELINE} saneamento estrutural`);
        const baseTemp = buildBaseFinanceiraNormalizada({
          transactions: brutos.transactions,
          loans: brutos.loans,
          payslips: brutos.payslips,
          evidencias: brutos.evidencias,
          statusManualConciliacao: brutos.statusManual,
          consigfacil: consolidarSnapshotsConsigfacil(
            brutos.snapshotsConsigfacil,
            input.perfilLeitura.configAuditoria,
          ),
          perfilLeitura: input.perfilLeitura,
        });

        const resultado = reprocessarSaneamentoCompleto(
          {
            snapshots: brutos.snapshotsConsigfacil,
            loans: brutos.loans,
            payslips: brutos.payslips,
            baseConciliada: baseTemp.baseConciliada,
            configAuditoria: input.perfilLeitura.configAuditoria,
          },
          { emitirEventoDashboard: false },
        );

        ultimoSaneamentoResumo = resultado.resumo;
        saneamentoCaches = resultado.caches_limpos.length;
        brutos = {
          ...brutos,
          loans: resultado.loans,
          snapshotsConsigfacil: reparseSnapshotsBrutos(brutos.snapshotsConsigfacil),
        };
      }
    }

    let snapshot = montarSnapshotTriagemCompleto({
      brutos,
      perfilLeitura: input.perfilLeitura,
      ultimoSaneamentoResumo,
    });

    if (input.modo === "aplicar_auto") {
      console.log(`${LOG_PIPELINE} aplicar auto em lote`);
      autoFechados = aplicarAutoFechamentos(snapshot);
      snapshot = montarSnapshotTriagemCompleto({
        brutos,
        perfilLeitura: input.perfilLeitura,
        ultimoSaneamentoResumo,
        version: Date.now(),
      });
    }

    console.log(`${LOG_FINAL}`, {
      modo: input.modo,
      version: snapshot.version,
      kpi: snapshot.metricas,
      autoFechados,
    });

    emitDashboardDataUpdated({
      origin: `triagem_pipeline_${input.modo}`,
      sincronizarFontes: input.modo === "saneamento_estrutural",
    });

    let mensagem: string | undefined;
    if (input.modo === "aplicar_auto" && autoFechados) {
      mensagem = `${autoFechados.motor + autoFechados.natureza} item(ns) fechado(s): ${autoFechados.motor} motor · ${autoFechados.natureza} histórico/OCR/contexto.`;
    } else if (input.modo === "saneamento_estrutural" && ultimoSaneamentoResumo) {
      const r = ultimoSaneamentoResumo;
      mensagem =
        `Saneamento: ${r.parcelas_corrigidas} parcela(s), ${r.ocrs_invalidados} OCR, ` +
        `${r.fusoes_desfeitas} fusão(ões), ${r.refinanciamentos_descartados} refin descartado(s), ` +
        `${saneamentoCaches} cache(s).`;
    } else if (input.modo === "reprocessar_vinculacao") {
      mensagem =
        "Vinculação reprocessada (OCR, contratos, match, clusters e triagem com regras atuais).";
    }

    return {
      ok: true,
      modo: input.modo,
      snapshot,
      mensagem,
      autoFechados,
      saneamentoCaches,
    };
  } finally {
    endSuppress();
    release();
    console.log(`${LOG_PIPELINE} fim modo=${input.modo}`);
  }
}
