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
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            Receitas
          </CardTitle>
          <div className="p-2 bg-emerald-50 rounded-lg">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-emerald-600">
            {formatCurrency(totalReceitas)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Total do período</p>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            Despesas
          </CardTitle>
          <div className="p-2 bg-red-50 rounded-lg">
            <TrendingDown className="h-4 w-4 text-red-600" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-red-600">
            {formatCurrency(totalDespesas)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Total do período</p>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            Saldo
          </CardTitle>
          <div
            className={`p-2 rounded-lg ${saldo >= 0 ? "bg-blue-50" : "bg-orange-50"}`}
          >
            <Wallet
              className={`h-4 w-4 ${saldo >= 0 ? "text-blue-600" : "text-orange-600"}`}
            />
          </div>
        </CardHeader>
        <CardContent>
          <p
            className={`text-2xl font-bold ${saldo >= 0 ? "text-blue-600" : "text-orange-600"}`}
          >
            {formatCurrency(saldo)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {saldo >= 0 ? "Saldo positivo" : "Saldo negativo"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
