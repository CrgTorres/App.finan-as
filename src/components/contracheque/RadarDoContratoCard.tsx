"use client";

import { useMemo, type ReactNode } from "react";
import type { AnaliseContratoEmprestimo, RiscoGeralContratoEmprestimo } from "@/types/analise-contrato-emprestimo";
import type { StatusConferenciaAnaliseJuridica } from "@/types/analise-juridico-financeira-contrato";
import { obterResumoRadarContrato, type SinalRadarContrato } from "@/lib/contratos/radar-contrato-resumo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AvisoTriagemAnaliseContrato } from "@/components/contratos/AvisoTriagemAnaliseContrato";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Radar,
  Scale,
  ShieldAlert,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";

function fmtBrl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function badgeRiscoGeral(r: RiscoGeralContratoEmprestimo) {
  const map: Record<RiscoGeralContratoEmprestimo, { label: string; className: string }> = {
    baixo: { label: "Baixo", className: "bg-emerald-600/90" },
    medio: { label: "Médio", className: "bg-amber-600/90" },
    alto: { label: "Alto", className: "bg-orange-600/90" },
    revisao_juridica: { label: "Revisão jurídica", className: "bg-destructive" },
  };
  const m = map[r];
  return <Badge className={`text-[10px] h-5 ${m.className}`}>{m.label}</Badge>;
}

function scoreCor(score: number, risco: RiscoGeralContratoEmprestimo): string {
  if (risco === "revisao_juridica" || score >= 70) return "text-destructive";
  if (risco === "alto" || score >= 42) return "text-orange-600 dark:text-orange-400";
  if (risco === "medio" || score >= 15) return "text-amber-700 dark:text-amber-300";
  return "text-emerald-700 dark:text-emerald-400";
}

function SecaoTitulo({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p
      id={id}
      className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-1 mb-2"
    >
      {children}
    </p>
  );
}

function MetricaCard({
  titulo,
  icon,
  children,
  destaque,
}: {
  titulo: string;
  icon?: ReactNode;
  children: ReactNode;
  destaque?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 flex flex-col min-h-[5.5rem]">
      <p className="text-[9px] font-medium text-muted-foreground flex items-center gap-1">
        {icon}
        {titulo}
      </p>
      {destaque ? (
        <p className="text-sm font-bold tabular-nums text-foreground mt-1 leading-tight">{destaque}</p>
      ) : null}
      <div className="text-[9px] text-muted-foreground space-y-0.5 mt-auto pt-1">{children}</div>
    </div>
  );
}

function SinalChip({ sinal }: { sinal: SinalRadarContrato }) {
  const border =
    sinal.severidade === "critico"
      ? "border-destructive/50 bg-destructive/5"
      : sinal.severidade === "alto"
        ? "border-orange-500/45 bg-orange-500/[0.06]"
        : sinal.severidade === "atencao"
          ? "border-amber-500/40 bg-amber-500/[0.05]"
          : "border-border/60 bg-muted/20";

  return (
    <div className={`rounded-lg border px-3 py-2.5 h-full flex flex-col ${border}`}>
      <p className="text-[10px] font-semibold flex items-center gap-1.5">
        {sinal.ativo ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
        )}
        {sinal.rotulo}
      </p>
      <p className="text-[9px] text-foreground/85 leading-snug mt-1.5 flex-1">{sinal.resumo}</p>
    </div>
  );
}

type Props = {
  analise: AnaliseContratoEmprestimo;
  conferencia?: StatusConferenciaAnaliseJuridica;
  onConferenciaChange?: (v: StatusConferenciaAnaliseJuridica) => void;
  observacao?: string;
  onObservacaoChange?: (v: string) => void;
  onVincularContratoAnterior?: () => void;
};

const ROTULO_CONFERENCIA: Record<StatusConferenciaAnaliseJuridica, string> = {
  pendente: "Pendente",
  conferido: "Análise confirmada",
  ignorado: "Falso positivo / ignorado",
  contrato_anterior_localizado: "Contrato anterior localizado",
  possivel_refinanciamento: "Possível refinanciamento",
  acao_revisao_sugerida: "Revisão jurídica",
};

export function RadarDoContratoCard({
  analise,
  conferencia = "pendente",
  onConferenciaChange,
  observacao = "",
  onObservacaoChange,
  onVincularContratoAnterior,
}: Props) {
  const resumo = useMemo(() => obterResumoRadarContrato(analise), [analise]);

  const borderCard =
    analise.risco_geral === "revisao_juridica"
      ? "border-destructive/40"
      : analise.risco_geral === "alto"
        ? "border-orange-500/35"
        : analise.risco_geral === "medio"
          ? "border-amber-500/30"
          : "border-emerald-500/25";

  const marcar = (v: StatusConferenciaAnaliseJuridica) => onConferenciaChange?.(v);

  return (
    <Card className={`${borderCard} shadow-sm overflow-hidden`}>
      {/* Cabeçalho */}
      <CardHeader className="pb-3 space-y-2 border-b border-border/40 bg-muted/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary shrink-0" aria-hidden />
            Radar do Contrato
          </CardTitle>
          {badgeRiscoGeral(analise.risco_geral)}
        </div>
        <CardDescription className="text-[10px] leading-relaxed">
          Visão consolidada: risco, custo, margem e indícios jurídico-financeiros.
        </CardDescription>
        <p className="text-[9px] text-muted-foreground tabular-nums">
          Análise v{analise.versao} · {new Date(analise.geradaEm).toLocaleString("pt-BR")}
        </p>
      </CardHeader>

      <CardContent className="pt-4 space-y-5 text-[10px]">
        <AvisoTriagemAnaliseContrato compacto />

        {/* 1 — Risco e alertas */}
        <section aria-labelledby="radar-sec-risco">
          <SecaoTitulo id="radar-sec-risco">Resumo de risco</SecaoTitulo>
          <div className="grid gap-3 md:grid-cols-[minmax(7rem,auto)_1fr]">
            <div className="rounded-lg border border-border/60 bg-background px-4 py-3 flex flex-col items-center justify-center text-center md:items-start md:text-left">
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide">
                Score de risco
              </p>
              <p
                className={`text-4xl font-bold tabular-nums leading-none mt-1 ${scoreCor(analise.score, analise.risco_geral)}`}
              >
                {analise.score}
              </p>
              <p className="text-[8px] text-muted-foreground mt-1">0–100 · maior = mais alertas</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-background px-3 py-2.5 min-h-[7rem] flex flex-col">
              <p className="text-[9px] font-semibold flex items-center gap-1 shrink-0 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                Alertas principais ({analise.alertas.length})
              </p>
              {resumo.alertasPrincipais.length === 0 ? (
                <p className="text-muted-foreground text-[10px]">Nenhum alerta na triagem.</p>
              ) : (
                <ul className="space-y-1 overflow-y-auto max-h-32 pr-1 flex-1">
                  {resumo.alertasPrincipais.map((a) => (
                    <li
                      key={a.codigo}
                      className={`rounded-md px-2 py-1 border text-[10px] leading-snug ${
                        a.severidade === "critico"
                          ? "border-destructive/40 bg-destructive/10"
                          : a.severidade === "alto"
                            ? "border-orange-500/35 bg-orange-500/10"
                            : "border-amber-500/25 bg-amber-500/5"
                      }`}
                    >
                      {a.titulo}
                    </li>
                  ))}
                </ul>
              )}
              {analise.alertas.length > resumo.alertasPrincipais.length ? (
                <p className="text-[8px] text-muted-foreground mt-1.5 shrink-0">
                  +{analise.alertas.length - resumo.alertasPrincipais.length} alerta(s) adicionais na análise
                  completa.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* 2 — Métricas financeiras */}
        <section aria-labelledby="radar-sec-metricas">
          <SecaoTitulo id="radar-sec-metricas">Indicadores financeiros</SecaoTitulo>
          <div className="grid gap-2 sm:grid-cols-3">
            <MetricaCard
              titulo="Total pago estimado"
              icon={<TrendingUp className="h-3 w-3" aria-hidden />}
              destaque={fmtBrl(resumo.liberadoVsTotal.totalPago)}
            >
              <p>
                {analise.calculos.quantidade_parcelas > 0
                  ? `${analise.calculos.quantidade_parcelas}× ${fmtBrl(analise.calculos.valor_parcela)}`
                  : "Prazo ou parcela incompletos"}
              </p>
            </MetricaCard>

            <MetricaCard titulo="Liberado × total pago" destaque={`×${resumo.liberadoVsTotal.multiplicador.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`}>
              <p>
                {fmtBrl(resumo.liberadoVsTotal.valorLiberado)} → {fmtBrl(resumo.liberadoVsTotal.totalPago)}
              </p>
              <p>+{fmtPct(resumo.liberadoVsTotal.percentualAcrescimo)} sobre o liberado</p>
            </MetricaCard>

            <MetricaCard
              titulo="Margem comprometida"
              icon={<Wallet className="h-3 w-3" aria-hidden />}
              destaque={
                resumo.margemComprometida.percentual != null
                  ? `${fmtPct(resumo.margemComprometida.percentual)} da renda`
                  : undefined
              }
            >
              {resumo.margemComprometida.percentual != null ? (
                <>
                  <p>
                    Parcelas {fmtBrl(resumo.margemComprometida.somaParcelas)} / renda{" "}
                    {fmtBrl(resumo.margemComprometida.rendaLiquida)}
                  </p>
                  <p>Restante ~{fmtBrl(resumo.margemComprometida.rendaRestante)}</p>
                  {resumo.margemComprometida.fonteRenda ? <p>{resumo.margemComprometida.fonteRenda}</p> : null}
                </>
              ) : (
                <p className="text-amber-800 dark:text-amber-200">
                  Sem renda no contracheque — importe folha para % de margem.
                </p>
              )}
            </MetricaCard>
          </div>
        </section>

        {/* 3 — Sinais */}
        <section aria-labelledby="radar-sec-sinais">
          <SecaoTitulo id="radar-sec-sinais">Sinais específicos</SecaoTitulo>
          <div className="grid gap-2 sm:grid-cols-3">
            <SinalChip sinal={resumo.seguroVendaCasada} />
            <SinalChip sinal={resumo.refinanciamento} />
            <SinalChip sinal={resumo.reducaoArtificialParcela} />
          </div>
        </section>

        {/* 4 — Recomendação */}
        <section aria-labelledby="radar-sec-recomendacao">
          <SecaoTitulo id="radar-sec-recomendacao">Recomendação</SecaoTitulo>
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
            <p className="text-[10px] font-semibold flex items-center gap-1.5 mb-1">
              <Scale className="h-3.5 w-3.5 text-primary" aria-hidden />
              Recomendação final
            </p>
            <p className="text-[11px] text-foreground/90 leading-relaxed">{resumo.recomendacaoFinal}</p>
          </div>
        </section>

        {/* 5 — Conferência */}
        {onConferenciaChange ? (
          <section aria-labelledby="radar-sec-conferencia" className="pt-1 border-t border-border/50 space-y-3">
            <SecaoTitulo id="radar-sec-conferencia">Conferência</SecaoTitulo>

            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={conferencia === "conferido" ? "secondary" : "outline"}
                className="h-8 text-[10px]"
                onClick={() => marcar("conferido")}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" aria-hidden />
                Confirmar análise
              </Button>
              <Button
                type="button"
                size="sm"
                variant={conferencia === "ignorado" ? "secondary" : "outline"}
                className="h-8 text-[10px]"
                onClick={() => marcar("ignorado")}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" aria-hidden />
                Falso positivo
              </Button>
              <Button
                type="button"
                size="sm"
                variant={conferencia === "contrato_anterior_localizado" ? "secondary" : "outline"}
                className="h-8 text-[10px]"
                onClick={() => {
                  marcar("contrato_anterior_localizado");
                  onVincularContratoAnterior?.();
                }}
              >
                <Link2 className="h-3.5 w-3.5 mr-1" aria-hidden />
                Vincular contrato anterior
              </Button>
              <Button
                type="button"
                size="sm"
                variant={conferencia === "acao_revisao_sugerida" ? "destructive" : "outline"}
                className="h-8 text-[10px]"
                onClick={() => marcar("acao_revisao_sugerida")}
              >
                <ShieldAlert className="h-3.5 w-3.5 mr-1" aria-hidden />
                Marcar revisão jurídica
              </Button>
            </div>

            {conferencia !== "pendente" ? (
              <p className="text-[9px] text-muted-foreground">
                Status: <span className="font-medium text-foreground">{ROTULO_CONFERENCIA[conferencia]}</span>
              </p>
            ) : null}

            {onObservacaoChange ? (
              <div className="space-y-1.5">
                <Label htmlFor="radar-obs" className="text-[10px] font-medium">
                  Nota da conferência (opcional)
                </Label>
                <textarea
                  id="radar-obs"
                  className="w-full min-h-[72px] rounded-md border border-input bg-background px-2.5 py-2 text-xs resize-y"
                  value={observacao}
                  onChange={(e) => onObservacaoChange(e.target.value)}
                  placeholder="Ex.: conferi com o PDF original — proposta 830795234"
                />
              </div>
            ) : null}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
