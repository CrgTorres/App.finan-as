"use client";

import { useMemo } from "react";
import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { contarContratosSemTipoEvidencia } from "@/lib/anexos/evidencias-emprestimos";
import type { Loan } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import { ExecutiveMetricCard } from "@/components/dashboard/analise/premium";
import {
  CheckCircle2,
  HelpCircle,
  FileWarning,
  Activity,
} from "lucide-react";

export function AnaliseEmprestimosStatsCards({
  contratos,
  loans = [],
  evidencias = [],
}: {
  contratos: EmprestimoContratoAnalise[];
  loans?: Loan[];
  evidencias?: LoanEvidence[];
}) {
  const { ativos, quitados, semParcelaNm, semEvidenciaContrato } = useMemo(() => {
    let ativos = 0;
    let quitados = 0;
    let semParcelaNm = 0;
    for (const c of contratos) {
      if (c.status === "ativo/em andamento") ativos++;
      if (
        c.status === "finalizado" ||
        (c.parcelaFinalDetectada != null &&
          c.totalParcelas != null &&
          c.parcelaFinalDetectada >= c.totalParcelas)
      ) {
        quitados++;
      }
      const temNm =
        c.parcelaInicialDetectada != null &&
        c.parcelaFinalDetectada != null &&
        c.totalParcelas != null &&
        c.tipoContrato !== "recorrente_01_01";
      if (!temNm) semParcelaNm++;
    }
    const semEvidenciaContrato = contarContratosSemTipoEvidencia(contratos, loans, evidencias, "contrato_formal");
    return { ativos, quitados, semParcelaNm, semEvidenciaContrato };
  }, [contratos, loans, evidencias]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <ExecutiveMetricCard
        index={0}
        label="Ativos (inferido)"
        value={`${ativos}`}
        description="Contratos com status de andamento na leitura automática."
        icon={Activity}
        tone="financeiro"
      />
      <ExecutiveMetricCard
        index={1}
        label="Quitados / encerrados"
        value={`${quitados}`}
        description="Linhas que a lógica marcou como encerradas ou parcela final ≥ total."
        icon={CheckCircle2}
        tone="positive"
      />
      <ExecutiveMetricCard
        index={2}
        label="Sem N/M claro"
        value={`${semParcelaNm}`}
        description="Parcela inicial/final/total ausentes ou recorrente 01/01 — conferir OCR."
        icon={HelpCircle}
        tone="warning"
      />
      <ExecutiveMetricCard
        index={3}
        label="Sem evidência (contrato)"
        value={`${semEvidenciaContrato}`}
        description="Contratos sem anexo formal vinculado ao tipo esperado."
        icon={FileWarning}
        tone="juridico"
      />
    </div>
  );
}
