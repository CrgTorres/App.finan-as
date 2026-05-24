"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConsignacaoOrdenadaLinha } from "@/lib/consignacoes-governo/consolidar-consignacoes-ordenadas";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const PALETA = [
  "#2563eb", "#a855f7", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#6366f1",
];

type Props = { linhas: ConsignacaoOrdenadaLinha[] };

/** Bar chart horizontal — totaliza `valor_total_pago_estimado` por banco oficial. */
export function ConsignacoesTotalPagoBanco({ linhas }: Props) {
  const dados = useMemo(() => {
    const acc = new Map<string, number>();
    for (const l of linhas) {
      acc.set(l.instituicao_oficial, (acc.get(l.instituicao_oficial) ?? 0) + l.valor_total_pago_estimado);
    }
    return Array.from(acc.entries())
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([instituicao_oficial, total]) => ({ instituicao_oficial, total }));
  }, [linhas]);

  if (dados.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Total pago por banco
          </CardTitle>
          <CardDescription>
            Sem descontos observados — importe contracheques/extratos com descontos para visualizar.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Total pago por banco
        </CardTitle>
        <CardDescription>
          Soma de <strong>valor_total_pago_estimado</strong> agrupada por{" "}
          <strong>instituicao_oficial</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                tickFormatter={(v: number) => brl(Number(v))}
                fontSize={11}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                type="category"
                dataKey="instituicao_oficial"
                fontSize={10}
                stroke="hsl(var(--muted-foreground))"
                width={160}
              />
              <Tooltip
                formatter={(value, name) => [brl(Number(value) || 0), String(name)]}
              />
              <Bar dataKey="total" fill={PALETA[0]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
