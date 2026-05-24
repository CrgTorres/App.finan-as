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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BaseMargemConsignavel, ConsigfacilTipoMargem } from "@/types/consigfacil";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatarCompetenciaBr(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) return competencia;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

type MargemKey = NonNullable<ConsigfacilTipoMargem>;

const CORES: Record<MargemKey, string> = {
  margem_consignavel: "#2563eb",
  margem_cartao: "#a855f7",
  margem_cartao_beneficio: "#0ea5e9",
  outra: "#64748b",
  desconhecida: "#94a3b8",
};

export type ConsigfacilMargemGraficoProps = {
  series: BaseMargemConsignavel[];
};

/** Evolução do comprometimento da margem ao longo do tempo, por tipo. */
export function ConsigfacilMargemGrafico({ series }: ConsigfacilMargemGraficoProps) {
  type LinhaMargemGrafico = {
    competencia: string;
    margem_consignavel?: number;
    margem_cartao?: number;
    margem_cartao_beneficio?: number;
    outra?: number;
    desconhecida?: number;
  };
  // Modalidades sem margem (Contribuição → null) não entram na evolução.
  const seriesComMargem = useMemo(
    () => series.filter((s): s is typeof s & { tipo_margem: NonNullable<typeof s.tipo_margem> } => s.tipo_margem != null),
    [series],
  );

  const dados = useMemo<LinhaMargemGrafico[]>(() => {
    const map = new Map<string, LinhaMargemGrafico>();
    for (const s of seriesComMargem) {
      const row = map.get(s.competencia) ?? { competencia: s.competencia };
      row[s.tipo_margem] = s.percentual_comprometido;
      map.set(s.competencia, row);
    }
    return Array.from(map.values()).sort((a, b) => a.competencia.localeCompare(b.competencia));
  }, [seriesComMargem]);

  const tiposAtivos = useMemo(() => {
    const set = new Set<NonNullable<ConsigfacilTipoMargem>>();
    for (const s of seriesComMargem) set.add(s.tipo_margem);
    return Array.from(set);
  }, [seriesComMargem]);

  if (dados.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Margem consignável ao longo do tempo</CardTitle>
          <CardDescription>
            Importe múltiplos snapshots do ConsigFácil em datas diferentes para ver evolução.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Margem consignável — evolução / comprometimento</CardTitle>
        <CardDescription>
          % de margem usada por tipo. Subir continuamente sugere refinanciamentos sucessivos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="competencia" tickFormatter={formatarCompetenciaBr} fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <Tooltip
                formatter={(value, name) => [`${Number(value).toFixed(0)}%`, String(name)]}
                labelFormatter={(c) => formatarCompetenciaBr(String(c))}
              />
              <Legend />
              {tiposAtivos.map((t) => (
                <Area
                  key={t}
                  type="monotone"
                  dataKey={t}
                  name={t}
                  stroke={CORES[t]}
                  fill={CORES[t]}
                  fillOpacity={0.2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 tabular-nums">
          Util. mais recente:{" "}
          {tiposAtivos
            .map((t) => {
              const last = seriesComMargem.filter((s) => s.tipo_margem === t).slice(-1)[0];
              return last ? `${t}: ${brl(last.margem_utilizada)} (${last.percentual_comprometido.toFixed(0)}%)` : "";
            })
            .filter(Boolean)
            .join(" · ")}
        </p>
      </CardContent>
    </Card>
  );
}
