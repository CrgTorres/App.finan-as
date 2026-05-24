import type { DashboardSummary } from "@/types";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";

interface SummaryCardsProps {
  summary: DashboardSummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const { totalReceitas, totalDespesas, saldo } = summary;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border dark:border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between pb-1.5">
          <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Receitas
          </CardTitle>
          <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight">
            {formatCurrency(totalReceitas)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Total do período</p>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border dark:border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between pb-1.5">
          <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Despesas
          </CardTitle>
          <div className="p-1.5 bg-red-50 dark:bg-red-950/50 rounded-lg">
            <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums tracking-tight">
            {formatCurrency(totalDespesas)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Total do período</p>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border dark:border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between pb-1.5">
          <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Saldo
          </CardTitle>
          <div
            className={`p-1.5 rounded-lg ${saldo >= 0 ? "bg-blue-50 dark:bg-blue-950/50" : "bg-orange-50 dark:bg-orange-950/50"}`}
          >
            <Wallet
              className={`h-3.5 w-3.5 ${saldo >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p
            className={`text-2xl font-bold tabular-nums tracking-tight ${saldo >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`}
          >
            {formatCurrency(saldo)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {saldo >= 0 ? "Saldo positivo" : "Saldo negativo"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
