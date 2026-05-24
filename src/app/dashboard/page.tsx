"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import type { Transaction, CategoryTotal } from "@/types";
import { MONTHS } from "@/lib/constants";
import { aggregateTransactionsByMonth } from "@/lib/utils/monthly-transactions";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { MonthlyComparisonChart } from "@/components/dashboard/monthly-comparison-chart";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { PetWidget } from "@/components/dashboard/pet-widget";
import { IntegracaoDashboardResumo } from "@/components/dashboard/saude-dados/integracao-dashboard-resumo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { MonthlyComparisonRow } from "@/components/dashboard/monthly-comparison-chart";

const now = new Date();
const currentYear = now.getFullYear();
const years = Array.from({ length: 14 }, (_, i) => currentYear - 8 + i);

/** 0 = resumo de todo o ano civil (jan–dez); 1–12 = mês específico. */
const WHOLE_YEAR = 0;

function DashboardInner() {
  const searchParams = useSearchParams();
  const monthParam = searchParams.get("month");
  const yearParam = searchParams.get("year");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(currentYear);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearTrend, setYearTrend] = useState<MonthlyComparisonRow[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [dataRefreshTick, setDataRefreshTick] = useState(0);

  useEffect(() => {
    if (yearParam) {
      const yi = parseInt(yearParam, 10);
      if (!Number.isNaN(yi)) setYear(yi);
    }
    if (monthParam !== null && monthParam !== "") {
      const mi = parseInt(monthParam, 10);
      if (!Number.isNaN(mi) && (mi === WHOLE_YEAR || (mi >= 1 && mi <= 12))) setMonth(mi);
    }
  }, [monthParam, yearParam]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const start =
      month === WHOLE_YEAR
        ? `${year}-01-01`
        : `${year}-${String(month).padStart(2, "0")}-01`;
    const end =
      month === WHOLE_YEAR
        ? `${year}-12-31`
        : `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

    const { data } = await supabase
      .from("transactions")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false });

    setTransactions((data as Transaction[]) ?? []);
    setLoading(false);
  }, [month, year]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions, dataRefreshTick]);

  useEffect(() => {
    const onDataUpdated = () => setDataRefreshTick((n) => n + 1);
    window.addEventListener(DASHBOARD_DATA_UPDATED, onDataUpdated);
    return () => window.removeEventListener(DASHBOARD_DATA_UPDATED, onDataUpdated);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadYearTrend() {
      setTrendLoading(true);
      const supabase = createClient();
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .gte("date", start)
        .lte("date", end);
      if (cancelled) return;
      const rows = aggregateTransactionsByMonth(
        (data as Transaction[]) ?? [],
        new Date(year, 0, 1),
        new Date(year, 11, 1)
      );
      setYearTrend(rows);
      setTrendLoading(false);
    }
    loadYearTrend();
    return () => {
      cancelled = true;
    };
  }, [year, dataRefreshTick]);

  const receitas = transactions.filter((t) => t.type === "receita");
  const despesas = transactions.filter((t) => t.type === "despesa");

  const totalReceitas = receitas.reduce((acc, t) => acc + t.amount, 0);
  const totalDespesas = despesas.reduce((acc, t) => acc + t.amount, 0);

  const despesasByCategory = despesas.reduce<Record<string, number>>(
    (acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + t.amount;
      return acc;
    },
    {}
  );

  const despesasCategoryData: CategoryTotal[] = Object.entries(
    despesasByCategory
  ).map(([category, total]) => ({
    category: category as CategoryTotal["category"],
    total,
    type: "despesa",
  }));

  const receitasByCategory = receitas.reduce<Record<string, number>>(
    (acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + t.amount;
      return acc;
    },
    {}
  );

  const receitasCategoryData: CategoryTotal[] = Object.entries(
    receitasByCategory
  ).map(([category, total]) => ({
    category: category as CategoryTotal["category"],
    total,
    type: "receita",
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {month === WHOLE_YEAR
              ? `Resumo financeiro de todo o ano de ${year}`
              : `Resumo financeiro de ${MONTHS[month - 1]} ${year}`}
          </p>
        </div>

        <div className="flex gap-2">
          <Select
            value={month.toString()}
            onValueChange={(v) => v && setMonth(parseInt(v, 10))}
          >
            <SelectTrigger className="w-[min(100%,11rem)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={String(WHOLE_YEAR)}>Ano inteiro</SelectItem>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={(i + 1).toString()}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={year.toString()}
            onValueChange={(v) => v && setYear(parseInt(v, 10))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <IntegracaoDashboardResumo />

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <SummaryCards
            summary={{
              totalReceitas,
              totalDespesas,
              saldo: totalReceitas - totalDespesas,
            }}
          />

          {trendLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <MonthlyComparisonChart
              data={yearTrend}
              title={`Receitas x despesas no ano ${year} (por mês)`}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CategoryChart
              data={despesasCategoryData}
              title="Despesas por categoria"
            />
            <CategoryChart
              data={receitasCategoryData}
              title="Receitas por categoria"
            />
            <PetWidget transactions={transactions} />
          </div>

          <RecentTransactions transactions={transactions} />
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}
