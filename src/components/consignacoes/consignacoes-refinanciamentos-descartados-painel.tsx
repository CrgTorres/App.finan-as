"use client";

import { Ban } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AVISO_CONTRATOS_UNICOS_CONSIGFACIL } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import type { RefinanciamentoDescartado } from "@/lib/consignacoes-governo/auditoria-contratos-unicos";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";

type Props = { itens: RefinanciamentoDescartado[] };

export function ConsignacoesRefinanciamentosDescartadosPainel({ itens }: Props) {
  if (itens.length === 0) return null;

  return (
    <Card className="border-amber-300/60 bg-amber-50/20 dark:bg-amber-950/15">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ban className="h-4 w-4" /> Refinanciamentos descartados (falso positivo)
        </CardTitle>
        <CardDescription>{AVISO_CONTRATOS_UNICOS_CONSIGFACIL}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-[11px] max-h-56 overflow-auto">
          {itens.map((r) => {
            const banco = resolverInstituicaoOficial(r.banco)?.nome_oficial ?? r.banco;
            return (
              <li
                key={`${r.contrato_origem}-${r.contrato_destino}`}
                className="rounded border p-2 bg-background"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{banco}</strong>
                  <span className="font-mono text-[10px]">{r.contrato_origem}</span>
                  <span>→</span>
                  <span className="font-mono text-[10px]">{r.contrato_destino}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {r.motivo}
                  </Badge>
                </div>
                {r.indicios_fracos.length > 0 && (
                  <p className="text-muted-foreground mt-1">
                    Indícios fracos ignorados: {r.indicios_fracos.join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
