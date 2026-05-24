"use client";

import { Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type SemExtratoBancarioBadgeProps = {
  possuiFonteBancariaReal: boolean;
  transacoesFolhaExcluidas?: number;
};

/**
 * Exibido quando só há folha/contracheque — conciliação bancária e duplicidade ficam desligadas.
 */
export function SemExtratoBancarioBadge({
  possuiFonteBancariaReal,
  transacoesFolhaExcluidas = 0,
}: SemExtratoBancarioBadgeProps) {
  if (possuiFonteBancariaReal) return null;

  return (
    <div className="rounded-lg border border-sky-300/60 bg-sky-50/80 dark:bg-sky-950/30 px-3 py-2 flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="gap-1 border-sky-500/50 text-sky-800 dark:text-sky-200">
        <Landmark className="h-3 w-3" />
        Sem extrato bancário importado
      </Badge>
      <p className="text-xs text-sky-900/90 dark:text-sky-100/80">
        Conciliação limitada à ficha financeira / contracheque. Não há duplicidade bancária nem fluxo
        de salário inferido do extrato.
        {transacoesFolhaExcluidas > 0 && (
          <span className="block mt-0.5 text-muted-foreground">
            {transacoesFolhaExcluidas} lançamento(s) de folha ignorado(s) na camada bancária.
          </span>
        )}
      </p>
    </div>
  );
}
