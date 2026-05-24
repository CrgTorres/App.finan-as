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
import { CreditCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConsignacaoOrdenadaLinha } from "@/lib/consignacoes-governo/consolidar-consignacoes-ordenadas";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

type Props = { linhas: ConsignacaoOrdenadaLinha[] };

/** RMC / RCC / cartão benefício / cartão crédito — por `instituicao_oficial`. */
export function ConsignacoesRmcRccPorBanco({ linhas }: Props) {
  const dados = useMemo(() => {
    const map = new Map<
      string,
      { instituicao_oficial: string; rmc: number; rcc: number; cartao_beneficio: number; cartao_credito: number }
    >();
    for (const l of linhas) {
      const row = map.get(l.instituicao_oficial) ?? {
        instituicao_oficial: l.instituicao_oficial,
        rmc: 0,
        rcc: 0,
        cartao_beneficio: 0,
        cartao_credito: 0,
      };
      const v = l.valor_parcela_oficial;
      if (l.eh_rmc) row.rmc += v;
      else if (l.eh_rcc) row.rcc += v;
      else if (l.eh_cartao_beneficio) row.cartao_beneficio += v;
      else if (l.eh_cartao || l.grupo_canonico === "cartao_credito") row.cartao_credito += v;
      map.set(l.instituicao_oficial, row);
    }
    return Array.from(map.values()).filter(
      (r) => r.rmc > 0 || r.rcc > 0 || r.cartao_beneficio > 0 || r.cartao_credito > 0,
    );
  }, [linhas]);

  if (dados.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" /> RMC / RCC / cartão por banco
        </CardTitle>
        <CardDescription>
          Separado por <strong>instituicao_oficial</strong> — nunca mistura com empréstimo comum.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="instituicao_oficial" fontSize={9} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis tickFormatter={(v: number) => brl(Number(v))} fontSize={10} width={70} />
              <Tooltip formatter={(value, name) => [brl(Number(value) || 0), String(name)]} />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
              <Bar dataKey="rmc" stackId="c" fill="#ef4444" />
              <Bar dataKey="rcc" stackId="c" fill="#dc2626" />
              <Bar dataKey="cartao_beneficio" stackId="c" fill="#0ea5e9" />
              <Bar dataKey="cartao_credito" stackId="c" fill="#a855f7" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
