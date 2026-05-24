"use client";

import { useMemo } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConsignacaoOrdenadaLinha } from "@/lib/consignacoes-governo/consolidar-consignacoes-ordenadas";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatarCompetenciaBr(c: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(c);
  if (!m) return c;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

type Props = { linhas: ConsignacaoOrdenadaLinha[] };

/**
 * Crescimento acumulado da dívida consignada — soma mensal de parcelas
 * oficiais (exclui cartão benefício quando marcado separado).
 */
export function ConsignacoesCrescimentoDivida({ linhas }: Props) {
  const dados = useMemo(() => {
    const porComp = new Map<string, number>();
    for (const l of linhas) {
      if (l.eh_cartao_beneficio) continue; // não somar com empréstimo comum
      const comps =
        l.competencias_detectadas.length > 0
          ? l.competencias_detectadas
          : l.primeiro_desconto
            ? [l.primeiro_desconto]
            : [];
      const v = l.valor_parcela_oficial;
      for (const c of comps) {
        porComp.set(c, (porComp.get(c) ?? 0) + v);
      }
    }
    let acum = 0;
    return Array.from(porComp.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([competencia, mensal]) => {
        acum += mensal;
        return { competencia, mensal, acumulado: acum };
      });
  }, [linhas]);

  if (dados.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown className="h-4 w-4" /> Crescimento da dívida consignada
        </CardTitle>
        <CardDescription>
          Parcela mensal e total acumulado pago (estimado) — exclui cartão benefício.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="competencia" tickFormatter={formatarCompetenciaBr} fontSize={10} />
              <YAxis tickFormatter={(v: number) => brl(Number(v))} fontSize={10} width={70} />
              <Tooltip
                formatter={(value, name) => [brl(Number(value) || 0), String(name)]}
                labelFormatter={(l) => formatarCompetenciaBr(String(l ?? ""))}
              />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
              <Line type="monotone" dataKey="mensal" stroke="#2563eb" name="Mensal" dot={false} />
              <Line type="monotone" dataKey="acumulado" stroke="#7c3aed" name="Acumulado" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
