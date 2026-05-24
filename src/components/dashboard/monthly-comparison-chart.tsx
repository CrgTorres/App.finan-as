"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface MonthlyComparisonRow {
  key: string;
  label: string;
  receitas: number;
  despesas: number;
}

interface MonthlyComparisonChartProps {
  data: MonthlyComparisonRow[];
  title?: string;
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function MonthlyComparisonChart({ data, title }: MonthlyComparisonChartProps) {
  if (!data.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Sem transações no período para montar o gráfico.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
      {title && (
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      )}
      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-slate-500" />
            <YAxis
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10 }}
              className="fill-slate-500"
              width={36}
            />
            <Tooltip
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value) || 0;
                const label = name === "receitas" ? "Receitas" : "Despesas";
                return [formatBRL(n), label];
              }}
              labelClassName="text-slate-700 dark:text-slate-200"
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid rgb(226 232 240)",
                fontSize: "12px",
              }}
            />
            <Legend
              formatter={(value) => (value === "receitas" ? "Receitas" : "Despesas")}
              wrapperStyle={{ fontSize: "12px" }}
            />
            <Bar dataKey="receitas" name="receitas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="despesas" name="despesas" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
