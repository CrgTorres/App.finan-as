"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileJson, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AnaliseNormalizadaSnapshot } from "@/lib/dashboard/base-financeira-normalizada";
import { buildBaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import { exportarBaseNormalizadaCsv } from "@/lib/exportacao/exportar-base-normalizada-csv";
import { exportarBaseNormalizadaJson } from "@/lib/exportacao/exportar-base-normalizada-json";
import { exportarBaseNormalizadaXlsx } from "@/lib/exportacao/exportar-base-normalizada-xlsx";
import type { Transaction } from "@/types";
import type { Loan } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import type { MonthlyComparisonRow } from "@/components/dashboard/monthly-comparison-chart";
import { toast } from "sonner";

export type AnaliseExportMenuProps = {
  snapshot: AnaliseNormalizadaSnapshot | null;
  periodoOverview: string;
  overviewRows?: MonthlyComparisonRow[];
  transactions?: Transaction[];
  loans?: Loan[];
  loanEvidencias?: LoanEvidence[];
  disabled?: boolean;
};

export function AnaliseExportMenu({
  snapshot,
  transactions,
  loans,
  loanEvidencias,
  disabled = false,
}: AnaliseExportMenuProps) {
  const [exportando, setExportando] = useState(false);

  const base = useMemo(() => {
    if (!snapshot) return null;
    return buildBaseFinanceiraNormalizada({
      transactions,
      loans,
      payslips: snapshot.payslipsFolha,
      evidencias: loanEvidencias,
    });
  }, [snapshot, transactions, loans, loanEvidencias]);

  const runExport = useCallback(
    async (fn: () => void, label: string) => {
      if (!base) {
        toast.error("Sem dados de contracheque para exportar.");
        return;
      }
      setExportando(true);
      try {
        await new Promise<void>((r) => {
          fn();
          r();
        });
        toast.success(`${label} baixado.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Falha ao exportar ${label}.`);
      } finally {
        setExportando(false);
      }
    },
    [base],
  );

  const semDados = !base || base.baseNormalizada.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-xl"
            disabled={disabled || exportando || semDados}
          >
            {exportando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden />
            )}
            Exportar dados
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onClick={() => void runExport(() => exportarBaseNormalizadaXlsx(base!), "Excel (.xlsx)")}
        >
          <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
          Excel completo (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onClick={() => void runExport(() => exportarBaseNormalizadaJson(base!), "JSON")}
        >
          <FileJson className="h-4 w-4 shrink-0" aria-hidden />
          JSON completo
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onClick={() => void runExport(() => exportarBaseNormalizadaCsv(base!), "CSV base normalizada")}
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
          CSV — base normalizada
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
