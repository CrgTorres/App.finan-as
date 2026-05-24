"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import {
  obterAnaliseCartaoSaqueDePayslip,
  payslipCartaoSaquePendenteConferencia,
  payslipTemCartaoSaqueParaExibir,
  resumoCartaoSaqueEmPayslips,
  statusConferenciaCartaoSaquePayslip,
  type ResumoCartaoSaqueConferencia,
  type RubricaCartaoSaqueComPayslip,
} from "@/lib/contracheque/analisar-cartao-saque-em-payslips";
import { historicoRubricaDePayslips } from "@/lib/contracheque/campos-cartao-saque-ao-gravar-payslip";
import type { Payslip } from "@/types/contracheque";
import type {
  AnaliseCartaoSaqueContracheque,
  StatusConferenciaCartaoSaqueEmbutido,
} from "@/types/cartao-saque-embutido";
import {
  ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE,
  AVISO_CARTAO_SAQUE_EMBUTIDO,
  RECOMENDACAO_CARTAO_SAQUE_CONTRACHEQUE,
  TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE,
} from "@/types/cartao-saque-embutido";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function badgeRisco(r: string) {
  if (r === "alto") return <Badge variant="destructive" className="text-[10px]">Alto</Badge>;
  if (r === "medio") return <Badge className="text-[10px] bg-amber-600/90">Médio</Badge>;
  return <Badge className="text-[10px] bg-slate-500/80">Baixo</Badge>;
}

function labelStatusConferencia(st: StatusConferenciaCartaoSaqueEmbutido | null | undefined): string {
  if (!st || st === "pendente_conferencia" || st === "pendente") return "Pendente conferência";
  if (st === "confirmado") return "Confirmado";
  if (st === "falso_positivo") return "Falso positivo";
  if (st === "contrato_localizado") return "Contrato vinculado";
  if (st === "precisa_revisao_juridica") return "Revisão jurídica";
  if (st === "ignorado") return "Ignorado";
  return st;
}

function RubricaLinha({
  r,
  statusSalvo,
  onStatus,
  podePersistir,
}: {
  r: RubricaCartaoSaqueComPayslip;
  statusSalvo?: StatusConferenciaCartaoSaqueEmbutido | null;
  onStatus: (status: StatusConferenciaCartaoSaqueEmbutido) => void;
  podePersistir: boolean;
}) {
  const border =
    r.risco === "alto"
      ? "border-destructive/45 bg-destructive/5"
      : r.risco === "medio"
        ? "border-amber-500/40 bg-amber-500/[0.06]"
        : "border-border/60";

  const aplicar = (st: StatusConferenciaCartaoSaqueEmbutido) => {
    if (!podePersistir) {
      toast.message("Grave o contracheque para persistir a conferência.");
      return;
    }
    onStatus(st);
  };

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${border}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tabular-nums">
          {String(r.mes).padStart(2, "0")}/{r.ano}
        </span>
        {badgeRisco(r.risco)}
        <Badge variant="outline" className="text-[9px] h-5">
          {r.termoEncontrado}
        </Badge>
        {r.descontoRecorrente ? (
          <Badge variant="outline" className="text-[9px] h-5 border-amber-500/50">
            Recorrente · {r.mesesRecorrencia} mês(es)
          </Badge>
        ) : null}
        <Badge variant="secondary" className="text-[8px] h-5">
          {labelStatusConferencia(statusSalvo)}
        </Badge>
      </div>

      <p className="text-[11px] font-medium leading-snug" title={r.nomeRubrica}>
        {r.nomeRubrica}
      </p>
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span>
          Valor: <strong className="text-foreground tabular-nums">{fmtBrl(r.valorDescontado)}</strong>
        </span>
        {r.bancoPossivel ? <span>Banco provável: {r.bancoPossivel}</span> : null}
        {r.codigoRubrica ? <span>Cód. {r.codigoRubrica}</span> : null}
      </div>

      <p className="text-[10px] text-foreground/85">{RECOMENDACAO_CARTAO_SAQUE_CONTRACHEQUE}</p>
      <p className="text-[9px] text-amber-800 dark:text-amber-200">
        Não cadastrar automaticamente como empréstimo comum — conferir contrato de cartão/saque/RMC/RCC.
      </p>

      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button
          type="button"
          size="sm"
          variant={statusSalvo === "confirmado" ? "secondary" : "outline"}
          className="h-7 text-[10px]"
          onClick={() => aplicar("confirmado")}
        >
          Confirmar
        </Button>
        <Button
          type="button"
          size="sm"
          variant={statusSalvo === "falso_positivo" ? "secondary" : "outline"}
          className="h-7 text-[10px]"
          onClick={() => aplicar("falso_positivo")}
        >
          Falso positivo
        </Button>
        <Button
          type="button"
          size="sm"
          variant={statusSalvo === "contrato_localizado" ? "secondary" : "outline"}
          className="h-7 text-[10px]"
          onClick={() => aplicar("contrato_localizado")}
        >
          Vincular contrato
        </Button>
        <Button
          type="button"
          size="sm"
          variant={statusSalvo === "precisa_revisao_juridica" ? "destructive" : "outline"}
          className="h-7 text-[10px]"
          onClick={() => aplicar("precisa_revisao_juridica")}
        >
          Revisão jurídica
        </Button>
        <Button
          type="button"
          size="sm"
          variant={statusSalvo === "ignorado" ? "secondary" : "ghost"}
          className="h-7 text-[10px]"
          onClick={() => aplicar("ignorado")}
        >
          Ignorar
        </Button>
      </div>
    </div>
  );
}

/** Selo discreto quando não há indício na folha. */
export function CartaoSaqueSemIndicioSelo({ className }: { className?: string }) {
  return (
    <p
      className={`text-[10px] text-muted-foreground italic border border-dashed border-border/80 rounded-md px-2.5 py-1.5 inline-block ${className ?? ""}`}
    >
      Sem indício de cartão/saque embutido nesta folha
    </p>
  );
}

export type CartaoSaqueEmbutidoFolhaCardProps = {
  competencia: { mes: number; ano: number };
  analise: AnaliseCartaoSaqueContracheque;
  payslipId?: string;
  statusInicial?: StatusConferenciaCartaoSaqueEmbutido | null;
  bancoColuna?: string | null;
  valorMensalColuna?: number | null;
  /** Sem borda de cartão grande (dentro da revisão mensal). */
  embutido?: boolean;
  onStatusPersistido?: (status: StatusConferenciaCartaoSaqueEmbutido) => void;
};

/** Card por folha — dados das colunas `cartao_saque_*` ou pré-visualização da importação. */
export function CartaoSaqueEmbutidoFolhaCard({
  competencia,
  analise,
  payslipId,
  statusInicial = null,
  bancoColuna,
  valorMensalColuna,
  embutido = false,
  onStatusPersistido,
}: CartaoSaqueEmbutidoFolhaCardProps) {
  const [statusLocal, setStatusLocal] = useState<StatusConferenciaCartaoSaqueEmbutido | null>(
    statusInicial,
  );

  useEffect(() => {
    setStatusLocal(statusInicial);
  }, [statusInicial, payslipId]);

  const statusAtual = statusLocal ?? statusInicial;
  const temIndicio = analise.encontrado;

  const persistirStatus = useCallback(
    async (status: StatusConferenciaCartaoSaqueEmbutido) => {
      if (!payslipId) {
        toast.message("Grave o contracheque para persistir a conferência.");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("payslips")
        .update({ cartao_saque_status_conferencia: status })
        .eq("id", payslipId);
      if (error) {
        toast.error("Não foi possível gravar. Execute patch_payslips_cartao_saque_embutido.sql no Supabase.");
        return;
      }
      setStatusLocal(status);
      onStatusPersistido?.(status);
      toast.message("Conferência registada.");
      emitDashboardDataUpdated({
        origin: "cartao_saque_conferencia",
        sincronizarFontes: false,
      });
    },
    [payslipId, onStatusPersistido],
  );

  if (!temIndicio && !statusAtual) {
    return <CartaoSaqueSemIndicioSelo />;
  }

  const rubricas = analise.rubricas.map((r) => ({
    ...r,
    mes: competencia.mes,
    ano: competencia.ano,
    payslipId,
  }));
  const valorTotal =
    valorMensalColuna ??
    (rubricas.length ? rubricas.reduce((s, r) => s + r.valorDescontado, 0) : null);
  const banco =
    bancoColuna ?? rubricas.find((r) => r.bancoPossivel)?.bancoPossivel ?? null;
  const riscoGlobal = analise.nivel_risco_global;

  const inner = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold tabular-nums">
          Competência {String(competencia.mes).padStart(2, "0")}/{competencia.ano}
        </span>
        {badgeRisco(riscoGlobal)}
        {valorTotal != null && valorTotal > 0 ? (
          <span className="text-muted-foreground">
            Total estimado: <strong className="text-foreground tabular-nums">{fmtBrl(valorTotal)}</strong>
          </span>
        ) : null}
        {banco ? <span className="text-muted-foreground">Banco provável: {banco}</span> : null}
      </div>

      <p className="text-[10px] italic text-muted-foreground border-l-2 border-muted pl-2">{AVISO_CARTAO_SAQUE_EMBUTIDO}</p>
      <p className="text-[11px] leading-relaxed">{analise.recomendacao ?? RECOMENDACAO_CARTAO_SAQUE_CONTRACHEQUE}</p>

      <div className="space-y-2">
        {rubricas.map((r) => (
          <RubricaLinha
            key={`${r.chaveRecorrencia}-${r.valorDescontado}-${r.nomeRubrica.slice(0, 20)}`}
            r={r}
            statusSalvo={statusAtual}
            podePersistir={Boolean(payslipId)}
            onStatus={(st) => void persistirStatus(st)}
          />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        <Link href="/dashboard/contrato-emprestimo" className="text-blue-600 dark:text-blue-400 hover:underline">
          Anexar contrato de cartão/saque
        </Link>
        {" · "}
        <Link href="/dashboard/analise" className="text-blue-600 dark:text-blue-400 hover:underline">
          Visão consolidada (Análise IA)
        </Link>
      </p>
    </>
  );

  if (embutido) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2 text-amber-950 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE}
        </p>
        <p className="text-xs leading-relaxed">{ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE}</p>
        {inner}
      </div>
    );
  }

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
          {TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE}
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">{ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{inner}</CardContent>
    </Card>
  );
}

export function CartaoSaqueEmbutidoResumoTopo({ resumo }: { resumo: ResumoCartaoSaqueConferencia }) {
  if (resumo.totalComAlerta === 0) return null;

  const itens = [
    { label: "Folhas com alerta", valor: resumo.totalComAlerta, destaque: true },
    { label: "Pendentes", valor: resumo.pendentes },
    { label: "Confirmadas", valor: resumo.confirmadas },
    { label: "Falso positivo", valor: resumo.falsoPositivo },
    { label: "Revisão jurídica", valor: resumo.revisaoJuridica },
  ];

  return (
    <Card className="border-amber-500/25 bg-amber-500/[0.04]">
      <CardHeader className="py-3 px-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />
          Cartão / saque embutido — resumo das folhas
        </CardTitle>
        <CardDescription className="text-[11px]">
          Conferência por contracheque gravado. A aba Empréstimos → Análise IA mantém a visão consolidada.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div className="flex flex-wrap gap-2">
          {itens.map((i) => (
            <div
              key={i.label}
              className={`rounded-lg border px-3 py-2 min-w-[7rem] text-center ${
                i.destaque ? "border-amber-500/50 bg-background/80" : "border-border/60 bg-muted/30"
              }`}
            >
              <div className="text-lg font-bold tabular-nums">{i.valor}</div>
              <div className="text-[10px] text-muted-foreground">{i.label}</div>
            </div>
          ))}
          {resumo.vinculadas > 0 ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 min-w-[7rem] text-center">
              <div className="text-lg font-bold tabular-nums">{resumo.vinculadas}</div>
              <div className="text-[10px] text-muted-foreground">Contrato vinculado</div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

type GrupoRubricaCartaoSaque = {
  chave: string;
  nome: string;
  risco: "baixo" | "medio" | "alto";
  termo: string;
  banco: string | null;
  total: number;
  valorMedio: number;
  ocorrencias: RubricaCartaoSaqueComPayslip[];
  competencias: string[];
  recorrente: boolean;
};

function rankRisco(r: string): number {
  if (r === "alto") return 3;
  if (r === "medio") return 2;
  return 1;
}

function normalizarTextoGrupoCartaoSaque(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\d{1,3}\/\d{1,3}/g, " ")
    .replace(/\b\d{3,8}\b/g, " ")
    .replace(/\bparcela\b|\bparc\b|\bcod(?:igo)?\b/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function familiaRubricaCartaoSaque(r: RubricaCartaoSaqueComPayslip): string {
  const texto = normalizarTextoGrupoCartaoSaque(`${r.nomeRubrica} ${r.termoEncontrado}`);
  if (/\bbib\b|banco industrial do brasil|industrial do brasil/.test(texto)) return "bib-cartao";
  if (/credcesta|cred cesta/.test(texto) && /\bsaque\b/.test(texto)) return "credcesta-saque";
  if (/credcesta|cred cesta/.test(texto) && /\bcompra\b/.test(texto)) return "credcesta-compra";
  if (/credcartao|cred cartao|cred card/.test(texto)) return "credcartao";
  if (/\brmc\b/.test(texto)) return "rmc";
  if (/\brcc\b/.test(texto)) return "rcc";
  if (/\bsaque\b/.test(texto)) return `${r.bancoPossivel ?? "sem-banco"}-saque`;
  if (/cartao|card/.test(texto)) return `${r.bancoPossivel ?? "sem-banco"}-cartao`;
  return texto;
}

function nomeGrupoPreferencial(grupo: string, fallback: string): string {
  if (grupo === "bib-cartao") return "Banco Industrial do Brasil CARTAO";
  if (grupo === "credcesta-saque") return "CREDCRESTA SAQUE".replace("CREDCRESTA", "CREDCESTA");
  if (grupo === "credcesta-compra") return "CREDCESTA COMPRA";
  if (grupo === "credcartao") return "CREDCARTAO";
  if (grupo === "rmc") return "RMC";
  if (grupo === "rcc") return "RCC";
  return fallback;
}

function chaveGrupoRubrica(r: RubricaCartaoSaqueComPayslip): string {
  return familiaRubricaCartaoSaque(r);
}

function agruparRubricasCartaoSaque(rubricas: RubricaCartaoSaqueComPayslip[]): GrupoRubricaCartaoSaque[] {
  const map = new Map<string, GrupoRubricaCartaoSaque>();
  for (const r of rubricas) {
    const chave = chaveGrupoRubrica(r);
    const cur =
      map.get(chave) ??
      ({
        chave,
        nome: nomeGrupoPreferencial(chave, r.nomeRubrica),
        risco: r.risco,
        termo: r.termoEncontrado,
        banco: r.bancoPossivel,
        total: 0,
        valorMedio: 0,
        ocorrencias: [],
        competencias: [],
        recorrente: false,
      } satisfies GrupoRubricaCartaoSaque);
    cur.total += r.valorDescontado;
    cur.ocorrencias.push(r);
    cur.banco = cur.banco ?? r.bancoPossivel;
    cur.nome = nomeGrupoPreferencial(chave, cur.nome);
    cur.recorrente = cur.recorrente || r.descontoRecorrente || cur.ocorrencias.length >= 2;
    if (rankRisco(r.risco) > rankRisco(cur.risco)) cur.risco = r.risco;
    map.set(chave, cur);
  }

  return [...map.values()]
    .map((g) => {
      const competencias = [...new Set(g.ocorrencias.map((r) => `${String(r.mes).padStart(2, "0")}/${r.ano}`))];
      return {
        ...g,
        total: Math.round(g.total * 100) / 100,
        valorMedio: Math.round((g.total / Math.max(1, g.ocorrencias.length)) * 100) / 100,
        competencias,
        recorrente: g.recorrente || competencias.length >= 2,
      };
    })
    .sort((a, b) => rankRisco(b.risco) - rankRisco(a.risco) || b.ocorrencias.length - a.ocorrencias.length);
}

type Props = {
  payslips: Payslip[];
  compacto?: boolean;
};

/** Visão consolidada (várias folhas) — reutiliza o card por folha. */
export function CartaoSaqueEmbutidoPainel({ payslips, compacto = false }: Props) {
  const historico = useMemo(() => historicoRubricaDePayslips(payslips), [payslips]);
  const [statusOverridePorPayslip, setStatusOverridePorPayslip] = useState<
    Record<string, StatusConferenciaCartaoSaqueEmbutido>
  >({});
  const [bulkBusy, setBulkBusy] = useState<StatusConferenciaCartaoSaqueEmbutido | null>(null);
  const folhasComAlerta = useMemo(
    () =>
      payslips.filter((p) => {
        if (payslipTemCartaoSaqueParaExibir(p)) return true;
        return obterAnaliseCartaoSaqueDePayslip(p, historico).encontrado;
      }),
    [historico, payslips],
  );
  const folhasPendentes = useMemo(
    () =>
      folhasComAlerta.filter((p) =>
        payslipCartaoSaquePendenteConferencia(p, statusOverridePorPayslip[p.id]),
      ),
    [folhasComAlerta, statusOverridePorPayslip],
  );
  const resumo = useMemo(() => resumoCartaoSaqueEmPayslips(payslips), [payslips]);
  const rubricas = useMemo(() => {
    const out: RubricaCartaoSaqueComPayslip[] = [];
    for (const p of folhasPendentes) {
      const analise = obterAnaliseCartaoSaqueDePayslip(p, historico);
      for (const r of analise.rubricas) out.push({ ...r, payslipId: p.id });
    }
    return out;
  }, [folhasPendentes, historico]);
  const grupos = useMemo(() => agruparRubricasCartaoSaque(rubricas), [rubricas]);
  const idsPersistiveis = useMemo(
    () => [...new Set(folhasPendentes.map((p) => p.id).filter(Boolean))],
    [folhasPendentes],
  );

  const aplicarStatusLote = useCallback(
    async (status: StatusConferenciaCartaoSaqueEmbutido) => {
      if (idsPersistiveis.length === 0) {
        toast.message("Nenhum contracheque gravado para atualizar.");
        return;
      }
      setBulkBusy(status);
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("payslips")
          .update({ cartao_saque_status_conferencia: status })
          .in("id", idsPersistiveis);
        if (error) {
          const msg = String(error.message ?? error);
          if (/cartao_saque_status_conferencia|column/i.test(msg)) {
            throw new Error(
              "Coluna de conferência ausente no Supabase. Execute supabase/patch_payslips_cartao_saque_embutido.sql.",
            );
          }
          throw error;
        }
        setStatusOverridePorPayslip((prev) => {
          const next = { ...prev };
          for (const id of idsPersistiveis) next[id] = status;
          return next;
        });
        toast.success(`${idsPersistiveis.length} competência(s) atualizada(s): ${labelStatusConferencia(status)}.`);
        emitDashboardDataUpdated({
          origin: "cartao_saque_conferencia_lote",
          sincronizarFontes: false,
        });
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Não foi possível aplicar a confirmação em lote.",
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [idsPersistiveis],
  );

  if (folhasComAlerta.length === 0) {
    return compacto ? null : (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4" aria-hidden />
            {TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE}
          </CardTitle>
          <CardDescription className="text-xs">
            Nenhuma rubrica de desconto com termos de cartão, RMC, RCC ou saque embutido nas folhas importadas.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (folhasPendentes.length === 0) {
    return (
      <div className="space-y-3" id="cartao-saque-contracheque">
        {!compacto ? <CartaoSaqueEmbutidoResumoTopo resumo={resumo} /> : null}
        <Card className="border-emerald-500/30 bg-emerald-500/[0.04]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Conferência de cartão/saque concluída
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Não há competências pendentes nesta fila.{" "}
              {resumo.confirmadas > 0 ? `${resumo.confirmadas} confirmada(s). ` : ""}
              {resumo.revisaoJuridica > 0 ? `${resumo.revisaoJuridica} em revisão jurídica. ` : ""}
              {resumo.falsoPositivo > 0 ? `${resumo.falsoPositivo} falso(s) positivo(s). ` : ""}
              {resumo.vinculadas > 0 ? `${resumo.vinculadas} com contrato vinculado. ` : ""}
              {resumo.ignoradas > 0 ? `${resumo.ignoradas} ignorada(s).` : ""}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3" id="cartao-saque-contracheque">
      {!compacto ? <CartaoSaqueEmbutidoResumoTopo resumo={resumo} /> : null}
      <Card className="border-amber-500/30 bg-amber-500/[0.035]">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
                {TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE}
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                {grupos.length} rubrica(s) agrupada(s) em {folhasPendentes.length} competência(s) pendente(s)
                {folhasComAlerta.length > folhasPendentes.length
                  ? ` · ${folhasComAlerta.length - folhasPendentes.length} já conferida(s)`
                  : ""}
                . Revise por grupo e aplique uma decisão prática em lote.
              </CardDescription>
            </div>
            <Link
              href="/dashboard/contrato-emprestimo"
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
            >
              Anexar contrato/cartão
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Achados</p>
              <p className="text-lg font-bold tabular-nums">{rubricas.length}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Risco alto</p>
              <p className="text-lg font-bold tabular-nums">{rubricas.filter((r) => r.risco === "alto").length}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Recorrentes</p>
              <p className="text-lg font-bold tabular-nums">{grupos.filter((g) => g.recorrente).length}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-2 space-y-2">
            <p className="text-[11px] font-medium">Ações rápidas para todas as competências listadas</p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["confirmado", "Confirmar achados"],
                  ["precisa_revisao_juridica", "Enviar para revisão jurídica"],
                  ["contrato_localizado", "Contrato localizado"],
                  ["falso_positivo", "Marcar falso positivo"],
                  ["ignorado", "Ignorar"],
                ] as const
              ).map(([status, label]) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={status === "precisa_revisao_juridica" ? "destructive" : "outline"}
                  className="h-7 text-[10px]"
                  disabled={bulkBusy != null}
                  onClick={() => void aplicarStatusLote(status)}
                >
                  {bulkBusy === status ? "Gravando..." : label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {grupos.slice(0, 12).map((g) => (
              <div key={g.chave} className="rounded-lg border border-border/60 bg-background/65 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" title={g.nome}>
                      {g.nome}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {g.ocorrencias.length} lançamento(s) · média {fmtBrl(g.valorMedio)}
                      {g.banco ? ` · ${g.banco}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {badgeRisco(g.risco)}
                    {g.recorrente ? (
                      <Badge variant="outline" className="text-[9px] h-5 border-amber-500/50">
                        Recorrente
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="text-[9px] h-5">
                      {g.termo}
                    </Badge>
                  </div>
                </div>
                <details className="mt-2 text-[10px] text-muted-foreground">
                  <summary className="cursor-pointer select-none hover:text-foreground">
                    Ver competências ({g.competencias.slice(0, 4).join(", ")}
                    {g.competencias.length > 4 ? ` +${g.competencias.length - 4}` : ""})
                  </summary>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {g.ocorrencias.map((r) => {
                      const folha = r.payslipId
                        ? folhasComAlerta.find((p) => p.id === r.payslipId)
                        : undefined;
                      const status = folha
                        ? (statusConferenciaCartaoSaquePayslip(
                            folha,
                            statusOverridePorPayslip[folha.id],
                          ) ?? "pendente_conferencia")
                        : "pendente_conferencia";
                      return (
                        <span
                          key={`${r.payslipId}-${r.nomeRubrica}-${r.valorDescontado}-${r.mes}-${r.ano}`}
                          className="rounded border border-border/60 bg-muted/30 px-2 py-0.5"
                        >
                          {String(r.mes).padStart(2, "0")}/{r.ano} · {fmtBrl(r.valorDescontado)} ·{" "}
                          {labelStatusConferencia(status as StatusConferenciaCartaoSaqueEmbutido)}
                        </span>
                      );
                    })}
                  </div>
                </details>
              </div>
            ))}
            {grupos.length > 12 ? (
              <p className="text-[10px] text-muted-foreground px-1">
                +{grupos.length - 12} grupo(s) oculto(s) para manter o painel compacto.
              </p>
            ) : null}
          </div>

          <p className="text-[10px] text-muted-foreground border-l-2 border-muted pl-2">
            {AVISO_CARTAO_SAQUE_EMBUTIDO}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
