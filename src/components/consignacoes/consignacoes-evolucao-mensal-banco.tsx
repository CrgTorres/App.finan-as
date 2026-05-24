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
import { TrendingUp } from "lucide-react";
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

// Paleta determinística por banco — escolhe pelo hash do nome
const PALETA = [
  "#2563eb", "#a855f7", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#6366f1",
  "#22c55e", "#eab308", "#ec4899", "#06b6d4", "#84cc16",
];
function corBanco(nome: string): string {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}

type Props = { linhas: ConsignacaoOrdenadaLinha[] };

/**
 * Evolução mensal por banco (instituicao_oficial) — usa
 * `competencias_detectadas` × `valor_parcela_oficial` para reconstruir o
 * valor descontado mês-a-mês.
 */
export function ConsignacoesEvolucaoMensalBanco({ linhas }: Props) {
  const { dados, bancos } = useMemo(() => {
    const porComp = new Map<string, Record<string, number>>();
    const bancosSet = new Set<string>();
    for (const l of linhas) {
      const banco = l.instituicao_oficial;
      bancosSet.add(banco);
      // Se há competências detectadas, usamos o valor exato; senão usamos
      // start/end + valor_parcela_oficial.
      if (l.competencias_detectadas.length > 0 && l.valor_parcela_folha > 0) {
        for (const c of l.competencias_detectadas) {
          const row = porComp.get(c) ?? {};
          row[banco] = (row[banco] ?? 0) + l.valor_parcela_folha;
          porComp.set(c, row);
        }
      } else if (l.primeiro_desconto && l.ultimo_desconto) {
        // Reconstrói meses entre primeiro e ultimo
        const [ya, ma] = l.primeiro_desconto.split("-").map(Number);
        const [yb, mb] = l.ultimo_desconto.split("-").map(Number);
        let y = ya, m = ma;
        const safetyMax = 600;
        let n = 0;
        while ((y < yb || (y === yb && m <= mb)) && n < safetyMax) {
          const comp = `${y}-${String(m).padStart(2, "0")}`;
          const row = porComp.get(comp) ?? {};
          row[banco] = (row[banco] ?? 0) + l.valor_parcela_oficial;
          porComp.set(comp, row);
          m += 1;
          if (m > 12) {
            m = 1;
            y += 1;
          }
          n += 1;
        }
      }
    }
    const dados = Array.from(porComp.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([competencia, valores]) => ({ competencia, ...valores }));
    return { dados, bancos: Array.from(bancosSet).sort() };
  }, [linhas]);

  if (dados.length === 0 || bancos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Evolução mensal por banco
          </CardTitle>
          <CardDescription>Sem dados no recorte atual.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Evolução mensal por banco
        </CardTitle>
        <CardDescription>
          Valor descontado por <strong>instituicao_oficial</strong> e competência.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dados} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="competencia"
                tickFormatter={formatarCompetenciaBr}
                fontSize={11}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tickFormatter={(v: number) => brl(Number(v))}
                fontSize={11}
                stroke="hsl(var(--muted-foreground))"
                width={70}
              />
              <Tooltip
                formatter={(value, name) => [brl(Number(value) || 0), String(name)]}
                labelFormatter={(l) => formatarCompetenciaBr(String(l ?? ""))}
              />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
              {bancos.map((b) => (
                <Area
                  key={b}
                  type="monotone"
                  dataKey={b}
                  stackId="1"
                  stroke={corBanco(b)}
                  fill={corBanco(b)}
                  fillOpacity={0.65}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
