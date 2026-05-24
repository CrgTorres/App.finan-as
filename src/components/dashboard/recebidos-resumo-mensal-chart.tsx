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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResumoMensalRecebidosRow } from "@/lib/receitas/normalizar-recebidos";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatarCompetenciaBr(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) return competencia;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

export type RecebidosResumoMensalChartProps = {
  resumoMensal: ResumoMensalRecebidosRow[];
};

/**
 * Dois totais separados por mês — nunca somados entre si:
 * - `recebido_bruto_contracheque` → composição da folha (rubricas).
 * - `total_recebido_para_fluxo_caixa` → entradas bancárias reais.
 */
export function RecebidosResumoMensalChart({ resumoMensal }: RecebidosResumoMensalChartProps) {
  const dados = resumoMensal
    .slice()
    .sort((a, b) => a.competencia.localeCompare(b.competencia))
    .map((r) => ({
      competencia: r.competencia,
      recebido_bruto_contracheque: r.recebido_bruto_contracheque,
      total_recebido_para_fluxo_caixa: r.total_recebido_para_fluxo_caixa,
    }));

  if (!dados.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recebido bruto vs. fluxo de caixa</CardTitle>
          <CardDescription>Sem dados no Resumo_Mensal.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recebido bruto vs. fluxo de caixa real</CardTitle>
        <CardDescription>
          Barras lado a lado — bruto da folha (rubricas) e total bancário. Não são somados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="competencia" tickFormatter={formatarCompetenciaBr} fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => brl(Number(v))} />
              <Tooltip
                formatter={(value, name) => [brl(Number(value) || 0), String(name)]}
                labelFormatter={(c) => formatarCompetenciaBr(String(c))}
              />
              <Legend />
              <Bar
                dataKey="recebido_bruto_contracheque"
                name="Bruto contracheque"
                fill="#2563eb"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="total_recebido_para_fluxo_caixa"
                name="Fluxo de caixa real"
                fill="#0ea5e9"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
