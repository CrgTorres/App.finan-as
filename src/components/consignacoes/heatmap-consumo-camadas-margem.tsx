"use client";

import { useDeferredValue, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResumoConsumoEstruturalMargem } from "@/lib/consignacoes-governo/consumo-estrutural-margem";
import { cn } from "@/lib/utils";

const MESES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const LABEL_MES = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

type CamadaHeat = "consignavel" | "cartao" | "beneficio";

function corPct(pct: number): string {
  if (pct >= 90) return "bg-red-600/85";
  if (pct >= 75) return "bg-orange-500/80";
  if (pct >= 50) return "bg-amber-400/80";
  if (pct > 0) return "bg-emerald-500/70";
  return "bg-muted/40";
}

type Props = {
  resumos: ResumoConsumoEstruturalMargem[];
};

export function HeatmapConsumoCamadasMargem({ resumos }: Props) {
  const deferred = useDeferredValue(resumos);

  const { anos, mapa } = useMemo(() => {
    const m = new Map<string, ResumoConsumoEstruturalMargem>();
    const anosSet = new Set<number>();
    for (const r of deferred) {
      m.set(r.competencia, r);
      const y = Number(r.competencia.slice(0, 4));
      if (Number.isFinite(y)) anosSet.add(y);
    }
    return { anos: [...anosSet].sort((a, b) => a - b).slice(-8), mapa: m };
  }, [deferred]);

  const renderCamada = (camada: CamadaHeat, titulo: string) => (
    <div key={camada} className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground">{titulo}</p>
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr>
            <th className="w-8" />
            {LABEL_MES.map((l, i) => (
              <th key={MESES[i]} className="p-0.5 font-normal text-muted-foreground">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {anos.map((ano) => (
            <tr key={`${camada}-${ano}`}>
              <td className="text-muted-foreground pr-1">{ano}</td>
              {MESES.map((mes) => {
                const comp = `${ano}-${mes}`;
                const row = mapa.get(comp);
                const pct =
                  camada === "consignavel"
                    ? row?.consignavel_percentual ?? -1
                    : camada === "cartao"
                      ? row?.cartao_percentual ?? -1
                      : row?.beneficio_percentual ?? -1;
                const title =
                  pct < 0
                    ? `${comp}: sem dado`
                    : `${comp} ${titulo}: ${pct.toFixed(1)}%`;
                return (
                  <td key={comp} className="p-0.5">
                    <div
                      className={cn("h-4 w-full min-w-[12px] rounded-sm", corPct(pct < 0 ? 0 : pct))}
                      title={title}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (anos.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Heatmap por camada</CardTitle>
        <CardDescription>Ano × mês — consignável, cartão e benefício em faixas separadas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 overflow-x-auto">
        {renderCamada("consignavel", "Margem consignável")}
        {renderCamada("cartao", "Margem cartão")}
        {renderCamada("beneficio", "Margem cartão benefício")}
      </CardContent>
    </Card>
  );
}
