"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronRight, HelpCircle, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ContextoTriagem, NivelLeitura } from "@/lib/triagem/triagem-inteligente-tipos";
import { ROTULOS_TIPO_PROBLEMA, ROTULOS_NIVEL_LEITURA } from "@/lib/triagem/triagem-inteligente-tipos";
import {
  ehNoTerminal,
  getPerguntaPorId,
  getPrimeiraPergunta,
  proximaPerguntaId,
} from "@/lib/triagem/perguntas-triagem-financeira";
import { resolverTriagemFinanceira } from "@/lib/triagem/resolver-triagem-financeira";
import {
  aplicarRespostasTriagem,
  buscarPadraoAprendido,
  type ResultadoAplicacaoTriagem,
} from "@/lib/triagem/aplicar-respostas-triagem";
import { salvarTriagemResposta, salvarPadraoAprendidoSupabase } from "@/lib/triagem/triagem-service";
import type { RespostasTriagem } from "@/lib/triagem/triagem-inteligente-tipos";

const NIVEIS_ORDEM: NivelLeitura[] = ["basico", "intermediario", "avancado", "especialista"];

type Props = {
  contexto: ContextoTriagem;
  tituloDetectado?: string;
  onConcluido?: (aplicacao: ResultadoAplicacaoTriagem) => void;
  onCancelar?: () => void;
  compacto?: boolean;
};

export function TriagemInteligenteForm({
  contexto,
  tituloDetectado,
  onConcluido,
  onCancelar,
  compacto = false,
}: Props) {
  const primeira = getPrimeiraPergunta(contexto.tipo_problema);
  const [perguntaAtualId, setPerguntaAtualId] = useState<string | null>(primeira?.id ?? null);
  const [respostas, setRespostas] = useState<RespostasTriagem>({});
  const [finalizando, setFinalizando] = useState(false);
  const [resultadoPreview, setResultadoPreview] = useState<ReturnType<typeof resolverTriagemFinanceira> | null>(
    null,
  );

  const perguntaAtual = perguntaAtualId ? getPerguntaPorId(perguntaAtualId) : undefined;

  const nivelAtualIdx = useMemo(() => {
    if (!perguntaAtual) return 0;
    return NIVEIS_ORDEM.indexOf(perguntaAtual.nivel);
  }, [perguntaAtual]);

  const finalizarTriagem = useCallback(
    async (terminalId: string, respostasFinais: RespostasTriagem) => {
      setFinalizando(true);
      try {
        const resultado = resolverTriagemFinanceira(
          contexto.tipo_problema,
          respostasFinais,
          contexto,
          terminalId,
        );
        setResultadoPreview(resultado);

        const aplicacao = aplicarRespostasTriagem({
          contexto,
          respostas: respostasFinais,
          resultado,
        });

        if (perguntaAtual) {
          await salvarTriagemResposta({
            tipo_problema: contexto.tipo_problema,
            nivel: perguntaAtual.nivel,
            entidade_tipo: contexto.entidade_tipo,
            entidade_id: contexto.entidade_id,
            pergunta_id: perguntaAtual.id,
            pergunta: perguntaAtual.pergunta,
            resposta: respostasFinais,
            resultado,
            resolvido: resultado.resolvido,
            remover_pendencia: resultado.remover_pendencia,
          });
        }

        if (resultado.registrar_padrao) {
          void salvarPadraoAprendidoSupabase({
            tipo_problema: contexto.tipo_problema,
            condicoes: respostasFinais,
            acao_recomendada: resultado.nova_classificacao,
            nivel_confianca: resultado.nivel_confianca,
          });
        }

        if (resultado.remover_pendencia) {
          toast.success(aplicacao.mensagem);
        } else if (resultado.sugerir_especialista) {
          toast.warning(aplicacao.mensagem);
        } else {
          toast.info(aplicacao.mensagem);
        }

        onConcluido?.(aplicacao);
      } finally {
        setFinalizando(false);
      }
    },
    [contexto, onConcluido, perguntaAtual],
  );

  const responder = useCallback(
    (valor: string) => {
      if (!perguntaAtual) return;

      const novas: RespostasTriagem = { ...respostas, [perguntaAtual.id]: valor };
      setRespostas(novas);

      const padrao = buscarPadraoAprendido(contexto.tipo_problema, novas);
      if (padrao && valor !== "nao_sei") {
        const resultadoPadrao = {
          resolvido: true,
          nova_classificacao: padrao.acao_recomendada,
          nivel_confianca: padrao.nivel_confianca,
          remover_pendencia: true,
          manter_pendencia: false,
          motivo: `Padrão aprendido aplicado: ${padrao.acao_recomendada}`,
          campos_corrigidos: {},
          proxima_acao: "nenhuma",
        };
        setFinalizando(true);
        const aplicacao = aplicarRespostasTriagem({
          contexto,
          respostas: novas,
          resultado: resultadoPadrao,
        });
        setResultadoPreview(resultadoPadrao);
        toast.success(aplicacao.mensagem);
        onConcluido?.(aplicacao);
        setFinalizando(false);
        return;
      }

      const nextId = proximaPerguntaId(perguntaAtual, valor);
      if (!nextId) {
        void finalizarTriagem(perguntaAtual.id, novas);
        return;
      }

      if (ehNoTerminal(nextId)) {
        void finalizarTriagem(nextId, { ...novas, [nextId]: valor });
        return;
      }

      const prox = getPerguntaPorId(nextId);
      if (prox) {
        setPerguntaAtualId(nextId);
      } else {
        void finalizarTriagem(nextId, novas);
      }
    },
    [perguntaAtual, respostas, contexto, finalizarTriagem],
  );

  if (!primeira) {
    return (
      <p className="text-sm text-muted-foreground">Sem perguntas cadastradas para este tipo de problema.</p>
    );
  }

  if (resultadoPreview && !perguntaAtualId) {
    return (
      <Card className={cn(compacto && "border-dashed")}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Triagem concluída
          </CardTitle>
          <CardDescription>{resultadoPreview.motivo}</CardDescription>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          <Badge variant={resultadoPreview.remover_pendencia ? "default" : "secondary"}>
            {resultadoPreview.nova_classificacao}
          </Badge>
          <p className="text-muted-foreground">
            Confiança: {Math.round(resultadoPreview.nivel_confianca * 100)}% —{" "}
            {resultadoPreview.proxima_acao}
          </p>
          {onCancelar && (
            <Button size="sm" variant="outline" onClick={onCancelar}>
              Fechar
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-violet-300/50", compacto && "shadow-sm")}>
      <CardHeader className={cn("pb-2", compacto && "py-3")}>
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          Resolver com perguntas
        </CardTitle>
        <CardDescription className="text-xs">
          {tituloDetectado ?? ROTULOS_TIPO_PROBLEMA[contexto.tipo_problema]}
          {contexto.competencia && ` · ${contexto.competencia}`}
          {contexto.banco && ` · ${contexto.banco}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {contexto.tipo_problema === "divergencia_valor" &&
          (contexto.valor_esperado != null || contexto.valor_observado != null) && (
            <div className="rounded-lg border border-violet-500/35 bg-violet-500/8 px-3 py-2 text-[11px] tabular-nums space-y-1">
              <p className="font-medium text-violet-950 dark:text-violet-100">Comparação de valores</p>
              <p>
                ConsigFácil (esperado):{" "}
                {(contexto.valor_esperado ?? 0).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
              <p>
                Folha / observado:{" "}
                {(contexto.valor_observado ?? 0).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
              {contexto.descricao && (
                <p className="text-muted-foreground font-sans">{contexto.descricao}</p>
              )}
            </div>
          )}
        {/* Barra de níveis */}
        <div className="flex items-center gap-1 text-[10px]">
          {NIVEIS_ORDEM.map((n, i) => (
            <div key={n} className="flex items-center gap-1 flex-1">
              <div
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i <= nivelAtualIdx ? "bg-violet-500" : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "hidden sm:inline shrink-0",
                  i === nivelAtualIdx ? "font-semibold text-violet-700" : "text-muted-foreground",
                )}
              >
                {ROTULOS_NIVEL_LEITURA[n]}
              </span>
              {i < NIVEIS_ORDEM.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
            </div>
          ))}
        </div>

        {perguntaAtual && (
          <div className="space-y-3">
            <p className="text-sm font-medium leading-snug">{perguntaAtual.pergunta}</p>
            {perguntaAtual.ajuda && (
              <p className="text-[11px] text-muted-foreground flex gap-1">
                <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                {perguntaAtual.ajuda}
              </p>
            )}

            {perguntaAtual.tipo_resposta === "sim_nao" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="default"
                  disabled={finalizando}
                  onClick={() => responder("sim")}
                >
                  Sim
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={finalizando}
                  onClick={() => responder("nao")}
                >
                  Não
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={finalizando}
                  onClick={() => responder("nao_sei")}
                >
                  Não sei
                </Button>
                <Button size="sm" variant="ghost" disabled={finalizando}>
                  Ver detalhes
                </Button>
              </div>
            )}

            {perguntaAtual.tipo_resposta === "multipla_escolha" &&
              perguntaAtual.opcoes?.map((op) => (
                <Button key={op} size="sm" variant="outline" onClick={() => responder(op)}>
                  {op}
                </Button>
              ))}
          </div>
        )}

        {finalizando && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Aplicando respostas…
          </p>
        )}

        {onCancelar && (
          <Button size="sm" variant="ghost" onClick={onCancelar} disabled={finalizando}>
            Cancelar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
