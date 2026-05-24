"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ExecutiveMetricTone = "positive" | "warning" | "juridico" | "financeiro";

const toneRing: Record<ExecutiveMetricTone, string> = {
  positive:
    "from-emerald-400/35 via-emerald-400/10 to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]",
  warning:
    "from-amber-400/40 via-amber-400/12 to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]",
  juridico:
    "from-violet-400/40 via-indigo-400/12 to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]",
  financeiro:
    "from-slate-200/25 via-white/10 to-transparent dark:from-white/15 dark:via-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
};

const toneDot: Record<ExecutiveMetricTone, string> = {
  positive: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]",
  warning: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]",
  juridico: "bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.45)]",
  financeiro: "bg-slate-400 dark:bg-slate-500 shadow-[0_0_8px_rgba(148,163,184,0.35)]",
};

export type ExecutiveMetricCardProps = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone: ExecutiveMetricTone;
  className?: string;
  index?: number;
};

export function ExecutiveMetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone,
  className,
  index = 0,
}: ExecutiveMetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={cn("min-h-[7.5rem] sm:min-h-[8.25rem]", className)}
    >
      <div
        className={cn(
          "group relative h-full overflow-hidden rounded-2xl border border-black/[0.06] bg-white/80 p-4 sm:p-5",
          "dark:border-white/[0.06] dark:bg-[#0F1724]/95",
          "backdrop-blur-md transition-colors duration-300",
          "hover:border-black/[0.08] hover:bg-white dark:hover:border-white/[0.08] dark:hover:bg-[rgba(255,255,255,0.04)]",
        )}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br opacity-70 blur-2xl transition-opacity group-hover:opacity-100",
            toneRing[tone],
          )}
        />
        <div className="relative flex h-full flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", toneDot[tone])} aria-hidden />
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-[#94A3B8]">
                  {label}
                </p>
              </div>
              <p
                className={cn(
                  "text-2xl font-bold tabular-nums tracking-tight sm:text-[1.75rem]",
                  "text-slate-900 dark:text-[#E5E7EB]",
                )}
              >
                {value}
              </p>
            </div>
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.05] bg-white/90 dark:border-white/[0.06] dark:bg-white/[0.04]",
              )}
            >
              <Icon className="h-[1.15rem] w-[1.15rem] text-slate-700 dark:text-[#E5E7EB]/90" aria-hidden />
            </div>
          </div>
          <p className="text-xs leading-snug text-slate-500 dark:text-[#94A3B8]">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}
