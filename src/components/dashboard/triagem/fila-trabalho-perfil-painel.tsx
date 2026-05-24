"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type ItemFilaTrabalhoTriagem,
  type PerfilTrabalhoTriagem,
  type ResultadoFilaTrabalhoPerfil,
  ROTULO_PERFIL_TRABALHO,
} from "@/lib/triagem/montar-fila-trabalho-perfil";
import { PrioridadeRiscoBadge } from "@/components/dashboard/triagem/prioridade-risco-badge";
import { cn } from "@/lib/utils";
import { ROTULOS_TRIAGEM_UI } from "@/lib/triagem/rotulos-triagem-resolutiva-ui";

const PERFIS_ORDEM: PerfilTrabalhoTriagem[] = [
  "usuario_comum",
  "ia",
  "orientador",
  "juridico",
  "contabil",
  "pericial",
];

type Props = {
  filaTrabalho: ResultadoFilaTrabalhoPerfil;
  perfilAtivo?: PerfilTrabalhoTriagem;
  onPerfilAtivo?: (p: PerfilTrabalhoTriagem) => void;
  onAbrirEntidade?: (item: ItemFilaTrabalhoTriagem) => void;
};

function CardTarefa({
  item,
  onAbrir,
}: {
  item: ItemFilaTrabalhoTriagem;
  onAbrir?: () => void;
}) {
  return (
    <article className="rounded-lg border p-3 space-y-2 bg-background/80">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap gap-1">
            <PrioridadeRiscoBadge prioridade={item.prioridade} />
            {item.risco_juridico && (
              <Badge variant="outline" className="text-[10px]">
                Jurídico
              </Badge>
            )}
            {item.risco_financeiro && (
              <Badge variant="outline" className="text-[10px]">
                Financeiro
              </Badge>
            )}
            {item.requer_documento && (
              <Badge variant="secondary" className="text-[10px]">
                Documento
              </Badge>
            )}
          </div>
          <p className="font-medium text-sm">{item.titulo}</p>
          <p className="text-xs text-muted-foreground">{item.descricao}</p>
          <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">
            → {item.acao_recomendada}
          </p>
        </div>
        {onAbrir && (
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onAbrir}>
            Abrir
          </Button>
        )}
      </div>
    </article>
  );
}

export function FilaTrabalhoPerfilPainel({
  filaTrabalho,
  perfilAtivo = "usuario_comum",
  onPerfilAtivo,
  onAbrirEntidade,
}: Props) {
  const totalHumano = filaTrabalho.metricas.total_humano_final;
  const totalFilaAlinhada = filaTrabalho.metricas.total_filtrado;

  return (
    <Card className="border-violet-500/35">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Fila de trabalho por perfil</CardTitle>
        <CardDescription>
          A mesma base de triagem, organizada para cada público.{" "}
          <span className="font-medium text-foreground">
            {totalHumano === 0
              ? ROTULOS_TRIAGEM_UI.nenhumaAcaoHumanaPendente
              : `${totalHumano} tarefa(s) na fila humana estrutural`}
            {totalFilaAlinhada !== totalHumano && totalHumano > 0
              ? ` (${totalFilaAlinhada} itens estruturais oficiais)`
              : ""}
            .
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={perfilAtivo}
          onValueChange={(v) => onPerfilAtivo?.(v as PerfilTrabalhoTriagem)}
        >
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
            {PERFIS_ORDEM.map((p) => (
              <TabsTrigger key={p} value={p} className="text-xs sm:text-sm">
                {ROTULO_PERFIL_TRABALHO[p]}
                <Badge variant="secondary" className="ml-1.5 text-[10px] tabular-nums">
                  {filaTrabalho.filas[p].length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {PERFIS_ORDEM.map((p) => {
            const itens = filaTrabalho.filas[p];
            const humanas = filaTrabalho.acao_humana_por_perfil[p];
            return (
              <TabsContent key={p} value={p} className="mt-4 space-y-3">
                <p
                  className={cn(
                    "text-sm rounded-md px-3 py-2",
                    humanas > 0
                      ? "bg-amber-500/10 text-amber-900 dark:text-amber-100 border border-amber-500/30"
                      : "bg-muted/50 text-muted-foreground",
                  )}
                >
                  {humanas > 0 ? (
                    <>
                      Esta fila contém <strong>{humanas}</strong> item(ns) na fila humana
                      estrutural.
                    </>
                  ) : (
                    <>{ROTULOS_TRIAGEM_UI.nenhumaAcaoHumanaPendente}</>
                  )}
                </p>

                {itens.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhuma tarefa para este perfil no momento.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {itens.map((item) => (
                      <CardTarefa
                        key={item.id}
                        item={item}
                        onAbrir={
                          onAbrirEntidade && item.entidade_tipo === "pendencia_triagem"
                            ? () => onAbrirEntidade(item)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
