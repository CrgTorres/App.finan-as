"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ROTULOS_CLASSIFICACAO_RESOLUCAO,
  type ClassificacaoResolucaoDivergencia,
  type ItemTriagemResolutiva,
} from "@/lib/triagem/triagem-resolutiva-tipos";
import { CheckCircle2, AlertTriangle, Brain, Zap } from "lucide-react";

type Props = {
  item: ItemTriagemResolutiva;
  compacto?: boolean;
};

export function RespostaDivergenciaCard({ item, compacto }: Props) {
  const m = item.motor;
  const resolvido = m.resolvido || !!item.resolucao_usuario?.resultado.remover_pendencia;
  const classificacao: ClassificacaoResolucaoDivergencia =
    (item.resolucao_usuario?.resultado.nova_classificacao as ClassificacaoResolucaoDivergencia) ??
    m.classificacao;

  const IconOrigem =
    m.origem === "aprendizado" ? Brain : m.origem === "automatica_motor" ? Zap : AlertTriangle;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 text-xs",
        resolvido
          ? "border-emerald-500/40 bg-emerald-500/8"
          : "border-amber-500/40 bg-amber-500/8",
        compacto && "p-2",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {resolvido ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden />
        )}
        <span className="font-semibold">
          {resolvido ? "Resolvido" : "Pendente de resolução"}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {ROTULOS_CLASSIFICACAO_RESOLUCAO[classificacao] ?? classificacao}
        </Badge>
        <Badge variant="secondary" className="text-[10px] gap-1">
          <IconOrigem className="h-3 w-3" aria-hidden />
          {m.origem.replace(/_/g, " ")}
        </Badge>
        {item.aprendizado_aplicado && (
          <Badge className="text-[10px] bg-violet-600">Aprendizado</Badge>
        )}
      </div>
      <p className="text-muted-foreground leading-relaxed">{m.explicacao}</p>
      {!compacto && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] tabular-nums">
          <dt className="text-muted-foreground">Risco</dt>
          <dd className="font-medium">{m.nivel_risco}</dd>
          <dt className="text-muted-foreground">Confiança</dt>
          <dd>{Math.round(m.confianca * 100)}%</dd>
          <dt className="text-muted-foreground">Ação</dt>
          <dd>{m.acao_tomada}</dd>
          <dt className="text-muted-foreground">Conferência</dt>
          <dd>{m.remover_conferencia || resolvido ? "Remover" : "Manter"}</dd>
        </dl>
      )}
    </div>
  );
}
