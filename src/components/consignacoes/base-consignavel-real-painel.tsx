"use client";

import { useDeferredValue, useMemo } from "react";
import { Calculator, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BaseConsignavelReal } from "@/lib/consignacoes-governo/calcular-base-consignavel-real";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

const COR_CONFIANCA: Record<BaseConsignavelReal["confianca_calculo"], string> = {
  alta: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  media: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  baixa: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

type Props = {
  bases: BaseConsignavelReal[];
  vigente?: BaseConsignavelReal | null;
};

export function BaseConsignavelRealPainel({ bases, vigente }: Props) {
  const deferred = useDeferredValue(bases);
  const b = useDeferredValue(vigente ?? deferred[deferred.length - 1] ?? null);

  const historico = useMemo(
    () => [...deferred].sort((a, c) => a.competencia.localeCompare(c.competencia)).slice(-6),
    [deferred],
  );

  if (!b) return null;

  return (
    <Card className="border-emerald-300/40 bg-emerald-50/10 dark:bg-emerald-950/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4" /> Base consignável real — {b.competencia}
        </CardTitle>
        <CardDescription>
          Esta base não é o salário líquido. É a base consignável estimada conforme rubricas
          elegíveis, descontos obrigatórios (IR, Amazon Prev, pensão/manutenção) e calibração pelo
          ConsigFácil quando disponível.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge className={COR_CONFIANCA[b.confianca_calculo]}>Confiança: {b.confianca_calculo}</Badge>
          <Badge variant="outline">Fonte: {b.fonte}</Badge>
          {b.percentual_aderencia_portal != null && (
            <Badge variant="secondary">Aderência portal: {b.percentual_aderencia_portal.toFixed(1)}%</Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Base calculada (folha)</p>
            <p className="text-lg font-semibold tabular-nums">{brl(b.base_consignavel_calculada)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Base inferida ConsigFácil</p>
            <p className="text-lg font-semibold tabular-nums">
              {b.base_portal_inferida != null ? brl(b.base_portal_inferida) : "—"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Diferença</p>
            <p className="text-lg font-semibold tabular-nums">
              {b.diferenca_base_portal != null ? brl(b.diferenca_base_portal) : "—"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Margem 30% / 5% / 5%</p>
            <p className="text-sm font-medium tabular-nums">
              {brl(b.margem_consignavel_30)} · {brl(b.margem_cartao_5)} · {brl(b.margem_cartao_beneficio_5)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <p className="text-xs font-medium mb-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Rubricas incluídas
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
              {b.rubricas_incluidas.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium mb-1 flex items-center gap-1">
              <Info className="h-3 w-3" /> Excluídas da base
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
              {b.rubricas_excluidas.length === 0 ? (
                <li>Nenhuma</li>
              ) : (
                b.rubricas_excluidas.map((r, i) => (
                  <li key={i}>{r}</li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-600" /> Obrigatórios abatidos
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
              {b.rubricas_obrigatorias_abatidas.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-muted-foreground">
          <span>Ganhos brutos: {brl(b.total_ganhos_bruto)}</span>
          <span>Proventos elegíveis: {brl(b.proventos_elegiveis)}</span>
          <span>Excluídos: {brl(b.proventos_excluidos)}</span>
          <span>IR: {brl(b.desconto_ir)}</span>
          <span>Amazon Prev: {brl(b.desconto_previdencia)}</span>
          <span>Pensão/manutenção: {brl(b.desconto_pensao)}</span>
        </div>

        {b.observacoes.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
            {b.observacoes.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        )}

        {historico.length > 1 && (
          <div className="overflow-x-auto">
            <p className="text-xs font-medium mb-2">Últimas competências</p>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1 pr-2">Comp.</th>
                  <th className="py-1 pr-2">Base calc.</th>
                  <th className="py-1 pr-2">Portal</th>
                  <th className="py-1 pr-2">Margem 30%</th>
                  <th className="py-1">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.competencia} className="border-b border-muted/30">
                    <td className="py-1 pr-2">{h.competencia}</td>
                    <td className="py-1 pr-2 tabular-nums">{brl(h.base_consignavel_calculada)}</td>
                    <td className="py-1 pr-2 tabular-nums">
                      {h.base_portal_inferida != null ? brl(h.base_portal_inferida) : "—"}
                    </td>
                    <td className="py-1 pr-2 tabular-nums">{brl(h.margem_consignavel_30)}</td>
                    <td className="py-1">{h.confianca_calculo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
