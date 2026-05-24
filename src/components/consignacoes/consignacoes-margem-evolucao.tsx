"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Gauge } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MargemHistorica } from "@/lib/consignacoes-governo/margem-historica-unificada";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatarCompetenciaBr(c: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(c);
  if (!m) return c;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

const CORES: Record<string, string> = {
  consignavel: "#2563eb",
  cartao: "#a855f7",
  cartao_beneficio: "#0ea5e9",
};

type Props = { margemHistorica: MargemHistorica[] };

export function ConsignacoesMargemEvolucao({ margemHistorica }: Props) {
  const { dados, tipos } = useMemo(() => {
    type LinhaMargem = { competencia: string } & Record<string, number | string>;
    const porComp = new Map<string, LinhaMargem>();
    const tiposSet = new Set<string>();
    for (const m of margemHistorica) {
      tiposSet.add(m.tipo_margem);
      const row: LinhaMargem = porComp.get(m.competencia) ?? { competencia: m.competencia };
      row[`${m.tipo_margem}_utilizada`] = m.margem_utilizada;
      row[`${m.tipo_margem}_pct`] = m.percentual_comprometido;
      porComp.set(m.competencia, row);
    }
    return {
      dados: Array.from(porComp.values()).sort((a, b) =>
        a.competencia.localeCompare(b.competencia),
      ),
      tipos: Array.from(tiposSet),
    };
  }, [margemHistorica]);

  if (dados.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Evolução da margem
          </CardTitle>
          <CardDescription>Importe margens do ConsigFácil para visualizar.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-4 w-4" /> Evolução da margem consignável
        </CardTitle>
        <CardDescription>
          Margem utilizada por tipo (consignável / cartão / cartão benefício) — fonte oficial.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="competencia" tickFormatter={formatarCompetenciaBr} fontSize={10} />
              <YAxis tickFormatter={(v: number) => brl(Number(v))} fontSize={10} width={70} />
              <Tooltip
                formatter={(value, name) => [brl(Number(value) || 0), String(name)]}
                labelFormatter={(l) => formatarCompetenciaBr(String(l ?? ""))}
              />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
              {tipos.map((t) => (
                <Area
                  key={t}
                  type="monotone"
                  dataKey={`${t}_utilizada`}
                  stackId="1"
                  stroke={CORES[t] ?? "#64748b"}
                  fill={CORES[t] ?? "#64748b"}
                  fillOpacity={0.6}
                  name={t}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
