"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Info, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseNavigatorLockError } from "@/lib/supabase/auth-lock-errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { subscribeDashboardDataUpdated } from "@/lib/dashboard-data-events";
import { buildBaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import type { EntradaStatusManualBaseConciliada } from "@/lib/conciliacao/conciliacao-financeira";
import { listarStatusManualConciliacao } from "@/lib/conciliacao/status-manual-conciliacao-service";
import { listarSnapshotsConsigfacil } from "@/lib/consignacoes-governo/consigfacil-service";
import { hydrateConsigfacilCatalogoCache } from "@/lib/consignacoes-governo/consigfacil-catalogo-cache";
import {
  consolidarSnapshotsConsigfacil,
  reparseSnapshotsBrutos,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import { PerfilLeituraResumoBanner } from "@/components/leitura-analise/perfil-leitura-resumo-banner";
import { usePerfilLeituraAnalise } from "@/components/leitura-analise/use-perfil-leitura-analise";

import {
  aplicarFiltrosConsignacoes,
  FILTROS_VAZIOS,
  type FiltrosConsignacoes,
} from "@/lib/consignacoes-governo/consignacoes-filtros";
import { ConsignacoesFiltrosBarra } from "@/components/consignacoes/consignacoes-filtros-barra";
import { ConsignacoesTabelaOrdenada } from "@/components/consignacoes/consignacoes-tabela-ordenada";
import { ConsignacoesLinhaDoTempo } from "@/components/consignacoes/consignacoes-linha-do-tempo";
import { ConsignacoesEvolucaoMensalBanco } from "@/components/consignacoes/consignacoes-evolucao-mensal-banco";
import { ConsignacoesTotalPagoBanco } from "@/components/consignacoes/consignacoes-total-pago-banco";
import { ConsignacoesModalidadesPorMes } from "@/components/consignacoes/consignacoes-modalidades-por-mes";
import { ConsignacoesRefinanciamentosDetectados } from "@/components/consignacoes/consignacoes-refinanciamentos-detectados";
import { ConsignacoesDivergenciasOficiais } from "@/components/consignacoes/consignacoes-divergencias-oficiais";
import { ConsignacoesCorrecoesPainel } from "@/components/consignacoes/consignacoes-correcoes-painel";
import { ConsignacoesHistoricoEventos } from "@/components/consignacoes/consignacoes-historico-eventos";
import { ConsignacoesContratosAtivosQuitados } from "@/components/consignacoes/consignacoes-contratos-ativos-quitados";
import { ConsignacoesRmcRccPorBanco } from "@/components/consignacoes/consignacoes-rmc-rcc-por-banco";
import { ConsignacoesCrescimentoDivida } from "@/components/consignacoes/consignacoes-crescimento-divida";
import { MargemHistoricaDashboard } from "@/components/consignacoes/margem-historica-dashboard";
import { RiscoJuridicoFinanceiroPainel } from "@/components/conciliacao/risco-juridico-financeiro-painel";
import { ConsignacoesContratosUnicosPainel } from "@/components/consignacoes/consignacoes-contratos-unicos-painel";
import { ConsignacoesDescontosFracionadosPainel } from "@/components/consignacoes/consignacoes-descontos-fracionados-painel";
import { ConsignacoesPendenciasReaisPainel } from "@/components/consignacoes/consignacoes-pendencias-reais-painel";
import { ConsignacoesRefinanciamentosDescartadosPainel } from "@/components/consignacoes/consignacoes-refinanciamentos-descartados-painel";
import { EventosOperacionaisPainel } from "@/components/dashboard/consignacoes/eventos-operacionais-painel";
import { DashboardCrossLinks } from "@/components/layout/dashboard-cross-links";

const FETCH_TIMEOUT_MS = 25_000;

async function withFetchTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} demorou demais. Verifique a conexão e tente de novo.`)),
          FETCH_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function ConsignacoesPage() {
  const perfilLeitura = usePerfilLeituraAnalise();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [evidencias, setEvidencias] = useState<LoanEvidence[]>([]);
  const [statusManual, setStatusManual] = useState<EntradaStatusManualBaseConciliada[]>([]);
  const [snapshotsConsigfacil, setSnapshotsConsigfacil] = useState<ConsigfacilSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [montandoBase, setMontandoBase] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [base, setBase] = useState<ReturnType<typeof buildBaseFinanceiraNormalizada> | null>(null);
  const [filtros, setFiltros] = useState<FiltrosConsignacoes>(FILTROS_VAZIOS);
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const initialLoadDoneRef = useRef(false);

  const fetchConsignacoesData = useCallback(async () => {
    const supabase = createClient();
    await withFetchTimeout(hydrateConsigfacilCatalogoCache(supabase), "Catálogo ConsigFácil");
    const {
      data: { user },
    } = await withFetchTimeout(supabase.auth.getUser(), "Autenticação Supabase");
    const userId = user?.id ?? null;
    const [{ data: tx }, { data: ln }, { data: ps }, { data: ev }, statusRes, consigfacilRes] =
      await withFetchTimeout(
        Promise.all([
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
        ]),
        "Dados do Supabase",
      );
    setTransactions((tx as Transaction[]) ?? []);
    setLoans((ln as Loan[]) ?? []);
    setPayslips((ps as Payslip[]) ?? []);
    setEvidencias((ev as LoanEvidence[]) ?? []);
    setStatusManual(statusRes.data);
    setSnapshotsConsigfacil(consigfacilRes.snapshots);
  }, []);

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (loadInFlightRef.current) {
        await loadInFlightRef.current;
        return;
      }
      const silent = opts?.silent === true && initialLoadDoneRef.current;
      const run = (async () => {
        if (!silent) {
          setLoading(true);
          setLoadError(null);
        }
        try {
          try {
            await fetchConsignacoesData();
          } catch (e) {
            if (isSupabaseNavigatorLockError(e)) {
              await new Promise((resolve) => setTimeout(resolve, 250));
              await fetchConsignacoesData();
              return;
            }
            throw e;
          }
          initialLoadDoneRef.current = true;
          if (!silent) setLoadError(null);
        } catch (e) {
          if (isSupabaseNavigatorLockError(e)) {
            const msg = "Sessão ocupada por outra aba. Feche outras abas ou recarregue.";
            setLoadError(msg);
            toast.warning(msg);
            return;
          }
          const msg = e instanceof Error ? e.message : "Falha ao carregar consignações.";
          setLoadError(msg);
          toast.error(msg);
        } finally {
          if (!silent) setLoading(false);
        }
      })();
      loadInFlightRef.current = run;
      try {
        await run;
      } finally {
        if (loadInFlightRef.current === run) loadInFlightRef.current = null;
      }
    },
    [fetchConsignacoesData],
  );

  useEffect(() => {
    void loadData();
    return subscribeDashboardDataUpdated((detail) => {
      const origem = detail?.origin ?? "";
      if (
        origem === "sincronizar_fontes_analise" ||
        origem === "cartao_saque_conferencia" ||
        origem === "cartao_saque_conferencia_lote"
      ) {
        return;
      }
      void loadData({ silent: true });
    });
  }, [loadData]);

  useEffect(() => {
    if (loading) {
      setBase(null);
      setMontandoBase(false);
      return;
    }

    let cancelled = false;
    setMontandoBase(true);

    const handle = window.setTimeout(() => {
      try {
        const reparsed = reparseSnapshotsBrutos(snapshotsConsigfacil);
        const consigfacil = consolidarSnapshotsConsigfacil(
          reparsed,
          perfilLeitura.configAuditoria,
        );
        const next = buildBaseFinanceiraNormalizada({
          transactions,
          loans,
          payslips,
          evidencias,
          statusManualConciliacao: statusManual,
          consigfacil,
          perfilLeitura,
          snapshotsConsigfacilRaw: reparsed,
        });
        if (!cancelled) setBase(next);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Falha ao montar consignações.";
          setLoadError(msg);
          setBase(null);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setMontandoBase(false);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    loading,
    transactions,
    loans,
    payslips,
    evidencias,
    statusManual,
    snapshotsConsigfacil,
    perfilLeitura,
  ]);

  const linhasFiltradas = useMemo(
    () => (base ? aplicarFiltrosConsignacoes(base.consignacoesOrdenadas, filtros) : []),
    [base, filtros],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span>Carregando dados do Supabase…</span>
      </div>
    );
  }

  if (loadError && !base && !montandoBase) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-sm text-muted-foreground max-w-md mx-auto text-center px-4">
        <p>{loadError}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadData()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
        </Button>
      </div>
    );
  }

  if (montandoBase || !base) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span>Montando consignações…</span>
        <span className="text-xs opacity-80">Processando folha e ConsigFácil</span>
      </div>
    );
  }

  const total = base.consignacoesOrdenadas.length;
  const filtrado = linhasFiltradas.length;
  const totalConfirmado = base.consignacoesOrdenadas.filter((l) => l.confirmado_consigfacil).length;
  const totalDivergencia = base.consignacoesOrdenadas.filter((l) => l.divergencia_consigfacil).length;
  const totalParcelaOficial = linhasFiltradas.reduce((s, l) => s + l.valor_parcela_oficial, 0);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListOrdered className="h-6 w-6" /> Consignações ordenadas
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão final ordenada por banco e período de desconto — usa SEMPRE{" "}
            <code>instituicao_oficial</code> e <code>modalidade_oficial</code>/
            <code>grupo_canonico</code>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadData()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Recarregar
        </Button>
      </header>

      <DashboardCrossLinks
        links={[
          {
            label: "Conciliação folha × portal",
            href: "/dashboard/conciliacao",
            description: "importar ConsigFácil e conferir linhas",
          },
          {
            label: "Central Importar",
            href: "/dashboard/importar",
          },
        ]}
      />

      <PerfilLeituraResumoBanner />

      {/* KPIs rápidos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Linhas no recorte</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {filtrado}
              <span className="text-sm text-muted-foreground"> / {total}</span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Confirmadas ConsigFácil</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {totalConfirmado}
              <Badge variant="outline" className="ml-2 text-[10px]">
                {total > 0 ? Math.round((totalConfirmado * 100) / total) : 0}%
              </Badge>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com divergência</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{totalDivergencia}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Parcela oficial (recorte)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {totalParcelaOficial.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
                maximumFractionDigits: 0,
              })}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filtros */}
      <ConsignacoesFiltrosBarra
        linhas={base.consignacoesOrdenadas}
        filtros={filtros}
        onChange={setFiltros}
      />

      {/* Aviso de regra */}
      <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-300/60">
        <CardContent className="pt-4 flex gap-2 items-start text-xs">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            <strong>Regra essencial.</strong> Nenhum dos gráficos abaixo usa nome bruto de banco
            nem modalidade bruta. Todos consomem <code>instituicao_oficial</code> e{" "}
            <code>grupo_canonico</code>/<code>modalidade_oficial</code> da visão canônica{" "}
            <code>Consignacoes_Ordenadas</code>.
          </p>
        </CardContent>
      </Card>

      {/* Pipeline oficial — correções automáticas */}
      <ConsignacoesCorrecoesPainel
        loansCorrigidos={base.loansCorrigidosConsigfacil}
        matches={base.consigfacilConciliacao.matches}
      />

      <ConsignacoesContratosUnicosPainel contratos={base.contratosUnicosConfirmados} />

      <ConsignacoesDescontosFracionadosPainel itens={base.descontosFracionadosConciliados} />

      <ConsignacoesRefinanciamentosDescartadosPainel itens={base.refinanciamentosDescartados} />

      <EventosOperacionaisPainel
        eventos={base.eventosOperacionaisConsignado}
        riscos={base.riscoRefinForcado}
        contratos={base.consigfacil.contratos}
        contratosAuditoria={base.auditoriaConsigfacil.contratos}
      />

      <ConsignacoesPendenciasReaisPainel pendencias={base.pendenciasConferenciaReais} />

      <MargemHistoricaDashboard
        avancada={base.margemHistoricaAvancada}
        consumoEstruturalMargem={base.consumoEstruturalMargem}
        baseConsignavelReal={base.baseConsignavelReal}
        baseConsignavelRealVigente={base.baseConsignavelRealVigente}
        margemHistorica={base.margemHistorica}
        detalhes={base.margemHistoricaDetalhes}
        analise={base.margemHistoricaAnalise}
      />

      {/* Painéis principais */}
      <ConsignacoesLinhaDoTempo linhas={linhasFiltradas} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ConsignacoesEvolucaoMensalBanco linhas={linhasFiltradas} />
        <ConsignacoesTotalPagoBanco linhas={linhasFiltradas} />
      </div>

      <ConsignacoesModalidadesPorMes linhas={linhasFiltradas} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ConsignacoesContratosAtivosQuitados linhas={linhasFiltradas} />
        <ConsignacoesCrescimentoDivida linhas={linhasFiltradas} />
      </div>

      <ConsignacoesRmcRccPorBanco linhas={linhasFiltradas} />

      <RiscoJuridicoFinanceiroPainel score={base.scoreRiscoFinanceiro} />

      <ConsignacoesRefinanciamentosDetectados
        refinanciamentos={base.consigfacil.refinanciamentos}
        contratos={base.consigfacil.contratos}
      />

      <ConsignacoesDivergenciasOficiais
        ajustes={base.consigfacilConciliacao.ajustes}
        consignacoes={base.consignacoesOrdenadas}
        contratosConsigfacil={base.consigfacil.contratos}
      />

      <ConsignacoesHistoricoEventos eventos={base.historicoContratoEventos} />

      {/* Tabela final ordenada — fonte canônica. */}
      <ConsignacoesTabelaOrdenada linhas={linhasFiltradas} />
    </div>
  );
}
