"use client";

import { AVISO_TRIAGEM_ANALISE_CONTRATO } from "@/types/analise-contrato-emprestimo";
import { Info } from "lucide-react";

type Props = {
  className?: string;
  compacto?: boolean;
};

/**
 * Aviso legal/educativo padrão da triagem de contratos (Radar, upload, evidências).
 */
export function AvisoTriagemAnaliseContrato({ className = "", compacto = false }: Props) {
  return (
    <div
      role="note"
      className={`flex gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2.5 ${className}`}
    >
      <Info
        className={`shrink-0 text-primary ${compacto ? "h-3.5 w-3.5 mt-0.5" : "h-4 w-4 mt-0.5"}`}
        aria-hidden
      />
      <p
        className={
          compacto
            ? "text-[10px] text-foreground/90 leading-snug"
            : "text-[11px] text-foreground/90 leading-relaxed"
        }
      >
        {AVISO_TRIAGEM_ANALISE_CONTRATO}
      </p>
    </div>
  );
}
