"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ItemTriagemResolutiva } from "@/lib/triagem/triagem-resolutiva-tipos";
import { ROTULOS_TIPO_PROBLEMA } from "@/lib/triagem/triagem-inteligente-tipos";
import { SequenciaLogicaDivergencia } from "@/components/dashboard/triagem/sequencia-logica-divergencia";
import { RespostaDivergenciaCard } from "@/components/dashboard/triagem/resposta-divergencia-card";
import { PerguntasResolutivasDivergencia } from "@/components/dashboard/triagem/perguntas-resolutivas-divergencia";
import {
  aplicarRespostasTriagem,
  type ResultadoAplicacaoTriagem,
} from "@/lib/triagem/aplicar-respostas-triagem";
import { contextoDePendencia } from "@/lib/triagem/triagem-service";
import { toast } from "sonner";

type Props = {
  item: ItemTriagemResolutiva | null;
  aberto: boolean;
  onFechar: () => void;
  onConcluido: () => void;
};

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PainelResolucaoDivergenciaLateral({ item, aberto, onFechar, onConcluido }: Props) {
  if (!aberto || !item) return null;

  const p = item.pendencia;
  const d = item.contexto.divergencia;
  const motorAutoResolvido =
    item.motor.resolvido && item.motor.remover_conferencia && !item.resolucao_usuario;

  const aceitarAutomatico = () => {
    const ctx = contextoDePendencia(p);
    const aplicacao = aplicarRespostasTriagem({
      contexto: ctx,
      respostas: { motor_auto: "aceito" },
      resultado: {
        resolvido: true,
        nova_classificacao: item.motor.classificacao,
        nivel_confianca: item.motor.confianca,
        remover_pendencia: true,
        manter_pendencia: false,
        motivo: item.motor.explicacao,
        campos_corrigidos: item.motor.campos_aplicados,
        proxima_acao: "nenhuma",
        registrar_padrao: item.motor.aprendizado_sugerido,
      },
    });
    toast.success(aplicacao.mensagem);
    onConcluido();
  };

  const onPerguntasConcluido = (_ap: ResultadoAplicacaoTriagem) => {
    onConcluido();
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/40"
        aria-label="Fechar painel"
        onClick={onFechar}
      />
      <aside
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-lg",
          "bg-background border-l shadow-xl flex flex-col",
          "animate-in slide-in-from-right duration-200",
        )}
      >
        <header className="flex items-start justify-between gap-2 border-b p-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Resolução guiada</h2>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {p.instituicao_oficial ?? "—"} · {p.competencia ?? "—"}
            </p>
            <Badge variant="outline" className="mt-2 text-[10px]">
              {ROTULOS_TIPO_PROBLEMA[contextoDePendencia(p).tipo_problema] ?? p.tipo}
            </Badge>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onFechar} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <section className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
            <h3 className="font-semibold text-sm">Resumo da divergência</h3>
            <p className="text-muted-foreground">{p.descricao}</p>
            <dl className="grid grid-cols-2 gap-2 tabular-nums">
              <div>
                <dt className="text-muted-foreground">ConsigFácil</dt>
                <dd className="font-medium">{formatBRL(d.valor_previsto)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Folha (soma)</dt>
                <dd className="font-medium">{formatBRL(d.valor_descontado)}</dd>
              </div>
              {d.percentual_divergencia != null && (
                <div>
                  <dt className="text-muted-foreground">Divergência</dt>
                  <dd className="font-medium">{d.percentual_divergencia.toFixed(1)}%</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Rubricas folha</dt>
                <dd>{item.contexto.fragmentos_desconto.length}</dd>
              </div>
            </dl>
          </section>

          {item.contexto.eventos_competencia.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Eventos operacionais</h3>
              <ul className="text-[11px] space-y-1 max-h-28 overflow-auto">
                {item.contexto.eventos_competencia.map((e, i) => (
                  <li key={`${e.tipo}-${i}`} className="border-b py-1">
                    <span className="font-medium">{e.tipo}</span> — {e.justificativa ?? "—"}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold mb-2">Sequência lógica (motor)</h3>
            <SequenciaLogicaDivergencia motor={item.motor} />
          </section>

          <RespostaDivergenciaCard item={item} />

          {motorAutoResolvido && (
            <Button type="button" className="w-full" onClick={aceitarAutomatico}>
              Aceitar resolução automática do motor
            </Button>
          )}

          {(!item.motor.resolvido || !item.motor.remover_conferencia) && (
            <section className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3">Perguntas resolutivas</h3>
              <PerguntasResolutivasDivergencia item={item} onConcluido={onPerguntasConcluido} />
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
