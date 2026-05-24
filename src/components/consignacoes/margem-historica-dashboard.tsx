"use client";

import { lazy, Suspense, useDeferredValue, useMemo } from "react";
import {
  AlertTriangle,
  Banknote,
  Gauge,
  LineChart,
  RefreshCw,
  TrendingDown,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PacoteMargemHistoricaAvancada } from "@/lib/consignacoes-governo/calcular-margem-historica-avancada";
import type { PacoteConsumoEstruturalMargem } from "@/lib/consignacoes-governo/consumo-estrutural-margem";
import type { BaseConsignavelReal } from "@/lib/consignacoes-governo/calcular-base-consignavel-real";
import { HeatmapMargemHistorica } from "@/components/consignacoes/heatmap-margem-historica";
import { TimelineMargemOperacional } from "@/components/consignacoes/timeline-margem-operacional";

const ConsumoEstruturalMargemPainelLazy = lazy(() =>
  import("@/components/consignacoes/consumo-estrutural-margem-painel").then((m) => ({
    default: m.ConsumoEstruturalMargemPainel,
  })),
);

const BaseConsignavelRealPainelLazy = lazy(() =>
  import("@/components/consignacoes/base-consignavel-real-painel").then((m) => ({
    default: m.BaseConsignavelRealPainel,
  })),
);

const MargemHistoricaPainelCompleto = lazy(() =>
  import("@/components/consignacoes/margem-historica-painel-completo").then((m) => ({
    default: m.MargemHistoricaPainelCompleto,
  })),
);

import type { AnaliseMargemHistorica, MargemHistorica } from "@/lib/consignacoes-governo/margem-historica-unificada";
import type { MargemHistoricaDetalhe } from "@/lib/consignacoes-governo/calcular-margem-desde-folha";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

type Props = {
  avancada: PacoteMargemHistoricaAvancada;
  consumoEstruturalMargem: PacoteConsumoEstruturalMargem;
  baseConsignavelReal: BaseConsignavelReal[];
  baseConsignavelRealVigente: BaseConsignavelReal | null;
  margemHistorica: MargemHistorica[];
  detalhes: MargemHistoricaDetalhe[];
  analise: AnaliseMargemHistorica;
};

export function MargemHistoricaDashboard({
  avancada,
  consumoEstruturalMargem,
  baseConsignavelReal,
  baseConsignavelRealVigente,
  margemHistorica,
  detalhes,
  analise,
}: Props) {
  const deferred = useDeferredValue(avancada);
  const deferredConsumo = useDeferredValue(consumoEstruturalMargem);
  const { resumo } = deferred;

  const insightsTop = useMemo(
    () => deferred.todos_insights.slice(0, 8),
    [deferred.todos_insights],
  );

  const alertasTop = useMemo(
    () => deferred.todos_alertas.slice(-12).reverse(),
    [deferred.todos_alertas],
  );

  if (deferred.competencias.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Motor histórico de margem (2012+)
          </CardTitle>
          <CardDescription>Importe contracheques para reconstruir a série mensal.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      {baseConsignavelReal.length > 0 && (
        <Suspense
          fallback={
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Calculando base consignável…
              </CardContent>
            </Card>
          }
        >
          <BaseConsignavelRealPainelLazy
            bases={baseConsignavelReal}
            vigente={baseConsignavelRealVigente}
          />
        </Suspense>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Maior comprometimento
            </CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {resumo.maior_comprometimento
                ? `${resumo.maior_comprometimento.percentual.toFixed(1)}%`
                : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {resumo.maior_comprometimento?.competencia ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1">
              <Banknote className="h-3 w-3" /> Menor margem livre
            </CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {resumo.menor_margem_livre ? brl(resumo.menor_margem_livre.valor) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {resumo.menor_margem_livre?.competencia ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Período crítico
            </CardDescription>
            <CardTitle className="text-lg">
              {resumo.periodo_critico ? `${resumo.periodo_critico.meses} meses` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {resumo.periodo_critico
              ? `${resumo.periodo_critico.inicio} → ${resumo.periodo_critico.fim}`
              : "Sem bloco crítico prolongado"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1">
              <Users className="h-3 w-3" /> Score médio / ativos
            </CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {resumo.score_medio_pressao} · {resumo.contratos_ativos_vigentes}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {resumo.quantidade_refin} refin · {resumo.meses_sufocamento} meses ≥85%
          </CardContent>
        </Card>
      </div>

      {resumo.bancos_dominantes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Bancos dominantes:</span>
          {resumo.bancos_dominantes.map((b) => (
            <Badge key={b} variant="secondary" className="text-[10px]">
              {b}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <HeatmapMargemHistorica competencias={deferred.competencias} anoInicio={resumo.ano_inicio} />
        <TimelineMargemOperacional eventos={deferred.todos_eventos} />
      </div>

      {deferredConsumo.resumo.length > 0 && (
        <Suspense
          fallback={
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Carregando consumo estrutural…
              </CardContent>
            </Card>
          }
        >
          <ConsumoEstruturalMargemPainelLazy pacote={deferredConsumo} />
        </Suspense>
      )}

      {(insightsTop.length > 0 || alertasTop.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <LineChart className="h-4 w-4" /> Insights automáticos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2 list-disc pl-4 text-muted-foreground">
                {insightsTop.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-red-200/50 dark:border-red-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" /> Alertas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-xs space-y-1.5">
                {alertasTop.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <Badge variant="outline" className="shrink-0 text-[9px]">
                      {a.competencia}
                    </Badge>
                    <span>{a.descricao}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {deferred.ciclos_endividamento.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Ciclos de endividamento
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {deferred.ciclos_endividamento.map((c, i) => (
              <Badge key={i} variant="outline" className="text-xs font-normal py-1">
                {c.inicio} → pico {c.pico} · {c.competencias_criticas} meses críticos ·{" "}
                {c.recuperacao ? "em recuperação" : "sem recuperação"}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {deferred.simulacoes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Simulação de cenários</CardTitle>
            <CardDescription>Projeções ilustrativas sobre a margem vigente.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {deferred.simulacoes.map((s) => (
              <div key={s.cenario} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{s.rotulo}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.descricao}</p>
                <p className="text-xs mt-2 tabular-nums">
                  {brl(s.margem_disponivel_atual)} → {brl(s.margem_disponivel_simulada)}{" "}
                  <span className="text-emerald-600">(+{brl(s.delta_mensal)})</span>
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Suspense
        fallback={
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Carregando gráficos de evolução…
            </CardContent>
          </Card>
        }
      >
        <MargemHistoricaPainelCompleto
          margemHistorica={margemHistorica}
          detalhes={detalhes}
          analise={analise}
        />
      </Suspense>
    </section>
  );
}
