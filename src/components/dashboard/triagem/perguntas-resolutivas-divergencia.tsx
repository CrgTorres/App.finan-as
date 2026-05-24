"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { ItemTriagemResolutiva, PerguntaResolutivaDivergencia } from "@/lib/triagem/triagem-resolutiva-tipos";
import {
  resolverComRespostasUsuario,
} from "@/lib/triagem/resolver-divergencia-guiada";
import {
  aplicarRespostasTriagem,
  type ResultadoAplicacaoTriagem,
} from "@/lib/triagem/aplicar-respostas-triagem";
import {
  registrarAprendizadoDivergencia,
  atualizarPreferenciaBancoQuebraMargem,
  type RespostaAprendizadoDivergencia,
} from "@/lib/triagem/aprendizado-divergencias";
import { contextoDePendencia } from "@/lib/triagem/triagem-service";
import { toast } from "sonner";

type Props = {
  item: ItemTriagemResolutiva;
  perguntas?: PerguntaResolutivaDivergencia[];
  onConcluido: (aplicacao: ResultadoAplicacaoTriagem) => void;
};

export function PerguntasResolutivasDivergencia({ item, perguntas, onConcluido }: Props) {
  const lista = perguntas ?? item.motor.perguntas_pendentes;
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const todasObrigatoriasOk = lista
    .filter((p) => p.obrigatoria)
    .every((p) => respostas[p.id]);

  const responder = (perguntaId: string, valor: string) => {
    setRespostas((prev) => ({ ...prev, [perguntaId]: valor }));
  };

  const finalizar = async () => {
    setSalvando(true);
    try {
      const motorFinal = resolverComRespostasUsuario(item.contexto, respostas);
      const ctx = contextoDePendencia(item.pendencia);

      const resultadoTriagem = {
        resolvido: motorFinal.resolvido,
        nova_classificacao: motorFinal.classificacao,
        nivel_confianca: motorFinal.confianca,
        remover_pendencia: motorFinal.remover_conferencia,
        manter_pendencia: !motorFinal.remover_conferencia,
        motivo: motorFinal.explicacao,
        campos_corrigidos: motorFinal.campos_aplicados,
        proxima_acao: motorFinal.remover_conferencia ? "nenhuma" : "revisar_manualmente",
        registrar_padrao: motorFinal.aprendizado_sugerido,
      };

      const aplicacao = aplicarRespostasTriagem({
        contexto: ctx,
        respostas,
        resultado: resultadoTriagem,
      });

      const banco = item.pendencia.instituicao_oficial ?? "";
      const recMargem = respostas.rec_quebra_margem as RespostaAprendizadoDivergencia | undefined;
      if (recMargem && banco) {
        atualizarPreferenciaBancoQuebraMargem(banco, recMargem);
      }

      if (respostas.div_ignorar_futuro === "sim" && banco) {
        registrarAprendizadoDivergencia({
          banco,
          tipo_divergencia: item.pendencia.tipo,
          resposta_usuario: "ignorar_padrao_futuro",
          classificacao: motorFinal.classificacao,
          percentual_tipico: item.contexto.divergencia.percentual_divergencia,
          aplicar_automaticamente_futuro: true,
        });
      }

      if (motorFinal.remover_conferencia) {
        toast.success(aplicacao.mensagem);
      } else {
        toast.info(aplicacao.mensagem);
      }

      onConcluido(aplicacao);
    } finally {
      setSalvando(false);
    }
  };

  if (lista.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        O motor resolutivo não exige perguntas adicionais para este caso.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {lista.map((p) => (
        <div key={p.id} className="space-y-2">
          <p className="text-sm font-medium leading-snug">{p.pergunta}</p>
          {p.ajuda && <p className="text-[11px] text-muted-foreground">{p.ajuda}</p>}
          <div className="flex flex-wrap gap-2">
            {p.opcoes.map((op) => (
              <Button
                key={op.id}
                type="button"
                size="sm"
                variant={respostas[p.id] === op.id ? "default" : "outline"}
                onClick={() => responder(p.id, op.id)}
              >
                {op.label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <Button
        type="button"
        className="w-full"
        disabled={!todasObrigatoriasOk || salvando}
        onClick={() => void finalizar()}
      >
        {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden /> : null}
        Confirmar resolução
      </Button>
    </div>
  );
}
