"use client";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type {
  AnaliseJuridicoFinanceiraContrato,
  StatusAnaliseJuridicaFinanceira,
  StatusConferenciaAnaliseJuridica,
} from "@/types/analise-juridico-financeira-contrato";
import { Scale, AlertTriangle, TrendingUp, Wallet } from "lucide-react";

function fmtBrl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function badgeStatus(s: StatusAnaliseJuridicaFinanceira) {
  const map: Record<StatusAnaliseJuridicaFinanceira, { label: string; className: string }> = {
    sem_alerta: { label: "Baixo risco", className: "bg-emerald-600/90" },
    atencao: { label: "Atenção", className: "bg-amber-600/90" },
    alto_risco: { label: "Alto risco", className: "bg-orange-600/90" },
    revisao_juridica: { label: "Revisão jurídica sugerida", className: "bg-destructive" },
  };
  const m = map[s];
  return <Badge className={`text-[10px] h-5 ${m.className}`}>{m.label}</Badge>;
}

const OPCOES_CONFERENCIA: { value: StatusConferenciaAnaliseJuridica; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "conferido", label: "Conferido" },
  { value: "ignorado", label: "Ignorar diagnóstico" },
  { value: "contrato_anterior_localizado", label: "Contrato anterior localizado" },
  { value: "possivel_refinanciamento", label: "Possível refinanciamento" },
  { value: "acao_revisao_sugerida", label: "Ação / revisão sugerida" },
];

type Props = {
  analise: AnaliseJuridicoFinanceiraContrato;
  conferencia?: StatusConferenciaAnaliseJuridica;
  onConferenciaChange?: (v: StatusConferenciaAnaliseJuridica) => void;
  observacao?: string;
  onObservacaoChange?: (v: string) => void;
  compacto?: boolean;
};

export function AnaliseJuridicoFinanceiraContratoBlock({
  analise,
  conferencia = "pendente",
  onConferenciaChange,
  observacao = "",
  onObservacaoChange,
  compacto = false,
}: Props) {
  const ind = analise.indicadores;
  const border =
    analise.status === "revisao_juridica"
      ? "border-destructive/50 bg-destructive/5"
      : analise.status === "alto_risco"
        ? "border-orange-500/45 bg-orange-500/[0.06]"
        : analise.status === "atencao"
          ? "border-amber-500/40 bg-amber-500/[0.05]"
          : "border-emerald-500/35 bg-emerald-500/[0.04]";

  return (
    <div
      className={`rounded-md border p-3 md:p-4 space-y-3 ${border}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Scale className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden />
          <p className="text-[11px] font-semibold text-foreground">
            Análise de possível abusividade / superendividamento / margem
          </p>
        </div>
        {badgeStatus(analise.status)}
        <span className="text-[9px] text-muted-foreground capitalize">
          {analise.tipoProduto.replace(/_/g, " ")} · margem {analise.classificacaoMargem}
        </span>
      </div>

      <p className="text-[10px] text-foreground/90 leading-snug">{analise.resumoContrato}</p>
      <p className="text-[9px] text-muted-foreground italic leading-snug border-l-2 border-muted pl-2">
        {analise.avisoLegal}
      </p>

      <div className={`grid gap-2 ${compacto ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"} text-[10px]`}>
        <div className="rounded border border-border/50 bg-background/50 px-2 py-1.5">
          <p className="font-medium flex items-center gap-1">
            <TrendingUp className="h-3 w-3" aria-hidden /> Total pago estimado
          </p>
          <p className="text-sm font-semibold tabular-nums">{fmtBrl(ind.totalPagoEstimado)}</p>
          <p className="text-[9px] text-muted-foreground">
            Base liberada {fmtBrl(ind.valorBaseLiberado)} · +{fmtPct(ind.percentualAcrescimoSobreBase)}
          </p>
        </div>
        <div className="rounded border border-border/50 bg-background/50 px-2 py-1.5">
          <p className="font-medium">Diferença total × base</p>
          <p className="text-sm font-semibold tabular-nums">{fmtBrl(ind.diferencaTotalPagoVsBase)}</p>
        </div>
        <div className="rounded border border-border/50 bg-background/50 px-2 py-1.5">
          <p className="font-medium flex items-center gap-1">
            <Wallet className="h-3 w-3" aria-hidden /> Margem comprometida
          </p>
          {ind.rendaMensalReferencia != null ? (
            <>
              <p className="text-sm font-semibold tabular-nums">
                {fmtPct(ind.percentualRendaTotalComprometida)} da renda
              </p>
              <p className="text-[9px] text-muted-foreground">
                Parcelas {fmtBrl(ind.somaParcelasAtivasMes)} / renda {fmtBrl(ind.rendaMensalReferencia)}
                {ind.limiarMargemAtingido ? ` · alerta ≥${ind.limiarMargemAtingido}%` : ""}
              </p>
              <p className="text-[9px] text-muted-foreground">
                Só este contrato: {fmtPct(ind.percentualRendaParcelaContrato)} (
                {fmtBrl(ind.parcelaMensalContrato)})
              </p>
            </>
          ) : (
            <p className="text-[10px] text-amber-800 dark:text-amber-200">
              Sem renda cadastrada — importe contracheque para % de margem.
            </p>
          )}
          {ind.fonteRenda ? (
            <p className="text-[8px] text-muted-foreground mt-0.5">{ind.fonteRenda}</p>
          ) : null}
        </div>
        <div className="rounded border border-border/50 bg-background/50 px-2 py-1.5">
          <p className="font-medium">Parcela × prazo</p>
          <p className="text-sm font-semibold tabular-nums">{fmtBrl(ind.parcelaMensalContrato)}</p>
        </div>
      </div>

      {analise.alertas.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
            Alertas ({analise.alertas.length})
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {analise.alertas.map((a) => (
              <li
                key={a.codigo}
                className={`text-[10px] rounded px-2 py-1 border ${
                  a.severidade === "critico"
                    ? "border-destructive/40 bg-destructive/10"
                    : a.severidade === "alto"
                      ? "border-orange-500/40 bg-orange-500/10"
                      : "border-border/60 bg-background/40"
                }`}
              >
                <span className="font-medium">{a.titulo}</span>
                <span className="text-foreground/85"> — {a.mensagem}</span>
                {a.baseLegal ? (
                  <span className="block text-[8px] text-muted-foreground mt-0.5">{a.baseLegal}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analise.recomendacoes.length > 0 ? (
        <div>
          <p className="text-[10px] font-medium mb-1">Recomendações práticas</p>
          <ul className="list-disc pl-4 text-[10px] text-foreground/90 space-y-0.5">
            {analise.recomendacoes.map((r) => (
              <li key={r.id}>
                <span className={r.prioridade === "alta" ? "font-medium" : "text-foreground/85"}>
                  {r.texto}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analise.camposEssenciaisAusentes.length > 0 ? (
        <p className="text-[9px] text-muted-foreground">
          Campos não lidos: {analise.camposEssenciaisAusentes.join(", ")}
        </p>
      ) : null}

      {onConferenciaChange ? (
        <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t border-border/50">
          <div className="space-y-1.5">
            <Label htmlFor="analise-conf" className="text-[10px]">
              Marcação do diagnóstico
            </Label>
            <select
              id="analise-conf"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              value={conferencia}
              onChange={(e) =>
                onConferenciaChange(e.target.value as StatusConferenciaAnaliseJuridica)
              }
            >
              {OPCOES_CONFERENCIA.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {onObservacaoChange ? (
            <div className="space-y-1.5">
              <Label htmlFor="analise-obs" className="text-[10px]">
                Observação (análise)
              </Label>
              <textarea
                id="analise-obs"
                className="w-full min-h-[56px] rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                value={observacao}
                onChange={(e) => onObservacaoChange(e.target.value)}
                placeholder="Ex.: vou comparar com holerite de março/2026"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}