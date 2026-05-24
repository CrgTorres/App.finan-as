"use client";

import { useState } from "react";
import { Layers, Eye, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  GrupoDivergenciaLogica,
  MetricasAgrupamentoTriagem,
  CausaProvavelCluster,
  DecisaoGrupoDivergencia,
} from "@/lib/triagem/agrupar-divergencias-logicas";
import { sugerirDecisaoParaGrupo } from "@/lib/triagem/agrupar-divergencias-logicas";
import { cn } from "@/lib/utils";

const ROTULO_CAUSA: Record<CausaProvavelCluster, string> = {
  desconto_fracionado: "Desconto fracionado",
  quebra_operacional: "Quebra operacional",
  consignacao_parcial: "Consignação parcial",
  rubrica_dividida: "Rubrica dividida",
  atraso_atualizacao: "Atraso atualização",
  bloqueio_temporario: "Bloqueio temporário",
  nao_identificado: "Não identificado",
};

const DECISOES: { id: DecisaoGrupoDivergencia; label: string }[] = [
  { id: "desconto_fracionado", label: "Desconto fracionado (margem)" },
  { id: "quebra_operacional", label: "Quebra operacional" },
  { id: "folha_parcial", label: "Folha parcial / cadastro correto" },
  { id: "consigfacil_correto", label: "ConsigFácil é o valor correto" },
  { id: "manter_conferencia", label: "Manter em conferência" },
  { id: "ignorar_padrao_futuro", label: "Ignorar padrão no futuro" },
];

function fmtMoeda(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = {
  grupos: GrupoDivergenciaLogica[];
  metricas: MetricasAgrupamentoTriagem;
  grupoRevisaoId: string | null;
  onResolverGrupo: (grupo: GrupoDivergenciaLogica, decisao: DecisaoGrupoDivergencia) => void;
  onRevisarGrupo: (grupo: GrupoDivergenciaLogica) => void;
  onAutoClusters?: () => void;
  autoElegiveis?: number;
};

export function PadroesDetectadosTriagem({
  grupos,
  metricas,
  grupoRevisaoId,
  onResolverGrupo,
  onRevisarGrupo,
  onAutoClusters,
  autoElegiveis = 0,
}: Props) {
  const [grupoDialog, setGrupoDialog] = useState<GrupoDivergenciaLogica | null>(null);
  const [decisaoSel, setDecisaoSel] = useState<DecisaoGrupoDivergencia>("desconto_fracionado");

  if (grupos.length === 0) return null;

  const abrirResolver = (grupo: GrupoDivergenciaLogica) => {
    setDecisaoSel(sugerirDecisaoParaGrupo(grupo));
    setGrupoDialog(grupo);
  };

  const confirmarResolver = () => {
    if (!grupoDialog) return;
    onResolverGrupo(grupoDialog, decisaoSel);
    setGrupoDialog(null);
  };

  return (
    <>
      <Card className="border-violet-500/45 bg-violet-500/5">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-5 w-5 text-violet-600" />
                Padrões detectados
              </CardTitle>
              <CardDescription>
                {metricas.grupos_detectados} grupo(s) · {metricas.linhas_em_grupos_multiplos} linha(s)
                consolidadas · ~{metricas.ganho_performance_triagem}% menos cliques na fila.
              </CardDescription>
            </div>
            {onAutoClusters && autoElegiveis > 0 && (
              <Button type="button" size="sm" variant="secondary" onClick={onAutoClusters}>
                Auto-resolver ({autoElegiveis})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {grupos.map((grupo) => (
            <article
              key={grupo.grupo_id}
              className={cn(
                "rounded-lg border p-3 space-y-2 bg-background/80",
                grupoRevisaoId === grupo.grupo_id && "ring-2 ring-violet-500/60",
                grupo.pode_resolver_em_lote && "border-emerald-500/35",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-sm">
                    {grupo.banco ?? "—"}
                    {grupo.rubrica ? ` · ${grupo.rubrica}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtMoeda(grupo.valor_observado)} observado × {fmtMoeda(grupo.valor_oficial)}{" "}
                    oficial
                    {grupo.percentual_divergencia != null &&
                      ` · ~${grupo.percentual_divergencia.toFixed(1)}%`}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {grupo.quantidade_ocorrencias} ocorrências
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {ROTULO_CAUSA[grupo.causa_provavel]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      conf. {grupo.score_confianca_cluster}%
                    </Badge>
                    {grupo.pode_resolver_em_lote && (
                      <Badge className="text-[10px] bg-emerald-600">Pode resolver em lote</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{grupo.justificativa_cluster}</p>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  <Button type="button" size="sm" onClick={() => abrirResolver(grupo)}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Resolver grupo
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onRevisarGrupo(grupo)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Revisar grupo
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>

      <Dialog open={grupoDialog != null} onOpenChange={(o) => !o && setGrupoDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver grupo ({grupoDialog?.quantidade_ocorrencias} linhas)</DialogTitle>
            <DialogDescription>
              Uma decisão será aplicada a todas as ocorrências do padrão — sem perguntas individuais.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            {DECISOES.map((d) => (
              <Button
                key={d.id}
                type="button"
                variant={decisaoSel === d.id ? "default" : "outline"}
                size="sm"
                className="justify-start h-auto py-2"
                onClick={() => setDecisaoSel(d.id)}
              >
                {d.label}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setGrupoDialog(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarResolver}>
              Aplicar a {grupoDialog?.quantidade_ocorrencias} linha(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
