"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Info,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConsigfacilAjusteBase } from "@/types/consigfacil";
import {
  consolidarDivergenciasContextuais,
  type MetadadosChaveConsolidacaoDivergencia,
} from "@/lib/conciliacao/consolidar-divergencias-contextuais";
import { ConciliacaoContextoCard } from "@/components/dashboard/conciliacao/conciliacao-contexto-card";
import { criarResolverMetaDivergenciaContextual } from "@/lib/conciliacao/resolver-meta-divergencia-consigfacil";
import { textoRubricaLinha } from "@/lib/conciliacao/regras-natureza-consignavel";

export type DivergenciasContextuaisPainelProps = {
  ajustes: ConsigfacilAjusteBase[];
  resolverMeta?: (a: ConsigfacilAjusteBase) => MetadadosChaveConsolidacaoDivergencia | undefined;
  loansComCorrelacao?: Array<{
    id: string;
    confirmacao_consigfacil?: import("@/types/consigfacil").ConsigfacilConfirmacao;
    institution_name?: string | null;
    description?: string | null;
  }>;
  linhasBaseComCorrelacao?: Array<{
    id: string;
    confirmacao_consigfacil?: import("@/types/consigfacil").ConsigfacilConfirmacao;
    contexto_instituicao?: import("@/lib/conciliacao/contexto-instituicao-folha-consigfacil").ContextoInstituicaoConciliacao | null;
    instituicao_original_folha?: string | null;
    banco_origem?: string | null;
    competencia?: string | null;
    descricao_original?: string | null;
    descricao_normalizada?: string | null;
  }>;
};

function ListaPlanaLegada({ lista }: { lista: ConsigfacilAjusteBase[] }) {
  return (
    <div className="divide-y divide-border rounded-md border">
      {lista.map((a, idx) => (
        <div key={`${a.id_consignacao}-${a.campo}-${idx}`} className="p-3 text-sm space-y-1">
          <span className="font-mono text-xs">{a.id_consignacao}</span> — {a.campo} —{" "}
          {String(a.valor_original)} vs {String(a.valor_oficial)}
        </div>
      ))}
    </div>
  );
}

export function DivergenciasContextuaisPainel({
  ajustes,
  resolverMeta: resolverMetaProp,
  loansComCorrelacao,
  linhasBaseComCorrelacao,
}: DivergenciasContextuaisPainelProps) {
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "confirmado" | "divergencia">("divergencia");
  const [ocultarRepeticoes, setOcultarRepeticoes] = useState(true);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const resolverMeta = useMemo(() => {
    if (resolverMetaProp) return resolverMetaProp;
    if (!loansComCorrelacao?.length && !linhasBaseComCorrelacao?.length) return undefined;
    return criarResolverMetaDivergenciaContextual({
      loans: loansComCorrelacao,
      linhasBase: linhasBaseComCorrelacao,
    });
  }, [resolverMetaProp, loansComCorrelacao, linhasBaseComCorrelacao]);

  const resolverTextoRubrica = useMemo(() => {
    if (!loansComCorrelacao?.length && !linhasBaseComCorrelacao?.length) return undefined;
    const loansById = new Map((loansComCorrelacao ?? []).map((l) => [l.id, l]));
    const baseById = new Map((linhasBaseComCorrelacao ?? []).map((l) => [l.id, l]));
    return (a: ConsigfacilAjusteBase) => {
      if (a.alvo_tipo === "loan") {
        const loan = loansById.get(a.alvo_id);
        return loan?.description ?? loan?.institution_name ?? null;
      }
      if (a.alvo_tipo === "base_conciliada") {
        const linha = baseById.get(a.alvo_id);
        return linha ? textoRubricaLinha(linha) : null;
      }
      return null;
    };
  }, [loansComCorrelacao, linhasBaseComCorrelacao]);

  const consolidacao = useMemo(
    () => consolidarDivergenciasContextuais(ajustes, resolverMeta, resolverTextoRubrica),
    [ajustes, resolverMeta, resolverTextoRubrica],
  );

  const { contextosFiltrados, confirmadosFiltrados, metricas } = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const passaBusca = (id: string, campo: string, motivo: string) =>
      !b ||
      id.toLowerCase().includes(b) ||
      campo.toLowerCase().includes(b) ||
      motivo.toLowerCase().includes(b);

    const contextos = consolidacao.contextos.filter((c) =>
      passaBusca(c.id_consignacao, c.campo, c.motivo_resumo),
    );
    const confirmados = consolidacao.confirmados.filter(
      (c) =>
        passaBusca(c.id_consignacao, c.campo, c.motivo_ajuste) &&
        (filtroTipo === "todos" || filtroTipo === "confirmado"),
    );

    return {
      contextosFiltrados: contextos,
      confirmadosFiltrados: confirmados,
      metricas: consolidacao.metricas,
    };
  }, [consolidacao, busca, filtroTipo]);

  const exibirContextos = filtroTipo !== "confirmado" ? contextosFiltrados : [];

  if (ajustes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ajustes ConsigFácil</CardTitle>
          <CardDescription>
            Importe um snapshot ConsigFácil para ver confirmações e diferenças monitoradas.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const totalConfirmados = consolidacao.confirmados.length;
  const totalDivergencias = metricas.linhas_originais;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-4 w-4" /> Ajustes ConsigFácil (contextual)
            </CardTitle>
            <CardDescription>
              Divergências repetidas agrupadas por contrato e campo — contextos independentes não
              contam como erro crítico sem continuidade comprovada.
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              {totalConfirmados} confirmado(s)
            </Badge>
            <Badge variant="outline" className="gap-1">
              <AlertTriangle className="h-3 w-3 text-red-600" />
              {metricas.total_divergencias_criticas} crítica(s)
            </Badge>
            {metricas.contextos_independentes_monitorados > 0 && (
              <Badge
                variant="outline"
                className="gap-1 border-sky-500/50 text-sky-800 dark:text-sky-200"
              >
                <Info className="h-3 w-3" />
                {metricas.contextos_independentes_monitorados} contexto(s) independente(s)
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-violet-500/35 bg-violet-500/5 p-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
              Divergências consolidadas
            </p>
            <p className="text-lg font-bold tabular-nums">
              {metricas.linhas_originais} linhas → {metricas.contextos_reais} contextos reais
            </p>
            {metricas.contextos_consolidados > 0 && (
              <p className="text-xs text-muted-foreground">
                {metricas.contextos_consolidados} bloco(s) com repetição ·{" "}
                {metricas.linhas_em_contextos_consolidados} linhas agrupadas
              </p>
            )}
          </div>
          <div className="rounded-lg border border-sky-500/35 bg-sky-500/5 p-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
              Contextos independentes monitorados
            </p>
            <p className="text-lg font-bold tabular-nums text-sky-900 dark:text-sky-100">
              {metricas.contextos_independentes_monitorados}
            </p>
            <p className="text-xs text-muted-foreground leading-snug">
              Rubrica histórica e contrato ConsigFácil sem evidência documental de continuidade —
              não entram em divergências críticas ({metricas.divergencia_estrutural_prioritaria}{" "}
              estrutural(is) prioritária(s)).
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            placeholder="Buscar contrato, campo, motivo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="lg:col-span-2"
          />
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="divergencia">Apenas divergências</option>
            <option value="confirmado">Apenas confirmações</option>
            <option value="todos">Todos os ajustes</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="ocultar-repeticoes"
            type="checkbox"
            className="h-4 w-4 rounded border"
            checked={ocultarRepeticoes}
            onChange={(e) => setOcultarRepeticoes(e.target.checked)}
          />
          <Label htmlFor="ocultar-repeticoes" className="text-sm font-normal cursor-pointer">
            Ocultar repetições consolidadas (visão por contexto)
          </Label>
        </div>

        {ocultarRepeticoes ? (
          <div className="space-y-3">
            {exibirContextos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma divergência com o filtro atual.
              </p>
            ) : (
              exibirContextos.map((ctx) => (
                <ConciliacaoContextoCard
                  key={ctx.chave}
                  ctx={ctx}
                  expandido={expandidos.has(ctx.chave)}
                  onToggle={() =>
                    setExpandidos((prev) => {
                      const next = new Set(prev);
                      if (next.has(ctx.chave)) next.delete(ctx.chave);
                      else next.add(ctx.chave);
                      return next;
                    })
                  }
                />
              ))
            )}
          </div>
        ) : (
          <ListaPlanaLegada lista={ajustes.filter((a) => a.tipo_ajuste === "divergencia")} />
        )}

        {(filtroTipo === "todos" || filtroTipo === "confirmado") &&
          confirmadosFiltrados.length > 0 && (
            <div className="rounded-md border border-emerald-500/30 divide-y divide-border">
              <p className="px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-500/5">
                Confirmações ({confirmadosFiltrados.length})
              </p>
              {confirmadosFiltrados.slice(0, 12).map((a, idx) => (
                <div
                  key={`c-${a.id_consignacao}-${a.campo}-${idx}`}
                  className="px-3 py-2 text-xs flex gap-2"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>
                    <span className="font-mono font-medium">{a.id_consignacao}</span> — {a.campo}{" "}
                    confirmado
                  </span>
                </div>
              ))}
              {confirmadosFiltrados.length > 12 && (
                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                  + {confirmadosFiltrados.length - 12} confirmação(ões)
                </p>
              )}
            </div>
          )}
      </CardContent>
    </Card>
  );
}
