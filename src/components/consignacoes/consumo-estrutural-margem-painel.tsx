"use client";

import { lazy, useDeferredValue, useMemo } from "react";
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
import { CreditCard, Layers, PiggyBank, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PacoteConsumoEstruturalMargem } from "@/lib/consignacoes-governo/consumo-estrutural-margem";

const HeatmapConsumoCamadas = lazy(() =>
  import("@/components/consignacoes/heatmap-consumo-camadas-margem").then((m) => ({
    default: m.HeatmapConsumoCamadasMargem,
  })),
);

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatarComp(c: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(c);
  if (!m) return c;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1]}/${m[1].slice(2)}`;
}

type Props = {
  pacote: PacoteConsumoEstruturalMargem;
};

export function ConsumoEstruturalMargemPainel({ pacote }: Props) {
  const deferred = useDeferredValue(pacote);
  const vigente = deferred.resumo[deferred.resumo.length - 1];

  const dadosBarras = useMemo(() => {
    if (!vigente) return [];
    return [
      {
        camada: "Consignável",
        percentual: vigente.consignavel_percentual,
        usado: vigente.consignavel_usado,
        total: vigente.consignavel_total,
        cor: "#2563eb",
      },
      {
        camada: "Cartão",
        percentual: vigente.cartao_percentual,
        usado: vigente.cartao_usado,
        total: vigente.cartao_total,
        cor: "#a855f7",
      },
      {
        camada: "Benefício",
        percentual: vigente.beneficio_percentual,
        usado: vigente.beneficio_usado,
        total: vigente.beneficio_total,
        cor: "#0ea5e9",
      },
    ];
  }, [vigente]);

  if (deferred.resumo.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <Card className="border-violet-300/30 bg-violet-50/10 dark:bg-violet-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" /> Consumo estrutural da margem
          </CardTitle>
          <CardDescription>
            Três camadas independentes — consignável, cartão e cartão benefício não são somadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {vigente && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription className="flex items-center gap-1 text-[11px]">
                    <Wallet className="h-3 w-3" /> Consignável usada
                  </CardDescription>
                  <CardTitle className="text-base tabular-nums">
                    {vigente.consignavel_percentual.toFixed(1)}%
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-[10px] text-muted-foreground pt-0">
                  {brl(vigente.consignavel_usado)} / {brl(vigente.consignavel_total)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription className="flex items-center gap-1 text-[11px]">
                    <CreditCard className="h-3 w-3" /> Cartão usada
                  </CardDescription>
                  <CardTitle className="text-base tabular-nums">
                    {vigente.cartao_percentual.toFixed(1)}%
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-[10px] text-muted-foreground pt-0">
                  {brl(vigente.cartao_usado)} / {brl(vigente.cartao_total)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription className="flex items-center gap-1 text-[11px]">
                    <PiggyBank className="h-3 w-3" /> Benefício usada
                  </CardDescription>
                  <CardTitle className="text-base tabular-nums">
                    {vigente.beneficio_percentual.toFixed(1)}%
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-[10px] text-muted-foreground pt-0">
                  {brl(vigente.beneficio_usado)} / {brl(vigente.beneficio_total)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription className="text-[11px]">Reservas ativas</CardDescription>
                  <CardTitle className="text-base tabular-nums">{vigente.reservas_ativas}</CardTitle>
                </CardHeader>
                <CardContent className="text-[10px] text-muted-foreground pt-0">
                  {formatarComp(vigente.competencia)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription className="text-[11px]">Fracionados</CardDescription>
                  <CardTitle className="text-base tabular-nums">
                    {vigente.contratos_fracionados}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-[10px] text-muted-foreground pt-0">
                  Suspensos: {vigente.contratos_suspensos}
                </CardContent>
              </Card>
            </div>
          )}

          {dadosBarras.length > 0 && (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosBarras} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="camada" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v, _n, item) => {
                      const usado = (item?.payload as { usado?: number })?.usado ?? 0;
                      const num = typeof v === "number" ? v : Number(v);
                      return [`${num.toFixed(1)}% (${brl(usado)})`, "% da camada"];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="percentual" name="% consumo da camada" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-muted-foreground text-center mt-1">
                Barras separadas por camada — não empilhadas (capacidades independentes).
              </p>
            </div>
          )}

          {deferred.insights.length > 0 && (
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
              {deferred.insights.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-[10px]">
              Pressão geral: {vigente?.nivel_pressao_geral ?? "—"}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {deferred.linhas.length} linhas de consumo
            </Badge>
          </div>
        </CardContent>
      </Card>

      <HeatmapConsumoCamadas resumos={deferred.resumo} />
    </section>
  );
}
