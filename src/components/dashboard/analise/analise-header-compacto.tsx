"use client";

import { Sparkles, RefreshCw, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OverviewPeriod = "last12" | number;

export type AnaliseHeaderCompactoProps = {
  periodoLabel: string;
  competenciasProcessadas: number;
  primeiraUltimaLinha?: string | null;
  overviewPeriod: OverviewPeriod;
  overviewYears: number[];
  overviewLoading: boolean;
  onPeriodChange: (next: OverviewPeriod) => void;
  onAtualizarAnalise: () => void;
  onCopiarResumo: () => void;
  atualizarDisabled?: boolean;
  exportSlot?: React.ReactNode;
};

export function AnaliseHeaderCompacto({
  periodoLabel,
  competenciasProcessadas,
  primeiraUltimaLinha,
  overviewPeriod,
  overviewYears,
  overviewLoading,
  onPeriodChange,
  onAtualizarAnalise,
  onCopiarResumo,
  atualizarDisabled = false,
  exportSlot,
}: AnaliseHeaderCompactoProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 -mx-4 mb-4 rounded-b-2xl border-b border-black/[0.06] px-4 py-3.5",
        "backdrop-blur-xl supports-[backdrop-filter]:backdrop-blur-xl",
        "bg-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.06)] dark:border-white/[0.06] dark:bg-[#0F1724]/85 dark:shadow-[0_12px_48px_rgba(0,0,0,0.35)]",
        "md:-mx-6 md:px-6",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/[0.06] bg-gradient-to-br from-indigo-500/15 to-violet-500/10 dark:border-white/[0.08]">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-300" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-[#E5E7EB] sm:text-lg">
                Central de Auditoria Financeira
              </h1>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-[#94A3B8]">
                Command center: diagnóstico, vínculos, consolidação, pendências, evidências e triagem jurídica
                informativa.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-[#94A3B8]">
            <span>
              <span className="font-medium text-slate-800 dark:text-[#E5E7EB]">{periodoLabel}</span>
              <span className="mx-1 opacity-50">·</span>
              {competenciasProcessadas} competência(s)
            </span>
            {primeiraUltimaLinha ? (
              <span className="tabular-nums text-slate-500/90 dark:text-[#94A3B8]">{primeiraUltimaLinha}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end shrink-0">
          <label className="flex min-w-[168px] flex-col gap-1 text-[11px] text-slate-500 dark:text-[#94A3B8]">
            Período (gráfico comparativo)
            <select
              className={cn(
                "h-9 rounded-xl border px-2.5 text-xs outline-none transition-colors",
                "border-black/[0.08] bg-white text-slate-900",
                "dark:border-white/[0.1] dark:bg-[#070B14] dark:text-[#E5E7EB]",
              )}
              disabled={overviewLoading}
              value={String(overviewPeriod)}
              onChange={(e) => {
                const v = e.target.value;
                onPeriodChange(v === "last12" ? "last12" : Number(v));
              }}
            >
              <option value="last12">Últimos 12 meses</option>
              {overviewYears.map((y) => (
                <option key={y} value={String(y)}>
                  Ano {y}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              className="gap-1.5 rounded-xl font-semibold shadow-sm"
              disabled={atualizarDisabled}
              onClick={onAtualizarAnalise}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${overviewLoading ? "animate-spin" : ""}`} aria-hidden />
              Atualizar análise
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={onCopiarResumo}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copiar resumo
            </Button>
            {exportSlot}
          </div>
        </div>
      </div>
    </header>
  );
}
