"use client";

import { useMemo } from "react";
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
import { Layers } from "lucide-react";
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

// Mapeamento canônico → cor (separa empréstimo / cartão benefício / cartão de crédito / contribuição / RMC-RCC / saque)
const CORES_GRUPO: Record<string, string> = {
  emprestimo_consignado: "#2563eb",
  cartao_beneficio: "#0ea5e9",
  cartao_credito: "#a855f7",
  contribuicao: "#64748b",
  rmc: "#ef4444",
  rcc: "#dc2626",
  saque_complementar: "#f97316",
  refinanciamentos: "#7c3aed",
  seguros: "#f43f5e",
  outros: "#94a3b8",
};

const ORDEM_GRUPOS = [
  "emprestimo_consignado",
  "cartao_beneficio",
  "cartao_credito",
  "contribuicao",
  "rmc",
  "rcc",
  "saque_complementar",
  "refinanciamentos",
  "seguros",
  "outros",
];

type Props = { linhas: ConsignacaoOrdenadaLinha[] };

export function ConsignacoesModalidadesPorMes({ linhas }: Props) {
  const { dados, grupos } = useMemo(() => {
    const porComp = new Map<string, Record<string, number>>();
    const gruposVistos = new Set<string>();
    for (const l of linhas) {
      const grupo = l.grupo_canonico;
      gruposVistos.add(grupo);
      const valor = l.valor_parcela_folha > 0 ? l.valor_parcela_folha : l.valor_parcela_oficial;
      const comps =
        l.competencias_detectadas.length > 0
          ? l.competencias_detectadas
          : l.primeiro_desconto
            ? [l.primeiro_desconto]
            : [];
      for (const c of comps) {
        const row = porComp.get(c) ?? {};
        row[grupo] = (row[grupo] ?? 0) + valor;
        porComp.set(c, row);
      }
    }
    const dados = Array.from(porComp.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([competencia, valores]) => ({ competencia, ...valores }));
    const grupos = ORDEM_GRUPOS.filter((g) => gruposVistos.has(g));
    return { dados, grupos };
  }, [linhas]);

  if (dados.length === 0 || grupos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> Modalidades por mês
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
          <Layers className="h-4 w-4" /> Modalidades por mês
        </CardTitle>
        <CardDescription>
          Composição por <strong>grupo_canonico</strong> — empréstimo, cartão benefício, cartão de
          crédito, contribuição, RMC/RCC, etc.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
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
              {grupos.map((g) => (
                <Bar
                  key={g}
                  dataKey={g}
                  stackId="modalidades"
                  fill={CORES_GRUPO[g] ?? "#94a3b8"}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
