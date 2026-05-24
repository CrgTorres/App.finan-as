"use client";

import { useMemo } from "react";
import type { AnaliseFinanceiraContrachequeResultado } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { consolidarEmprestimosPorPadraoLogico, type GrupoConsolidadoEmprestimo, type SuspeitaRefinanciamento } from "@/lib/anexos/consolidacao-logica-emprestimos";
import { classNameCelulaValorParcela } from "@/lib/anexos/contrato-inferido-valor-parcela";
import { cn } from "@/lib/utils";
import { gerarTimelineEventosAnaliseUi, type TimelineEventoAnalise } from "@/lib/anexos/pendencias-revisao-dashboard-ajustes";
import type { Payslip } from "@/types/contracheque";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuditoriaSection } from "@/components/dashboard/analise/premium";
import { GitMerge, History, ListTree } from "lucide-react";
import { toast } from "sonner";

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function bucketInstituicaoEvento(ev: TimelineEventoAnalise): string {
  const inst = ev.instituicao?.trim();
  if (inst) return inst;
  const d = ev.detalhe;
  const idx = d.indexOf(":");
  if (idx > 0 && idx < 48) {
    const head = d.slice(0, idx).trim();
    if (head.length > 1) return head;
  }
  return "Outros eventos";
}

function GrupoLinhaCompacta({ g }: { g: GrupoConsolidadoEmprestimo }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/40 py-2 text-[11px] last:border-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium text-foreground leading-tight line-clamp-2">{g.descricaoPrincipal}</p>
        <p className="text-muted-foreground">
          {g.instituicao} · {g.primeiraAparicao.replace("-", "/")} — {g.ultimaAparicao.replace("-", "/")}
        </p>
      </div>
      <div className="shrink-0 text-right tabular-nums space-y-0.5">
        <p className="text-[9px] text-muted-foreground">Valor parcela (méd.)</p>
        <p
          className={cn(
            "inline-block rounded-sm px-1.5 py-0.5",
            classNameCelulaValorParcela(g.valorMedioParcela > 0 ? g.valorMedioParcela : null),
          )}
        >
          {fmtBRL(g.valorMedioParcela)}
        </p>
        <p className="text-[9px] text-muted-foreground pt-0.5">Total pago</p>
        <p>{fmtBRL(g.totalPagoConsolidado)}</p>
      </div>
    </div>
  );
}

function SuspeitaRefinLinhaCompacta({ s }: { s: SuspeitaRefinanciamento }) {
  const nivelLabel = s.nivel === "provavel" ? "Provável (heurística)" : "Possível (heurística)";
  return (
    <div className="border-b border-border/40 py-2 text-[11px] last:border-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={s.nivel === "provavel" ? "default" : "secondary"} className="text-[10px] shrink-0">
          {nivelLabel}
        </Badge>
        <span className="text-muted-foreground">{s.instituicao}</span>
      </div>
      <p className="font-medium text-foreground leading-tight">
        {s.contratoAnterior.descricao.slice(0, 72)}
        {s.contratoAnterior.descricao.length > 72 ? "…" : ""}
      </p>
      <p className="text-muted-foreground">↓ parece suceder ↓</p>
      <p className="font-medium text-foreground leading-tight">
        {s.contratoNovo.descricao.slice(0, 72)}
        {s.contratoNovo.descricao.length > 72 ? "…" : ""}
      </p>
      <p className="text-[10px] text-muted-foreground leading-snug">{s.mensagem}</p>
      <ul className="list-disc pl-4 text-[10px] text-muted-foreground space-y-0.5">
        {s.criterios.slice(0, 4).map((c, i) => (
          <li key={i}>{c}</li>
        ))}
        {s.criterios.length > 4 ? <li>…</li> : null}
      </ul>
    </div>
  );
}

const GRUPOS_CONSOLIDACAO: {
  key: string;
  titulo: string;
  desc: string;
  filtro: (g: GrupoConsolidadoEmprestimo) => boolean;
}[] = [
  {
    key: "mesmo",
    titulo: "Mesmo contrato (provável)",
    desc: "Vínculos sugeridos como mesma operação ou continuidade. Refinanciamento não funde linhas aqui — ver bloco dedicado.",
    filtro: (g) =>
      g.tipoConsolidacao === "possivel_mesmo_contrato" ||
      g.tipoConsolidacao === "mesmo_contrato" ||
      g.tipoConsolidacao === "recorrente_01_01",
  },
  {
    key: "distintos",
    titulo: "Contratos distintos (mesmo banco)",
    desc: "Linhas que a lógica mantém separadas no mesmo credor.",
    filtro: (g) => g.tipoConsolidacao === "contratos_distintos_mesmo_banco",
  },
];

const cardShell =
  "rounded-2xl border-black/[0.06] bg-white/90 shadow-none backdrop-blur-sm dark:border-white/[0.06] dark:bg-[#0F1724]/95";

export function AnaliseConsolidacaoAuditoria({
  resultado,
  payslipsAnexo,
  onIrPendencias,
}: {
  resultado: AnaliseFinanceiraContrachequeResultado;
  payslipsAnexo: Payslip[];
  onIrPendencias: () => void;
}) {
  const consolidacao = useMemo(
    () => consolidarEmprestimosPorPadraoLogico(resultado.emprestimosPorContrato),
    [resultado.emprestimosPorContrato],
  );

  const eventos = useMemo(
    () => gerarTimelineEventosAnaliseUi(payslipsAnexo, resultado.emprestimosPorContrato, consolidacao),
    [payslipsAnexo, resultado.emprestimosPorContrato, consolidacao],
  );

  const eventosPorBanco = useMemo(() => {
    const m = new Map<string, TimelineEventoAnalise[]>();
    for (const ev of eventos) {
      const b = bucketInstituicaoEvento(ev);
      if (!m.has(b)) m.set(b, []);
      m.get(b)!.push(ev);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" }));
  }, [eventos]);

  const irPendenciasCom = (dica: string) => {
    onIrPendencias();
    toast.message("Etapa Pendências", { description: dica });
  };

  return (
    <div className="space-y-6">
      <AuditoriaSection
        title="Agrupamentos lógicos"
        description="Organização visual dos grupos já calculados — decisões ficam registradas na triagem de pendências."
      >
        <Card className={cn(cardShell, "border-border/80")}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2 font-semibold">
              <ListTree className="h-4 w-4 opacity-80" aria-hidden />
              Painel de grupos
            </CardTitle>
            <CardDescription className="text-[11px] leading-snug">
              Somente organização visual dos grupos já calculados — decisões são registradas na triagem de pendências.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={() => irPendenciasCom("Use «É mesmo contrato» nas pendências relacionadas.")}>
                Decisão: mesmo contrato
              </Button>
              <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={() => irPendenciasCom("Use «É contrato diferente» quando as linhas forem operação distinta.")}>
                Decisão: contrato diferente
              </Button>
              <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={() => irPendenciasCom("Use «É refinanciamento» na triagem só após conferência — confirmação manual, não automática.")}>
                Triagem: confirmar refinanciamento
              </Button>
            </div>

            <div className="space-y-2">
              {GRUPOS_CONSOLIDACAO.map((bloco) => {
                const lista = consolidacao.grupos.filter(bloco.filtro);
                return (
                  <details
                    key={bloco.key}
                    className="rounded-xl border border-border/70 bg-muted/10 open:bg-muted/15"
                  >
                    <summary className="cursor-pointer list-none flex flex-wrap items-center gap-2 px-3 py-2 text-left [&::-webkit-details-marker]:hidden">
                      <GitMerge className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="text-xs font-semibold flex-1 min-w-0">{bloco.titulo}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0 tabular-nums">
                        {lista.length}
                      </Badge>
                    </summary>
                    <p className="text-[10px] text-muted-foreground px-3 pb-2 border-t border-border/40 pt-2">{bloco.desc}</p>
                    <div className="max-h-48 overflow-y-auto px-3 pb-3">
                      {lista.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground py-2">Nenhum grupo nesta categoria.</p>
                      ) : (
                        lista.map((g) => <GrupoLinhaCompacta key={g.grupoId} g={g} />)
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </AuditoriaSection>

      <AuditoriaSection
        title="Hipóteses analíticas de refinanciamento"
        description="Somente suspeitas heurísticas entre pares de linhas inferidas. Contratos não são fundidos nem valores alterados; linhas antigas permanecem visíveis nos grupos acima."
      >
        <Card className={cn(cardShell, "border-border/80")}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2 font-semibold">
              <GitMerge className="h-4 w-4 opacity-80" aria-hidden />
              Possibilidade analítica (auditoria)
            </CardTitle>
            <CardDescription className="text-[11px] leading-snug">
              Níveis: possível e provável refinanciamento são inferências; «confirmado» existe apenas quando a triagem marca «É refinanciamento».
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-2 mb-3 text-[10px] text-muted-foreground">
              <Badge variant="outline" className="tabular-nums">
                Possível: {consolidacao.suspeitasRefinanciamento.filter((x) => x.nivel === "possivel").length}
              </Badge>
              <Badge variant="outline" className="tabular-nums">
                Provável: {consolidacao.suspeitasRefinanciamento.filter((x) => x.nivel === "provavel").length}
              </Badge>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-muted/10 px-3 py-1">
              {consolidacao.suspeitasRefinanciamento.length === 0 ? (
                <p className="text-[11px] text-muted-foreground py-3">Nenhuma hipótese analítica de refinanciamento para o par de critérios atuais.</p>
              ) : (
                consolidacao.suspeitasRefinanciamento.map((s) => <SuspeitaRefinLinhaCompacta key={s.id} s={s} />)
              )}
            </div>
          </CardContent>
        </Card>
      </AuditoriaSection>

      <AuditoriaSection
        title="Linha do tempo por instituição"
        description="Eventos derivados da mesma base; agrupamento visual pelo texto do evento (credor quando presente)."
      >
        <Card className={cn(cardShell, "border-border/80")}>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2 font-semibold">
              <History className="h-4 w-4 opacity-80" aria-hidden />
              Timeline (heurística)
            </CardTitle>
            <CardDescription className="text-[11px] leading-relaxed">
              Somente leitura automática da base — não é erro do sistema e não muda ao confirmar cartão/saque.
              «Série encerrada» = o desconto sumiu das folhas seguintes (não prova quitação). Decisões ficam em Pendências.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            {eventosPorBanco.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Sem eventos para exibir.</p>
            ) : (
              eventosPorBanco.map(([banco, evs]) => (
                <details key={banco} className="rounded-lg border border-border/60 bg-background/50">
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-2 py-1.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
                    <span className="truncate min-w-0">{banco}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {evs.length}
                    </Badge>
                  </summary>
                  <div className="border-t border-border/50 px-2 py-2 space-y-2 max-h-40 overflow-y-auto">
                    {evs.map((ev) => (
                      <div key={ev.id} className="relative pl-3 text-[11px] border-l-2 border-primary/30">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-medium text-foreground leading-tight">{ev.label}</p>
                          {ev.categoria === "contrato_quitado" ? (
                            <Badge variant="outline" className="text-[9px] h-4 px-1">
                              Heurística
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-[10px] text-muted-foreground tabular-nums">{ev.competencia}</p>
                        <p className="text-muted-foreground leading-snug line-clamp-4">{ev.detalhe}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ))
            )}
          </CardContent>
        </Card>
      </AuditoriaSection>
    </div>
  );
}
