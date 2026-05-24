"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Layers,
  ListTree,
  Eye,
  EyeOff,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ItemTriagemResolutiva } from "@/lib/triagem/triagem-resolutiva-tipos";
import type { MetricasConsolidacaoContextual } from "@/lib/triagem/consolidar-contextos-resolutivos";
import type { ContextoResolutivoExportacao } from "@/lib/triagem/rastreabilidade-triagem-consolidada";
import {
  justificativaExibicao,
  rotuloOrigemContexto,
  rotuloTipoContexto,
  tituloContextoResolutivo,
} from "@/lib/triagem/consolidar-contextos-resolutivos";
import { ROTULOS_CLASSIFICACAO_RESOLUCAO } from "@/lib/triagem/triagem-resolutiva-tipos";
import { cn } from "@/lib/utils";

function fmtMoeda(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = {
  contextos: ContextoResolutivoExportacao[];
  metricas: MetricasConsolidacaoContextual;
  itensPorId: Map<string, ItemTriagemResolutiva>;
  onVerLinha?: (pendenciaId: string) => void;
  linhasReveladas?: Set<string>;
  onRevelarLinhasContexto?: (ctx: ContextoResolutivoExportacao) => void;
  onManterConsolidado?: (ctx: ContextoResolutivoExportacao) => void;
  onExportarContexto?: (ctx: ContextoResolutivoExportacao) => void;
};

export function ContextosResolutivosPainel({
  contextos,
  metricas,
  itensPorId,
  onVerLinha,
  linhasReveladas,
  onRevelarLinhasContexto,
  onManterConsolidado,
  onExportarContexto,
}: Props) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  if (contextos.length === 0) return null;

  const toggle = (id: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-5 w-5 text-emerald-600" />
          Contextos resolvidos automaticamente
        </CardTitle>
        <CardDescription>
          {metricas.resolucoes_automaticas_agrupadas} contexto(s) ·{" "}
          {metricas.linhas_consolidadas} linha(s) consolidadas · redução cognitiva{" "}
          {metricas.reducao_cognitiva_pct}% · ruído removido {metricas.percentual_ruido_removido}%
        </CardDescription>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="outline">{metricas.linhas_consolidadas} consolidadas</Badge>
          <Badge variant="outline">{metricas.reducao_cognitiva_pct}% menos cards</Badge>
          <Badge className="bg-emerald-600">{metricas.percentual_ruido_removido}% ruído</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {contextos.map((ctx) => {
          const aberto = expandidos.has(ctx.contexto_id);
          const revelado = ctx.linhas_relacionadas.some((id) => linhasReveladas?.has(id));

          return (
            <article
              key={ctx.contexto_id}
              className={cn(
                "rounded-lg border bg-background/90 overflow-hidden",
                ctx.pode_ocultar_linhas_individuais && "border-emerald-500/30",
              )}
            >
              <div className="p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{tituloContextoResolutivo(ctx)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ctx.quantidade_ocorrencias} ocorrências resolvidas automaticamente
                    </p>
                    <p className="text-xs mt-1">
                      Motivo: {justificativaExibicao(ctx)}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {rotuloTipoContexto(ctx.tipo_contexto)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Origem: {rotuloOrigemContexto(ctx.origem_principal)}
                      </Badge>
                      {ctx.impacto_financeiro_total > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          Impacto: {fmtMoeda(ctx.impacto_financeiro_total)}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        conf. {ctx.score_confianca}%
                      </Badge>
                      {ctx.score_confianca >= 85 && (
                        <Badge className="text-[10px] bg-emerald-600">Pode resolver em lote</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => toggle(ctx.contexto_id)}
                  >
                    {aberto ? (
                      <ChevronDown className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 mr-1" />
                    )}
                    {aberto ? "Recolher detalhes" : "Expandir detalhes"}
                  </Button>
                  {onRevelarLinhasContexto && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => onRevelarLinhasContexto(ctx)}
                    >
                      <ListTree className="h-3.5 w-3.5 mr-1" />
                      Ver linhas individuais
                    </Button>
                  )}
                  {onManterConsolidado && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => onManterConsolidado(ctx)}
                    >
                      {revelado ? (
                        <EyeOff className="h-3.5 w-3.5 mr-1" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 mr-1" />
                      )}
                      Manter consolidado
                    </Button>
                  )}
                  {onExportarContexto && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onExportarContexto(ctx)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Exportar contexto
                    </Button>
                  )}
                </div>
              </div>

              {aberto && (
                <div className="border-t bg-muted/30 px-3 py-2 space-y-1.5 max-h-48 overflow-y-auto">
                  {ctx.linhas_relacionadas.map((id) => {
                    const item = itensPorId.get(id);
                    if (!item) return null;
                    const p = item.pendencia;
                    const classificacao = item.motor.classificacao;
                    return (
                      <div
                        key={id}
                        className="flex flex-wrap items-center justify-between gap-2 text-[11px] py-1 border-b border-border/50 last:border-0"
                      >
                        <div className="min-w-0">
                          <span className="text-muted-foreground">{p.competencia ?? "—"}</span>
                          <span className="mx-1">·</span>
                          <span className="truncate">{p.descricao?.slice(0, 80) ?? id}</span>
                          <Badge variant="outline" className="text-[9px] ml-1">
                            {ROTULOS_CLASSIFICACAO_RESOLUCAO[classificacao] ?? classificacao}
                          </Badge>
                        </div>
                        {onVerLinha && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] shrink-0"
                            onClick={() => onVerLinha(id)}
                          >
                            Abrir
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </CardContent>
    </Card>
  );
}
