"use client";

import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AVISO_CONTRATOS_UNICOS_CONSIGFACIL } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import type { ContratoUnicoConfirmado } from "@/lib/consignacoes-governo/auditoria-contratos-unicos";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

type Props = { contratos: ContratoUnicoConfirmado[] };

export function ConsignacoesContratosUnicosPainel({ contratos }: Props) {
  if (contratos.length === 0) return null;

  return (
    <Card className="border-sky-300/60 bg-sky-50/30 dark:bg-sky-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Contratos únicos confirmados
        </CardTitle>
        <CardDescription>{AVISO_CONTRATOS_UNICOS_CONSIGFACIL}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-[11px] max-h-64 overflow-auto">
          {contratos.map((c) => (
            <li key={c.id_consignacao} className="rounded border p-2 bg-background">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{c.banco}</strong>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {c.codigo_oficial}
                </Badge>
                <span className="tabular-nums">{brl(c.valor_parcela)}</span>
                <span className="text-muted-foreground">
                  {c.parcela_atual}/{c.parcelas_total} parcelas
                </span>
                <Badge className="text-[10px] bg-sky-600">nao_refinanciamento_confirmado</Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {c.motivo}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
