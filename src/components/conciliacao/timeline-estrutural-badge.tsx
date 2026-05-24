"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ClassificacaoContinuidadeTimeline } from "@/lib/conciliacao/timeline-estrutural-contrato";
import { ROTULO_CLASSIFICACAO_CONTINUIDADE } from "@/lib/conciliacao/timeline-estrutural-contrato";

const COR_CLASSIFICACAO: Record<ClassificacaoContinuidadeTimeline, string> = {
  continuidade_confirmada:
    "border-emerald-400/60 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  continuidade_parcial:
    "border-amber-400/50 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  sequencia_quebrada: "border-red-400/60 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
  refinanciamento_suspeito:
    "border-violet-400/50 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  contrato_reiniciado:
    "border-orange-400/50 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  contrato_suspenso:
    "border-slate-400/50 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  contrato_quitado:
    "border-sky-400/50 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  indefinido: "border-border text-muted-foreground",
};

export type TimelineEstruturalBadgeProps = {
  classificacao: ClassificacaoContinuidadeTimeline;
  resumo?: string;
  compacto?: boolean;
};

export function TimelineEstruturalBadge({
  classificacao,
  resumo,
  compacto,
}: TimelineEstruturalBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-normal", COR_CLASSIFICACAO[classificacao])}
      title={resumo}
    >
      {compacto ? resumo ?? ROTULO_CLASSIFICACAO_CONTINUIDADE[classificacao] : ROTULO_CLASSIFICACAO_CONTINUIDADE[classificacao]}
    </Badge>
  );
}
