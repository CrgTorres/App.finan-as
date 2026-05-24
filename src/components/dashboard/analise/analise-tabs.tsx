"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnaliseDashboardAbaId } from "./analise-tab-ids";

const ITEMS: { id: AnaliseDashboardAbaId; label: string }[] = [
  { id: "diagnostico", label: "Diagnóstico" },
  { id: "emprestimos", label: "Empréstimos" },
  { id: "consolidacao", label: "Consolidação" },
  { id: "pendencias", label: "Pendências" },
  { id: "evidencias", label: "Evidências" },
  { id: "juridico", label: "Jurídico" },
];

export function AnaliseTabTriggers() {
  return (
    <TabsList
      variant="line"
      className="w-full h-auto min-h-10 flex flex-nowrap justify-start overflow-x-auto gap-0.5 p-1 bg-muted/40 rounded-lg border border-border/60 [&::-webkit-scrollbar]:h-1"
    >
      {ITEMS.map((t) => (
        <TabsTrigger
          key={t.id}
          value={t.id}
          className="shrink-0 px-2.5 py-1.5 text-xs sm:text-sm data-active:shadow-sm rounded-md"
        >
          {t.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
