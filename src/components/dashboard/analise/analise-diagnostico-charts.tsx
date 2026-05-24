"use client";

import { useMemo } from "react";
import type { PadroesConsumoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { AuditoriaChartCard } from "@/components/dashboard/analise/premium";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Percent } from "lucide-react";

function fmtK(v: number) {
  return `${(v / 1000).toFixed(0)}k`;
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

type TooltipRow = {
  name?: string;
  value?: unknown;
  dataKey?: string | number;
};

function formatTooltipValue(row: TooltipRow): string {
  const v = row.value;
  if (row.dataKey === "pct" && typeof v === "number") {
    return `${v.toFixed(1)}%`;
  }
  if (typeof v === "number") {
    return formatBRL(v);
  }
  return v != null ? String(v) : "";
}

function PremiumTooltip(props: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string | number;
}) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0F1724]/95 px-3 py-2.5 text-xs shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md">
      {label != null && label !== "" ? (
        <p className="mb-1.5 font-semibold text-[#E5E7EB]">{String(label)}</p>
      ) : null}
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={String(p.name ?? p.dataKey)} className="flex items-center justify-between gap-4 text-[11px]">
            <span className="text-[#94A3B8]">{p.name ?? p.dataKey}</span>
            <span className="font-semibold tabular-nums text-[#E5E7EB]">{formatTooltipValue(p)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnaliseDiagnosticoCharts({ padroes }: { padroes: PadroesConsumoAnalise }) {
  const dadosDescontosAno = useMemo(
    () => padroes.porAno.map((a) => ({ ano: String(a.ano), emprestimos: a.emprestimos })),
    [padroes.porAno],
  );

  const dadosComprometimento = useMemo(() => {
    return padroes.porMes
      .filter((m) => m.pctEmprestimoGanhos != null)
      .map((m) => ({
        ref: m.competencia.replace("-", "/"),
        pct: Math.min(100, m.pctEmprestimoGanhos ?? 0),
      }));
  }, [padroes.porMes]);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <AuditoriaChartCard
        index={0}
        title="Empréstimos por ano"
        subtitle="Soma anual apenas das rubricas classificadas como empréstimo/consignado."
        icon={BarChart3}
        className="min-w-0"
      >
        {dadosDescontosAno.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">Sem série anual.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosDescontosAno} margin={{ top: 10, right: 6, left: 2, bottom: 4 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} strokeOpacity={0.45} />
              <XAxis dataKey="ano" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickFormatter={fmtK}
                width={36}
              />
              <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<PremiumTooltip />} />
              <Bar dataKey="emprestimos" fill="var(--chart-2)" radius={[6, 6, 0, 0]} name="Empréstimos" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </AuditoriaChartCard>

      <AuditoriaChartCard
        index={1}
        title="Comprometimento (empr. ÷ ganhos)"
        subtitle="Evolução mensal em que há ganhos mensuráveis na base."
        icon={Percent}
        className="min-w-0"
      >
        {dadosComprometimento.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">Sem pontos com % calculável.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dadosComprometimento} margin={{ top: 10, right: 6, left: 2, bottom: 4 }}>
              <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.45} />
              <XAxis
                dataKey="ref"
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                domain={[0, "auto"]}
                width={32}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip cursor={{ stroke: "rgba(148,163,184,0.25)", strokeWidth: 1 }} content={<PremiumTooltip />} />
              <Line
                type="monotone"
                dataKey="pct"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: "var(--primary)" }}
                activeDot={{ r: 5 }}
                animationDuration={900}
                isAnimationActive
                name="% empr./ganhos"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </AuditoriaChartCard>
    </div>
  );
}
