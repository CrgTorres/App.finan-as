"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaction, CategoryTotal } from "@/types";
import { MONTHS } from "@/lib/constants";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const now = new Date();
const currentYear = now.getFullYear();
const years = [currentYear - 1, currentYear, currentYear + 1];

export default function DashboardPage() {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(currentYear);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

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
  }, [fetchTransactions]);

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
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Resumo financeiro de {MONTHS[month - 1]} {year}
          </p>
        </div>

        <div className="flex gap-2">
          <Select
            value={month.toString()}
            onValueChange={(v) => v && setMonth(parseInt(v))}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={(i + 1).toString()}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={year.toString()}
            onValueChange={(v) => v && setYear(parseInt(v))}
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CategoryChart
              data={despesasCategoryData}
              title="Despesas por categoria"
            />
            <CategoryChart
              data={receitasCategoryData}
              title="Receitas por categoria"
            />
          </div>

          <RecentTransactions transactions={transactions} />
        </>
      )}
    </div>
  );
}
