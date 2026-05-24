"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { PieChartIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConsignacaoOrdenadaLinha } from "@/lib/consignacoes-governo/consolidar-consignacoes-ordenadas";

const CORES = ["#2563eb", "#94a3b8", "#f59e0b", "#ef4444", "#8b5cf6"];

type Props = { linhas: ConsignacaoOrdenadaLinha[] };

export function ConsignacoesContratosAtivosQuitados({ linhas }: Props) {
  const dados = useMemo(() => {
    const acc = { ativo: 0, suspenso: 0, quitado: 0, outros: 0 };
    for (const l of linhas) {
      if (l.status_oficial === "ativo" || l.status_oficial === "em_averbacao") acc.ativo += 1;
      else if (l.status_oficial === "suspenso") acc.suspenso += 1;
      else if (l.status_oficial === "quitado") acc.quitado += 1;
      else acc.outros += 1;
    }
    return [
      { name: "Ativos", value: acc.ativo },
      { name: "Suspensos", value: acc.suspenso },
      { name: "Quitados", value: acc.quitado },
      { name: "Outros", value: acc.outros },
    ].filter((d) => d.value > 0);
  }, [linhas]);

  if (dados.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PieChartIcon className="h-4 w-4" /> Contratos ativos vs quitados
        </CardTitle>
        <CardDescription>Status oficial ConsigFácil por consignação.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={dados} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                {dados.map((_, i) => (
                  <Cell key={i} fill={CORES[i % CORES.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
