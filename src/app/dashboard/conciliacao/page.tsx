"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseNavigatorLockError } from "@/lib/supabase/auth-lock-errors";
import { Button } from "@/components/ui/button";
import { useBaseFinanceiraWorker } from "@/lib/dashboard/use-base-financeira-worker";
import { exportarCatalogoCacheParaWorker } from "@/lib/consignacoes-governo/consigfacil-catalogo-cache";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import type {
  EntradaStatusManualBaseConciliada,
  StatusManualUsuario,
} from "@/lib/conciliacao/conciliacao-financeira";
import {
  listarStatusManualConciliacao,
  removerStatusManualConciliacao,
  salvarStatusManualConciliacao,
} from "@/lib/conciliacao/status-manual-conciliacao-service";
import { ConciliacaoKpiCards } from "@/components/conciliacao/conciliacao-kpi-cards";
import { SemExtratoBancarioBadge } from "@/components/conciliacao/sem-extrato-bancario-badge";
import { possuiFonteBancariaReal } from "@/lib/conciliacao/validar-fonte-bancaria-real";
import { ConciliacaoTabela } from "@/components/conciliacao/conciliacao-tabela";
import { FluxoFinanceiroRealPainel } from "@/components/conciliacao/fluxo-financeiro-real-painel";
import { RiscoJuridicoFinanceiroPainel } from "@/components/conciliacao/risco-juridico-financeiro-painel";
import { RecebidosFolhaVsFluxoChart } from "@/components/dashboard/recebidos-folha-vs-fluxo-chart";
import { RecebidosResumoMensalChart } from "@/components/dashboard/recebidos-resumo-mensal-chart";
import { ConsigfacilImportar } from "@/components/consigfacil/consigfacil-importar";
import { ConsigfacilMargemCards } from "@/components/consigfacil/consigfacil-margem-cards";
import { ConsigfacilMargemGrafico } from "@/components/consigfacil/consigfacil-margem-grafico";
import { MargemHistoricaDashboard } from "@/components/consignacoes/margem-historica-dashboard";
import { ConsigfacilContratosTabela } from "@/components/consigfacil/consigfacil-contratos-tabela";
import { ConsigfacilAjustesPainel } from "@/components/consigfacil/consigfacil-ajustes-painel";
import { ConsigfacilQualidadeClassificacaoPainel } from "@/components/consigfacil/consigfacil-qualidade-classificacao-painel";
import { ConsignacoesContratosUnicosPainel } from "@/components/consignacoes/consignacoes-contratos-unicos-painel";
import { ConsignacoesDescontosFracionadosPainel } from "@/components/consignacoes/consignacoes-descontos-fracionados-painel";
import { ConsignacoesPendenciasReaisPainel } from "@/components/consignacoes/consignacoes-pendencias-reais-painel";
import { ConsignacoesRefinanciamentosDescartadosPainel } from "@/components/consignacoes/consignacoes-refinanciamentos-descartados-painel";
import {
  listarSnapshotsConsigfacil,
  removerSnapshotConsigfacil,
  salvarSnapshotConsigfacil,
} from "@/lib/consignacoes-governo/consigfacil-service";
import { hydrateConsigfacilCatalogoCache } from "@/lib/consignacoes-governo/consigfacil-catalogo-cache";
import { salvarSnapshotsLocaisDireto } from "@/lib/consignacoes-governo/consigfacil-service";
import { filtrarLinhasParaConferencia } from "@/lib/consignacoes-governo/aplicar-auditoria-consigfacil";
import {
  buildPendenciasReais,
  linhaElegivelPendenciaRealConsignavel,
  entradaPendenciaDeBaseConciliada,
} from "@/lib/conciliacao/pendencia-real-consignavel";
import { PerfilLeituraAtivoTopo } from "@/components/leitura-analise/perfil-leitura-ativo-topo";
import { usePerfilLeituraAnalise } from "@/components/leitura-analise/use-perfil-leitura-analise";
import { perfilLeituraParaWorker } from "@/lib/leitura-analise/perfil-leitura-worker-payload";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import { PERFIL_LEITURA_ATUALIZADO } from "@/lib/leitura-analise/perfil-leitura-storage";
import { pendenciaOcultaPorTriagem, TRIAGEM_ATUALIZADA } from "@/lib/triagem/aplicar-respostas-triagem";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";

export default function ConciliacaoPage() {
  const perfilLeitura = usePerfilLeituraAnalise();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [evidencias, setEvidencias] = useState<LoanEvidence[]>([]);
  const [statusManual, setStatusManual] = useState<EntradaStatusManualBaseConciliada[]>([]);
  const [origemStatusManual, setOrigemStatusManual] = useState<"supabase" | "local" | null>(null);
  const [snapshotsConsigfacil, setSnapshotsConsigfacil] = useState<ConsigfacilSnapshot[]>([]);
  const [origemConsigfacil, setOrigemConsigfacil] = useState<"supabase" | "local" | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<ReadonlySet<string>>(new Set());
  const [triagemTick, setTriagemTick] = useState(0);
  const loadInFlightRef = useRef<Promise<void> | null>(null);

  const {
    base,
    computing: computingBase,
    resumo: resumoBase,
    logs: logsBase,
    tempoProcessamentoMs,
    error: erroBase,
    snapshotsProcessados,
    run: runBaseWorker,
    cancel: cancelBaseWorker,
  } = useBaseFinanceiraWorker();

  const fetchConciliacaoData = useCallback(async () => {
    const supabase = createClient();
    await hydrateConsigfacilCatalogoCache(supabase);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    const [
      { data: tx },
      { data: ln },
      { data: ps },
      { data: ev },
      statusRes,
      consigfacilRes,
    ] = await Promise.all([
      supabase.from("transactions").select("*").order("date", { ascending: true }),
      supabase.from("loans").select("*"),
      supabase
        .from("payslips")
        .select("*")
        .order("year", { ascending: true })
        .order("month", { ascending: true }),
      supabase.from("loan_evidences").select("*").order("created_at", { ascending: false }),
      userId
        ? listarStatusManualConciliacao(supabase, userId)
        : Promise.resolve({ data: [], origem: "local" as const, error: null }),
      userId
        ? listarSnapshotsConsigfacil(supabase, userId)
        : Promise.resolve({ snapshots: [], origem: "local" as const }),
    ]);

    setTransactions((tx as Transaction[]) ?? []);
    setLoans((ln as Loan[]) ?? []);
    setPayslips((ps as Payslip[]) ?? []);
    setEvidencias((ev as LoanEvidence[]) ?? []);
    setStatusManual(statusRes.data);
    setOrigemStatusManual(statusRes.origem);
    setSnapshotsConsigfacil(consigfacilRes.snapshots);
    setOrigemConsigfacil(consigfacilRes.origem);
  }, []);

  const loadData = useCallback(async () => {
    if (loadInFlightRef.current) {
      await loadInFlightRef.current;
      return;
    }

    const run = (async () => {
      setLoading(true);
      try {
        try {
          await fetchConciliacaoData();
        } catch (e) {
          if (isSupabaseNavigatorLockError(e)) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            await fetchConciliacaoData();
            return;
          }
          throw e;
        }
      } catch (e) {
        if (isSupabaseNavigatorLockError(e)) {
          toast.warning("Sessão ocupada por outra aba. Tente recarregar em instantes.");
          return;
        }
        toast.error(e instanceof Error ? e.message : "Falha ao carregar dados de conciliação.");
      } finally {
        setLoading(false);
      }
    })();

    loadInFlightRef.current = run;
    try {
      await run;
    } finally {
      if (loadInFlightRef.current === run) {
        loadInFlightRef.current = null;
      }
    }
  }, [fetchConciliacaoData]);

  useEffect(() => {
    void loadData();
    const onUpdate = () => void loadData();
    const onPerfil = () => perfilLeitura.recarregar();
    window.addEventListener(DASHBOARD_DATA_UPDATED, onUpdate);
    window.addEventListener(PERFIL_LEITURA_ATUALIZADO, onPerfil);
    const onTriagem = () => setTriagemTick((t) => t + 1);
    window.addEventListener(TRIAGEM_ATUALIZADA, onTriagem);
    return () => {
      window.removeEventListener(DASHBOARD_DATA_UPDATED, onUpdate);
      window.removeEventListener(PERFIL_LEITURA_ATUALIZADO, onPerfil);
      window.removeEventListener(TRIAGEM_ATUALIZADA, onTriagem);
    };
  }, [loadData, perfilLeitura.recarregar]);

  const perfilLeituraParaWorkerEstavel = useMemo(
    (): ResultadoResolucaoPerfil => perfilLeituraParaWorker(perfilLeitura),
    [
      perfilLeitura.nivel,
      perfilLeitura.modoListaConferencia,
      perfilLeitura.catalogoVersion,
      perfilLeitura.configAuditoria,
      perfilLeitura.respostas,
      perfilLeitura.parametrosAplicados,
      perfilLeitura.scoreMatchMinimoAutomatico,
      perfilLeitura.scoreMatchLimitePendencia,
      perfilLeitura.tratarDescontoFracionado,
      perfilLeitura.visualizacaoConsolidadaInteligente,
    ],
  );

  const fonteBancariaReal = useMemo(
    () => possuiFonteBancariaReal(transactions),
    [transactions],
  );

  useEffect(() => {
    if (loading) {
      cancelBaseWorker();
      return;
    }

    runBaseWorker({
      transactions,
      loans,
      payslips,
      evidencias,
      statusManualConciliacao: statusManual,
      snapshotsConsigfacil,
      origemConsigfacilLocal: origemConsigfacil === "local",
      perfilLeitura: perfilLeituraParaWorkerEstavel,
      catalogoCache: exportarCatalogoCacheParaWorker(),
    });
  }, [
    loading,
    transactions,
    loans,
    payslips,
    evidencias,
    statusManual,
    snapshotsConsigfacil,
    origemConsigfacil,
    perfilLeituraParaWorkerEstavel,
    runBaseWorker,
    cancelBaseWorker,
  ]);

  useEffect(() => {
    if (!snapshotsProcessados || origemConsigfacil !== "local") return;
    salvarSnapshotsLocaisDireto(snapshotsProcessados);
  }, [snapshotsProcessados, origemConsigfacil]);

  useEffect(() => {
    if (erroBase) {
      toast.error(erroBase);
    }
  }, [erroBase]);

  const statusManualPorEventoId = useMemo(() => {
    const m = new Map<string, StatusManualUsuario>();
    for (const s of statusManual) m.set(s.eventoId, s.status);
    return m;
  }, [statusManual]);

  const linhasConferencia = useMemo(() => {
    if (!base) return [];
    if (perfilLeitura.modoListaConferencia === "todas") {
      return base.baseConciliada;
    }
    if (perfilLeitura.modoListaConferencia === "linhas_revisao") {
      return filtrarLinhasParaConferencia(base.baseConciliada);
    }
    const pendenciasVisiveis = buildPendenciasReais(
      base.pendenciasConferenciaReais.filter((p) => !pendenciaOcultaPorTriagem(p.id)),
    );
    const idsPendenciaVisiveis = new Set(
      pendenciasVisiveis
        .filter((p) => p.id.startsWith("p-linha-"))
        .map((p) => p.id.replace("p-linha-", "")),
    );
    return base.baseConciliada.filter((l) => {
      if (!linhaElegivelPendenciaRealConsignavel(entradaPendenciaDeBaseConciliada(l))) {
        return false;
      }
      return (
        idsPendenciaVisiveis.has(l.id) ||
        (l.status_conciliacao !== "conciliado" &&
          l.status_manual !== "ignorar" &&
          l.status_manual !== "transferencia_propria")
      );
    });
  }, [
    base,
    perfilLeitura.modoListaConferencia,
    triagemTick,
  ]);

  async function importarSnapshotConsigfacil(snapshot: ConsigfacilSnapshot) {
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      toast.error("Faça login para salvar o snapshot.");
      return;
    }
    const res = await salvarSnapshotConsigfacil(supabase, user.user.id, snapshot);
    if (res.error) toast.warning(`Salvo localmente, com aviso: ${res.error.message}`);
    setSnapshotsConsigfacil((prev) => {
      const sem = prev.filter((s) => s.capturado_em !== snapshot.capturado_em);
      return [...sem, snapshot];
    });
    window.dispatchEvent(new CustomEvent(DASHBOARD_DATA_UPDATED));
    toast.success(
      `Pipeline ConsigFácil: ${snapshot.contratos.length} contrato(s) e ${snapshot.margens.length} margem(ns) importados. Base, gráficos e conciliação serão recalculados.`,
    );
  }

  async function removerSnapshot(capturadoEm: string) {
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      toast.error("Faça login.");
      return;
    }
    await removerSnapshotConsigfacil(supabase, user.user.id, capturadoEm);
    setSnapshotsConsigfacil((prev) => prev.filter((s) => s.capturado_em !== capturadoEm));
    toast.success("Snapshot removido.");
  }

  async function alterarStatusManual(eventoId: string, novoStatus: StatusManualUsuario | null) {
    const supabase = createClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      toast.error("Faça login para salvar a revisão.");
      return;
    }
    const userId = userRes.user.id;

    setSalvando((prev) => new Set(prev).add(eventoId));
    try {
      if (novoStatus === null) {
        await removerStatusManualConciliacao(supabase, userId, eventoId);
        setStatusManual((prev) => prev.filter((s) => s.eventoId !== eventoId));
      } else {
        const res = await salvarStatusManualConciliacao(supabase, userId, {
          eventoId,
          status: novoStatus,
        });
        if (res.error) toast.warning(`Salvo localmente, com aviso: ${res.error.message}`);
        setStatusManual((prev) => {
          const sem = prev.filter((s) => s.eventoId !== eventoId);
          return [...sem, { eventoId, status: novoStatus }];
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar revisão.");
    } finally {
      setSalvando((prev) => {
        const next = new Set(prev);
        next.delete(eventoId);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando dados de conciliação…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            Conciliação Financeira
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Auditoria visual entre contracheque, extrato bancário e contratos. Nenhum total soma
            rubrica de folha com transação bancária conciliada.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadData()}>
          <RefreshCw className="h-4 w-4" /> Recarregar
        </Button>
      </div>

      <PerfilLeituraAtivoTopo destaque />

      <SemExtratoBancarioBadge
        possuiFonteBancariaReal={fonteBancariaReal}
        transacoesFolhaExcluidas={
          typeof base?.metricas.transacoes_folha_excluidas === "number"
            ? base.metricas.transacoes_folha_excluidas
            : 0
        }
      />

      {computingBase && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>
                Processando em segundo plano
                {payslips.length > 0 && (
                  <span className="tabular-nums">
                    {" "}
                    ({payslips.length} folha{payslips.length === 1 ? "" : "s"} na base)
                  </span>
                )}
                …
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={cancelBaseWorker}>
              Cancelar
            </Button>
          </div>
          {logsBase.length > 0 && (
            <ul className="text-[10px] opacity-70 space-y-0.5 max-h-20 overflow-y-auto font-mono">
              {logsBase.map((l, i) => (
                <li key={`${i}-${l}`}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!computingBase && tempoProcessamentoMs != null && resumoBase && (
        <p className="text-[11px] text-muted-foreground">
          Base processada em {tempoProcessamentoMs} ms — {resumoBase.linhasConciliada} linha(s),{" "}
          {resumoBase.pendenciasReais} pendência(s).
        </p>
      )}

      {origemStatusManual === "local" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>
            As revisões manuais estão sendo armazenadas <strong>apenas neste dispositivo</strong>{" "}
            (localStorage). Para sincronizar entre dispositivos, aplique a migration{" "}
            <code className="text-[11px]">supabase/migrations/add_status_manual_conciliacao.sql</code>{" "}
            no Supabase.
          </p>
        </div>
      )}

      <ConsigfacilImportar
        snapshots={snapshotsConsigfacil}
        onSnapshotImportado={importarSnapshotConsigfacil}
        onRemoverSnapshot={removerSnapshot}
        origem={origemConsigfacil}
      />

      {base && (
        <>
          {base.consigfacil.margens.length > 0 && (
            <ConsigfacilMargemCards margens={base.consigfacil.margens} />
          )}

          {base.consigfacil.contratos.length > 0 && (
            <ConsigfacilContratosTabela contratos={base.consigfacil.contratos} />
          )}

          {base.consigfacil.margensSerieTemporal.length > 0 && (
            <ConsigfacilMargemGrafico series={base.consigfacil.margensSerieTemporal} />
          )}

          {base.margemHistoricaAvancada.competencias.length > 0 && (
            <MargemHistoricaDashboard
              avancada={base.margemHistoricaAvancada}
              consumoEstruturalMargem={base.consumoEstruturalMargem}
              baseConsignavelReal={base.baseConsignavelReal}
              baseConsignavelRealVigente={base.baseConsignavelRealVigente}
              margemHistorica={base.margemHistorica}
              detalhes={base.margemHistoricaDetalhes}
              analise={base.margemHistoricaAnalise}
            />
          )}

          {base.consigfacilConciliacao.ajustes.length > 0 && (
            <ConsigfacilAjustesPainel
              ajustes={base.consigfacilConciliacao.ajustes}
              loansComCorrelacao={base.consigfacilConciliacao.loansComConfirmacao}
              linhasBaseComCorrelacao={base.consigfacilConciliacao.baseConciliadaEnriquecida}
            />
          )}

          <ConsignacoesContratosUnicosPainel contratos={base.contratosUnicosConfirmados} />

          <ConsignacoesDescontosFracionadosPainel itens={base.descontosFracionadosConciliados} />

          <ConsignacoesRefinanciamentosDescartadosPainel itens={base.refinanciamentosDescartados} />

          <ConsignacoesPendenciasReaisPainel pendencias={base.pendenciasConferenciaReais} />

          <ConsigfacilQualidadeClassificacaoPainel
            resumo={base.qualidadeClassificacao}
            classificacoesLoans={base.classificacoesLoans}
            classificacoesBaseConciliada={base.classificacoesBaseConciliada}
          />

          <ConciliacaoKpiCards
            baseConciliada={base.baseConciliada}
            conciliacaoFolhaExtrato={base.conciliacaoFolhaExtrato}
            conciliacaoContratoExtrato={base.conciliacaoContratoExtrato}
            possuiFonteBancariaReal={fonteBancariaReal}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <FluxoFinanceiroRealPainel baseConciliada={base.baseConciliada} />
            <RiscoJuridicoFinanceiroPainel score={base.scoreRiscoFinanceiro} />
          </div>

          <RecebidosResumoMensalChart resumoMensal={base.resumoMensalRecebidos} />

          <RecebidosFolhaVsFluxoChart
            recebidos={base.recebidosNormalizados}
            resumoMensal={base.resumoMensalRecebidos}
          />

          <ConciliacaoTabela
            linhas={linhasConferencia}
            titulo="Conferência — pendências reais"
            descricao={`${linhasConferencia.length} linha(s) após excluir contratos únicos confirmados, descontos fracionados conciliados e falsos refinanciamentos. ${base.pendenciasConferenciaReais.length} pendência(s) catalogada(s).`}
            statusManualPorEventoId={statusManualPorEventoId}
            onAlterarStatusManual={alterarStatusManual}
            eventoIdsSalvando={salvando}
          />
        </>
      )}
    </div>
  );
}
