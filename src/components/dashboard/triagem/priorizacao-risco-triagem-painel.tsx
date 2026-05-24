"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Scale,
  Wallet,
  ShieldAlert,
  TrendingUp,
  FileWarning,
  GitBranch,
  Eye,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  ItemTriagemPriorizado,
  ResultadoPriorizacaoFila,
  FiltroPrioridadeTriagem,
  CategoriaRiscoTriagem,
} from "@/lib/triagem/calcular-prioridade-risco-triagem";
import type { BadgeNaturezaTriagem } from "@/lib/triagem/classificar-natureza-estrutural-pendencia";
import { MonitoramentoHistoricoTriagemPainel } from "@/components/dashboard/triagem/monitoramento-historico-triagem-painel";
import type { LinhaMonitoramentoHistoricoTriagem } from "@/lib/triagem/classificar-natureza-estrutural-pendencia";
import {
  ROTULO_RECOMENDACAO,
} from "@/lib/triagem/calcular-prioridade-risco-triagem";
import { PrioridadeRiscoBadge } from "@/components/dashboard/triagem/prioridade-risco-badge";
import { cn } from "@/lib/utils";
import {
  ROTULOS_TRIAGEM_UI,
  classesCardTriagem,
  exigeLinguagemCritica,
  filtrarCategoriasRiscoExibicao,
  motivoExibicaoTriagem,
  rotuloRecomendacaoTriagem,
  textoBotaoResolver,
} from "@/lib/triagem/rotulos-triagem-resolutiva-ui";

const FILTROS_PRIORIDADE: { id: FiltroPrioridadeTriagem; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "somente_criticas", label: "Críticas" },
  { id: "somente_juridicas", label: "Jurídicas" },
  { id: "somente_financeiras", label: "Financeiras" },
  { id: "somente_fraude", label: "Fraude" },
  { id: "somente_automaticas", label: "Automáticas" },
  { id: "monitoramento", label: ROTULOS_TRIAGEM_UI.filtroMonitoramento },
];

const CARDS_CATEGORIA: {
  id: CategoriaRiscoTriagem;
  titulo: string;
  icon: typeof Scale;
  filtro: FiltroPrioridadeTriagem;
}[] = [
  { id: "risco_juridico", titulo: "Risco jurídico", icon: Scale, filtro: "somente_juridicas" },
  { id: "risco_financeiro", titulo: "Risco financeiro", icon: Wallet, filtro: "somente_financeiras" },
  { id: "possivel_fraude", titulo: "Possível fraude", icon: ShieldAlert, filtro: "somente_fraude" },
  {
    id: "refinanciamento_induzido",
    titulo: "Refin. induzido",
    icon: GitBranch,
    filtro: "somente_juridicas",
  },
  {
    id: "crescimento_divida",
    titulo: "Crescimento anormal",
    icon: TrendingUp,
    filtro: "somente_financeiras",
  },
  {
    id: "contrato_sem_evidencia",
    titulo: "Sem evidência",
    icon: FileWarning,
    filtro: "somente_criticas",
  },
];

function fmtMoeda(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ROTULO_BADGE_NATUREZA: Record<BadgeNaturezaTriagem, { label: string; className: string }> = {
  historico: { label: "Histórico", className: "bg-slate-200 text-slate-800 dark:bg-slate-700" },
  estrutural_oficial: {
    label: "Estrutural oficial",
    className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40",
  },
  ocr_invalido: {
    label: "OCR inválido",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40",
  },
  consigfacil_oficial: {
    label: "ConsigFácil oficial",
    className: "bg-blue-100 text-blue-900 dark:bg-blue-900/40",
  },
  inferencia_historica: {
    label: "Inferência histórica",
    className: "bg-violet-100 text-violet-900 dark:bg-violet-900/40",
  },
  operacional: { label: "Operacional", className: "bg-orange-100 text-orange-900" },
  juridico: { label: "Jurídico", className: "bg-red-100 text-red-900" },
  refin: { label: "Refin real", className: "bg-rose-100 text-rose-900" },
};

export function BadgeNaturezaTriagemVisual({
  badge,
}: {
  badge: BadgeNaturezaTriagem | undefined;
}) {
  if (!badge) return null;
  const cfg = ROTULO_BADGE_NATUREZA[badge];
  return (
    <Badge variant="outline" className={cn("text-[9px] border-0", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

function LinhaItemResumo({
  item,
  onAbrir,
}: {
  item: ItemTriagemPriorizado;
  onAbrir?: (id: string) => void;
}) {
  const p = item.pendencia;
  const pr = item.prioridade_risco;
  const critico = exigeLinguagemCritica(item);
  const cats = filtrarCategoriasRiscoExibicao(item);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 py-2 border-b border-border/50 last:border-0">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap gap-1">
          {critico && (
            <PrioridadeRiscoBadge prioridade={pr.prioridade} score={pr.score_risco} />
          )}
          <BadgeNaturezaTriagemVisual badge={item.natureza?.badge_visual} />
          <Badge variant="outline" className="text-[10px]">
            {rotuloRecomendacaoTriagem(item, ROTULO_RECOMENDACAO[pr.recomendacao])}
          </Badge>
          {cats.slice(0, 2).map((cat) => (
            <Badge key={cat} variant="secondary" className="text-[9px]">
              {cat.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
        <p className="text-sm font-medium">
          {p.instituicao_oficial ?? "—"} · {p.competencia ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground">{motivoExibicaoTriagem(item)}</p>
        {item.impacto_financeiro > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Impacto: {fmtMoeda(item.impacto_financeiro)}
          </p>
        )}
      </div>
      {onAbrir && (
        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => onAbrir(p.id)}>
          Abrir
        </Button>
      )}
    </div>
  );
}

type Props = {
  priorizacao: ResultadoPriorizacaoFila;
  filtroPrioridade: FiltroPrioridadeTriagem;
  onFiltroPrioridade: (f: FiltroPrioridadeTriagem) => void;
  onAbrirItem?: (id: string) => void;
  monitoramentoHistorico?: LinhaMonitoramentoHistoricoTriagem[];
  /** KPIs do snapshot do pipeline (preferir sobre métricas derivadas na UI). */
  metricasSnapshot?: {
    fila_humana: number;
    total_monitoramento: number;
    ganho_triagem_pct: number;
  };
};

export function PriorizacaoRiscoTriagemPainel({
  priorizacao,
  filtroPrioridade,
  onFiltroPrioridade,
  onAbrirItem,
  monitoramentoHistorico = [],
  metricasSnapshot,
}: Props) {
  const [monitoramentoAberto, setMonitoramentoAberto] = useState(false);
  const m = priorizacao.metricas;
  const filaHumanaKpi = metricasSnapshot?.fila_humana ?? m.fila_humana_estimada;
  const monitoramentoKpi =
    metricasSnapshot?.total_monitoramento ?? m.em_monitoramento;

  const atencao =
    filtroPrioridade === "todas" || filtroPrioridade === "somente_criticas"
      ? priorizacao.atencao_imediata
      : [];

  const monitoramento =
    filtroPrioridade === "monitoramento" || filtroPrioridade === "somente_automaticas"
      ? priorizacao.monitoramento
      : filtroPrioridade === "todas"
        ? priorizacao.monitoramento
        : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        <div className="rounded-lg border p-3 border-emerald-500/40">
          <p className="text-xs font-medium text-muted-foreground">Estruturais oficiais</p>
          <p className="text-lg font-bold tabular-nums">{m.estruturais_oficiais}</p>
        </div>
        <div className="rounded-lg border p-3 border-slate-500/40">
          <p className="text-xs font-medium text-muted-foreground">Históricos monitorados</p>
          <p className="text-lg font-bold tabular-nums">{m.historicos_monitorados}</p>
        </div>
        <div className="rounded-lg border p-3 border-amber-500/40">
          <p className="text-xs font-medium text-muted-foreground">OCR descartados</p>
          <p className="text-lg font-bold tabular-nums">{m.ocr_descartados}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs font-medium text-muted-foreground">Ruído removido</p>
          <p className="text-lg font-bold tabular-nums">{m.ruido_removido_estruturalmente}</p>
        </div>
        <div className="rounded-lg border p-3 border-violet-500/40 col-span-2 sm:col-span-1">
          <p className="text-xs font-medium text-muted-foreground">
            {ROTULOS_TRIAGEM_UI.filaHumanaEstrutural}
          </p>
          <p className="text-lg font-bold tabular-nums">{filaHumanaKpi}</p>
        </div>
      </div>

      <MonitoramentoHistoricoTriagemPainel
        linhas={monitoramentoHistorico}
        total={m.historicos_monitorados}
      />

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {CARDS_CATEGORIA.map((card) => {
          const qtd = priorizacao.por_categoria[card.id]?.length ?? 0;
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              className={cn(
                "rounded-lg border p-3 text-left transition-colors hover:bg-muted/60",
                qtd > 0 && "border-amber-500/40",
              )}
              onClick={() => onFiltroPrioridade(card.filtro)}
            >
              <Icon className="h-4 w-4 mb-1 text-muted-foreground" />
              <p className="text-xs font-medium leading-tight">{card.titulo}</p>
              <p className="text-lg font-bold tabular-nums mt-0.5">{qtd}</p>
            </button>
          );
        })}
      </div>

      <Card
        className={cn(
          atencao.filter(exigeLinguagemCritica).length > 0
            ? "border-red-500/40 bg-red-500/5"
            : "border-emerald-500/30 bg-emerald-500/5",
        )}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle
              className={cn(
                "h-5 w-5",
                atencao.filter(exigeLinguagemCritica).length > 0
                  ? "text-red-600"
                  : "text-emerald-600",
              )}
            />
            {ROTULOS_TRIAGEM_UI.atencaoEstruturalTitulo}
          </CardTitle>
          <CardDescription>
            {atencao.filter(exigeLinguagemCritica).length} decisão(ões) estrutural(is) ·{" "}
            {priorizacao.metricas.criticas} prioridade alta/crítica
          </CardDescription>
        </CardHeader>
        <CardContent>
          {atencao.filter(exigeLinguagemCritica).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {ROTULOS_TRIAGEM_UI.nenhumCasoCritico}
            </p>
          ) : (
            <div className="space-y-0">
              {atencao
                .filter(exigeLinguagemCritica)
                .slice(0, 8)
                .map((item) => (
                  <LinhaItemResumo key={item.pendencia.id} item={item} onAbrir={onAbrirItem} />
                ))}
              {atencao.filter(exigeLinguagemCritica).length > 8 && (
                <p className="text-xs text-muted-foreground pt-2">
                  {ROTULOS_TRIAGEM_UI.maisNaFilaHumana(
                    atencao.filter(exigeLinguagemCritica).length - 8,
                  )}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{ROTULOS_TRIAGEM_UI.priorizacaoContextual}</CardTitle>
          <CardDescription>
            {ROTULOS_TRIAGEM_UI.priorizacaoContextualDesc(monitoramentoKpi)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {FILTROS_PRIORIDADE.map((f) => (
            <Button
              key={f.id}
              type="button"
              size="sm"
              variant={filtroPrioridade === f.id ? "default" : "outline"}
              onClick={() => onFiltroPrioridade(f.id)}
            >
              {f.label}
              {f.id === "monitoramento" && (
                <span className="ml-1 tabular-nums opacity-80">
                  ({priorizacao.metricas.em_monitoramento})
                </span>
              )}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card className="border-slate-500/30">
        <CardHeader className="pb-2">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setMonitoramentoAberto((v) => !v)}
          >
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" />
                {ROTULOS_TRIAGEM_UI.monitoramentoContextualTitulo}
                <Badge variant="secondary" className="text-[10px]">
                  {priorizacao.monitoramento.length}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {ROTULOS_TRIAGEM_UI.monitoramentoContextualDesc}
              </CardDescription>
            </div>
            {monitoramentoAberto ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
          </button>
        </CardHeader>
        {monitoramentoAberto && (
          <CardContent className="max-h-64 overflow-y-auto">
            {monitoramento.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {ROTULOS_TRIAGEM_UI.nenhumItemMonitoramento}
              </p>
            ) : (
              monitoramento.map((item) => (
                <LinhaItemResumo key={item.pendencia.id} item={item} onAbrir={onAbrirItem} />
              ))
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export function ItemTriagemCardPriorizado({
  item,
  onResolver,
}: {
  item: ItemTriagemPriorizado;
  onResolver: () => void;
}) {
  const p = item.pendencia;
  const pr = item.prioridade_risco;
  const resolvido =
    item.motor.resolvido || !!item.resolucao_usuario?.resultado.remover_pendencia;
  const critico = exigeLinguagemCritica(item);
  const cats = filtrarCategoriasRiscoExibicao(item);

  return (
    <article className={cn("rounded-lg border p-3 space-y-2", classesCardTriagem(item, resolvido))}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-xs min-w-0 flex-1">
          <div className="flex flex-wrap gap-1 mb-1">
            {critico && (
              <PrioridadeRiscoBadge prioridade={pr.prioridade} score={pr.score_risco} />
            )}
            <BadgeNaturezaTriagemVisual badge={item.natureza?.badge_visual} />
            <Badge variant="outline" className="text-[10px]">
              {rotuloRecomendacaoTriagem(item, ROTULO_RECOMENDACAO[pr.recomendacao])}
            </Badge>
            {cats.slice(0, 2).map((cat) => (
              <Badge key={cat} variant="secondary" className="text-[9px]">
                {cat.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
          <p className="font-medium text-foreground">
            {p.instituicao_oficial ?? "—"} · {p.competencia ?? "—"}
          </p>
          <p className="text-muted-foreground mt-0.5 line-clamp-2">{motivoExibicaoTriagem(item)}</p>
          {critico && (
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{p.descricao}</p>
          )}
        </div>
        <Button type="button" size="sm" onClick={onResolver}>
          {textoBotaoResolver(item)}
        </Button>
      </div>
    </article>
  );
}
