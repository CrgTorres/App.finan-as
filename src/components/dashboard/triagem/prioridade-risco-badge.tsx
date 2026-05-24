"use client";

import { Badge } from "@/components/ui/badge";
import type { NivelPrioridadeTriagem } from "@/lib/triagem/calcular-prioridade-risco-triagem";
import { ROTULO_PRIORIDADE } from "@/lib/triagem/calcular-prioridade-risco-triagem";
import { cn } from "@/lib/utils";

const ESTILO: Record<NivelPrioridadeTriagem, string> = {
  critica: "bg-red-600 hover:bg-red-600 text-white border-red-700",
  alta: "bg-orange-600 hover:bg-orange-600 text-white border-orange-700",
  media: "bg-amber-500 hover:bg-amber-500 text-black border-amber-600",
  baixa: "bg-slate-500 hover:bg-slate-500 text-white border-slate-600",
  informativa: "bg-slate-200 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-700 dark:text-slate-100",
};

type Props = {
  prioridade: NivelPrioridadeTriagem;
  score?: number;
  className?: string;
};

export function PrioridadeRiscoBadge({ prioridade, score, className }: Props) {
  return (
    <Badge
      className={cn("text-[10px] font-semibold tabular-nums", ESTILO[prioridade], className)}
    >
      {ROTULO_PRIORIDADE[prioridade]}
      {score != null ? ` · ${score}` : ""}
    </Badge>
  );
}
