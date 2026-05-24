"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DASHBOARD_DATA_UPDATED,
  emitDashboardDataUpdated,
  PENDENCIAS_ANALISE_REVISAO_ATUALIZADA,
  subscribeDashboardDataUpdated,
  type PendenciasAnaliseRevisaoDetail,
} from "@/lib/dashboard-data-events";
import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import { getLoanProjection } from "@/types/contracheque";
import { payslipPreferidoParaAnalise } from "@/lib/anexos/payslip-preferred-for-analise";
import { buildAnaliseNormalizadaSnapshot } from "@/lib/dashboard/base-financeira-normalizada";
import {
  carregarRevisaoPendenciasLocal,
  enriquecerPendenciasAnalise,
  montarSnapshotRevisaoParaDashboard,
  type PendenciasRevisaoSyncSnapshot,
} from "@/lib/anexos/pendencias-analise-ui";
import { EmprestimosAnalisePainel } from "@/components/dashboard/emprestimos-analise-painel";
import {
  PAYSLIPS_ANALISE_LIMIT,
  textoResumoEmprestimosParaChat,
} from "@/lib/anexos/emprestimos-cruzamento-loans";
import { consolidarEmprestimosPorPadraoLogico } from "@/lib/anexos/consolidacao-logica-emprestimos";
import { gerarValidacaoBaseEmprestimos } from "@/lib/anexos/validacao-base-emprestimos";
import { calcularScoresDashboard } from "@/lib/anexos/pendencias-revisao-dashboard-ajustes";
import { cadastrarEmprestimosDetectadosContracheque } from "@/lib/anexos/loans-cadastro-automatico-contracheque";
import {
  reprocessarCartaoSaqueContracheques,
  type ResultadoReprocessamentoCartaoSaque,
} from "@/lib/contracheque/reprocessar-cartao-saque-payslips";
import { AnaliseFinanceiraContracheque } from "@/components/contracheque/AnaliseFinanceiraContracheque";
import { CartaoSaqueEmbutidoPainel } from "@/components/contracheque/CartaoSaqueEmbutidoPainel";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AnaliseHeaderCompacto } from "@/components/dashboard/analise/analise-header-compacto";
import { DashboardCrossLinks } from "@/components/layout/dashboard-cross-links";
import { AnaliseExportMenu } from "@/components/dashboard/analise/analise-export-menu";
import { AnaliseMetricCards } from "@/components/dashboard/analise/analise-metric-cards";
import { AnaliseAuditoriaStepper } from "@/components/dashboard/analise/analise-auditoria-stepper";
import { AnaliseDiagnosticoCharts } from "@/components/dashboard/analise/analise-diagnostico-charts";
import { AnaliseConsolidacaoAuditoria } from "@/components/dashboard/analise/analise-consolidacao-auditoria";
import { AnaliseEmprestimosStatsCards } from "@/components/dashboard/analise/analise-emprestimos-stats";
import { AuditoriaInsightBanner, AuditoriaSection } from "@/components/dashboard/analise/premium";
import type { AnaliseDashboardAbaId } from "@/components/dashboard/analise/analise-tab-ids";
import { AnaliseResumoTab } from "@/components/dashboard/analise/analise-resumo-tab";
import { AnaliseEmprestimosTab } from "@/components/dashboard/analise/analise-emprestimos-tab";
import { AnaliseConsolidacaoTab } from "@/components/dashboard/analise/analise-consolidacao-tab";
import { AnalisePendenciasTab } from "@/components/dashboard/analise/analise-pendencias-tab";
import { AnaliseEvidenciasTab } from "@/components/dashboard/analise/analise-evidencias-tab";
import { AnaliseJuridicoTab } from "@/components/dashboard/analise/analise-juridico-tab";
import { PendenciasAnaliseRevisaoPanel } from "@/components/dashboard/pendencias-analise-revisao-panel";
import { CATEGORY_COLORS } from "@/lib/constants";
import {
  Sparkles, AlertTriangle, TrendingDown, CheckCircle2,
  Info, Loader2, ChevronRight, Zap, Target, Crown,
  Lock, ArrowRight, BarChart3, PiggyBank, CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aggregateTransactionsByMonth } from "@/lib/utils/monthly-transactions";
import { parseTransactionDate } from "@/lib/utils/monthly-transactions";
import { MonthlyComparisonChart } from "@/components/dashboard/monthly-comparison-chart";
import { toast } from "sonner";
import type { MonthlyComparisonRow } from "@/components/dashboard/monthly-comparison-chart";
import type { LoanEvidence } from "@/types/loan-evidence";

// ── Types ─────────────────────────────────────────────────────────
type InsightLevel = "critical" | "warning" | "positive" | "info";

interface Insight {
  level: InsightLevel;
  icon: React.ElementType;
  title: string;
  description: string;
  action?: string;
  value?: string;
}

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Analysis engine ───────────────────────────────────────────────
function generateInsights(
  transactions: Transaction[],
  loans: Loan[],
  payslip: Payslip | null
): Insight[] {
  const insights: Insight[] = [];

  const receitas = transactions.filter((t) => t.type === "receita").reduce((s, t) => s + t.amount, 0);
  const despesas = transactions.filter((t) => t.type === "despesa").reduce((s, t) => s + t.amount, 0);
  const saldo = receitas - despesas;

  const apenasFolha =
    receitas === 0 && despesas === 0 && payslip != null && (payslip.net_salary ?? 0) > 0;

  // 1 · Saldo geral
  if (receitas === 0 && despesas === 0 && !apenasFolha) {
    insights.push({
      level: "info", icon: Info,
      title: "Sem dados suficientes",
      description: "Nenhuma transação encontrada no período. Adicione suas receitas e despesas para gerar uma análise completa.",
    });
    return insights;
  }

  if (apenasFolha) {
    insights.push({
      level: "info",
      icon: Info,
      title: "Período sem lançamentos — base na folha",
      description: `Não há receitas ou despesas registradas no recorte; a análise de empréstimos e reserva usa o líquido do contracheque mais recente (${formatCurrency(payslip!.net_salary)}). Importe extrato ou lance movimentação para ver fluxo e saldo no período.`,
      action: "Ao anexar contracheques ou ficha, este painel atualiza automaticamente.",
      value: formatCurrency(payslip!.net_salary),
    });
  }

  if (!apenasFolha && saldo < 0) {
    insights.push({
      level: "critical", icon: AlertTriangle,
      title: "Gastos acima da renda",
      description: `Seus gastos superaram sua renda em ${formatCurrency(Math.abs(saldo))} no período analisado. Isso compromete sua estabilidade financeira.`,
      action: "Mapeie os 3 maiores gastos variáveis e estabeleça um teto mensal imediato.",
      value: formatCurrency(Math.abs(saldo)),
    });
  } else if (!apenasFolha) {
    const savingRate = receitas > 0 ? (saldo / receitas) * 100 : 0;
    if (savingRate < 10) {
      insights.push({
        level: "warning", icon: TrendingDown,
        title: "Margem de segurança baixa",
        description: `Você economizou apenas ${savingRate.toFixed(1)}% da renda. O mínimo recomendado é 10%, sendo 20% o ideal para uma reserva sólida.`,
        action: `Redirecione ${formatCurrency(receitas * 0.1 - saldo)} de gastos variáveis para poupança.`,
        value: `${savingRate.toFixed(1)}% guardado`,
      });
    } else if (savingRate >= 20) {
      insights.push({
        level: "positive", icon: CheckCircle2,
        title: "Excelente taxa de poupança",
        description: `Parabéns! Você guardou ${savingRate.toFixed(1)}% da renda — acima da meta de 20%. Continue assim e pense em investimentos.`,
        value: formatCurrency(saldo),
      });
    } else {
      insights.push({
        level: "info", icon: PiggyBank,
        title: "Poupança no caminho certo",
        description: `Taxa de poupança de ${savingRate.toFixed(1)}%. Bom, mas pode melhorar! Tente chegar em 20% reduzindo gastos variáveis.`,
        action: `Faltam ${formatCurrency(receitas * 0.2 - saldo)} para atingir a meta de 20%.`,
        value: formatCurrency(saldo),
      });
    }
  }

  // 2 · Carga de empréstimos
  const activeLoans = loans.filter((l) => l.status === "ativo");
  if (activeLoans.length > 0) {
    const totalConsig = activeLoans.reduce((s, l) => s + l.installment_amount, 0);
    const salaryBase = payslip?.net_salary ?? receitas;
    const burden = salaryBase > 0 ? (totalConsig / salaryBase) * 100 : 0;

    if (burden > 35) {
      insights.push({
        level: "critical", icon: CreditCard,
        title: `Carga de empréstimos crítica (${burden.toFixed(0)}%)`,
        description: `Seus ${activeLoans.length} empréstimos consumem ${formatCurrency(totalConsig)}/mês — ${burden.toFixed(1)}% do salário líquido. O limite seguro é 30%.`,
        action: "Considere um empréstimo de consolidação com taxa menor para substituir os atuais e reduzir a parcela total.",
        value: formatCurrency(totalConsig) + "/mês",
      });
    } else if (burden > 20) {
      insights.push({
        level: "warning", icon: CreditCard,
        title: `Atenção com empréstimos (${burden.toFixed(0)}%)`,
        description: `Empréstimos consomem ${burden.toFixed(1)}% do salário líquido. Monitorar para não ultrapassar 30%.`,
        action: "Evite novos empréstimos até reduzir essa proporção.",
        value: formatCurrency(totalConsig) + "/mês",
      });
    }

    // Oportunidade de quitação antecipada (menor saldo devedor)
    const sorted = [...activeLoans].sort((a, b) => {
      const pA = getLoanProjection(a).remainingAmount;
      const pB = getLoanProjection(b).remainingAmount;
      return pA - pB;
    });
    const smallest = sorted[0];
    if (smallest) {
      const proj = getLoanProjection(smallest);
      if (proj.remainingInstallments <= 18) {
        insights.push({
          level: "info", icon: Target,
          title: "Oportunidade: quitar antecipadamente",
          description: `"${smallest.description}" tem apenas ${proj.remainingInstallments} parcelas restantes (${formatCurrency(proj.remainingAmount)} total). Quitar agora libera ${formatCurrency(smallest.installment_amount)}/mês no seu orçamento.`,
          action: "Verifique se há desconto por quitação antecipada — geralmente 20–40% de desconto nos juros restantes.",
          value: `Libera ${formatCurrency(smallest.installment_amount)}/mês`,
        });
      }
    }
  }

  // 2b · Parcelas de consignado (paga/total) no contracheque
  const itensParcela =
    payslip?.items?.filter(
      (it) =>
        it.type === "desconto" &&
        it.parcelaAtual != null &&
        it.parcelaTotal != null &&
        it.value > 0
    ) ?? [];
  if (itensParcela.length > 0) {
    const exemplos = itensParcela
      .slice(0, 3)
      .map((it) => {
        const d = it.description.trim();
        return d.length > 44 ? `${d.slice(0, 44)}…` : d;
      })
      .join(" · ");
    insights.push({
      level: "info",
      icon: CreditCard,
      title: "Parcelas de consignados na folha",
      description: `Foram lidas ${itensParcela.length} rubrica(s) de desconto com parcela (ex.: 01/48 = 1.ª de 48). Útil para saber quanto falta do plano e para comparar com o contrato. Trechos: ${exemplos}.`,
      action:
        "Se o OCR omitir o par no fim da linha, reimporte em melhor qualidade ou use «Re-ler com OCR reforçado» em Anexos. O histórico de descontos cruza o mesmo empréstimo ignorando só o contador N/M.",
      value: `${itensParcela.length} com parcela`,
    });
  }

  // 3 · Categoria com maior peso
  const despesasCat: Record<string, number> = {};
  transactions.filter((t) => t.type === "despesa").forEach((t) => {
    despesasCat[t.category] = (despesasCat[t.category] ?? 0) + t.amount;
  });
  const topCats = Object.entries(despesasCat).sort((a, b) => b[1] - a[1]);
  if (topCats.length > 0 && despesas > 0) {
    const [cat, val] = topCats[0];
    const pct = (val / despesas) * 100;
    if (pct > 35) {
      insights.push({
        level: "warning", icon: BarChart3,
        title: `Concentração alta em "${cat}"`,
        description: `"${cat}" representa ${pct.toFixed(1)}% dos seus gastos (${formatCurrency(val)}). Uma única categoria acima de 35% é sinal de atenção.`,
        action: `Meta sugerida: reduzir "${cat}" em 15% (${formatCurrency(val * 0.15)}) e direcionar para reserva de emergência.`,
        value: `${pct.toFixed(1)}% dos gastos`,
      });
    }
  }

  // 4 · Meta de reserva de emergência
  const liquidoBase = payslip?.net_salary ?? receitas;
  if (liquidoBase > 0) {
    const meta3meses = liquidoBase * 3;
    const meta6meses = liquidoBase * 6;
    insights.push({
      level: "info", icon: PiggyBank,
      title: "Meta: reserva de emergência",
      description: `Com base no seu salário líquido, sua reserva ideal é entre ${formatCurrency(meta3meses)} (3 meses) e ${formatCurrency(meta6meses)} (6 meses — recomendado para servidores públicos).`,
      action: `Poupe ${formatCurrency(liquidoBase * 0.15)}/mês para atingir a reserva em 3–4 anos gradualmente.`,
      value: `Meta: ${formatCurrency(meta6meses)}`,
    });
  }

  return insights;
}

// ── Insight card ──────────────────────────────────────────────────
const levelConfig: Record<InsightLevel, { bg: string; border: string; icon: string; badge: string }> = {
  critical: {
    bg:     "bg-red-50 dark:bg-red-950/30",
    border: "border-l-4 border-l-red-500",
    icon:   "text-red-600 dark:text-red-400",
    badge:  "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300",
  },
  warning: {
    bg:     "bg-amber-50 dark:bg-amber-950/30",
    border: "border-l-4 border-l-amber-500",
    icon:   "text-amber-600 dark:text-amber-400",
    badge:  "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
  },
  positive: {
    bg:     "bg-green-50 dark:bg-green-950/30",
    border: "border-l-4 border-l-green-500",
    icon:   "text-green-600 dark:text-green-400",
    badge:  "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300",
  },
  info: {
    bg:     "bg-blue-50 dark:bg-blue-950/30",
    border: "border-l-4 border-l-blue-500",
    icon:   "text-blue-600 dark:text-blue-400",
    badge:  "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
  },
};

const levelLabels: Record<InsightLevel, string> = {
  critical: "Atenção urgente",
  warning:  "Ponto de melhoria",
  positive: "Você está bem",
  info:     "Dica financeira",
};

function InsightCard({ insight }: { insight: Insight }) {
  const cfg = levelConfig[insight.level];
  const Icon = insight.icon;
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/[0.06] p-4 space-y-2 backdrop-blur-sm dark:border-white/[0.06]",
        cfg.bg,
        cfg.border,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", cfg.icon)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{insight.title}</p>
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide", cfg.badge)}>
              {levelLabels[insight.level]}
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{insight.description}</p>
          {insight.action && (
            <div className="mt-2 flex items-start gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">{insight.action}</p>
            </div>
          )}
        </div>
        {insight.value && (
          <span className="shrink-0 text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg">
            {insight.value}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Plan cards ────────────────────────────────────────────────────
const plans = [
  {
    id: "pra-ontem",
    emoji: "⚡",
    name: "Pra Ontem",
    tagline: "Urgente & Direto ao ponto",
    price: 47.90,
    period: "30 dias",
    color: {
      bg:      "bg-amber-50 dark:bg-amber-950/30",
      border:  "border-amber-200 dark:border-amber-800",
      badge:   "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
      button:  "bg-amber-500 hover:bg-amber-600 text-white",
      accent:  "text-amber-600 dark:text-amber-400",
    },
    popular: false,
    description: "Para quem está no limite e precisa de orientação rápida, sem enrolação.",
    features: [
      "Análise prioritária em até 24h",
      "Plano de ação personalizado",
      "Chat com consultor (5 atendimentos)",
      "Revisão de contracheque completa",
      "Identificação das 3 maiores perdas",
      "Validade: 30 dias",
    ],
    cta: "Resolver agora",
    disclaimer: "Ideal para situação pontual de endividamento ou descontrole",
  },
  {
    id: "primer",
    emoji: "🎯",
    name: "Primer",
    tagline: "Profissional & Com acompanhamento",
    price: 97.90,
    period: "3 meses",
    color: {
      bg:      "bg-blue-600 dark:bg-blue-700",
      border:  "border-blue-600 dark:border-blue-500",
      badge:   "bg-white/20 text-white",
      button:  "bg-white hover:bg-blue-50 text-blue-700 font-bold",
      accent:  "text-blue-100",
    },
    popular: true,
    description: "Acompanhamento real por 3 meses com metas, relatórios e consultoria.",
    features: [
      "Tudo do Pra Ontem",
      "Acompanhamento mensal por 90 dias",
      "Relatórios automáticos todo mês",
      "Negociação de dívidas assistida",
      "Meta financeira personalizada",
      "Revisão mensal com consultor",
      "Acesso a calculadoras exclusivas",
    ],
    cta: "Assinar Primer",
    disclaimer: "Mais escolhido por servidores públicos",
  },
  {
    id: "gestao-total",
    emoji: "👑",
    name: "Gestão Total",
    tagline: "Elite & Exclusivo",
    price: 197.90,
    period: "12 meses",
    color: {
      bg:      "bg-violet-50 dark:bg-violet-950/30",
      border:  "border-violet-200 dark:border-violet-800",
      badge:   "bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300",
      button:  "bg-violet-600 hover:bg-violet-700 text-white",
      accent:  "text-violet-600 dark:text-violet-400",
    },
    popular: false,
    description: "Gestão patrimonial completa com consultor exclusivo e planejamento de longo prazo.",
    features: [
      "Tudo do Primer",
      "Consultor financeiro dedicado",
      "WhatsApp direto com o consultor",
      "Planejamento de aposentadoria",
      "Revisão trimestral (online/presencial)",
      "Proteção patrimonial e sucessória",
      "Simulações de investimento",
      "Relatório anual completo",
    ],
    cta: "Falar com consultor",
    disclaimer: "Para quem pensa no futuro com seriedade",
  },
];

type OverviewPeriod = "last12" | number;

function rangeForOverviewPeriod(period: OverviewPeriod): { from: Date; to: Date } {
  const now = new Date();
  if (period === "last12") {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 11, 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }
  return {
    from: new Date(period, 0, 1),
    to: new Date(period, 11, 31),
  };
}

// ── Page ──────────────────────────────────────────────────────────
export default function AnalisePage() {
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewTransactions, setOverviewTransactions] = useState<Transaction[]>([]);
  const [overviewLoans, setOverviewLoans] = useState<Loan[]>([]);
  const [payslipsAnalise, setPayslipsAnalise] = useState<Payslip[]>([]);
  const [overviewPeriod, setOverviewPeriod] = useState<OverviewPeriod>("last12");
  const [dataRefreshTick, setDataRefreshTick] = useState(0);

  const snapshotAnalise = useMemo(
    () => buildAnaliseNormalizadaSnapshot(payslipsAnalise),
    [payslipsAnalise],
  );
  const emprestimosAnalise = snapshotAnalise.emprestimosAnalise;
  const payslipsAnaliseSincronizados = snapshotAnalise.payslipsFolha;
  const itensAnaliseFinanceiraContracheque = snapshotAnalise.itensContracheque;
  const resultadoAnaliseContracheque = snapshotAnalise.resultadoContracheque;
  const contratosMetricasCanonico = snapshotAnalise.contratosCanonico;

  const [revisaoPendenciasSnapshot, setRevisaoPendenciasSnapshot] = useState<PendenciasRevisaoSyncSnapshot | null>(null);

  useEffect(() => {
    const onRev = (e: Event) => {
      const ce = e as CustomEvent<PendenciasAnaliseRevisaoDetail>;
      if (ce.detail?.snapshot) setRevisaoPendenciasSnapshot(ce.detail.snapshot);
    };
    window.addEventListener(PENDENCIAS_ANALISE_REVISAO_ATUALIZADA, onRev);
    return () => window.removeEventListener(PENDENCIAS_ANALISE_REVISAO_ATUALIZADA, onRev);
  }, []);

  useEffect(() => {
    const store = carregarRevisaoPendenciasLocal();
    const items = enriquecerPendenciasAnalise(emprestimosAnalise.pendencias, emprestimosAnalise.contratos);
    setRevisaoPendenciasSnapshot(montarSnapshotRevisaoParaDashboard(items, store.byId));
  }, [emprestimosAnalise]);
  const payslipLiquidoRef = useMemo(
    () => payslipPreferidoParaAnalise(payslipsAnaliseSincronizados),
    [payslipsAnaliseSincronizados]
  );

  const emprestimosPorContratoAnalise = contratosMetricasCanonico;

  const [loanEvidencias, setLoanEvidencias] = useState<LoanEvidence[]>([]);

  const loadLoanEvidencias = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("loan_evidences")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return;
    setLoanEvidencias((data as LoanEvidence[]) ?? []);
  }, []);

  useEffect(() => {
    void loadLoanEvidencias();
    const onEvt = () => void loadLoanEvidencias();
    window.addEventListener(DASHBOARD_DATA_UPDATED, onEvt);
    return () => window.removeEventListener(DASHBOARD_DATA_UPDATED, onEvt);
  }, [loadLoanEvidencias, dataRefreshTick]);

  const validacaoParaJuridicoPage = useMemo(() => {
    if (!resultadoAnaliseContracheque || itensAnaliseFinanceiraContracheque.length === 0) return null;
    const cons = consolidarEmprestimosPorPadraoLogico(resultadoAnaliseContracheque.emprestimosPorContrato);
    return gerarValidacaoBaseEmprestimos(
      itensAnaliseFinanceiraContracheque,
      resultadoAnaliseContracheque.emprestimosPorContrato,
      cons,
      payslipsAnaliseSincronizados,
      overviewTransactions,
      loanEvidencias,
      overviewLoans,
    );
  }, [
    resultadoAnaliseContracheque,
    itensAnaliseFinanceiraContracheque,
    payslipsAnaliseSincronizados,
    overviewTransactions,
    loanEvidencias,
    overviewLoans,
  ]);

  const overviewYears = useMemo(() => {
    const years = new Set<number>();
    for (const t of overviewTransactions) {
      const d = parseTransactionDate(String(t.date));
      if (d) years.add(d.getFullYear());
    }
    return [...years].sort((a, b) => b - a);
  }, [overviewTransactions]);

  const overviewRows = useMemo<MonthlyComparisonRow[]>(() => {
    const { from, to } = rangeForOverviewPeriod(overviewPeriod);
    return aggregateTransactionsByMonth(overviewTransactions, from, to);
  }, [overviewTransactions, overviewPeriod]);

  const [insights, setInsights] = useState<Insight[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [summary, setSummary] = useState<{
    receitas: number; despesas: number; saldo: number;
    topCats: Array<{ cat: string; val: number; pct: number }>;
    period: string;
  } | null>(null);

  const [cadastroEmprestimosBusy, setCadastroEmprestimosBusy] = useState(false);
  const [feedbackCadastroEmprestimos, setFeedbackCadastroEmprestimos] = useState<{
    cadastrados: number;
    jaExistiam: number;
    erros: number;
  } | null>(null);
  const [reprocessandoCartaoSaque, setReprocessandoCartaoSaque] = useState(false);
  const [resultadoReprocessamentoCartaoSaque, setResultadoReprocessamentoCartaoSaque] =
    useState<ResultadoReprocessamentoCartaoSaque | null>(null);

  const overviewPeriodRef = useRef<OverviewPeriod>("last12");
  const runAnalysisRef = useRef<
    (p?: OverviewPeriod, txs?: Transaction[]) => Promise<void>
  >(() => Promise.resolve());

  useEffect(() => {
    overviewPeriodRef.current = overviewPeriod;
  }, [overviewPeriod]);

  const runAnalysis = useCallback(
    async (periodOverride?: OverviewPeriod, transactionsOverride?: Transaction[]) => {
      const period = periodOverride ?? overviewPeriod;
      const txSource = transactionsOverride ?? overviewTransactions;
      setAnalyzing(true);
      const supabase = createClient();

      const [{ data: loansData }, { data: payslipsData }] = await Promise.all([
        supabase.from("loans").select("*"),
        supabase
          .from("payslips")
          .select("*")
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .limit(80),
      ]);

      const selectedRange = rangeForOverviewPeriod(period);
      const fromTs = new Date(
        selectedRange.from.getFullYear(),
        selectedRange.from.getMonth(),
        selectedRange.from.getDate(),
        0,
        0,
        0
      ).getTime();
      const toTs = new Date(
        selectedRange.to.getFullYear(),
        selectedRange.to.getMonth(),
        selectedRange.to.getDate(),
        23,
        59,
        59
      ).getTime();
      const transactions = txSource.filter((t) => {
        const d = parseTransactionDate(String(t.date));
        if (!d) return false;
        const ts = d.getTime();
        return ts >= fromTs && ts <= toTs;
      });
      const loans = (loansData as Loan[]) ?? [];
      const payslip = payslipPreferidoParaAnalise((payslipsData as Payslip[]) ?? []) ?? null;

      const generatedInsights = generateInsights(transactions, loans, payslip);
      setInsights(generatedInsights);

      // Build summary
      const receitas = transactions.filter((t) => t.type === "receita").reduce((s, t) => s + t.amount, 0);
      const despesas = transactions.filter((t) => t.type === "despesa").reduce((s, t) => s + t.amount, 0);
      const despesasCat: Record<string, number> = {};
      transactions.filter((t) => t.type === "despesa").forEach((t) => {
        despesasCat[t.category] = (despesasCat[t.category] ?? 0) + t.amount;
      });
      const topCats = Object.entries(despesasCat)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat, val]) => ({ cat, val, pct: despesas > 0 ? (val / despesas) * 100 : 0 }));

      const monthName = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      const from = selectedRange.from;
      const to = selectedRange.to;
      const periodLabel =
        period === "last12"
          ? `${monthName[from.getMonth()]}–${monthName[to.getMonth()]}/${to.getFullYear()}`
          : `Ano ${period} (jan–dez)`;

      setSummary({ receitas, despesas, saldo: receitas - despesas, topCats, period: periodLabel });
      setAnalyzing(false);
      setAnalyzed(true);
    },
    [overviewPeriod, overviewTransactions]
  );

  useEffect(() => {
    runAnalysisRef.current = runAnalysis;
  }, [runAnalysis]);

  const loadOverview = useCallback(async (afterDataChange: boolean) => {
    setOverviewLoading(true);
    try {
      const supabase = createClient();
      const [{ data: txData }, { data: loansData }, { count: payslipCount }, { data: payslipsRows }] = await Promise.all([
        supabase.from("transactions").select("*").order("date", { ascending: true }),
        supabase.from("loans").select("*"),
        supabase.from("payslips").select("id", { count: "exact", head: true }),
        supabase
          .from("payslips")
          .select("*")
          .order("year", { ascending: true })
          .order("month", { ascending: true })
          .limit(PAYSLIPS_ANALISE_LIMIT),
      ]);
      const txs = (txData as Transaction[]) ?? [];
      const loans = (loansData as Loan[]) ?? [];
      setOverviewTransactions(txs);
      setOverviewLoans(loans);
      setPayslipsAnalise((payslipsRows as Payslip[]) ?? []);

      const hasSheetData = txs.length > 0 || (payslipCount ?? 0) > 0;
      if (hasSheetData) {
        await runAnalysisRef.current(overviewPeriodRef.current, txs);
      }
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const reprocessarCartoesSaques = useCallback(async () => {
    setReprocessandoCartaoSaque(true);
    setResultadoReprocessamentoCartaoSaque(null);
    try {
      const supabase = createClient();
      const resumo = await reprocessarCartaoSaqueContracheques(supabase);
      setResultadoReprocessamentoCartaoSaque(resumo);

      if (!resumo.colunasProntas) {
        toast.error(
          resumo.primeiraMensagemErro ??
            "Execute supabase/patch_payslips_cartao_saque_embutido.sql no Supabase.",
        );
        return;
      }

      if (resumo.atualizados === 0 && resumo.erros > 0) {
        throw new Error(
          resumo.primeiraMensagemErro ?? "Nenhum contracheque foi atualizado.",
        );
      }

      emitDashboardDataUpdated({ origin: "reprocessar_cartao_saque", sincronizarFontes: false });
      try {
        await loadOverview(true);
      } catch {
        toast.message("Reprocessamento gravado; recarregue a página se o painel não atualizar.");
      }

      if (resumo.erros > 0) {
        toast.warning(
          `Reprocessamento parcial: ${resumo.atualizados}/${resumo.analisados} atualizado(s), ${resumo.alertasEncontrados} alerta(s), ${resumo.erros} falha(s).`,
        );
      } else {
        toast.success(
          `Reprocessamento concluído: ${resumo.analisados} analisado(s), ${resumo.alertasEncontrados} alerta(s).`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível reprocessar cartões/saques dos contracheques.",
      );
    } finally {
      setReprocessandoCartaoSaque(false);
    }
  }, [loadOverview]);

  useEffect(() => {
    void loadOverview(dataRefreshTick > 0);
  }, [loadOverview, dataRefreshTick]);

  useEffect(
    () =>
      subscribeDashboardDataUpdated((detail) => {
        if (detail?.origin === "cartao_saque_conferencia" || detail?.origin === "cartao_saque_conferencia_lote") {
          return;
        }
        setDataRefreshTick((n) => n + 1);
      }),
    [],
  );

  const cadastrarEmprestimosDetectados = useCallback(async () => {
    if (emprestimosPorContratoAnalise.length === 0) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Faça login novamente.");
      return;
    }
    setCadastroEmprestimosBusy(true);
    try {
      const r = await cadastrarEmprestimosDetectadosContracheque(
        supabase,
        user.id,
        emprestimosPorContratoAnalise,
        overviewLoans,
      );
      setFeedbackCadastroEmprestimos(r);
      toast.message("Cadastro concluído", {
        description: `${r.cadastrados} empréstimos cadastrados · ${r.jaExistiam} já existiam · ${r.erros} com erro`,
      });
      if (r.cadastrados > 0) {
        emitDashboardDataUpdated({ origin: "cadastro_emprestimos_detectados", sincronizarFontes: false });
      }
    } finally {
      setCadastroEmprestimosBusy(false);
    }
  }, [emprestimosPorContratoAnalise, overviewLoans]);

  const [abaAnalise, setAbaAnalise] = useState<AnaliseDashboardAbaId>("diagnostico");

  const metricasTopo = useMemo(() => {
    if (!resultadoAnaliseContracheque || itensAnaliseFinanceiraContracheque.length === 0) return null;
    const consolidacao = consolidarEmprestimosPorPadraoLogico(resultadoAnaliseContracheque.emprestimosPorContrato);
    const validacao = gerarValidacaoBaseEmprestimos(
      itensAnaliseFinanceiraContracheque,
      resultadoAnaliseContracheque.emprestimosPorContrato,
      consolidacao,
      payslipsAnaliseSincronizados,
      overviewTransactions,
      loanEvidencias,
      overviewLoans,
    );
    const scores = calcularScoresDashboard(
      validacao,
      revisaoPendenciasSnapshot,
      resultadoAnaliseContracheque.hipotesesJuridicas.length,
    );
    return {
      qualidadeBase: scores.qualidadeBase,
      totalDescontadoHistorico: emprestimosAnalise.kpis.totalHistoricoDescontado,
      contratosDetectados: contratosMetricasCanonico.length,
      pendenciasAbertas: revisaoPendenciasSnapshot?.resumo.abertas ?? 0,
      scoreJuridicoPreliminar: scores.scoreJuridicoPreliminar,
    };
  }, [
    resultadoAnaliseContracheque,
    itensAnaliseFinanceiraContracheque,
    payslipsAnaliseSincronizados,
    overviewTransactions,
    overviewLoans,
    revisaoPendenciasSnapshot,
    emprestimosAnalise,
    contratosMetricasCanonico.length,
    loanEvidencias,
  ]);

  const bannerExecutivo = useMemo(():
    | {
        titulo: string;
        subtitulo: string;
        tags: string[];
        statusLabel: string;
        statusTone: "attention" | "positive";
      }
    | null => {
    if (!metricasTopo) return null;
    const statusTone: "attention" | "positive" = metricasTopo.pendenciasAbertas > 0 ? "attention" : "positive";
    return {
      titulo: `Score ${metricasTopo.qualidadeBase}/100 · ${metricasTopo.contratosDetectados} contrato(s) · ${formatCurrency(metricasTopo.totalDescontadoHistorico)} descontados (hist.)`,
      subtitulo: `${metricasTopo.pendenciasAbertas} pendência(s) em triagem · Indicador jurídico preliminar ${metricasTopo.scoreJuridicoPreliminar} (informativo, não conclusivo).`,
      tags: [
        `${metricasTopo.qualidadeBase}/100 base`,
        `${metricasTopo.pendenciasAbertas} pend.`,
        `${metricasTopo.contratosDetectados} contratos`,
      ],
      statusLabel: metricasTopo.pendenciasAbertas > 0 ? "Revisão recomendada" : "Base consistente",
      statusTone,
    };
  }, [metricasTopo]);

  const copiarResumoAnalise = useCallback(async () => {
    const texto = textoResumoEmprestimosParaChat({
      data: emprestimosAnalise,
      loans: overviewLoans,
      ultimoLiquido: payslipLiquidoRef?.net_salary ?? null,
    });
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Resumo copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar. Tente manualmente se o navegador bloquear.");
    }
  }, [emprestimosAnalise, overviewLoans, payslipLiquidoRef]);

  const primeiraUltimaLinhaHeader =
    emprestimosAnalise.primeiraCompetencia && emprestimosAnalise.ultimaCompetencia
      ? `${String(emprestimosAnalise.primeiraCompetencia.month).padStart(2, "0")}/${emprestimosAnalise.primeiraCompetencia.year} – ${String(emprestimosAnalise.ultimaCompetencia.month).padStart(2, "0")}/${emprestimosAnalise.ultimaCompetencia.year} · folha`
      : null;

  const periodoAnaliseHeader =
    overviewPeriod === "last12" ? "Últimos 12 meses · transações" : `Ano ${overviewPeriod} · transações`;

  const resultadoParaUi =
    resultadoAnaliseContracheque && snapshotAnalise.padroesParaGraficos
      ? {
          ...resultadoAnaliseContracheque,
          padroesConsumo: snapshotAnalise.padroesParaGraficos,
        }
      : resultadoAnaliseContracheque;

  const contrachequePropsComum = {
    itens: itensAnaliseFinanceiraContracheque,
    resultado: resultadoParaUi ?? undefined,
    payslipsAnexo: payslipsAnaliseSincronizados,
    transactionsResumo: overviewTransactions,
    loansCadastro: overviewLoans,
    revisaoPendenciasSnapshot,
  } as const;

  return (
    <div
      className={cn(
        "auditoria-premium relative w-full pb-10",
        "-mx-4 rounded-2xl px-4 py-2 md:-mx-6 md:px-6 md:py-3",
        "bg-slate-50/90 dark:bg-[#070B14] [scrollbar-gutter:stable]",
      )}
    >
      <div className="mb-3 px-1">
        <DashboardCrossLinks
          links={[
            {
              label: "Triagem de pendências",
              href: "/dashboard/triagem",
              description: "resolver divergências em fila",
            },
            {
              label: "Boletins defesa",
              href: "/dashboard/boletins",
            },
          ]}
        />
      </div>

      <AnaliseHeaderCompacto
        periodoLabel={periodoAnaliseHeader}
        competenciasProcessadas={emprestimosAnalise.competenciasProcessadas}
        primeiraUltimaLinha={primeiraUltimaLinhaHeader}
        overviewPeriod={overviewPeriod}
        overviewYears={overviewYears}
        overviewLoading={overviewLoading}
        onPeriodChange={(next) => {
          setOverviewPeriod(next);
          if (analyzed) void runAnalysis(next);
        }}
        onAtualizarAnalise={() => {
          setDataRefreshTick((n) => n + 1);
          void runAnalysis(overviewPeriodRef.current);
        }}
        onCopiarResumo={() => void copiarResumoAnalise()}
        atualizarDisabled={overviewLoading}
        exportSlot={
          <AnaliseExportMenu
            snapshot={snapshotAnalise}
            periodoOverview={periodoAnaliseHeader}
            overviewRows={overviewRows}
            transactions={overviewTransactions}
            loans={overviewLoans}
            loanEvidencias={loanEvidencias}
            disabled={overviewLoading}
          />
        }
      />

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Cartões/saques nos contracheques
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Releitura administrativa das folhas já anexadas para credcesta, cartão, RMC/RCC, saque e pagamento mínimo.
          </p>
          {resultadoReprocessamentoCartaoSaque ? (
            <p className="mt-1 text-[11px] text-amber-900 dark:text-amber-100">
              {resultadoReprocessamentoCartaoSaque.analisados} analisado(s) ·{" "}
              {resultadoReprocessamentoCartaoSaque.atualizados} atualizado(s) ·{" "}
              {resultadoReprocessamentoCartaoSaque.alertasEncontrados} alerta(s) ·{" "}
              {resultadoReprocessamentoCartaoSaque.recorrentes} recorrência(s)
              {resultadoReprocessamentoCartaoSaque.erros > 0
                ? ` · ${resultadoReprocessamentoCartaoSaque.erros} erro(s)`
                : ""}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2 shrink-0 border-amber-500/40"
          disabled={reprocessandoCartaoSaque || overviewLoading}
          onClick={() => void reprocessarCartoesSaques()}
        >
          {reprocessandoCartaoSaque ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CreditCard className="h-4 w-4" aria-hidden />
          )}
          Reprocessar cartões/saques
        </Button>
      </div>

      {overviewLoading ? (
        <div
          className="space-y-4 rounded-2xl border border-black/[0.06] bg-white/60 p-5 dark:border-white/[0.06] dark:bg-[#0F1724]/40"
          aria-busy="true"
          aria-label="A carregar painel"
        >
          <div className="h-9 w-48 animate-pulse rounded-lg bg-slate-200/80 dark:bg-white/10" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-black/[0.04] bg-slate-200/70 dark:border-white/[0.05] dark:bg-white/[0.06]"
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-52 animate-pulse rounded-2xl border border-black/[0.04] bg-slate-200/60 dark:border-white/[0.05] dark:bg-white/[0.05]"
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <Tabs
            value={abaAnalise}
            onValueChange={(v) => setAbaAnalise(v as AnaliseDashboardAbaId)}
            className="flex flex-col gap-3"
          >
            <AnaliseAuditoriaStepper />

            <TabsContent value="diagnostico" className="mt-0 space-y-4">
              <AnaliseResumoTab>
                {bannerExecutivo ? (
                  <AuditoriaSection
                    title="Painel executivo"
                    description="Leitura sintética da base documental e riscos operacionais — sem alterar dados brutos."
                  >
                    <AuditoriaInsightBanner
                      layout="page"
                      titulo={bannerExecutivo.titulo}
                      subtitulo={bannerExecutivo.subtitulo}
                      href="#validacao-base-diagnostico"
                      statusLabel={bannerExecutivo.statusLabel}
                      statusTone={bannerExecutivo.statusTone}
                      tags={bannerExecutivo.tags}
                      verDetalhesLabel="Ver detalhes"
                    />
                  </AuditoriaSection>
                ) : null}
                <AuditoriaSection
                  title="Indicadores da base"
                  description="Métricas calculadas sobre folha, cadastro e triagem — destaque para qualidade, financeiro e jurídico preliminar."
                  contentClassName="space-y-3"
                >
                  {metricasTopo ? <AnaliseMetricCards {...metricasTopo} /> : null}
                </AuditoriaSection>
                <AuditoriaSection
                  title="Diagnóstico visual"
                  description="Séries derivadas dos padrões já calculados — maior respiro e leitura executiva."
                  contentClassName="space-y-3"
                >
                  {snapshotAnalise.padroesParaGraficos ? (
                    <AnaliseDiagnosticoCharts padroes={snapshotAnalise.padroesParaGraficos} />
                  ) : null}
                </AuditoriaSection>
                {itensAnaliseFinanceiraContracheque.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 px-4 py-6 text-center">
                    Importe contracheques ou ficha financeira para preencher o diagnóstico.
                  </p>
                ) : (
                  <details
                    id="validacao-base-diagnostico"
                    className="rounded-xl border border-black/[0.07] bg-white/90 dark:border-white/[0.06] dark:bg-[#0F1724]/90"
                  >
                    <summary className="px-3 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      Base inferida · validação e alertas críticos (detalhe)
                    </summary>
                    <div className="px-3 pb-3 pt-0 border-t border-slate-100 dark:border-slate-800">
                      <AnaliseFinanceiraContracheque
                        {...contrachequePropsComum}
                        ocultarSecoes={{
                          tabelaContratosInferidos: true,
                          tabelaConsolidados: true,
                          alertasConsolidacao: true,
                          checklistMelhoria: true,
                          hipotesesJuridicas: true,
                          sugestoesDocumentos: true,
                        }}
                        painelSincronizadoModo="semTimeline"
                        filtroAlertasGerais="critico"
                        compactarValidacaoBase
                      />
                    </div>
                  </details>
                )}

                <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 group">
                  <summary className="px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    Fluxo de caixa (transações) e análise minuciosa
                  </summary>
                  <div className="space-y-2 px-3 pb-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {overviewPeriod === "last12"
                      ? "Últimos 12 meses (transações registradas)."
                      : `Ano fechado ${overviewPeriod} (jan–dez).`}
                  </p>
                  <MonthlyComparisonChart data={overviewRows} title="Receitas x despesas por mês" />
                  {overviewLoans.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                      {overviewLoans.filter((l) => l.status === "ativo").length} empréstimo(s) ativo(s) cadastrado(s).
                    </p>
                  )}

                <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 group">
                  <summary className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 cursor-pointer list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-500" />
                      Análise minuciosa gratuita
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 uppercase">
                        Grátis
                      </span>
                    </span>
                  </summary>
                  <div className="px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-800 space-y-4">
                    <div className="flex items-center justify-between pt-3">
                      {analyzed && (
                        <Button size="sm" variant="ghost" onClick={() => { setAnalyzed(false); setInsights([]); setSummary(null); }}>
                          Nova análise
                        </Button>
                      )}
                    </div>
                    {!analyzed && !analyzing && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <Button onClick={() => void runAnalysis()} className="gap-2 shrink-0">
                          <Sparkles className="h-4 w-4" />
                          Gerar análise agora
                        </Button>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Cruza transações, folhas e cadastro no período selecionado no cabeçalho.
                        </p>
                      </div>
                    )}
                    {analyzing && (
                      <div className="flex items-center gap-3 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                        Analisando dados financeiros…
                      </div>
                    )}
                    {analyzed && summary && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-center">
                            <p className="text-[10px] font-semibold uppercase text-slate-400">Período</p>
                            <p className="text-xs font-bold mt-1">{summary.period}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-center">
                            <p className="text-[10px] font-semibold uppercase text-slate-400">Receitas</p>
                            <p className="text-xs font-bold tabular-nums text-emerald-600 mt-1">{formatCurrency(summary.receitas)}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-center">
                            <p className="text-[10px] font-semibold uppercase text-slate-400">Gastos</p>
                            <p className="text-xs font-bold tabular-nums text-red-600 mt-1">{formatCurrency(summary.despesas)}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-center">
                            <p className="text-[10px] font-semibold uppercase text-slate-400">Saldo</p>
                            <p className={cn("text-xs font-bold tabular-nums mt-1", summary.saldo >= 0 ? "text-blue-600" : "text-red-600")}>
                              {formatCurrency(summary.saldo)}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Alertas críticos (resumo)</p>
                          {insights.filter((i) => i.level === "critical").length === 0 ? (
                            <p className="text-xs text-slate-500">Nenhum ponto crítico nas regras atuais.</p>
                          ) : (
                            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                              {insights.filter((i) => i.level === "critical").map((insight, i) => (
                                <InsightCard key={i} insight={insight} />
                              ))}
                            </div>
                          )}
                          <details className="mt-3 text-xs">
                            <summary className="cursor-pointer font-medium text-primary">Ver todos os insights</summary>
                            <div className="mt-2 space-y-2 max-h-[320px] overflow-y-auto">
                              {insights.map((insight, i) => (
                                <InsightCard key={`all-${i}`} insight={insight} />
                              ))}
                            </div>
                          </details>
                        </div>
                        {summary.topCats.length > 0 && (
                          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2 max-h-[220px] overflow-y-auto">
                            <p className="text-xs font-semibold">Concentração de gastos</p>
                            {summary.topCats.map(({ cat, val, pct }) => (
                              <div key={cat} className="space-y-1">
                                <div className="flex justify-between text-[11px]">
                                  <span className="font-medium">{cat}</span>
                                  <span className="tabular-nums text-slate-500">
                                    {formatCurrency(val)} · {pct.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS] ?? "#6366f1",
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 p-4 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            Plano de ação com consultor
                          </p>
                          <button
                            type="button"
                            onClick={() => document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" })}
                            className="flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400"
                          >
                            Ver planos <ArrowRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
                  </div>
                </details>
              </AnaliseResumoTab>
            </TabsContent>

            <TabsContent value="emprestimos" className="mt-0 space-y-3">
              <AnaliseEmprestimosTab>
                {itensAnaliseFinanceiraContracheque.length > 0 ? (
                  <AnaliseEmprestimosStatsCards
                    contratos={contratosMetricasCanonico}
                    loans={overviewLoans}
                    evidencias={loanEvidencias}
                  />
                ) : null}
                {payslipsAnaliseSincronizados.length > 0 ? (
                  <CartaoSaqueEmbutidoPainel payslips={payslipsAnaliseSincronizados} />
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Tabela inferida com filtros locais. Cadastro automático usa a mesma lógica de antes.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={cadastroEmprestimosBusy || emprestimosPorContratoAnalise.length === 0}
                    onClick={() => void cadastrarEmprestimosDetectados()}
                  >
                    {cadastroEmprestimosBusy ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        Cadastrando…
                      </span>
                    ) : (
                      "Cadastrar empréstimos detectados"
                    )}
                  </Button>
                </div>
                {feedbackCadastroEmprestimos != null && (
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span className="tabular-nums font-medium">{feedbackCadastroEmprestimos.cadastrados} cadastrados</span>
                    <span className="tabular-nums">{feedbackCadastroEmprestimos.jaExistiam} já existiam</span>
                    <span className="tabular-nums">{feedbackCadastroEmprestimos.erros} erros</span>
                  </div>
                )}
                {itensAnaliseFinanceiraContracheque.length === 0 ? (
                  <p className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
                    Importe contracheques para listar empréstimos inferidos.
                  </p>
                ) : (
                  <AnaliseFinanceiraContracheque
                    {...contrachequePropsComum}
                    filtrosTabelaContratosInferidos
                    ocultarSecoes={{
                      kpisResumo: true,
                      graficoAnualEmprestimos: true,
                      tabelaConsolidados: true,
                      alertasConsolidacao: true,
                      alertasGerais: true,
                      checklistMelhoria: true,
                      painelSincronizado: true,
                      validacaoBase: true,
                      hipotesesJuridicas: true,
                      sugestoesDocumentos: true,
                    }}
                  />
                )}
                <details className="rounded-lg border border-border/80 bg-muted/10">
                  <summary className="px-3 py-2 text-xs font-medium cursor-pointer select-none">
                    Cruzamento folha × cadastro (gráficos)
                  </summary>
                  <div className="px-3 pb-3 border-t border-border/60">
                    <EmprestimosAnalisePainel
                      data={emprestimosAnalise}
                      loans={overviewLoans}
                      ultimoLiquido={payslipLiquidoRef?.net_salary ?? null}
                      payslipsParaGrafico={payslipsAnaliseSincronizados}
                      folhaJaPreparada
                      exibirPainelPendencias={false}
                      ocultarCabecalhoHero
                    />
                  </div>
                </details>
              </AnaliseEmprestimosTab>
            </TabsContent>

            <TabsContent value="consolidacao" className="mt-0 space-y-3">
              <AnaliseConsolidacaoTab>
                {itensAnaliseFinanceiraContracheque.length === 0 || !resultadoAnaliseContracheque ? (
                  <p className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
                    Importe contracheques para ver consolidação lógica.
                  </p>
                ) : (
                  <>
                    <AnaliseConsolidacaoAuditoria
                      resultado={resultadoAnaliseContracheque}
                      payslipsAnexo={payslipsAnaliseSincronizados}
                      onIrPendencias={() => setAbaAnalise("pendencias")}
                    />
                    <details className="rounded-lg border border-border/80 bg-muted/10">
                      <summary className="px-3 py-2 text-xs font-medium cursor-pointer select-none">
                        Tabelas completas de consolidação e alertas
                      </summary>
                      <div className="px-3 pb-3 border-t border-border/60 max-h-[min(520px,70vh)] overflow-y-auto">
                        <AnaliseFinanceiraContracheque
                          {...contrachequePropsComum}
                          ocultarSecoes={{
                            kpisResumo: true,
                            graficoAnualEmprestimos: true,
                            tabelaContratosInferidos: true,
                            alertasGerais: true,
                            checklistMelhoria: true,
                            painelSincronizado: true,
                            validacaoBase: true,
                            hipotesesJuridicas: true,
                            sugestoesDocumentos: true,
                          }}
                        />
                      </div>
                    </details>
                  </>
                )}
              </AnaliseConsolidacaoTab>
            </TabsContent>

            <TabsContent value="pendencias" className="mt-0">
              <AnalisePendenciasTab>
                <PendenciasAnaliseRevisaoPanel
                  pendencias={emprestimosAnalise.pendencias}
                  contratos={[...emprestimosAnalise.contratos].sort((a, b) =>
                    (a.label ?? "").localeCompare(b.label ?? "", "pt-BR", { sensitivity: "base", numeric: true }),
                  )}
                  ultimaCompetencia={emprestimosAnalise.ultimaCompetencia}
                  variant="auditoria"
                />
              </AnalisePendenciasTab>
            </TabsContent>

            <TabsContent value="evidencias" className="mt-0">
              <AnaliseEvidenciasTab>
                {itensAnaliseFinanceiraContracheque.length === 0 ? (
                  <p className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
                    Importe contracheques para anexar evidências por contrato.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Checklist por linha inferida: atalhos abrem o mesmo fluxo de anexos.
                    </p>
                    <AnaliseFinanceiraContracheque
                      {...contrachequePropsComum}
                      evidenciasAtalhosTipos
                      ocultarSecoes={{
                        kpisResumo: true,
                        graficoAnualEmprestimos: true,
                        tabelaConsolidados: true,
                        alertasConsolidacao: true,
                        alertasGerais: true,
                        painelSincronizado: true,
                        validacaoBase: true,
                        hipotesesJuridicas: true,
                      }}
                    />
                    <details className="rounded-lg border border-border/80 bg-muted/10">
                      <summary className="px-3 py-2 text-xs font-medium cursor-pointer select-none">
                        Checklist de melhoria e sugestões de documentos
                      </summary>
                      <div className="px-3 pb-3 border-t border-border/60">
                        <AnaliseFinanceiraContracheque
                          {...contrachequePropsComum}
                          ocultarSecoes={{
                            kpisResumo: true,
                            graficoAnualEmprestimos: true,
                            tabelaContratosInferidos: true,
                            tabelaConsolidados: true,
                            alertasConsolidacao: true,
                            alertasGerais: true,
                            painelSincronizado: true,
                            validacaoBase: true,
                            hipotesesJuridicas: true,
                          }}
                        />
                      </div>
                    </details>
                  </>
                )}
              </AnaliseEvidenciasTab>
            </TabsContent>

            <TabsContent value="juridico" className="mt-0">
              {resultadoAnaliseContracheque ? (
                <AnaliseJuridicoTab hipoteses={resultadoAnaliseContracheque.hipotesesJuridicas} validacaoBase={validacaoParaJuridicoPage}>
                  <AnaliseFinanceiraContracheque
                    {...contrachequePropsComum}
                    hipotesesEmAcordeao
                    ocultarSecoes={{
                      kpisResumo: true,
                      graficoAnualEmprestimos: true,
                      tabelaContratosInferidos: true,
                      tabelaConsolidados: true,
                      alertasConsolidacao: true,
                      alertasGerais: true,
                      checklistMelhoria: true,
                      painelSincronizado: true,
                      validacaoBase: true,
                      sugestoesDocumentos: true,
                    }}
                  />
                </AnaliseJuridicoTab>
              ) : (
                <p className="text-sm text-muted-foreground border rounded-lg p-4 text-center">Sem dados de contracheque.</p>
              )}
            </TabsContent>

          </Tabs>
        </>
      )}

      {/* ── PLANS SECTION ────────────────────────────────────────── */}
      <details id="planos" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 space-y-5 pt-2 pb-3 px-1 group/planos">
        <summary className="list-none cursor-pointer select-none px-3 py-3 text-center [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 group-open/planos:hidden">
            Consultoria e planos (opcional) — expandir
          </span>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 hidden group-open/planos:block">
            Consultoria Profissional
          </span>
        </summary>
        <div className="space-y-5 px-2">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
            Consultoria Profissional
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Escolha o nível de acompanhamento que você precisa.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const isInverted = plan.id === "primer";
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative rounded-2xl border p-5 flex flex-col gap-4 transition-all",
                  isInverted
                    ? "bg-blue-600 dark:bg-blue-700 border-blue-600 dark:border-blue-500 shadow-2xl shadow-blue-500/20 scale-[1.02]"
                    : cn("bg-white dark:bg-slate-900", plan.color.border, "border")
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-blue-500 to-violet-500 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                      ✦ Mais escolhido
                    </span>
                  </div>
                )}

                {/* Header */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{plan.emoji}</span>
                    <div>
                      <p className={cn(
                        "text-base font-bold",
                        isInverted ? "text-white" : "text-slate-800 dark:text-slate-100"
                      )}>
                        {plan.name}
                      </p>
                      <p className={cn(
                        "text-[11px] font-medium",
                        isInverted ? "text-blue-100" : plan.color.accent
                      )}>
                        {plan.tagline}
                      </p>
                    </div>
                  </div>
                  <p className={cn(
                    "text-xs mt-2",
                    isInverted ? "text-blue-100" : "text-slate-500 dark:text-slate-400"
                  )}>
                    {plan.description}
                  </p>
                </div>

                {/* Price */}
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className={cn(
                      "text-3xl font-black tabular-nums tracking-tight",
                      isInverted ? "text-white" : "text-slate-800 dark:text-slate-100"
                    )}>
                      R$ {plan.price.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                  <p className={cn(
                    "text-[11px] mt-0.5",
                    isInverted ? "text-blue-200" : "text-slate-400 dark:text-slate-500"
                  )}>
                    Validade: {plan.period}
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-2 flex-1">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className={cn(
                        "h-3.5 w-3.5 mt-0.5 shrink-0",
                        isInverted ? "text-blue-200" : "text-green-500 dark:text-green-400"
                      )} />
                      <span className={cn(
                        isInverted ? "text-blue-50" : "text-slate-600 dark:text-slate-300"
                      )}>
                        {feat}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="space-y-2">
                  <button
                    className={cn(
                      "w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                      plan.color.button
                    )}
                    onClick={() => alert(`Em breve! Plano ${plan.name} em desenvolvimento.`)}
                  >
                    {plan.id === "gestao-total" && <Crown className="h-4 w-4" />}
                    {plan.id === "pra-ontem"    && <Zap   className="h-4 w-4" />}
                    {plan.id === "primer"       && <Target className="h-4 w-4" />}
                    {plan.cta}
                  </button>
                  <p className={cn(
                    "text-[10px] text-center",
                    isInverted ? "text-blue-200" : "text-slate-400 dark:text-slate-500"
                  )}>
                    {plan.disclaimer}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Comparison table */}
        <details className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <summary className="px-4 py-3 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700">
            Comparar planos em detalhes
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500 dark:text-slate-400">Recurso</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-amber-600 dark:text-amber-400">Pra Ontem</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-blue-600 dark:text-blue-400">Primer</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-violet-600 dark:text-violet-400">Gestão Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[
                  ["Análise personalizada",    true,  true,  true ],
                  ["Plano de ação",            true,  true,  true ],
                  ["Chat com consultor",       "5x",  "Ilim.", "Direto"],
                  ["Acompanhamento",           "30d", "90d", "12m" ],
                  ["Relatórios automáticos",   false, true,  true ],
                  ["Negociação de dívidas",    false, true,  true ],
                  ["Planejamento aposentadoria",false, false, true ],
                  ["Consultor dedicado",       false, false, true ],
                ].map(([feature, pO, pr, gT]) => (
                  <tr key={String(feature)} className="bg-white dark:bg-slate-900">
                    <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200">{feature}</td>
                    {[pO, pr, gT].map((v, i) => (
                      <td key={i} className="px-4 py-2.5 text-center">
                        {v === true  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" /> :
                         v === false ? <span className="text-slate-300 dark:text-slate-600">—</span> :
                         <span className="font-semibold text-slate-600 dark:text-slate-300">{v}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* Legal disclaimer */}
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <Lock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            <strong className="text-slate-500 dark:text-slate-400">Aviso:</strong> Os planos acima são ilustrativos e estão em desenvolvimento.
            Os valores são referências de mercado para consultoria financeira pessoal no Brasil (2025).
            Nenhuma cobrança é realizada no momento. A análise gratuita tem caráter educativo e não substitui consultoria financeira profissional regulamentada.
          </p>
        </div>
        </div>
      </details>
    </div>
  );
}
