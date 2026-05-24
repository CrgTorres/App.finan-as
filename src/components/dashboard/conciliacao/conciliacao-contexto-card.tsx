"use client";

import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  expandirOcorrenciasContextuais,
  formatarDiferencaPct,
  type ContextoConciliacaoConsolidado,
} from "@/lib/conciliacao/consolidar-divergencias-contextuais";
import { tomBadgeDivergenciaContextual } from "@/components/dashboard/conciliacao/conciliacao-badges";
import { BadgeDivergenciaContextual } from "@/components/dashboard/conciliacao/conciliacao-badges";
import { ehContextoInstitucionalIndependente } from "@/lib/conciliacao/tipo-divergencia-contextual";

const CLASSE_CARD_TOM = {
  critico: "border-red-400/60 bg-red-50/40 dark:bg-red-950/20",
  independente: "border-sky-400/45 bg-sky-50/50 dark:bg-sky-950/25",
  monitoramento: "border-amber-400/50 bg-amber-50/40 dark:bg-amber-950/25",
  neutro: "border-border bg-muted/20",
} as const;

export type ConciliacaoContextoCardProps = {
  ctx: ContextoConciliacaoConsolidado;
  expandido: boolean;
  onToggle: () => void;
};

export function ConciliacaoContextoCard({
  ctx,
  expandido,
  onToggle,
}: ConciliacaoContextoCardProps) {
  const linhasTabela = expandirOcorrenciasContextuais(ctx);
  const periodos =
    ctx.competencias_afetadas.length > 0 ? ctx.competencias_afetadas.join(", ") : "—";
  const tom = tomBadgeDivergenciaContextual(ctx.tipo_divergencia_contextual);
  const semVinculo =
    ctx.id_consignacao === "—" || ctx.chave.includes("sem_vinculo_institucional");
  const ehIndependente = ehContextoInstitucionalIndependente(ctx.tipo_divergencia_contextual);

  return (
    <div className={cn("rounded-lg border p-4 space-y-3", CLASSE_CARD_TOM[tom])}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold">
            {semVinculo
              ? "Rubrica histórica (sem vínculo ConsigFácil)"
              : `Contrato ${ctx.id_consignacao}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {ctx.rotulo_campo}
            {ctx.quantidade > 1 && (
              <span className="font-medium text-foreground">
                {" "}
                · {ctx.quantidade} ocorrência(s) similares consolidadas
              </span>
            )}
          </p>
        </div>
        <BadgeDivergenciaContextual tipo={ctx.tipo_divergencia_contextual} titulo={ctx.titulo_badge} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div
          className={cn(
            "rounded-md border bg-background p-2.5",
            ehIndependente ? "border-sky-300/50" : "border-amber-300/50",
          )}
        >
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {ctx.fonte_original === "contracheque" || ctx.fonte_original === "ocr"
              ? "OCR/Contracheque"
              : "Origem observada"}
          </p>
          <p className="font-semibold tabular-nums">{ctx.valor_origem_exibicao}</p>
        </div>
        <div className="rounded-md border border-emerald-400/50 bg-background p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> ConsigFácil
          </p>
          <p className="font-semibold tabular-nums">{ctx.valor_oficial_exibicao}</p>
        </div>
        <div className="rounded-md border bg-background p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Diferença</p>
          <p className="font-semibold tabular-nums">{formatarDiferencaPct(ctx.diferenca_pct)}</p>
        </div>
        <div className="rounded-md border bg-background p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Períodos afetados
          </p>
          <p className="text-xs font-medium leading-snug">{periodos}</p>
        </div>
      </div>

      <p
        className={cn(
          "text-[11px] leading-snug",
          ehIndependente ? "text-sky-900/90 dark:text-sky-100/90" : "text-muted-foreground italic",
        )}
      >
        {ctx.descricao_contextual}
      </p>

      {ctx.quantidade > 1 && (
        <div>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onToggle}>
            {expandido ? (
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 mr-1" />
            )}
            {expandido ? "Recolher ocorrências" : "Expandir ocorrências"}
          </Button>

          {expandido && (
            <div className="mt-2 overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="p-2 font-medium">Competência</th>
                    <th className="p-2 font-medium">Origem</th>
                    <th className="p-2 font-medium">Score</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasTabela.map((row, i) => (
                    <tr key={`${row.alvo_id}-${i}`} className="border-b border-border/50 last:border-0">
                      <td className="p-2 tabular-nums">{row.competencia}</td>
                      <td className="p-2">{row.origem}</td>
                      <td className="p-2 tabular-nums">{row.score}</td>
                      <td className="p-2">{row.status}</td>
                      <td className="p-2 text-muted-foreground max-w-[240px]">{row.observacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
