"use client";

import { Split } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DescontoFracionadoConciliado } from "@/lib/consignacoes-governo/aplicar-auditoria-consigfacil";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

type Props = { itens: DescontoFracionadoConciliado[] };

export function ConsignacoesDescontosFracionadosPainel({ itens }: Props) {
  if (itens.length === 0) return null;

  return (
    <Card className="border-teal-300/60 bg-teal-50/30 dark:bg-teal-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Split className="h-4 w-4" /> Descontos fracionados conciliados
        </CardTitle>
        <CardDescription>
          Mesmo código/rubrica repetida no contracheque — soma dos descontos quebrados igual à
          parcela oficial ConsigFácil (margem acima de 30%, ajuste operacional).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-[11px] max-h-72 overflow-auto">
          {itens.map((d, i) => (
            <li
              key={`${d.id_consignacao}-${d.competencia}-${i}`}
              className="rounded border p-2 bg-background"
            >
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="outline">{d.competencia}</Badge>
                <strong>{d.banco}</strong>
                <Badge className="bg-teal-600 text-[10px]">{d.status}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">Rubricas: {d.rubricas_encontradas || "—"}</p>
              <p>
                Quebrados: {d.valores_quebrados} = <strong>{brl(d.soma_total)}</strong> · Oficial:{" "}
                <strong>{brl(d.parcela_oficial)}</strong> · Δ {brl(d.diferenca)} ({d.percentual_diferenca}
                %)
              </p>
              <p className="italic text-muted-foreground mt-0.5">{d.motivo}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
