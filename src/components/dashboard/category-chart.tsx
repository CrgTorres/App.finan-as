"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { CategoryTotal } from "@/types";
import { CATEGORY_COLORS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CategoryChartProps {
  data: CategoryTotal[];
  title: string;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{payload[0].name}</p>
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
          {formatCurrency(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

export function CategoryChart({ data, title }: CategoryChartProps) {
  if (data.length === 0) {
    return (
      <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border dark:border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12 text-slate-400 dark:text-slate-500 text-sm">
          Nenhum dado disponível
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    name: d.category,
    value: d.total,
    color: CATEGORY_COLORS[d.category],
  }));

  return (
    <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border dark:border-slate-700">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span className="text-xs text-slate-600 dark:text-slate-300">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
