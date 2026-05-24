"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { AnaliseDashboardAbaId } from "./analise-tab-ids";

const ETAPAS: { id: AnaliseDashboardAbaId; step: number; label: string }[] = [
  { id: "diagnostico", step: 1, label: "Diagnóstico" },
  { id: "emprestimos", step: 2, label: "Empréstimos" },
  { id: "consolidacao", step: 3, label: "Consolidação" },
  { id: "pendencias", step: 4, label: "Pendências" },
  { id: "evidencias", step: 5, label: "Evidências" },
  { id: "juridico", step: 6, label: "Jurídico" },
];

export function AnaliseAuditoriaStepper() {
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/[0.06] bg-white/70 px-2 py-2 backdrop-blur-md",
        "dark:border-white/[0.06] dark:bg-[#0F1724]/92 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
      )}
    >
      <p className="mb-2 px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-[#94A3B8]">
        Fluxo da auditoria · etapas
      </p>
      <TabsList
        variant="line"
        className="h-auto min-h-0 w-full flex-nowrap justify-start gap-1 overflow-x-auto scroll-smooth border-0 bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1"
      >
        {ETAPAS.map((t) => (
          <TabsTrigger
            key={t.id}
            value={t.id}
            className={cn(
              "shrink-0 rounded-xl border border-transparent px-2.5 py-2 text-[10px] sm:text-xs",
              "data-active:border-black/[0.08] data-active:bg-white data-active:shadow-md",
              "dark:data-active:border-white/[0.1] dark:data-active:bg-white/[0.06] dark:data-active:shadow-[0_8px_24px_rgba(0,0,0,0.25)]",
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/12 text-[10px] font-bold text-indigo-700 tabular-nums dark:bg-indigo-400/15 dark:text-indigo-200">
              {t.step}
            </span>
            <span className="whitespace-nowrap text-slate-700 dark:text-[#E5E7EB]">{t.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
