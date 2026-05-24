"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { ChevronRight, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AuditoriaInsightBannerProps = {
  /** Main headline */
  titulo: string;
  /** Secondary line */
  subtitulo: string;
  href: string;
  /** e.g. "Monitoramento ativo", "Ação recomendada" */
  statusLabel: string;
  statusTone?: "neutral" | "attention" | "positive";
  /** Short chips for compact exec view */
  tags?: string[];
  verDetalhesLabel?: string;
  /** Taller padding for in-page vs compact footer */
  layout?: "page" | "footer";
  icon?: LucideIcon;
  className?: string;
};

const statusToneCls: Record<NonNullable<AuditoriaInsightBannerProps["statusTone"]>, string> = {
  neutral:
    "border-slate-200/80 bg-slate-100/90 text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-[#E5E7EB]",
  attention:
    "border-amber-300/50 bg-amber-50/95 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100",
  positive:
    "border-emerald-300/45 bg-emerald-50/95 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100",
};

export function AuditoriaInsightBanner({
  titulo,
  subtitulo,
  href,
  statusLabel,
  statusTone = "neutral",
  tags = [],
  verDetalhesLabel = "Ver detalhes",
  layout = "page",
  icon: Icon = FileText,
  className,
}: AuditoriaInsightBannerProps) {
  const compact = layout === "footer";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-black/[0.07] bg-white/90 dark:border-white/[0.06] dark:bg-[#0F1724]/98",
        "backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.35)]",
        compact ? "p-3 md:p-3.5" : "p-4 sm:p-5",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/[0.06] via-transparent to-violet-500/[0.05] dark:from-indigo-400/[0.07] dark:to-violet-500/[0.04]"
      />
      <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-xl border border-black/[0.06] bg-gradient-to-br from-slate-50 to-white dark:border-white/[0.07] dark:from-white/[0.06] dark:to-white/[0.02]",
              compact ? "h-10 w-10" : "h-11 w-11 sm:h-12 sm:w-12",
            )}
          >
            <Icon className={cn("text-indigo-600 dark:text-indigo-300", compact ? "h-5 w-5" : "h-5 w-5 sm:h-6 sm:w-6")} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  statusToneCls[statusTone],
                )}
              >
                {statusLabel}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-[#94A3B8]">
                Resumo executivo
              </span>
            </div>
            <div>
              <p
                className={cn(
                  "font-semibold leading-snug text-slate-900 dark:text-[#E5E7EB]",
                  compact ? "text-xs md:text-sm line-clamp-2" : "text-sm sm:text-base line-clamp-3 sm:line-clamp-2",
                )}
              >
                {titulo}
              </p>
              <p
                className={cn(
                  "mt-1 text-slate-500 dark:text-[#94A3B8]",
                  compact ? "text-[10px] md:text-xs line-clamp-2" : "text-xs sm:text-sm line-clamp-2",
                )}
              >
                {subtitulo}
              </p>
            </div>
            {!compact && tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-black/[0.06] bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-[#94A3B8]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-stretch lg:flex-row lg:items-center">
          <Link
            href={href}
            title={titulo}
            className={cn(
              buttonVariants({
                variant: "outline",
                size: compact ? "sm" : "default",
              }),
              "gap-1.5 rounded-xl border-black/[0.08] bg-white/90 font-semibold dark:border-white/[0.1] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]",
              compact && "!h-8 text-xs",
            )}
          >
            {verDetalhesLabel}
            <ChevronRight className="h-3.5 w-3.5 opacity-70" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
