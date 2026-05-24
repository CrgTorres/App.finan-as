"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AuditoriaTimelineBarProps = {
  clock: string;
  /** Marquee / ticker row */
  ticker: ReactNode;
  expanded: boolean;
  onToggleExpanded: () => void;
  expandLabelOpen?: string;
  expandLabelClosed?: string;
  /** Optional badge column (e.g. compliance) */
  endBadge?: ReactNode;
  /** Top executive strip (banner) */
  topStrip?: ReactNode;
  className?: string;
};

export function AuditoriaTimelineBar({
  clock,
  ticker,
  expanded,
  onToggleExpanded,
  expandLabelOpen = "Fechar",
  expandLabelClosed = "Painel",
  endBadge,
  topStrip,
  className,
}: AuditoriaTimelineBarProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col border-t border-black/20 dark:border-white/[0.06]",
        className,
      )}
    >
      {topStrip ? (
        <div className="border-b border-black/15 bg-[#0c101c] px-2 py-2 dark:border-white/[0.05] dark:bg-[#070B14]/98 md:px-3">
          {topStrip}
        </div>
      ) : null}

      <div className="flex min-h-[2.75rem] w-full items-stretch bg-[#0a0e18] dark:bg-[#070B14] md:min-h-[3rem]">
        <span
          className="flex w-14 shrink-0 flex-col items-center justify-center border-r border-white/[0.06] bg-[#0F1724] px-1 text-[10px] font-semibold tabular-nums leading-tight text-[#94A3B8] md:w-16 md:text-xs"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-[8px] font-bold uppercase tracking-wider text-[#64748B] md:text-[9px]">Relógio</span>
          <span className="font-bold tracking-tight text-[#E5E7EB]">{clock}</span>
        </span>

        <div className="relative flex min-w-0 flex-1 items-center overflow-hidden">
          <div className="flex min-h-[inherit] min-w-0 flex-1 items-center overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_4%,black_96%,transparent)]">
            <div className="info-ticker-animate flex w-max items-center gap-6 whitespace-nowrap px-3 py-1 text-[11px] font-medium leading-snug text-[#CBD5E1] md:gap-8 md:px-4 md:text-[12px]">
              {ticker}
            </div>
          </div>
        </div>

        {endBadge ? (
          <div className="hidden w-[5.25rem] shrink-0 flex-col items-center justify-center border-l border-white/[0.06] bg-[#0F1724] px-1 text-center md:flex md:w-24 md:px-2">
            {endBadge}
          </div>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto min-w-[3rem] shrink-0 rounded-none border-l border-white/[0.06] bg-[#0F1724] px-2 text-[#E5E7EB] hover:bg-white/[0.04] md:min-w-[7.5rem] md:px-3"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-controls="dashboard-info-expanded"
        >
          {expanded ? (
            <ChevronUp className="mx-auto h-4 w-4 shrink-0 md:mr-1.5" aria-hidden />
          ) : (
            <ChevronDown className="mx-auto h-4 w-4 shrink-0 md:mr-1.5" aria-hidden />
          )}
          <span className="hidden text-xs font-semibold md:inline">{expanded ? expandLabelOpen : expandLabelClosed}</span>
        </Button>
      </div>
    </div>
  );
}
