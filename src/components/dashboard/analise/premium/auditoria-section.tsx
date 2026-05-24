"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type AuditoriaSectionProps = {
  id?: string;
  title: string;
  description?: string;
  /** Optional action aligned to title row */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function AuditoriaSection({
  id,
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: AuditoriaSectionProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn("scroll-mt-24 space-y-3", className)}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-[#E5E7EB]">{title}</h2>
          {description ? (
            <p className="max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-[#94A3B8]">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn(contentClassName)}>{children}</div>
    </motion.section>
  );
}
