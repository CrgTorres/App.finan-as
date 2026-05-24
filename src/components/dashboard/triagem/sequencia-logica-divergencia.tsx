"use client";

import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EtapaMotorResolucao, ResultadoResolucaoGuiada } from "@/lib/triagem/triagem-resolutiva-tipos";

const ROTULOS_ETAPA: Record<EtapaMotorResolucao, string> = {
  evento_operacional: "1. Evento operacional",
  desconto_fracionado: "2. Desconto fracionado",
  comportamento_recorrente: "3. Comportamento recorrente",
  quebra_margem: "4. Quebra de margem",
  risco_real: "5. Risco real",
  perguntas_guiadas: "6. Perguntas guiadas",
};

const ORDEM: EtapaMotorResolucao[] = [
  "evento_operacional",
  "desconto_fracionado",
  "comportamento_recorrente",
  "quebra_margem",
  "risco_real",
  "perguntas_guiadas",
];

type Props = {
  motor: ResultadoResolucaoGuiada;
  className?: string;
};

export function SequenciaLogicaDivergencia({ motor, className }: Props) {
  const etapaAtiva = motor.etapa_aplicada;

  return (
    <ol className={cn("space-y-1.5 text-[11px]", className)}>
      {ORDEM.map((etapa) => {
        const verificada = motor.etapas_verificadas.includes(etapa);
        const ativa = etapaAtiva === etapa;
        const ok = verificada && motor.resolvido && ativa;
        const falha = verificada && !motor.resolvido && ativa && etapa === "risco_real";

        return (
          <li
            key={etapa}
            className={cn(
              "flex items-start gap-2 rounded-md px-2 py-1",
              ativa && "bg-violet-500/10 border border-violet-500/30",
              !verificada && "opacity-45",
            )}
          >
            {ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" aria-hidden />
            ) : falha ? (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" aria-hidden />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            )}
            <span>
              <span className="font-medium">{ROTULOS_ETAPA[etapa]}</span>
              {ativa && motor.explicacao && (
                <span className="block text-muted-foreground mt-0.5 leading-snug">{motor.explicacao}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
