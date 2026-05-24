"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type AuditoriaChartCardProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  chartClassName?: string;
  index?: number;
};

export function AuditoriaChartCard({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
  chartClassName,
  index = 0,
}: AuditoriaChartCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white/85 dark:border-white/[0.06] dark:bg-[#0F1724]/95",
        "backdrop-blur-md shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] transition-colors duration-300",
        "hover:border-black/[0.08] dark:hover:border-white/[0.09] dark:hover:bg-[rgba(255,255,255,0.03)]",
        className,
      )}
    >
      <div className="border-b border-black/[0.05] px-4 pb-2.5 pt-3.5 dark:border-white/[0.06]">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/[0.06] bg-slate-50 dark:border-white/[0.06] dark:bg-white/[0.04]">
            <Icon className="h-4 w-4 text-slate-600 dark:text-[#94A3B8]" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold leading-snug text-slate-800 dark:text-[#E5E7EB]">{title}</h3>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500 dark:text-[#94A3B8]">{subtitle}</p>
          </div>
        </div>
      </div>
      <div
        className={cn(
          "h-[11.5rem] w-full min-w-0 flex-1 px-3 pb-3 pt-3",
          "[&_.recharts-cartesian-grid_line]:stroke-[rgba(148,163,184,0.18)] dark:[&_.recharts-cartesian-grid_line]:stroke-[rgba(148,163,184,0.12)]",
          "[&_.recharts-default-tooltip]:!rounded-xl [&_.recharts-default-tooltip]:!border-white/10",
          chartClassName,
        )}
      >
        <div className="h-full w-full min-w-0">{children}</div>
      </div>
    </motion.div>
  );
}
