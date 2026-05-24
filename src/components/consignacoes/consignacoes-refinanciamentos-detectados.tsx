"use client";

import { RefreshCw, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ConsigfacilContrato, ConsigfacilRefinanciamento } from "@/types/consigfacil";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

type Props = {
  refinanciamentos: ConsigfacilRefinanciamento[];
  contratos: ConsigfacilContrato[];
};

/** Cards visuais — não usa Recharts porque cada item é mais textual que numérico. */
export function ConsignacoesRefinanciamentosDetectados({ refinanciamentos, contratos }: Props) {
  if (refinanciamentos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Refinanciamentos detectados
          </CardTitle>
          <CardDescription>
            Nenhum refinanciamento foi marcado automaticamente. O detector exige 3+ indícios,
            incluindo pelo menos 1 forte oficial (suspenso/quitado/substituição/vínculo no portal).
            Mesmo banco, data próxima ou parcela parecida, isolados, não bastam.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const byId = new Map(contratos.map((c) => [c.id_consignacao, c]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Refinanciamentos detectados
        </CardTitle>
        <CardDescription>
          {refinanciamentos.length} caso(s) detectado(s) com base nos indícios oficiais ConsigFácil.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {refinanciamentos.map((r) => {
            const origem = byId.get(r.contrato_origem);
            const destino = byId.get(r.contrato_destino);
            const banco = resolverInstituicaoOficial(r.banco)?.nome_oficial ?? r.banco;
            return (
              <div
                key={`${r.contrato_origem}-${r.contrato_destino}`}
                className="rounded-md border p-3 bg-purple-50/30 dark:bg-purple-950/20 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <strong className="text-sm">{banco}</strong>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {r.tipo_refinanciamento}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      confiança {r.grau_confianca}/100
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
                  <div className="rounded border p-2 bg-background">
                    <p className="text-muted-foreground">Contrato anterior</p>
                    <p className="font-mono truncate" title={r.contrato_origem}>
                      {r.contrato_origem}
                    </p>
                    {origem && (
                      <>
                        <p>{brl(origem.valor_parcela)}</p>
                        <p className="text-muted-foreground">
                          {origem.parcela_atual}/{origem.parcelas_total} · {origem.status}
                        </p>
                      </>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-purple-600" />
                  <div className="rounded border p-2 bg-background">
                    <p className="text-muted-foreground">Contrato novo</p>
                    <p className="font-mono truncate" title={r.contrato_destino}>
                      {r.contrato_destino}
                    </p>
                    {destino && (
                      <>
                        <p>{brl(destino.valor_parcela)}</p>
                        <p className="text-muted-foreground">
                          {destino.parcela_atual}/{destino.parcelas_total} · {destino.status}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-[11px]">
                  <p className="text-muted-foreground">
                    Distância: <strong>{r.distancia_dias} dia(s)</strong>
                  </p>
                  {r.evidencias_refinanciamento.length > 0 && (
                    <div className="mt-1">
                      <p className="text-muted-foreground">Indícios usados:</p>
                      <ul className="list-disc list-inside">
                        {r.evidencias_refinanciamento.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
