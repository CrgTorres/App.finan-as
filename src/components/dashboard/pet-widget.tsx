"use client";

import { useEffect, useState } from "react";
import { PawPrint, Plus, X } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import type { Transaction } from "@/types";

interface PetWidgetProps {
  transactions: Transaction[];
}

const PET_COLOR = "#f472b6";
const REST_COLOR = "#e2e8f0";

export function PetWidget({ transactions }: PetWidgetProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    setEnabled(localStorage.getItem("pets_enabled") === "true");
  }, []);

  function activate() {
    localStorage.setItem("pets_enabled", "true");
    setEnabled(true);
  }

  function deactivate() {
    localStorage.setItem("pets_enabled", "false");
    setEnabled(false);
  }

  // Evita flash de hidratação
  if (enabled === null) return null;

  const petDespesas = transactions.filter(
    (t) => t.category === "Pets" && t.type === "despesa"
  );
  const totalPets = petDespesas.reduce((acc, t) => acc + t.amount, 0);
  const totalDespesas = transactions
    .filter((t) => t.type === "despesa")
    .reduce((acc, t) => acc + t.amount, 0);

  const pctPets =
    totalDespesas > 0 ? ((totalPets / totalDespesas) * 100).toFixed(1) : "0";

  const chartData =
    totalPets > 0
      ? [
          { name: "Pets", value: totalPets, color: PET_COLOR },
          {
            name: "Demais despesas",
            value: Math.max(0, totalDespesas - totalPets),
            color: REST_COLOR,
          },
        ]
      : [{ name: "Sem gastos", value: 1, color: REST_COLOR }];

  /* ── Estado DESATIVADO ── */
  if (!enabled) {
    return (
      <Card className="border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 shadow-none">
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="p-3 bg-pink-50 dark:bg-pink-950/40 rounded-full">
            <PawPrint className="h-6 w-6 text-pink-400" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Gastos com Pets
            </p>
            <p className="text-xs text-slate-400">
              Você tem animais de estimação?
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={activate}
            className="gap-1.5 mt-1 border-pink-200 text-pink-600 hover:bg-pink-50 hover:border-pink-300 dark:border-pink-800 dark:text-pink-400 dark:hover:bg-pink-950/40"
          >
            <Plus className="h-3.5 w-3.5" />
            Ativar categoria Pets
          </Button>
        </CardContent>
      </Card>
    );
  }

  /* ── Estado ATIVADO ── */
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-1.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-pink-50 dark:bg-pink-950/40 rounded-lg">
            <PawPrint className="h-3.5 w-3.5 text-pink-500" />
          </div>
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Pets
          </CardTitle>
        </div>
        <button
          onClick={deactivate}
          title="Desativar"
          className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </CardHeader>

      <CardContent className="pt-0">
        <p className="text-2xl font-bold text-pink-600 tabular-nums tracking-tight">
          {formatCurrency(totalPets)}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {petDespesas.length === 0
            ? "Nenhuma despesa com Pets no período"
            : `${petDespesas.length} despesa(s) · ${pctPets}% do total`}
        </p>

        {/* Gráfico de rosca */}
        <div className="relative mt-3">
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={58}
                paddingAngle={totalPets > 0 ? 3 : 0}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              {totalPets > 0 && (
                <Tooltip
                  formatter={(value) =>
                    [formatCurrency(Number(value)), ""] as [string, string]
                  }
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                />
              )}
            </PieChart>
          </ResponsiveContainer>

          {/* Valor central */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[11px] font-semibold text-pink-500">
              {pctPets}%
            </span>
            <span className="text-[10px] text-slate-400">das despesas</span>
          </div>
        </div>

        {petDespesas.length === 0 && (
          <p className="text-[11px] text-slate-400 text-center -mt-1 italic">
            Selecione &quot;Pets&quot; ao adicionar uma transação
          </p>
        )}
      </CardContent>
    </Card>
  );
}
