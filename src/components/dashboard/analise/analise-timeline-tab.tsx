"use client";

import { useMemo } from "react";
import type { AnaliseFinanceiraContrachequeResultado } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { consolidarEmprestimosPorPadraoLogico } from "@/lib/anexos/consolidacao-logica-emprestimos";
import { gerarTimelineEventosAnaliseUi } from "@/lib/anexos/pendencias-revisao-dashboard-ajustes";
import type { Payslip } from "@/types/contracheque";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

export function AnaliseTimelineTab({
  resultado,
  payslipsAnexo,
}: {
  resultado: AnaliseFinanceiraContrachequeResultado;
  payslipsAnexo: Payslip[];
}) {
  const { emprestimosPorContrato, padroesConsumo } = resultado;

  const eventos = useMemo(() => {
    const cons = consolidarEmprestimosPorPadraoLogico(emprestimosPorContrato);
    return gerarTimelineEventosAnaliseUi(payslipsAnexo, emprestimosPorContrato, cons);
  }, [emprestimosPorContrato, payslipsAnexo]);

  const ativos = emprestimosPorContrato.filter((c) => c.status === "ativo/em andamento");
  const quitados = emprestimosPorContrato.filter(
    (c) =>
      c.status === "finalizado" ||
      (c.parcelaFinalDetectada != null &&
        c.totalParcelas != null &&
        c.parcelaFinalDetectada >= c.totalParcelas),
  );

  const refin = eventos.filter((e) => e.categoria === "refinanciamento");

  const excessoMeses = padroesConsumo.porMes.filter((m) => (m.pctEmprestimoGanhos ?? 0) > 40);

  return (
    <section className="space-y-4 pt-2">
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Primeira folha</CardTitle>
            <CardDescription className="text-xs">
              Menor competência com anexo na base usada na análise.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            {payslipsAnexo.length === 0 ? (
              <p className="text-muted-foreground">Sem folhas carregadas.</p>
            ) : (
              (() => {
                const sorted = [...payslipsAnexo].sort((a, b) => a.year - b.year || a.month - b.month);
                const f = sorted[0]!;
                return (
                  <p className="font-medium tabular-nums">
                    {String(f.month).padStart(2, "0")}/{f.year}
                  </p>
                );
              })()
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resumo de contratos (status inferido)</CardTitle>
            <CardDescription className="text-xs">Contagem a partir das linhas consolidadas na análise.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="tabular-nums">
              Ativos: {ativos.length}
            </Badge>
            <Badge variant="outline" className="tabular-nums">
              Quitados / encerrados na série: {quitados.length}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" aria-hidden />
            Eventos e períodos críticos
          </CardTitle>
          <CardDescription className="text-xs">
            Hipóteses analíticas de refinanciamento (não confirmam operação), maiores comprometimentos e linha do tempo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {refin.length > 0 && (
            <div>
              <p className="font-medium text-foreground mb-1">Hipóteses analíticas — refinanciamento</p>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                {refin.map((e) => (
                  <li key={e.id}>
                    <span className="text-foreground">{e.label}</span> — {e.competencia}: {e.detalhe}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {padroesConsumo.maiorMesComprometimento && (
            <div className="rounded-md border border-border/70 px-3 py-2">
              <p className="font-medium text-foreground">Maior comprometimento empréstimo/ganhos</p>
              <p className="text-muted-foreground mt-0.5">
                {padroesConsumo.maiorMesComprometimento.competencia.replace("-", "/")}:{" "}
                {padroesConsumo.maiorMesComprometimento.pctEmprestimoGanhos.toFixed(1)}%
              </p>
            </div>
          )}
          {excessoMeses.length > 0 && (
            <div>
              <p className="font-medium text-foreground mb-1">Meses com comprometimento &gt; 40% (ganhos)</p>
              <div className="flex flex-wrap gap-1">
                {excessoMeses.map((m) => (
                  <Badge key={m.competencia} variant="secondary" className="text-[10px] tabular-nums">
                    {m.competencia.replace("-", "/")} · {(m.pctEmprestimoGanhos ?? 0).toFixed(0)}%
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="font-medium text-foreground mb-2">Linha do tempo (heurística)</p>
            <div className="max-h-[min(360px,50vh)] overflow-y-auto space-y-2 border-l-2 border-border/80 pl-3 ml-1">
              {eventos.length === 0 ? (
                <p className="text-muted-foreground">Sem eventos derivados da base atual.</p>
              ) : (
                eventos.map((ev) => (
                  <div key={ev.id} className="relative">
                    <span className="absolute -left-[15px] top-1 h-2 w-2 rounded-full bg-primary" aria-hidden />
                    <p className="font-medium text-foreground">{ev.label}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{ev.competencia}</p>
                    <p className="text-muted-foreground leading-snug">{ev.detalhe}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
