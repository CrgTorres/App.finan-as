"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import {
  type AnaliseFinanceiraContrachequeResultado,
  type ItemContrachequeAnalise,
  gerarAnaliseFinanceiraContracheque,
} from "@/lib/anexos/analise-financeira-contracheque-padroes";
import {
  consolidarEmprestimosPorPadraoLogico,
  type GrupoConsolidadoEmprestimo,
} from "@/lib/anexos/consolidacao-logica-emprestimos";
import { gerarValidacaoBaseEmprestimos, type StatusBaseEmprestimos } from "@/lib/anexos/validacao-base-emprestimos";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import { EvidenciasEmprestimoBlock } from "@/components/contracheque/EvidenciasEmprestimoBlock";
import type { Transaction } from "@/types";
import type { PendenciasRevisaoSyncSnapshot } from "@/lib/anexos/pendencias-analise-ui";
import {
  calcularScoresDashboard,
  gerarTimelineEventosAnaliseUi,
  largurasBarraRisco,
  mergeChecklistMelhoriaComRevisao,
  mergeValidacaoBaseComRevisao,
} from "@/lib/anexos/pendencias-revisao-dashboard-ajustes";
import { contratoTemEvidenciaTipo } from "@/lib/anexos/evidencias-emprestimos";
import {
  classNameCelulaValorParcela,
  obterValorParcela,
} from "@/lib/anexos/contrato-inferido-valor-parcela";
import { deduplicarContratosParaApresentacao } from "@/lib/contracheque/canonicalizar-contrato";
import { CartaoSaqueEmbutidoPainel } from "@/components/contracheque/CartaoSaqueEmbutidoPainel";
import {
  alertasCartaoSaqueContrachequeParaAnalise,
  listarRubricasCartaoSaqueEmPayslips,
} from "@/lib/contracheque/analisar-cartao-saque-em-payslips";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Gavel, Scale, TrendingUp, FileWarning, ClipboardList, CircleDashed, History } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function badgeStatusClass(status: string): string {
  if (status === "ativo/em andamento") return "bg-blue-600/15 text-blue-700 dark:text-blue-300 border-blue-500/40";
  if (status === "inconsistente") return "bg-amber-600/15 text-amber-800 dark:text-amber-200 border-amber-500/40";
  return "bg-muted text-muted-foreground";
}

function badgeRisco(r: string): string {
  if (r === "alto") return "bg-red-600/15 text-red-700 dark:text-red-300";
  if (r === "medio") return "bg-amber-600/15 text-amber-800";
  return "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300";
}

function badgeConfiancaConsolidacao(n: GrupoConsolidadoEmprestimo["nivelConfianca"]): string {
  if (n === "alto") return "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40";
  if (n === "medio") return "bg-amber-600/15 text-amber-800 dark:text-amber-200 border-amber-500/40";
  return "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/35";
}

function badgeStatusBaseEmprestimos(s: StatusBaseEmprestimos): string {
  if (s === "incompleta") return "bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/35";
  if (s === "em revisão") return "bg-amber-600/15 text-amber-900 dark:text-amber-200 border-amber-500/40";
  if (s === "consistente para análise financeira") {
    return "bg-sky-600/15 text-sky-800 dark:text-sky-200 border-sky-500/40";
  }
  return "bg-violet-600/15 text-violet-900 dark:text-violet-200 border-violet-500/40";
}

/** Seções do painel — use `ocultarSecoes` para reorganizar por abas sem alterar a engine. */
export type AnaliseFinanceiraContrachequeSecao =
  | "kpisResumo"
  | "graficoAnualEmprestimos"
  | "tabelaContratosInferidos"
  | "tabelaConsolidados"
  | "alertasConsolidacao"
  | "alertasGerais"
  | "checklistMelhoria"
  | "painelSincronizado"
  | "validacaoBase"
  | "hipotesesJuridicas"
  | "sugestoesDocumentos"
  | "cartaoSaqueEmbutido";

export type AnaliseFinanceiraContrachequeProps = {
  /** Resultado já calculado (opcional se passar `itens`). */
  resultado?: AnaliseFinanceiraContrachequeResultado;
  /** Rubricas extraídas — a análise é calculada no cliente com `useMemo`. */
  itens?: ItemContrachequeAnalise[];
  /** Folhas importadas — para validação da base (document_kind, competências). */
  payslipsAnexo?: Payslip[];
  /** Transações — para detetar importação de extrato na validação. */
  transactionsResumo?: Transaction[];
  /** Empréstimos na tabela `loans` — para cruzar evidências por `loan_id`. */
  loansCadastro?: Loan[];
  /** Sincronização com a revisão de pendências da análise de folha (evento + localStorage). */
  revisaoPendenciasSnapshot?: PendenciasRevisaoSyncSnapshot | null;
  /** Ocultar blocos específicos (layout por abas). Omitido = exibir tudo. */
  ocultarSecoes?: Partial<Record<AnaliseFinanceiraContrachequeSecao, true>>;
  /** Resumo da linha do tempo dentro do painel sincronizado (evitar duplicar na aba Linha do tempo). */
  painelSincronizadoModo?: "completo" | "semTimeline";
  /** Filtrar apenas alertas críticos no bloco «Alertas». */
  filtroAlertasGerais?: "todos" | "critico";
  /** Validação da base em modo compacto (detalhes em «Ver detalhes»). */
  compactarValidacaoBase?: boolean;
  /** Filtros apenas visuais sobre a tabela de contratos inferidos. */
  filtrosTabelaContratosInferidos?: boolean;
  /** Acordeão por hipótese jurídica (texto fechado por padrão). */
  hipotesesEmAcordeao?: boolean;
  /** Botões rápidos de tipo de evidência na coluna de anexos. */
  evidenciasAtalhosTipos?: boolean;
};

export function AnaliseFinanceiraContracheque({
  resultado: resultadoProp,
  itens,
  payslipsAnexo,
  transactionsResumo,
  loansCadastro,
  revisaoPendenciasSnapshot = null,
  ocultarSecoes = {},
  painelSincronizadoModo = "completo",
  filtroAlertasGerais = "todos",
  compactarValidacaoBase = false,
  filtrosTabelaContratosInferidos = false,
  hipotesesEmAcordeao = false,
  evidenciasAtalhosTipos = false,
}: AnaliseFinanceiraContrachequeProps) {
  const [evidencias, setEvidencias] = useState<LoanEvidence[]>([]);
  const [filtroBanco, setFiltroBanco] = useState<string>("__todos__");
  const [filtroStatus, setFiltroStatus] = useState<string>("__todos__");
  const [filtroRisco, setFiltroRisco] = useState<string>("__todos__");
  const [filtroEvidencia, setFiltroEvidencia] = useState<"todos" | "com" | "sem">("todos");
  const [filtroFaixaParcela, setFiltroFaixaParcela] = useState<string>("__todos__");

  const loadEvidencias = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("loan_evidences")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return;
    setEvidencias((data as LoanEvidence[]) ?? []);
  }, []);

  useEffect(() => {
    void loadEvidencias();
    const onEvt = () => void loadEvidencias();
    window.addEventListener(DASHBOARD_DATA_UPDATED, onEvt);
    return () => window.removeEventListener(DASHBOARD_DATA_UPDATED, onEvt);
  }, [loadEvidencias]);
  const resultado = useMemo(() => {
    if (resultadoProp) return resultadoProp;
    if (itens && itens.length > 0) return gerarAnaliseFinanceiraContracheque(itens);
    return null;
  }, [resultadoProp, itens]);

  if (!resultado) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Análise financeira (contracheque)</CardTitle>
          <CardDescription>
            Forneça <code className="text-xs bg-muted px-1 rounded">itens</code> ou{" "}
            <code className="text-xs bg-muted px-1 rounded">resultado</code> para gerar o painel.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { resumoFinanceiro, emprestimosPorContrato, padroesConsumo, alertas, hipotesesJuridicas, checklistMelhoriaDados } =
    resultado;

  const consolidacaoLogica = useMemo(
    () => consolidarEmprestimosPorPadraoLogico(emprestimosPorContrato),
    [emprestimosPorContrato],
  );

  const validacaoBase = useMemo(
    () =>
      gerarValidacaoBaseEmprestimos(
        itens ?? [],
        emprestimosPorContrato,
        consolidacaoLogica,
        payslipsAnexo ?? [],
        transactionsResumo ?? [],
        evidencias,
        loansCadastro ?? [],
      ),
    [
      itens,
      emprestimosPorContrato,
      consolidacaoLogica,
      payslipsAnexo,
      transactionsResumo,
      evidencias,
      loansCadastro,
    ],
  );

  const validacaoBaseAjustada = useMemo(
    () => mergeValidacaoBaseComRevisao(validacaoBase, revisaoPendenciasSnapshot ?? null),
    [validacaoBase, revisaoPendenciasSnapshot],
  );

  const checklistMelhoriaAjustado = useMemo(
    () => mergeChecklistMelhoriaComRevisao(checklistMelhoriaDados, revisaoPendenciasSnapshot ?? null),
    [checklistMelhoriaDados, revisaoPendenciasSnapshot],
  );

  const scoresDashboard = useMemo(
    () => calcularScoresDashboard(validacaoBase, revisaoPendenciasSnapshot ?? null, hipotesesJuridicas.length),
    [validacaoBase, revisaoPendenciasSnapshot, hipotesesJuridicas.length],
  );

  const timelineEventos = useMemo(
    () => gerarTimelineEventosAnaliseUi(payslipsAnexo ?? [], emprestimosPorContrato, consolidacaoLogica),
    [payslipsAnexo, emprestimosPorContrato, consolidacaoLogica],
  );

  const riscoBarraFrac = useMemo(() => largurasBarraRisco(scoresDashboard), [scoresDashboard]);
  const riscoBarraSum =
    riscoBarraFrac.verde + riscoBarraFrac.amarelo + riscoBarraFrac.vermelho > 0
      ? riscoBarraFrac.verde + riscoBarraFrac.amarelo + riscoBarraFrac.vermelho
      : 1;

  const loans = loansCadastro ?? [];

  const bancosContratos = useMemo(() => {
    const s = new Set<string>();
    for (const c of emprestimosPorContrato) {
      const b = (c.instituicaoDetectada ?? "").trim();
      if (b) s.add(b);
    }
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [emprestimosPorContrato]);

  const statusContratos = useMemo(() => {
    const s = new Set<string>();
    for (const c of emprestimosPorContrato) s.add(c.status);
    return [...s].sort();
  }, [emprestimosPorContrato]);

  const riscosContratos = useMemo(() => {
    const s = new Set<string>();
    for (const c of emprestimosPorContrato) s.add(c.risco);
    return [...s].sort();
  }, [emprestimosPorContrato]);

  const linhasContratosApresentacao = useMemo(
    () => deduplicarContratosParaApresentacao(emprestimosPorContrato),
    [emprestimosPorContrato],
  );

  const emprestimosPorContratoFiltrados = useMemo(() => {
    if (!filtrosTabelaContratosInferidos) return linhasContratosApresentacao;
    return linhasContratosApresentacao.filter(({ contrato: c }) => {
      if (filtroBanco !== "__todos__") {
        const b = (c.instituicaoDetectada ?? "").trim();
        if (b !== filtroBanco) return false;
      }
      if (filtroStatus !== "__todos__" && c.status !== filtroStatus) return false;
      if (filtroRisco !== "__todos__" && c.risco !== filtroRisco) return false;
      if (filtroEvidencia !== "todos") {
        const tem = contratoTemEvidenciaTipo(c, loans, evidencias, "contrato_formal");
        if (filtroEvidencia === "com" && !tem) return false;
        if (filtroEvidencia === "sem" && tem) return false;
      }
      if (filtroFaixaParcela !== "__todos__") {
        const vp = obterValorParcela(c);
        if (vp == null) return false;
        if (filtroFaixaParcela === "ate100" && vp > 100) return false;
        if (filtroFaixaParcela === "101_500" && (vp <= 100 || vp > 500)) return false;
        if (filtroFaixaParcela === "acima500" && vp <= 500) return false;
      }
      return true;
    });
  }, [
    filtrosTabelaContratosInferidos,
    linhasContratosApresentacao,
    filtroBanco,
    filtroStatus,
    filtroRisco,
    filtroEvidencia,
    filtroFaixaParcela,
    loans,
    evidencias,
  ]);

  const chartAnoData = padroesConsumo.evolucaoAnualEmprestimos.map((x) => ({
    ano: String(x.ano),
    emprestimos: x.total,
  }));

  const nivelAlerta = (n: string) => {
    if (n === "critico") return "border-red-500/40 bg-red-500/5";
    if (n === "aviso") return "border-amber-500/40 bg-amber-500/5";
    return "border-sky-500/30 bg-sky-500/5";
  };

  const secao = (k: AnaliseFinanceiraContrachequeSecao) => !ocultarSecoes[k];

  const alertasCartao = useMemo(() => {
    if (!payslipsAnexo?.length) return [];
    const rubricas = listarRubricasCartaoSaqueEmPayslips(payslipsAnexo);
    return alertasCartaoSaqueContrachequeParaAnalise(rubricas);
  }, [payslipsAnexo]);

  const alertasExibir = useMemo(() => {
    const base =
      filtroAlertasGerais === "critico" ? alertas.filter((a) => a.nivel === "critico") : alertas;
    const ids = new Set(base.map((a) => a.id));
    const extra = alertasCartao.filter((a) => !ids.has(a.id));
    return [...base, ...extra];
  }, [alertas, alertasCartao, filtroAlertasGerais]);

  const validacaoStatusEResumo = (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-muted-foreground">Status da base</p>
        <Badge variant="outline" className={badgeStatusBaseEmprestimos(validacaoBaseAjustada.statusBase)}>
          {validacaoBaseAjustada.statusBase}
        </Badge>
      </div>
      <p
        className={
          compactarValidacaoBase
            ? "text-sm leading-relaxed text-foreground/90 line-clamp-3"
            : "text-sm leading-relaxed text-foreground/90"
        }
      >
        {validacaoBaseAjustada.resumoStatus}
      </p>
    </>
  );

  const validacaoPainelEChecklist = (
    <>
      <div>
        <p className="text-sm font-semibold mb-2">Painel de qualidade</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm max-h-[min(280px,40vh)] overflow-y-auto pr-1">
          {(
            [
              ["Rubricas de empréstimo detectadas", validacaoBaseAjustada.painel.totalRubricasEmprestimoDetectadas],
              ["Contratos inferidos", validacaoBaseAjustada.painel.totalContratosInferidos],
              ["Contratos consolidados (lógica)", validacaoBaseAjustada.painel.totalContratosConsolidados],
              ["Com baixa confiança", validacaoBaseAjustada.painel.contratosComBaixaConfianca],
              ["Com possível duplicidade", validacaoBaseAjustada.painel.contratosComPossivelDuplicidade],
              ["Hipótese analítica: possível refinanciamento (pares)", validacaoBaseAjustada.painel.suspeitasRefinanciamentoPossivel],
              ["Hipótese analítica: provável refinanciamento (pares)", validacaoBaseAjustada.painel.suspeitasRefinanciamentoProvavel],
              [
                "Refinanciamento confirmado na triagem («É refinanciamento»)",
                validacaoBaseAjustada.painel.refinanciamentosConfirmadosTriagem,
              ],
              ["Com meses faltantes", validacaoBaseAjustada.painel.contratosComMesesFaltantes],
              ["Com parcela fora de sequência", validacaoBaseAjustada.painel.contratosComParcelaForaDeSequencia],
              ["Sem total de parcelas (parcelado)", validacaoBaseAjustada.painel.contratosSemTotalDeParcelas],
              ["Sem contrato formal anexado (na app)", validacaoBaseAjustada.painel.contratosSemContratoFormalAnexado],
              [
                "Extrato correspondente não verificado",
                validacaoBaseAjustada.painel.contratosSemExtratoBancarioCorrespondenteVerificado,
              ],
              ["Autorização de desconto não rastreada", validacaoBaseAjustada.painel.contratosSemAutorizacaoDeDescontoRastreada],
            ] as const
          ).map(([label, val]) => (
            <div
              key={label}
              className="flex justify-between gap-3 rounded-md border border-border/80 bg-background/60 px-3 py-2"
            >
              <span className="text-muted-foreground leading-snug">{label}</span>
              <span className="tabular-nums font-semibold shrink-0">{val}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Itens marcados «na app» refletem limitações do produto (sem arquivo de contrato/autorização); o valor é o
          número de linhas inferidas a cruzar com documentos externos.
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">Checklist final</p>
        <ul className="space-y-2 max-h-[min(220px,35vh)] overflow-y-auto pr-1">
          {validacaoBaseAjustada.checklistFinal.map((c) => {
            const Icon =
              c.status === "ok" ? CheckCircle2 : c.status === "parcial" ? AlertTriangle : CircleDashed;
            const iconClass =
              c.status === "ok"
                ? "text-emerald-600"
                : c.status === "parcial"
                  ? "text-amber-600"
                  : "text-muted-foreground";
            return (
              <li key={c.id} className="flex gap-2 text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconClass}`} aria-hidden />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.label}</span>
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {c.status}
                    </Badge>
                  </div>
                  {c.detalhe ? <p className="text-xs text-muted-foreground mt-0.5">{c.detalhe}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      {secao("kpisResumo") && (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ganhos (soma das rubricas)</CardDescription>
            <CardTitle className="text-xl tabular-nums text-blue-600 dark:text-blue-400">
              {formatBRL(resumoFinanceiro.somaGanhos)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {resumoFinanceiro.primeiroMes?.replace("-", "/")} — {resumoFinanceiro.ultimoMes?.replace("-", "/")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Descontos</CardDescription>
            <CardTitle className="text-xl tabular-nums text-red-600 dark:text-red-400">
              {formatBRL(resumoFinanceiro.somaDescontos)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {resumoFinanceiro.pctDescontosSobreGanhos != null
              ? `${resumoFinanceiro.pctDescontosSobreGanhos.toFixed(1)}% dos ganhos`
              : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Empréstimos / consignados (estimado)</CardDescription>
            <CardTitle className="text-xl tabular-nums text-violet-600 dark:text-violet-400">
              {formatBRL(resumoFinanceiro.somaEmprestimosDescontos)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {resumoFinanceiro.pctEmprestimosSobreGanhos != null
              ? `${resumoFinanceiro.pctEmprestimosSobreGanhos.toFixed(1)}% dos ganhos`
              : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Líquido (ganhos − descontos, rubricas)</CardDescription>
            <CardTitle className="text-xl tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatBRL(resumoFinanceiro.somaLiquido)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {padroesConsumo.maiorMesComprometimento
              ? `Maior % empr./ganhos: ${padroesConsumo.maiorMesComprometimento.competencia.replace("-", "/")} (${padroesConsumo.maiorMesComprometimento.pctEmprestimoGanhos.toFixed(1)}%)`
              : "—"}
          </CardContent>
        </Card>
      </div>
      )}

      {secao("graficoAnualEmprestimos") && chartAnoData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" aria-hidden />
              Empréstimos descontados por ano (soma)
            </CardTitle>
            <CardDescription>Valores inferidos a partir das rubricas classificadas como possível consignado.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartAnoData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="ano"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value) =>
                    typeof value === "number" ? formatBRL(value) : String(value ?? "")
                  }
                  labelFormatter={(l) => `Ano ${l}`}
                  contentStyle={{ borderRadius: 8 }}
                />
                <Bar
                  dataKey="emprestimos"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                  name="Empréstimos"
                />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {secao("tabelaContratosInferidos") && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">DADOS DETALHADOS</CardTitle>
          <CardDescription>
            Uma linha por código de folha + instituição + família de produto (empréstimo, cartão, saque…). Variações
            OCR e fragmentos com o mesmo código unificam-se aqui; passe o rato na descrição para ver textos brutos. A
            base bruta e a consolidação lógica abaixo não são alteradas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtrosTabelaContratosInferidos ? (
            <div className="flex flex-wrap items-end gap-2 text-[11px]">
              <label className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Banco</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[120px]"
                  value={filtroBanco}
                  onChange={(e) => setFiltroBanco(e.target.value)}
                >
                  <option value="__todos__">Todos</option>
                  {bancosContratos.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Status</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                >
                  <option value="__todos__">Todos</option>
                  {statusContratos.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Risco</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={filtroRisco}
                  onChange={(e) => setFiltroRisco(e.target.value)}
                >
                  <option value="__todos__">Todos</option>
                  {riscosContratos.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Valor parcela</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[140px]"
                  value={filtroFaixaParcela}
                  onChange={(e) => setFiltroFaixaParcela(e.target.value)}
                >
                  <option value="__todos__">Todos</option>
                  <option value="ate100">Até R$ 100</option>
                  <option value="101_500">R$ 101 – 500</option>
                  <option value="acima500">Acima de R$ 500</option>
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Evid. contrato</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={filtroEvidencia}
                  onChange={(e) => setFiltroEvidencia(e.target.value as "todos" | "com" | "sem")}
                >
                  <option value="todos">Todos</option>
                  <option value="com">Com anexo</option>
                  <option value="sem">Sem anexo</option>
                </select>
              </label>
            </div>
          ) : null}
          <div className="overflow-x-auto max-h-[min(480px,55vh)] overflow-y-auto -mx-2 px-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor parcela</TableHead>
                <TableHead className="text-right">Parcela (N/M)</TableHead>
                <TableHead className="text-right">Total pago</TableHead>
                <TableHead className="text-right">Saldo est.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risco</TableHead>
                <TableHead className="min-w-[148px]">Evidências</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emprestimosPorContrato.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground text-sm">
                    Nenhum desconto classificado como possível empréstimo/consignado com os critérios atuais.
                  </TableCell>
                </TableRow>
              ) : emprestimosPorContratoFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground text-sm">
                    Nenhuma linha com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                emprestimosPorContratoFiltrados.map((linha, idx) => {
                  const c = linha.contrato;
                  const nVariantes = linha.origensOCRBruta.length;
                  const tooltipOrigemOCR =
                    nVariantes > 1
                      ? `${nVariantes} variações OCR unificadas:\n${linha.origensOCRBruta.join("\n")}`
                      : linha.origensOCRBruta[0] && linha.origensOCRBruta[0].trim() !== linha.titulo
                        ? `Texto bruto (OCR):\n${linha.origensOCRBruta[0]}`
                        : undefined;
                  const vp = obterValorParcela(c);
                  return (
                  <TableRow key={`${linha.chaveCanonica}-${idx}`}>
                    <TableCell className="font-mono text-xs">{c.codigo || "—"}</TableCell>
                    <TableCell className="max-w-[240px] min-w-0">
                      <div className={cn("min-w-0", tooltipOrigemOCR ? "cursor-help" : "")} title={tooltipOrigemOCR}>
                        <p className="truncate text-sm font-medium">{linha.titulo}</p>
                        {linha.subtituloParcela ? (
                          <span className="block text-[10px] text-muted-foreground tabular-nums">
                            {linha.subtituloParcela}
                          </span>
                        ) : null}
                        {c.instituicaoDetectada &&
                        !linha.titulo.toUpperCase().includes(c.instituicaoDetectada.toUpperCase().slice(0, 8)) ? (
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {c.instituicaoDetectada}
                          </span>
                        ) : null}
                        {nVariantes > 1 ? (
                          <span className="block text-[10px] text-muted-foreground/80">
                            {nVariantes} leituras OCR
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums text-xs font-medium rounded-sm",
                        classNameCelulaValorParcela(vp),
                      )}
                      title={
                        vp != null
                          ? undefined
                          : "Valor mensal não identificado — confira a rubrica na folha."
                      }
                    >
                      {vp != null ? formatBRL(vp) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {c.parcelaInicialDetectada != null && c.parcelaFinalDetectada != null && c.totalParcelas
                        ? `${String(c.parcelaInicialDetectada).padStart(2, "0")}–${String(c.parcelaFinalDetectada).padStart(2, "0")}/${String(c.totalParcelas).padStart(2, "0")}`
                        : c.tipoContrato === "recorrente_01_01"
                          ? "01/01"
                          : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(c.totalPago)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {c.saldoEstimado != null ? formatBRL(c.saldoEstimado) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeStatusClass(c.status)}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeRisco(c.risco)}>
                        {c.risco}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <EvidenciasEmprestimoBlock
                        mode="contrato"
                        contrato={c}
                        loans={loans}
                        evidencias={evidencias}
                        onRefresh={loadEvidencias}
                        mostrarAtalhosTipos={evidenciasAtalhosTipos}
                      />
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
      )}

      {secao("tabelaConsolidados") && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CONTRATOS CONSOLIDADOS POR LÓGICA FINANCEIRA</CardTitle>
          <CardDescription>
            Visão complementar: encadeamento de parcelas, recorrentes 01/01 e possível refinanciamento, sem coexistência
            no mesmo mês — quando há dúvida, as linhas permanecem separadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto max-h-[min(520px,58vh)] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instituição</TableHead>
                <TableHead>Descrição principal</TableHead>
                <TableHead className="text-right text-xs">Nº orig.</TableHead>
                <TableHead>Códigos</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Valor parcela (médio)</TableHead>
                <TableHead className="text-right">Total pago</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Confiança</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Obs.</TableHead>
                <TableHead className="min-w-[148px]">Evidências</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consolidacaoLogica.grupos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-muted-foreground text-sm">
                    Nenhum grupo consolidado — importe contracheques com descontos classificados como empréstimo.
                  </TableCell>
                </TableRow>
              ) : (
                consolidacaoLogica.grupos.map((g) => (
                  <TableRow key={g.grupoId}>
                    <TableCell className="text-sm font-medium whitespace-nowrap">{g.instituicao}</TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="line-clamp-2 text-sm" title={g.descricaoPrincipal}>
                        {g.descricaoPrincipal}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{g.contratosOriginais.length}</TableCell>
                    <TableCell className="font-mono text-[10px] max-w-[100px] break-all">
                      {g.codigosEnvolvidos.length ? g.codigosEnvolvidos.join(", ") : "—"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {g.primeiraAparicao.replace("-", "/")} — {g.ultimaAparicao.replace("-", "/")}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums text-sm rounded-sm",
                        classNameCelulaValorParcela(g.valorMedioParcela > 0 ? g.valorMedioParcela : null),
                      )}
                    >
                      {g.valorMedioParcela > 0 ? formatBRL(g.valorMedioParcela) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatBRL(g.totalPagoConsolidado)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeStatusClass(g.statusConsolidado)}>
                        {g.statusConsolidado}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeConfiancaConsolidacao(g.nivelConfianca)}>
                        {g.nivelConfianca}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{g.scoreConfianca}</TableCell>
                    <TableCell className="text-[11px] max-w-[120px]" title={g.tipoConsolidacao}>
                      {g.tipoConsolidacao.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                      <span className="line-clamp-3" title={g.motivoAgrupamento}>
                        {g.motivoAgrupamento}
                      </span>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground max-w-[140px]">
                      {g.observacoes.length ? (
                        <span className="line-clamp-2" title={g.observacoes.join(" ")}>
                          {g.observacoes.join(" · ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <EvidenciasEmprestimoBlock
                        mode="grupo"
                        grupo={g}
                        loans={loans}
                        evidencias={evidencias}
                        onRefresh={loadEvidencias}
                        mostrarAtalhosTipos={evidenciasAtalhosTipos}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      {secao("alertasConsolidacao") && consolidacaoLogica.alertas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Alertas da consolidação lógica
            </CardTitle>
            <CardDescription>Sinais de simultaneidade, refinanciamento ou risco de agrupamento incorreto.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {consolidacaoLogica.alertas.map((a) => (
              <div
                key={a.id}
                className={`rounded-lg border px-3 py-2 text-sm ${nivelAlerta(a.nivel)}`}
              >
                <p className="font-medium">{a.titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.detalhe}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {secao("alertasGerais") && alertasExibir.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Alertas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[min(320px,40vh)] overflow-y-auto">
            {alertasExibir.map((a) => (
              <div
                key={a.id}
                className={`rounded-lg border px-3 py-2 text-sm ${nivelAlerta(a.nivel)}`}
              >
                <p className="font-medium">{a.titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.detalhe}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {secao("cartaoSaqueEmbutido") && payslipsAnexo && payslipsAnexo.length > 0 ? (
        <CartaoSaqueEmbutidoPainel payslips={payslipsAnexo} />
      ) : null}

      {secao("checklistMelhoria") && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileWarning className="h-4 w-4" aria-hidden />
            Checklist de dados e revisão
          </CardTitle>
          <CardDescription>
            Itens automáticos para melhorar prova e completude (não valida documentos reais anexados).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[min(360px,45vh)] overflow-y-auto">
          {checklistMelhoriaAjustado.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-2 text-sm border-b border-border/60 last:border-0 pb-2 last:pb-0"
            >
              {c.respondidoOk ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" aria-hidden />
              )}
              <div>
                <p className="font-medium">{c.pergunta}</p>
                {c.detalhe ? <p className="text-xs text-muted-foreground">{c.detalhe}</p> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      )}

      {secao("painelSincronizado") && (
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" aria-hidden />
            Painel sincronizado (revisão de pendências)
          </CardTitle>
          <CardDescription>
            Indicadores 0–100 e linha do tempo derivados da base inferida + triagem «Pendências e limites de análise». Não
            recalcula rubricas nem parsers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {revisaoPendenciasSnapshot && revisaoPendenciasSnapshot.resumo.total > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground">{revisaoPendenciasSnapshot.resumo.total}</span> total
              </span>
              <span>
                <span className="font-semibold text-foreground">{revisaoPendenciasSnapshot.resumo.resolvidas}</span>{" "}
                resolv.
              </span>
              <span>
                <span className="font-semibold text-foreground">{revisaoPendenciasSnapshot.resumo.ignoradas}</span>{" "}
                ignor.
              </span>
              <span>
                <span className="font-semibold text-foreground">{revisaoPendenciasSnapshot.resumo.revisaoPendente}</span>{" "}
                revisar
              </span>
              <span>
                <span className="font-semibold text-foreground">{revisaoPendenciasSnapshot.resumo.confirmadas}</span>{" "}
                confirm.
              </span>
              <span>
                <span className="font-semibold text-foreground">
                  {revisaoPendenciasSnapshot.resumo.contratosAfetados}
                </span>{" "}
                contratos
              </span>
              <span>
                <span className="font-semibold text-foreground">
                  {revisaoPendenciasSnapshot.resumo.altoImpactoAbertas}
                </span>{" "}
                alto impacto aberto
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ajuste pendências no painel de empréstimos para preencher o resumo global e refinar os escores abaixo.
            </p>
          )}

          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Risco geral (faixa verde · amarelo · vermelho)</p>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-border/70">
              <div
                className="h-full bg-emerald-500 transition-[width] duration-500"
                style={{ width: `${(riscoBarraFrac.verde / riscoBarraSum) * 100}%` }}
                title="Verde"
              />
              <div
                className="h-full bg-amber-400 transition-[width] duration-500"
                style={{ width: `${(riscoBarraFrac.amarelo / riscoBarraSum) * 100}%` }}
                title="Amarelo"
              />
              <div
                className="h-full bg-red-500 transition-[width] duration-500"
                style={{ width: `${(riscoBarraFrac.vermelho / riscoBarraSum) * 100}%` }}
                title="Vermelho"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Média dos eixos {scoresDashboard.mediaEixos}/100 · classificação{" "}
              <span className="font-medium text-foreground">{scoresDashboard.riscoGeral}</span>
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[11px]">
            {(
              [
                ["Qualidade da base", scoresDashboard.qualidadeBase],
                ["Completude documental", scoresDashboard.completudeDocumental],
                ["Consistência financeira", scoresDashboard.consistenciaFinanceira],
                ["Consistência temporal", scoresDashboard.consistenciaTemporal],
                ["Confiabilidade OCR", scoresDashboard.confiabilidadeOcr],
                ["Consistência (média)", scoresDashboard.consistenciaGeral],
                ["Score jurídico preliminar (UI)", scoresDashboard.scoreJuridicoPreliminar],
              ] as const
            ).map(([label, val]) => (
              <div
                key={label}
                className="flex justify-between gap-2 rounded-md border border-border/70 bg-background/50 px-2 py-1.5"
              >
                <span className="text-muted-foreground leading-snug">{label}</span>
                <span className="tabular-nums font-semibold shrink-0">{val}</span>
              </div>
            ))}
          </div>

          {painelSincronizadoModo === "completo" && (
          <div>
            <p className="text-sm font-semibold mb-2 flex items-center gap-2">
              <History className="h-4 w-4 opacity-80" aria-hidden />
              Linha do tempo (heurística)
            </p>
            <div className="max-h-48 overflow-y-auto space-y-2 border-l-2 border-border/80 pl-3 ml-1">
              {timelineEventos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem eventos derivados da base atual.</p>
              ) : (
                timelineEventos.map((ev) => (
                  <div key={ev.id} className="relative text-xs">
                    <span className="absolute -left-[15px] top-1 h-2 w-2 rounded-full bg-primary" aria-hidden />
                    <p className="font-medium text-foreground">{ev.label}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{ev.competencia}</p>
                    <p className="text-muted-foreground leading-snug">{ev.detalhe}</p>
                  </div>
                ))
              )}
            </div>
          </div>
          )}
        </CardContent>
      </Card>
      )}

      {secao("validacaoBase") && (
        <Card className="border-teal-500/30 bg-teal-500/[0.04]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" aria-hidden />
              Validação da Base de Empréstimos
            </CardTitle>
            <CardDescription>
              Antes da triagem jurídica: qualidade da base inferida e do que falta comprovar. Não há conclusão jurídica
              automática.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {compactarValidacaoBase ? (
              <>
                {validacaoStatusEResumo}
                <details className="rounded-lg border border-border/60 bg-background/40">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-primary hover:underline">
                    Ver detalhes da validação
                  </summary>
                  <div className="px-3 pb-4 pt-2 space-y-5 border-t border-border/40">{validacaoPainelEChecklist}</div>
                </details>
              </>
            ) : (
              <>
                {validacaoStatusEResumo}
                {validacaoPainelEChecklist}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {secao("hipotesesJuridicas") && (
        <Card className="border-amber-500/35">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4" aria-hidden />
              Hipóteses jurídicas (triagem informativa)
            </CardTitle>
            <CardDescription className="text-amber-900/80 dark:text-amber-200/90">
              {resultado.avisoJuridico}
            </CardDescription>
            <p className="text-[11px] text-muted-foreground pt-1">
              Score jurídico preliminar (UI, sincronizado com revisão de pendências):{" "}
              <span className="font-semibold tabular-nums text-foreground">{scoresDashboard.scoreJuridicoPreliminar}</span>
              /100
            </p>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[min(480px,55vh)] overflow-y-auto">
            {hipotesesJuridicas.map((h) =>
              hipotesesEmAcordeao ? (
                <details
                  key={h.id}
                  className="rounded-md border border-border/80 bg-muted/20 open:bg-muted/30"
                >
                  <summary className="cursor-pointer list-none flex flex-wrap items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                    <Gavel className="h-3.5 w-3.5 opacity-70 shrink-0" aria-hidden />
                    <span className="font-medium flex-1 min-w-0">{h.titulo}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {h.tema.replace(/_/g, " ")}
                    </Badge>
                  </summary>
                  <p className="text-xs text-muted-foreground leading-relaxed px-3 pb-3 border-t border-border/50 pt-2">
                    {h.textoInformativo}
                  </p>
                </details>
              ) : (
                <div
                  key={h.id}
                  className="rounded-md border border-border/80 bg-muted/20 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Gavel className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    <span className="font-medium">{h.titulo}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {h.tema.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{h.textoInformativo}</p>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      )}

      {secao("sugestoesDocumentos") && resultado.sugestoesProximosDocumentos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sugestões de próximos documentos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {resultado.sugestoesProximosDocumentos.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
