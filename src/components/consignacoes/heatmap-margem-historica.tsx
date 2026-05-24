"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  MargemHistoricaCompetencia,
  NivelPressaoMargem,
} from "@/lib/consignacoes-governo/calcular-margem-historica-avancada";
import { cn } from "@/lib/utils";

const MESES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const LABEL_MES = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function corCelula(
  row: MargemHistoricaCompetencia | undefined,
): { bg: string; title: string } {
  if (!row) {
    return { bg: "bg-muted/40", title: "Sem folha importada" };
  }
  const map: Record<NivelPressaoMargem, string> = {
    baixo: "bg-emerald-500/80 hover:bg-emerald-500",
    moderado: "bg-amber-400/80 hover:bg-amber-400",
    alto: "bg-orange-500/80 hover:bg-orange-500",
    critico: "bg-red-600/85 hover:bg-red-600",
  };
  return {
    bg: map[row.nivel_pressao],
    title: `${row.competencia}: ${row.percentual_comprometido.toFixed(1)}% — ${row.nivel_pressao}`,
  };
}

type Props = {
  competencias: MargemHistoricaCompetencia[];
  anoInicio?: number;
};

export function HeatmapMargemHistorica({ competencias, anoInicio = 2012 }: Props) {
  const deferred = useDeferredValue(competencias);
  const [tooltip, setTooltip] = useState<string | null>(null);

  const { anos, mapa } = useMemo(() => {
    const porComp = new Map(deferred.map((c) => [c.competencia, c]));
    const anosSet = new Set<number>();
    for (const c of deferred) {
      const y = Number(c.competencia.slice(0, 4));
      if (Number.isFinite(y)) anosSet.add(y);
    }
    const anosArr = [...anosSet].sort((a, b) => a - b);
    if (anosArr.length === 0) {
      const atual = new Date().getFullYear();
      for (let y = anoInicio; y <= atual; y += 1) anosArr.push(y);
    }
    return { anos: anosArr, mapa: porComp };
  }, [deferred, anoInicio]);

  const anosPagina = useMemo(() => {
    const PAGE = 8;
    if (anos.length <= PAGE) return anos;
    return anos.slice(-PAGE);
  }, [anos]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Heatmap histórico</CardTitle>
        <CardDescription>
          Comprometimento da margem consignável por competência — verde (saudável) a vermelho (crítico); cinza sem folha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {tooltip && (
          <p className="text-xs text-muted-foreground border rounded-md px-2 py-1">{tooltip}</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="p-1 text-left text-muted-foreground w-10" />
                {LABEL_MES.map((m, i) => (
                  <th key={MESES[i]} className="p-0.5 text-center text-muted-foreground font-normal">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {anosPagina.map((ano) => (
                <tr key={ano}>
                  <td className="p-1 text-muted-foreground font-medium">{ano}</td>
                  {MESES.map((mes) => {
                    const comp = `${ano}-${mes}`;
                    const row = mapa.get(comp);
                    const { bg, title } = corCelula(row);
                    return (
                      <td key={comp} className="p-0.5">
                        <button
                          type="button"
                          className={cn("h-5 w-full min-w-[14px] rounded-sm transition-colors", bg)}
                          title={title}
                          onMouseEnter={() => setTooltip(title)}
                          onFocus={() => setTooltip(title)}
                          onMouseLeave={() => setTooltip(null)}
                          onBlur={() => setTooltip(null)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-emerald-500/80" /> Saudável
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-amber-400/80" /> Moderado
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-orange-500/80" /> Alto
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-red-600/85" /> Crítico
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-muted/40" /> Sem folha
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
