"use client";

import { AlertCircle, FileStack, Scale, ShieldCheck, Wallet } from "lucide-react";
import { ExecutiveMetricCard } from "@/components/dashboard/analise/premium";

export type AnaliseMetricCardsProps = {
  qualidadeBase: number;
  totalDescontadoHistorico: number;
  contratosDetectados: number;
  pendenciasAbertas: number;
  scoreJuridicoPreliminar: number;
};

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function AnaliseMetricCards({
  qualidadeBase,
  totalDescontadoHistorico,
  contratosDetectados,
  pendenciasAbertas,
  scoreJuridicoPreliminar,
}: AnaliseMetricCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <ExecutiveMetricCard
        index={0}
        label="Score base"
        value={`${qualidadeBase}`}
        description="Qualidade da base documental (0–100 · camada de UI)."
        icon={ShieldCheck}
        tone="positive"
      />
      <ExecutiveMetricCard
        index={1}
        label="Total descontado"
        value={fmtBRL(totalDescontadoHistorico)}
        description="Impacto financeiro acumulado inferido na folha."
        icon={Wallet}
        tone="financeiro"
      />
      <ExecutiveMetricCard
        index={2}
        label="Contratos detectados"
        value={`${contratosDetectados}`}
        description="Chaves distintas inferidas na série analisada."
        icon={FileStack}
        tone="financeiro"
      />
      <ExecutiveMetricCard
        index={3}
        label="Pendências abertas"
        value={`${pendenciasAbertas}`}
        description="Itens em triagem folha — conferir antes de conclusões."
        icon={AlertCircle}
        tone="warning"
      />
      <ExecutiveMetricCard
        index={4}
        label="Score jurídico (prelim.)"
        value={`${scoreJuridicoPreliminar}`}
        description="Triagem informativa — não substitui parecer profissional."
        icon={Scale}
        tone="juridico"
        className="sm:col-span-2 lg:col-span-1 xl:col-span-1"
      />
    </div>
  );
}
