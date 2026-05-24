"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  buildBaseFinanceiraNormalizada,
  type FiltrosBaseFinanceiraNormalizada,
} from "@/lib/dashboard/base-financeira-normalizada";
import { listarStatusManualConciliacao } from "@/lib/conciliacao/status-manual-conciliacao-service";
import type { EntradaStatusManualBaseConciliada } from "@/lib/conciliacao/conciliacao-financeira";
import { listarSnapshotsConsigfacil } from "@/lib/consignacoes-governo/consigfacil-service";
import {
  consolidarSnapshotsConsigfacil,
  reparseSnapshotsBrutos,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import { exportarBaseNormalizadaCsv } from "@/lib/exportacao/exportar-base-normalizada-csv";
import { exportarBaseNormalizadaJson } from "@/lib/exportacao/exportar-base-normalizada-json";
import { exportarBaseNormalizadaXlsx } from "@/lib/exportacao/exportar-base-normalizada-xlsx";
import {
  criarFiltrosExportacaoVazios,
  ExportacaoFiltros,
  type ExportacaoFiltrosState,
} from "@/components/dashboard/exportacao/exportacao-filtros";
import { ExportacaoBotoes } from "@/components/dashboard/exportacao/exportacao-botoes";
import { ExportacaoPreviewTabela } from "@/components/dashboard/exportacao/exportacao-preview-tabela";

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  );
}

function asFiltros(f: ExportacaoFiltrosState): FiltrosBaseFinanceiraNormalizada {
  return {
    dataInicio: f.dataInicio || undefined,
    dataFim: f.dataFim || undefined,
    banco: f.banco,
    tipo: f.tipo,
    risco: f.risco,
    categoria: f.categoria,
  };
}

export default function ExportacaoPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [evidencias, setEvidencias] = useState<LoanEvidence[]>([]);
  const [statusManual, setStatusManual] = useState<EntradaStatusManualBaseConciliada[]>([]);
  const [snapshotsConsigfacil, setSnapshotsConsigfacil] = useState<ConsigfacilSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [filters, setFilters] = useState<ExportacaoFiltrosState>(criarFiltrosExportacaoVazios());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const [{ data: txData }, { data: loansData }, { data: payslipData }, { data: evidData }, statusRes, consigRes] =
        await Promise.all([
          supabase.from("transactions").select("*").order("date", { ascending: true }),
          supabase.from("loans").select("*"),
          supabase.from("payslips").select("*").order("year", { ascending: true }).order("month", { ascending: true }),
          supabase.from("loan_evidences").select("*").order("created_at", { ascending: false }),
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
      setTransactions((txData as Transaction[]) ?? []);
      setLoans((loansData as Loan[]) ?? []);
      setPayslips((payslipData as Payslip[]) ?? []);
      setEvidencias((evidData as LoanEvidence[]) ?? []);
      setStatusManual(statusRes.data);
      setSnapshotsConsigfacil(reparseSnapshotsBrutos(consigRes.snapshots));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar dados para exportação.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const baseConsigfacil = useMemo(
    () => consolidarSnapshotsConsigfacil(snapshotsConsigfacil),
    [snapshotsConsigfacil],
  );

  const baseSemFiltro = useMemo(
    () =>
      buildBaseFinanceiraNormalizada({
        transactions,
        loans,
        payslips,
        evidencias,
        statusManualConciliacao: statusManual,
        consigfacil: baseConsigfacil,
        snapshotsConsigfacilRaw: snapshotsConsigfacil,
      }),
    [transactions, loans, payslips, evidencias, statusManual, baseConsigfacil, snapshotsConsigfacil],
  );

  const base = useMemo(
    () =>
      buildBaseFinanceiraNormalizada({
        transactions,
        loans,
        payslips,
        evidencias,
        filtros: asFiltros(filters),
        statusManualConciliacao: statusManual,
        consigfacil: baseConsigfacil,
        snapshotsConsigfacilRaw: snapshotsConsigfacil,
      }),
    [transactions, loans, payslips, evidencias, filters, statusManual, baseConsigfacil, snapshotsConsigfacil],
  );

  const bancos = useMemo(() => uniqueSorted(baseSemFiltro.eventos.map((e) => e.banco)), [baseSemFiltro]);
  const tipos = useMemo(() => uniqueSorted(baseSemFiltro.eventos.map((e) => e.tipo_evento)), [baseSemFiltro]);
  const riscos = useMemo(() => uniqueSorted(baseSemFiltro.eventos.map((e) => e.risco)), [baseSemFiltro]);
  const categorias = useMemo(() => uniqueSorted(baseSemFiltro.eventos.map((e) => e.categoria)), [baseSemFiltro]);

  const baixar = useCallback(
    async (tipo: "xlsx" | "csv" | "json") => {
      setExportando(true);
      try {
        if (tipo === "xlsx") exportarBaseNormalizadaXlsx(base);
        if (tipo === "csv") exportarBaseNormalizadaCsv(base);
        if (tipo === "json") exportarBaseNormalizadaJson(base);
        toast.success("Arquivo gerado com a base filtrada.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao gerar arquivo.");
      } finally {
        setExportando(false);
      }
    },
    [base],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exportar dados organizados</h1>
          <p className="text-sm text-muted-foreground">
            Base normalizada única para Excel, Power BI, CSV e auditoria técnica em JSON.
          </p>
        </div>
        <Button type="button" variant="outline" className="gap-2" disabled={loading} onClick={() => void loadData()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar dados
        </Button>
      </div>

      <ExportacaoFiltros
        value={filters}
        onChange={setFilters}
        bancos={bancos}
        tipos={tipos}
        riscos={riscos}
        categorias={categorias}
      />

      <ExportacaoBotoes disabled={loading || exportando} onExport={(tipo) => void baixar(tipo)} />

      <ExportacaoPreviewTabela base={base} />
    </div>
  );
}
