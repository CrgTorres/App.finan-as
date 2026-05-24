"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EmprestimosAnaliseFromPayslips } from "@/lib/anexos/emprestimos-analise-from-payslips";
import { prepararFolhaParaAnaliseGrafico } from "@/lib/anexos/emprestimos-analise-from-payslips";
import {
  PAYSLIPS_ANALISE_LIMIT,
  contratosFolhaSemLoanCadastrado,
  cruzarLoansComAnaliseFolha,
  textoResumoEmprestimosParaChat,
} from "@/lib/anexos/emprestimos-cruzamento-loans";
import type { Loan, Payslip } from "@/types/contracheque";
import {
  agregarDescontosPorChaveRubrica,
  carregarOverridesClassificacao,
  categoriaEfetiva,
  chaveRubricaDescontoUsuario,
  inferirCategoriaDescontoPadrao,
  itemEntraBaseRoxa,
  itemMostrarNoGrafico,
  salvarOverridesClassificacao,
  type CategoriaDescontoManual,
  type OverrideDescontoUsuario,
} from "@/lib/anexos/descontos-classificacao-manual";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  ClipboardList,
  Copy,
  CreditCard,
  Layers,
  Lightbulb,
  Link2,
  Paperclip,
  Receipt,
  Scale,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PendenciasAnaliseRevisaoPanel } from "@/components/dashboard/pendencias-analise-revisao-panel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const LS_EXTRAS_GRAFICO = "financaPainelGraficoExtrasV1";

const LABEL_CATEGORIA_DESCONTO: Record<CategoriaDescontoManual, string> = {
  emprestimo: "Empréstimo",
  cooperativa: "Cooperativa",
  associacao: "Associação",
  pensao: "Pensão alimentícia",
  gasto_fixo: "Gasto fixo",
  outro: "Outro",
};

const COR_CATEGORIA_PIE: Record<CategoriaDescontoManual, string> = {
  emprestimo: "#2563eb",
  cooperativa: "#14b8a6",
  associacao: "#22c55e",
  pensao: "#ef4444",
  gasto_fixo: "#a855f7",
  outro: "#64748b",
};

const TR_STRIPE_CATEGORIA: Record<CategoriaDescontoManual, string> = {
  emprestimo: "border-l-blue-500",
  cooperativa: "border-l-teal-500",
  associacao: "border-l-green-500",
  pensao: "border-l-rose-500",
  gasto_fixo: "border-l-violet-500",
  outro: "border-l-slate-400",
};

const TR_BG_CATEGORIA: Record<CategoriaDescontoManual, string> = {
  emprestimo: "bg-blue-500/[0.04] dark:bg-blue-500/[0.07]",
  cooperativa: "bg-teal-500/[0.04] dark:bg-teal-500/[0.07]",
  associacao: "bg-green-500/[0.04] dark:bg-green-500/[0.07]",
  pensao: "bg-rose-500/[0.06] dark:bg-rose-500/[0.10]",
  gasto_fixo: "bg-violet-500/[0.04] dark:bg-violet-500/[0.08]",
  outro: "bg-slate-500/[0.03] dark:bg-slate-500/[0.06]",
};

const SELECT_RING_CATEGORIA: Record<CategoriaDescontoManual, string> = {
  emprestimo: "focus-visible:ring-blue-500/30 border-blue-200/80 dark:border-blue-800/60",
  cooperativa: "focus-visible:ring-teal-500/30 border-teal-200/80 dark:border-teal-800/60",
  associacao: "focus-visible:ring-green-500/30 border-green-200/80 dark:border-green-800/60",
  pensao: "focus-visible:ring-rose-500/30 border-rose-200/80 dark:border-rose-800/60",
  gasto_fixo: "focus-visible:ring-violet-500/30 border-violet-200/80 dark:border-violet-800/60",
  outro: "focus-visible:ring-slate-400/30 border-slate-200 dark:border-slate-600",
};

const SIGLA_CATEGORIA_DESCONTO: Record<CategoriaDescontoManual, string> = {
  emprestimo: "Empr.",
  cooperativa: "Coop.",
  associacao: "Assoc.",
  pensao: "Pensão",
  gasto_fixo: "Fixo",
  outro: "Outro",
};

const BADGE_CLASS_CATEGORIA: Record<CategoriaDescontoManual, string> = {
  emprestimo: "border-blue-200/90 bg-blue-500/12 text-blue-900 dark:border-blue-800 dark:bg-blue-500/15 dark:text-blue-100",
  cooperativa: "border-teal-200/90 bg-teal-500/12 text-teal-900 dark:border-teal-800 dark:bg-teal-500/15 dark:text-teal-100",
  associacao: "border-green-200/90 bg-green-500/12 text-green-900 dark:border-green-800 dark:bg-green-500/15 dark:text-green-100",
  pensao: "border-rose-200/90 bg-rose-500/14 text-rose-950 dark:border-rose-800 dark:bg-rose-500/18 dark:text-rose-100",
  gasto_fixo: "border-violet-200/90 bg-violet-500/12 text-violet-900 dark:border-violet-800 dark:bg-violet-500/15 dark:text-violet-100",
  outro: "border-slate-300/90 bg-slate-500/10 text-slate-800 dark:border-slate-600 dark:bg-slate-500/15 dark:text-slate-200",
};

type ExtraGraficoLinha = { id: string; texto: string; incluir: boolean };

/** Índice linear do mês (igual a `competenciaOrdem` na análise). */
function ordCompetencia(year: number, month: number): number {
  return year * 12 + (month - 1);
}

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

function periodoIndiceParaYearMonth(periodoIndice: number): { year: number; month: number } {
  const year = Math.floor(periodoIndice / 12);
  const month = (periodoIndice % 12) + 1;
  return { year, month };
}

function labelEixoTemporal(periodoIndice: number): string {
  const { year, month } = periodoIndiceParaYearMonth(periodoIndice);
  return `${MESES_ABREV[month - 1]}/${String(year).slice(-2)}`;
}

function labelTooltipCompetencia(periodoIndice: number): string {
  const { year, month } = periodoIndiceParaYearMonth(periodoIndice);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function ticksEixoTemporal(periodos: number[], maxMarcas = 14): number[] {
  if (periodos.length === 0) return [];
  const minO = Math.min(...periodos);
  const maxO = Math.max(...periodos);
  const span = maxO - minO;
  if (span <= 0) return [minO];
  let step = Math.max(1, Math.ceil((span + 1) / maxMarcas));
  if (span > 40 && step < 3) step = 3;
  const ticks: number[] = [];
  for (let o = minO; o <= maxO; o += step) ticks.push(o);
  if (ticks[ticks.length - 1] !== maxO) ticks.push(maxO);
  return ticks;
}

function carregarExtrasGraficoLocal(): ExtraGraficoLinha[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_EXTRAS_GRAFICO);
    if (!raw) return [];
    const o = JSON.parse(raw) as { rows?: Array<{ id: string; texto: string; incluir?: boolean }> };
    return (o.rows ?? []).map((r) => ({
      id: r.id,
      texto: String(r.texto ?? "").trim(),
      incluir: r.incluir !== false,
    }));
  } catch {
    return [];
  }
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatBRLFull(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

function labelLinkInstituicao(url: string): string {
  if (url.includes("bcb.gov.br")) return "Bacen";
  if (url.includes("caixa.gov.br")) return "Caixa";
  if (url.includes("bb.com.br")) return "BB";
  if (url.includes("sicoob")) return "Sicoob";
  if (url.includes("bradesco")) return "Bradesco";
  if (url.includes("itau.com")) return "Itaú";
  if (url.includes("santander")) return "Santander";
  return "Site";
}

interface EmprestimosAnalisePainelProps {
  data: EmprestimosAnaliseFromPayslips;
  /** Empréstimos cadastrados na tabela `loans` (Supabase) para cruzar com a folha. */
  loans?: Loan[];
  /** Salário líquido do último contracheque preferido, para carga % (opcional). */
  ultimoLiquido?: number | null;
  /** Folhas (mesmo conjunto da análise) para somar palavras-chave personalizadas no gráfico. */
  payslipsParaGrafico?: Payslip[];
  /** Quando true, `payslipsParaGrafico` já passou por merge/inferência — não reprocessar. */
  folhaJaPreparada?: boolean;
  /** Quando falso, o painel de revisão de pendências não é renderizado aqui (ex.: aba dedicada). Padrão: true. */
  exibirPainelPendencias?: boolean;
  /** Oculta o bloco hero superior (título longo + botão copiar) — útil quando o cabeçalho da página assume isso. */
  ocultarCabecalhoHero?: boolean;
}

export function EmprestimosAnalisePainel({
  data,
  loans = [],
  ultimoLiquido,
  payslipsParaGrafico,
  folhaJaPreparada = false,
  exibirPainelPendencias = true,
  ocultarCabecalhoHero = false,
}: EmprestimosAnalisePainelProps) {
  const {
    kpis,
    serieMensalTotal,
    contratos,
    porFaixaProgresso,
    pendencias,
    primeiraCompetencia,
    ultimaCompetencia,
    padroesDetectados = [],
    sugestoesResolucao = [],
    mesesInferidosParcela = 0,
  } = data;

  const contratosOrdenados = useMemo(() => {
    return [...contratos].sort((a, b) => {
      const rubA = (a.label ?? "").trim();
      const rubB = (b.label ?? "").trim();
      const cmpRub = rubA.localeCompare(rubB, "pt-BR", { sensitivity: "base", numeric: true });
      if (cmpRub !== 0) return cmpRub;
      const numA = parseInt(String(a.code ?? "").replace(/\D/g, ""), 10);
      const numB = parseInt(String(b.code ?? "").replace(/\D/g, ""), 10);
      const na = Number.isFinite(numA) ? numA : -1;
      const nb = Number.isFinite(numB) ? numB : -1;
      if (na !== nb) return na - nb;
      return String(a.chave).localeCompare(String(b.chave), "pt-BR");
    });
  }, [contratos]);

  const [incluirIrNoGrafico, setIncluirIrNoGrafico] = useState(false);
  const [incluirAmazonPrevNoGrafico, setIncluirAmazonPrevNoGrafico] = useState(false);
  const [incluirPensaoNoGrafico, setIncluirPensaoNoGrafico] = useState(true);
  const [extrasGrafico, setExtrasGrafico] = useState<ExtraGraficoLinha[]>(carregarExtrasGraficoLocal);
  const [novoExtraTexto, setNovoExtraTexto] = useState("");
  const [overridesClassif, setOverridesClassif] = useState<Record<string, OverrideDescontoUsuario>>({});
  const [classifHydrated, setClassifHydrated] = useState(false);
  const [filtroListaClassif, setFiltroListaClassif] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LS_EXTRAS_GRAFICO, JSON.stringify({ rows: extrasGrafico }));
  }, [extrasGrafico]);

  useEffect(() => {
    setOverridesClassif(carregarOverridesClassificacao());
    setClassifHydrated(true);
  }, []);

  const agregadosMap = useMemo(
    () => agregarDescontosPorChaveRubrica(payslipsParaGrafico ?? []),
    [payslipsParaGrafico]
  );

  const agregadosListaOrdenada = useMemo(
    () => [...agregadosMap.values()].sort((a, b) => b.total - a.total),
    [agregadosMap]
  );

  const agregadosListaOrdenadaVisual = useMemo(() => {
    const list = [...agregadosListaOrdenada];
    const rank = (c: CategoriaDescontoManual) => {
      if (c === "pensao") return 0;
      if (c === "emprestimo") return 1;
      return 2;
    };
    list.sort((a, b) => {
      const ca = categoriaEfetiva(a.chave, a.exemplo, overridesClassif);
      const cb = categoriaEfetiva(b.chave, b.exemplo, overridesClassif);
      const d = rank(ca) - rank(cb);
      if (d !== 0) return d;
      return b.total - a.total;
    });
    return list;
  }, [agregadosListaOrdenada, overridesClassif]);

  const resumoPensaoNaLista = useMemo(() => {
    let total = 0;
    let n = 0;
    for (const a of agregadosListaOrdenada) {
      if (categoriaEfetiva(a.chave, a.exemplo, overridesClassif) !== "pensao") continue;
      n += 1;
      total += a.total;
    }
    return { n, total };
  }, [agregadosListaOrdenada, overridesClassif]);

  useEffect(() => {
    if (!classifHydrated) return;
    salvarOverridesClassificacao(overridesClassif);
  }, [classifHydrated, overridesClassif]);

  useEffect(() => {
    if (!classifHydrated) return;
    setOverridesClassif((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [chave, agg] of agregadosMap) {
        if (next[chave] === undefined) {
          next[chave] = {
            categoria: inferirCategoriaDescontoPadrao(agg.exemplo),
            mostrarNoGrafico: true,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [classifHydrated, agregadosMap]);

  const folhaGrafico = useMemo(() => {
    if (!payslipsParaGrafico?.length) return [];
    return folhaJaPreparada ? payslipsParaGrafico : prepararFolhaParaAnaliseGrafico(payslipsParaGrafico);
  }, [payslipsParaGrafico, folhaJaPreparada]);

  const folhaPorOrd = useMemo(() => {
    const m = new Map<number, Payslip>();
    for (const p of folhaGrafico) {
      m.set(ordCompetencia(p.year, p.month), p);
    }
    return m;
  }, [folhaGrafico]);

  const chartSerieData = useMemo(() => {
    const customByIdMonth = new Map<string, Map<number, number>>();
    if (folhaGrafico.length) {
      const folha = folhaGrafico;
      for (const ex of extrasGrafico) {
        const t = ex.texto.trim().toLowerCase();
        if (t.length < 2) continue;
        const m = new Map<number, number>();
        for (const p of folha) {
          const ord = ordCompetencia(p.year, p.month);
          let s = 0;
          for (const it of p.items ?? []) {
            if (it.type !== "desconto" || it.value <= 0) continue;
            if (it.description.toLowerCase().includes(t)) s += it.value;
          }
          if (s > 0) m.set(ord, s);
        }
        customByIdMonth.set(ex.id, m);
      }
    }

    const ov = overridesClassif;

    return serieMensalTotal.map((row) => {
      const ord = ordCompetencia(row.year, row.month);
      const p = folhaPorOrd.get(ord);

      let purple = 0;
      let blueManual = 0;

      if (p) {
        for (const it of p.items ?? []) {
          if (
            !itemEntraBaseRoxa(it, {
              incluirIr: incluirIrNoGrafico,
              incluirAmazon: incluirAmazonPrevNoGrafico,
              overrides: ov,
            })
          ) {
            continue;
          }
          purple += it.value;
          const ch = chaveRubricaDescontoUsuario(it.code, it.description);
          if (categoriaEfetiva(ch, it, ov) === "emprestimo") blueManual += it.value;
        }
      } else {
        purple = row.totalExcIrAmazon;
        if (incluirIrNoGrafico) purple += row.irMensal ?? 0;
        if (incluirAmazonPrevNoGrafico) purple += row.amazonPrevMensal ?? 0;
        blueManual = row.total;
      }

      if (!incluirPensaoNoGrafico) purple -= row.pensaoAlimenticiaMensal ?? 0;
      for (const ex of extrasGrafico) {
        if (ex.incluir) continue;
        purple -= customByIdMonth.get(ex.id)?.get(ord) ?? 0;
      }
      purple = Math.max(0, purple);
      blueManual = Math.min(blueManual, purple);
      const outrosAdj = Math.max(0, purple - blueManual);

      return {
        ...row,
        periodoIndice: ord,
        totalExcIrAmazonAjustado: purple,
        outrosNaoEmprestimoAjustado: outrosAdj,
        totalManualEmprestimoMes: blueManual,
      };
    });
  }, [
    serieMensalTotal,
    incluirIrNoGrafico,
    incluirAmazonPrevNoGrafico,
    incluirPensaoNoGrafico,
    extrasGrafico,
    folhaGrafico,
    folhaPorOrd,
    overridesClassif,
  ]);

  const ticksGraficoLinha = useMemo(
    () => ticksEixoTemporal(chartSerieData.map((r) => r.periodoIndice as number)),
    [chartSerieData]
  );

  const piePorCategoria = useMemo(() => {
    const totais: Record<CategoriaDescontoManual, number> = {
      emprestimo: 0,
      cooperativa: 0,
      associacao: 0,
      pensao: 0,
      gasto_fixo: 0,
      outro: 0,
    };
    for (const agg of agregadosListaOrdenada) {
      if (!itemMostrarNoGrafico(agg.chave, agg.exemplo, overridesClassif)) continue;
      if (
        !itemEntraBaseRoxa(agg.exemplo, {
          incluirIr: incluirIrNoGrafico,
          incluirAmazon: incluirAmazonPrevNoGrafico,
          overrides: overridesClassif,
        })
      ) {
        continue;
      }
      const cat = categoriaEfetiva(agg.chave, agg.exemplo, overridesClassif);
      totais[cat] += agg.total;
    }
    const rows = (Object.keys(totais) as CategoriaDescontoManual[])
      .map((cat) => ({
        name: LABEL_CATEGORIA_DESCONTO[cat],
        value: totais[cat],
        categoria: cat,
      }))
      .filter((r) => r.value > 0);
    return rows.length ? rows : [{ name: "—", value: 1, categoria: "outro" as CategoriaDescontoManual }];
  }, [
    agregadosListaOrdenada,
    overridesClassif,
    incluirIrNoGrafico,
    incluirAmazonPrevNoGrafico,
  ]);

  const cruzamento = useMemo(() => cruzarLoansComAnaliseFolha(loans, data), [loans, data]);
  const folhaSemLoanCadastro = useMemo(
    () => contratosFolhaSemLoanCadastrado(cruzamento, data),
    [cruzamento, data]
  );

  async function copiarResumo() {
    const texto = textoResumoEmprestimosParaChat({ data, loans, ultimoLiquido });
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Resumo copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente se o navegador bloquear.");
    }
  }

  const cargaUltimoMes =
    ultimoLiquido != null && ultimoLiquido > 0
      ? Math.min(100, (kpis.parcelaNoUltimoMes / ultimoLiquido) * 100)
      : null;

  const topContratos = contratos.slice(0, 10).map((c) => {
    const u = c.ultimaParcela;
    const pct = u && u.total > 0 ? Math.round((u.atual / u.total) * 1000) / 10 : null;
    return {
      name: c.label.length > 36 ? `${c.label.slice(0, 34)}…` : c.label,
      total: c.totalPago,
      progressoLabel: pct != null ? `${pct}%` : "—",
    };
  });

  const pctCenter = kpis.progressoMedioPonderadoPct;

  return (
    <div className="space-y-6">
      {!ocultarCabecalhoHero && (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-200/90">Empréstimos na folha</p>
            <h2 className="text-lg font-bold tracking-tight mt-0.5">Análise consolidada dos descontos anexados</h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Agrupamento por código + valor da parcela + texto da rubrica sem sufixo N/M. Por competência, **mensal +
              ficha financeira + folha especial** são fundidos (linhas iguais não duplicam), para não omitir rubricas que
              só constam num dos PDFs. Amazon Prev, previdência e Milicred (associação) não entram como empréstimo.
              CREDICESTA/CREDCESTA unificam-se na chave como credcesta; BB-EMP separa por código + valor. Parcelas N/M
              usam inferência por vizinhança. Até {PAYSLIPS_ANALISE_LIMIT} competências carregadas para esta visão.
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-2 bg-white/10 hover:bg-white/20 text-white border-white/20"
              onClick={() => void copiarResumo()}
            >
              <Copy className="h-4 w-4" />
              Copiar resumo (chat)
            </Button>
          {primeiraCompetencia && ultimaCompetencia && (
            <div className="text-right text-xs text-slate-300 shrink-0">
              <p>
                <span className="text-slate-400">De</span>{" "}
                {String(primeiraCompetencia.month).padStart(2, "0")}/{primeiraCompetencia.year}{" "}
                <span className="text-slate-400">até</span> {String(ultimaCompetencia.month).padStart(2, "0")}/
                {ultimaCompetencia.year}
              </p>
              <p className="text-slate-400 mt-0.5">{data.competenciasProcessadas} competência(s) após fundir anexos por mês</p>
            </div>
          )}
          </div>
        </div>
      </div>
      )}

      {/* Cadastro loans × folha */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cadastro (tabela loans) × folha</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Cruzamento heurístico por parcela cadastrada, texto normalizado e total de parcelas (N/M). Linhas em
              verde = forte match; âmbar = revisar; vermelho = sem rubrica correspondente na folha.
            </p>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
            {loans.length} cadastro(s) · {folhaSemLoanCadastro.length} na folha sem match de cadastro
          </p>
        </div>
        {loans.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nenhum registro na tabela de empréstimos (loans). O painel acima usa só as rubricas dos contracheques; cadastre empréstimos
            no app (quando disponível) para cruzar parcela e progresso.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800 max-h-[220px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left px-2 py-2 font-semibold text-slate-500">Empréstimo (cadastro)</th>
                  <th className="text-left px-2 py-2 font-semibold text-slate-500">Status</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500">Parcela</th>
                  <th className="text-left px-2 py-2 font-semibold text-slate-500">Match na folha</th>
                  <th className="text-left px-2 py-2 font-semibold text-slate-500">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cruzamento.map((r) => (
                  <tr key={r.loan.id} className="bg-white dark:bg-slate-900">
                    <td className="px-2 py-2 text-slate-700 dark:text-slate-200 max-w-[200px] truncate" title={r.loan.description}>
                      {r.loan.description.trim()}
                    </td>
                    <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{r.loan.status}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatBRLFull(r.loan.installment_amount)}</td>
                    <td className="px-2 py-2">
                      {r.melhorContrato ? (
                        <span
                          className={
                            r.tipo === "ok"
                              ? "text-emerald-700 dark:text-emerald-400 font-medium"
                              : "text-amber-700 dark:text-amber-400 font-medium"
                          }
                        >
                          {r.melhorContrato.label.length > 40 ? `${r.melhorContrato.label.slice(0, 38)}…` : r.melhorContrato.label}
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 font-medium">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-slate-500 dark:text-slate-400 max-w-[240px]">{r.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {folhaSemLoanCadastro.length > 0 && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Só na folha (sem cadastro correlacionado): </span>
            {folhaSemLoanCadastro
              .slice(0, 6)
              .map((c) => c.label)
              .join(" · ")}
            {folhaSemLoanCadastro.length > 6 ? ` … (+${folhaSemLoanCadastro.length - 6})` : ""}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/80 dark:bg-orange-950/30 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">Contratos distintos</p>
          <p className="text-2xl font-black tabular-nums text-orange-900 dark:text-orange-100 mt-1">{kpis.nContratosDistintos}</p>
          <p className="text-[11px] text-orange-800/80 dark:text-orange-200/70 mt-1">Chaves código + valor + rubrica</p>
        </div>
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/80 dark:bg-blue-950/30 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Total descontado (histórico)</p>
          <p className="text-xl font-black tabular-nums text-blue-900 dark:text-blue-100 mt-1 leading-tight">{formatBRL(kpis.totalHistoricoDescontado)}</p>
          <p className="text-[11px] text-blue-800/80 dark:text-blue-200/70 mt-1">Só rubricas classificadas como empréstimo/consignado</p>
        </div>
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/80 dark:bg-emerald-950/30 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Média mensal (no período)</p>
          <p className="text-xl font-black tabular-nums text-emerald-900 dark:text-emerald-100 mt-1">{formatBRL(kpis.mediaMensalNoPeriodo)}</p>
          <p className="text-[11px] text-emerald-800/80 dark:text-emerald-200/70 mt-1">Média das parcelas detectadas</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/30 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">Último mês (parcelas)</p>
          <p className="text-xl font-black tabular-nums text-red-900 dark:text-red-100 mt-1">{formatBRL(kpis.parcelaNoUltimoMes)}</p>
          {cargaUltimoMes != null && (
            <p className="text-[11px] text-red-800/90 dark:text-red-200/80 mt-1">
              ≈ {cargaUltimoMes.toFixed(1)}% do último líquido informado
            </p>
          )}
          {cargaUltimoMes == null && (
            <p className="text-[11px] text-red-800/70 dark:text-red-200/60 mt-1">Sem líquido recente para %</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/80 dark:bg-indigo-950/30 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
            Descontos exc. IR e Amazon Prev
          </p>
          <p className="text-xl font-black tabular-nums text-indigo-900 dark:text-indigo-100 mt-1 leading-tight">
            {formatBRL(kpis.totalHistoricoDescontosExcIrAmazon)}
          </p>
          <p className="text-[11px] text-indigo-800/80 dark:text-indigo-200/70 mt-1">
            Média mensal: {formatBRL(kpis.mediaMensalDescontosExcIrAmazon)} · Último mês:{" "}
            {formatBRL(kpis.descontosExcIrAmazonNoUltimoMes)}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            Outros descontos (não «empréstimo»)
          </p>
          <p className="text-xl font-black tabular-nums text-amber-950 dark:text-amber-100 mt-1 leading-tight">
            {formatBRL(kpis.totalHistoricoOutrosNaoEmprestimo)}
          </p>
          <p className="text-[11px] text-amber-900/80 dark:text-amber-200/70 mt-1">
            Sindicato, convênios, etc. Último mês: {formatBRL(kpis.outrosNaoEmprestimoNoUltimoMes)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/40 p-4 flex flex-col justify-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Como ler</p>
          <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-1 leading-snug">
            Use os interruptores abaixo para incluir IR e Amazon Prev na linha roxa, ou para retirar pensão e outras rubricas
            fixas (por palavra-chave) do gráfico. A linha azul soma empréstimos reconhecidos pelo texto/código e também
            descontos com parcela N/M plausível (ex.: 048/072) quando o nome do banco falha no OCR.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex flex-col items-center justify-center min-h-[220px]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-center mb-2">
            Progresso médio (ponderado pelo total pago)
          </p>
          <div className="relative w-44 h-24">
            <svg viewBox="0 0 200 100" className="w-full h-full">
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                className="stroke-slate-200 dark:stroke-slate-700"
                strokeWidth="14"
                strokeLinecap="round"
              />
              {pctCenter != null && (
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="url(#gaugeGrad)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${(pctCenter / 100) * 251.2} 251.2`}
                />
              )}
              <defs>
                <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="50%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-0 pointer-events-none">
              <span className="text-2xl font-black tabular-nums text-slate-800 dark:text-slate-100">
                {pctCenter != null ? `${pctCenter.toFixed(1)}%` : "—"}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-2 px-2">
            Só contratos com parcela N/M válida na última leitura entram no peso.
          </p>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Contratos por faixa de amortização</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">Distribuição com base na última parcela N/M conhecida</p>
          <div className="h-52 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porFaixaProgresso} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} className="fill-slate-500" />
                <YAxis type="category" dataKey="faixa" width={88} tick={{ fontSize: 10 }} className="fill-slate-500" />
                <Tooltip
                  formatter={(v) => [`${Number(v ?? 0)} contrato(s)`, "Quantidade"]}
                  labelFormatter={(l) => String(l)}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="count" name="Contratos" fill="#14b8a6" radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Evolução no tempo — quanto desconta na folha
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            O eixo horizontal é a competência (mês/ano) dos contracheques: meses sem PDF ficam mais afastados, porque não há
            ponto na linha. Passe o rato para ver o mês por extenso e os valores em reais.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-600/80 bg-gradient-to-b from-slate-50/95 to-slate-100/35 dark:from-slate-900/85 dark:to-slate-950/50 px-3 py-3 mb-3 space-y-3 text-xs shadow-sm">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Base do gráfico (linha roxa)</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Inclua ou exclua rubricas grandes; Amazon Prev ≠ pensão alimentícia
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label
              htmlFor="toggle-ir-grafico"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-all",
                incluirIrNoGrafico
                  ? "border-sky-400 bg-sky-500/10 shadow-[0_0_0_1px_rgba(14,165,233,0.2)] dark:border-sky-500 dark:bg-sky-950/40"
                  : "border-slate-200/90 bg-white/90 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/45 dark:hover:border-slate-500"
              )}
            >
              <input
                id="toggle-ir-grafico"
                type="checkbox"
                className="mt-0.5 rounded border-input"
                checked={incluirIrNoGrafico}
                onChange={(e) => setIncluirIrNoGrafico(e.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                  <Receipt className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                  Imposto de Renda
                </span>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Somado à linha roxa de descontos
                </p>
              </div>
            </label>
            <label
              htmlFor="toggle-amazon-grafico"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-all",
                incluirAmazonPrevNoGrafico
                  ? "border-emerald-400 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.2)] dark:border-emerald-500 dark:bg-emerald-950/40"
                  : "border-slate-200/90 bg-white/90 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/45 dark:hover:border-slate-500"
              )}
            >
              <input
                id="toggle-amazon-grafico"
                type="checkbox"
                className="mt-0.5 rounded border-input"
                checked={incluirAmazonPrevNoGrafico}
                onChange={(e) => setIncluirAmazonPrevNoGrafico(e.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  Amazon Prev
                </span>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Previdência complementar (ex. 6392)
                </p>
              </div>
            </label>
            <label
              htmlFor="toggle-pensao-grafico"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-all",
                incluirPensaoNoGrafico
                  ? "border-rose-400 bg-rose-500/10 shadow-[0_0_0_1px_rgba(244,63,94,0.2)] dark:border-rose-500 dark:bg-rose-950/40"
                  : "border-slate-200/90 bg-white/90 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/45 dark:hover:border-slate-500"
              )}
            >
              <input
                id="toggle-pensao-grafico"
                type="checkbox"
                className="mt-0.5 rounded border-input"
                checked={incluirPensaoNoGrafico}
                onChange={(e) => setIncluirPensaoNoGrafico(e.target.checked)}
              />
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                  <Scale className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
                  Pensão / manutenção
                </span>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Soma todas as rubricas detetadas (várias linhas)
                </p>
              </div>
            </label>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 border-t border-slate-200/80 dark:border-slate-600/50 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-violet-500 shadow-sm" aria-hidden />
              Roxo — total de descontos
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-blue-500 shadow-sm" aria-hidden />
              Azul — empréstimos na folha
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-amber-500 shadow-sm" aria-hidden />
              Âmbar — demais descontos
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end pt-1 border-t border-slate-200/80 dark:border-slate-600/60">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">Outro gasto fixo (palavra na rubrica, ex.: SINDICATO)</p>
              <Input
                value={novoExtraTexto}
                onChange={(e) => setNovoExtraTexto(e.target.value)}
                placeholder="Texto a procurar na descrição do desconto"
                className="h-8 text-xs"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => {
                const t = novoExtraTexto.trim();
                if (t.length < 3) {
                  toast.error("Use pelo menos 3 caracteres para evitar coincidências demasiado largas.");
                  return;
                }
                if (extrasGrafico.some((x) => x.texto.toLowerCase() === t.toLowerCase())) {
                  toast.info("Esta palavra-chave já está na lista.");
                  return;
                }
                const id = globalThis.crypto?.randomUUID?.() ?? `x-${Date.now()}`;
                setExtrasGrafico((prev) => [...prev, { id, texto: t, incluir: true }]);
                setNovoExtraTexto("");
              }}
            >
              Adicionar
            </Button>
          </div>
          {extrasGrafico.length > 0 && (
            <ul className="space-y-1.5 pt-1">
              {extrasGrafico.map((ex) => (
                <li key={ex.id} className="flex flex-wrap items-center gap-2 justify-between gap-y-1">
                  <label className="flex items-center gap-2 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      className="rounded border-input shrink-0"
                      checked={ex.incluir}
                      onChange={(e) =>
                        setExtrasGrafico((prev) =>
                          prev.map((r) => (r.id === ex.id ? { ...r, incluir: e.target.checked } : r))
                        )
                      }
                    />
                    <span className="truncate" title={ex.texto}>
                      Incluir «{ex.texto}»
                    </span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-red-600 dark:text-red-400 shrink-0"
                    onClick={() => setExtrasGrafico((prev) => prev.filter((r) => r.id !== ex.id))}
                  >
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!payslipsParaGrafico?.length && extrasGrafico.length > 0 && (
            <p className="text-[10px] text-amber-700 dark:text-amber-300">
              Palavras-chave personalizadas precisam das folhas em memória — recarregue a página de Análise ou aguarde o carregamento dos anexos.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-3 py-3 mb-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <ClipboardList className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  Rubricas para classificar (foco em empréstimos e afins)
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Cores na tabela seguem o tipo (pensão em rosa, empréstimo em azul). Imposto de renda, Amazon Prev e
                  descontos de 13.º não aparecem aqui — cobertos pelos cartões acima. Linhas de pensão aparecem por rubrica;
                  o total na série segue «Pensão / manutenção». Preferências guardadas neste navegador.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-[11px] shrink-0"
              disabled={!payslipsParaGrafico?.length}
              onClick={() => {
                setOverridesClassif((prev) => {
                  const next = { ...prev };
                  for (const a of agregadosListaOrdenada) {
                    next[a.chave] = {
                      categoria: inferirCategoriaDescontoPadrao(a.exemplo),
                      mostrarNoGrafico: true,
                    };
                  }
                  return next;
                });
                toast.success("Classificações repostas pelas sugestões automáticas.");
              }}
            >
              Repor sugestões
            </Button>
          </div>
          <Input
            value={filtroListaClassif}
            onChange={(e) => setFiltroListaClassif(e.target.value)}
            placeholder="Filtrar por texto da rubrica ou código…"
            className="h-8 text-xs"
          />
          {resumoPensaoNaLista.n > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-xl border border-rose-200/90 dark:border-rose-900/50 bg-gradient-to-r from-rose-500/[0.09] via-rose-500/[0.04] to-transparent dark:from-rose-950/50 dark:via-rose-950/25 px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/20 dark:bg-rose-500/25 text-rose-700 dark:text-rose-200">
                  <Scale className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-rose-950 dark:text-rose-100 leading-tight">
                    Pensão / manutenção familiar na lista
                  </p>
                  <p className="text-[10px] text-rose-800/85 dark:text-rose-200/80 mt-0.5">
                    {resumoPensaoNaLista.n} rubrica{resumoPensaoNaLista.n !== 1 ? "s" : ""} distinta
                    {resumoPensaoNaLista.n !== 1 ? "s" : ""} · Soma no período carregado:{" "}
                    <span className="font-bold tabular-nums">{formatBRLFull(resumoPensaoNaLista.total)}</span>
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-rose-800/75 dark:text-rose-300/90 sm:ml-auto sm:max-w-[240px] leading-snug">
                Amazon Prev não entra neste bloco — use o cartão «Amazon Prev» acima na linha roxa.
              </p>
            </div>
          )}
          {!payslipsParaGrafico?.length ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 py-2">
              Sem folhas em memória para listar rubricas — abra esta análise a partir da página com os contracheques carregados.
            </p>
          ) : !classifHydrated ? (
            <p className="text-[11px] text-slate-500 py-2">A carregar preferências…</p>
          ) : (
            <div className="overflow-x-auto max-h-[min(420px,55vh)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 z-[1] border-b border-slate-200/90 dark:border-slate-600 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-sm">
                  <tr>
                    <th className="text-left px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">Rubrica</th>
                    <th className="text-left px-2 py-2 font-semibold text-slate-600 dark:text-slate-300 w-14">Cód.</th>
                    <th className="text-right px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">Total</th>
                    <th className="text-center px-2 py-2 font-semibold text-slate-600 dark:text-slate-300 w-16">Auto emp.</th>
                    <th className="text-left px-2 py-2 font-semibold text-slate-600 dark:text-slate-300 min-w-[140px]">Tipo</th>
                    <th className="text-center px-2 py-2 font-semibold text-slate-600 dark:text-slate-300 w-[108px]">
                      No gráfico
                      <span className="block text-[9px] text-slate-400 font-normal mt-0.5">
                        opcional exceto empréstimo
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {agregadosListaOrdenadaVisual
                    .filter((a) => {
                      const f = filtroListaClassif.trim().toLowerCase();
                      if (!f) return true;
                      return (
                        a.label.toLowerCase().includes(f) ||
                        (a.code ?? "").toLowerCase().includes(f) ||
                        a.chave.toLowerCase().includes(f)
                      );
                    })
                    .map((agg) => {
                      const catEff = categoriaEfetiva(agg.chave, agg.exemplo, overridesClassif);
                      const graficoObrigatorio = catEff === "emprestimo";
                      return (
                      <tr
                        key={agg.chave}
                        className={cn(
                          "border-l-[3px] transition-colors",
                          TR_STRIPE_CATEGORIA[catEff],
                          TR_BG_CATEGORIA[catEff]
                        )}
                      >
                        <td className="px-2 py-2 text-slate-800 dark:text-slate-200 max-w-[240px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge
                              variant="outline"
                              className={cn("shrink-0 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide", BADGE_CLASS_CATEGORIA[catEff])}
                            >
                              {SIGLA_CATEGORIA_DESCONTO[catEff]}
                            </Badge>
                            <span className="truncate font-medium" title={agg.exemplo.description}>
                              {agg.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 font-mono text-slate-600 dark:text-slate-400">{agg.code ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-800 dark:text-slate-100 font-medium">
                          {formatBRLFull(agg.total)}
                        </td>
                        <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-400">
                          {agg.detecaoAutoEmprestimo ? (
                            <span className="inline-flex rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:text-blue-200">
                              Sim
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className={cn(
                              "w-full max-w-[180px] rounded-md border bg-white dark:bg-slate-900 px-1.5 py-1 text-[11px] shadow-sm focus-visible:outline-none focus-visible:ring-2",
                              SELECT_RING_CATEGORIA[catEff]
                            )}
                            value={categoriaEfetiva(agg.chave, agg.exemplo, overridesClassif)}
                            onChange={(e) => {
                              const v = e.target.value as CategoriaDescontoManual;
                              setOverridesClassif((prev) => ({
                                ...prev,
                                [agg.chave]: {
                                  categoria: v,
                                  mostrarNoGrafico:
                                    v === "emprestimo"
                                      ? true
                                      : itemMostrarNoGrafico(agg.chave, agg.exemplo, prev),
                                },
                              }));
                            }}
                          >
                            <option value="emprestimo">{LABEL_CATEGORIA_DESCONTO.emprestimo}</option>
                            <option value="cooperativa">{LABEL_CATEGORIA_DESCONTO.cooperativa}</option>
                            <option value="associacao">{LABEL_CATEGORIA_DESCONTO.associacao}</option>
                            <option value="pensao">{LABEL_CATEGORIA_DESCONTO.pensao}</option>
                            <option value="gasto_fixo">{LABEL_CATEGORIA_DESCONTO.gasto_fixo}</option>
                            <option value="outro">{LABEL_CATEGORIA_DESCONTO.outro}</option>
                          </select>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-input disabled:opacity-50 h-4 w-4"
                            disabled={graficoObrigatorio}
                            title={
                              graficoObrigatorio
                                ? "Empréstimo entra sempre nas análises deste painel"
                                : "Incluir na pizza e nos totais da série conforme regras dos toggles IR/Amazon"
                            }
                            checked={itemMostrarNoGrafico(agg.chave, agg.exemplo, overridesClassif)}
                            onChange={(e) =>
                              setOverridesClassif((prev) => ({
                                ...prev,
                                [agg.chave]: {
                                  categoria: categoriaEfetiva(agg.chave, agg.exemplo, prev),
                                  mostrarNoGrafico: e.target.checked,
                                },
                              }))
                            }
                          />
                        </td>
                      </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {chartSerieData.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">Sem série para exibir.</p>
        ) : (
          <div className="h-80 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartSerieData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis
                  type="number"
                  dataKey="periodoIndice"
                  domain={["dataMin", "dataMax"]}
                  ticks={ticksGraficoLinha}
                  tickFormatter={(v) => labelEixoTemporal(Number(v))}
                  tick={{ fontSize: 10 }}
                  angle={-32}
                  dy={6}
                  height={52}
                  className="fill-slate-500"
                />
                <YAxis
                  tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 10 }}
                  width={36}
                  className="fill-slate-500"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as {
                      periodoIndice?: number;
                      label?: string;
                      totalManualEmprestimoMes?: number;
                      totalExcIrAmazonAjustado?: number;
                      outrosNaoEmprestimoAjustado?: number;
                    };
                    const titulo =
                      row.periodoIndice != null
                        ? labelTooltipCompetencia(row.periodoIndice)
                        : row.label != null
                          ? String(row.label)
                          : "";
                    const emp = Number(row.totalManualEmprestimoMes ?? 0);
                    const tot = Number(row.totalExcIrAmazonAjustado ?? 0);
                    const dem = Number(row.outrosNaoEmprestimoAjustado ?? 0);
                    return (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white/98 dark:bg-slate-800/98 px-3 py-2.5 text-xs shadow-lg backdrop-blur-sm min-w-[220px] space-y-2">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 capitalize border-b border-slate-100 dark:border-slate-700 pb-1.5">
                          {titulo}
                        </p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-4">
                            <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" aria-hidden />
                              Total descontos
                            </span>
                            <span className="tabular-nums font-semibold text-violet-700 dark:text-violet-300">
                              {formatBRLFull(tot)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />
                              Empréstimos
                            </span>
                            <span className="tabular-nums font-medium text-blue-600 dark:text-blue-400">
                              {formatBRLFull(emp)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                              Demais
                            </span>
                            <span className="tabular-nums font-medium text-amber-700 dark:text-amber-400">
                              {formatBRLFull(dem)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="totalManualEmprestimoMes"
                  name="Empréstimos"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="totalExcIrAmazonAjustado"
                  name="Total de descontos"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="outrosNaoEmprestimoAjustado"
                  name="Demais descontos"
                  stroke="#d97706"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="mb-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-violet-500" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Participação por categoria (manual)</p>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-6">
              Soma histórica das rubricas com «no gráfico» ativo, repartida por tipo (empréstimo, cooperativa, associação, pensão,
              outro). Sem fatia genérica «outros contratos».
            </p>
          </div>
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={piePorCategoria} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} dataKey="value">
                  {piePorCategoria.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.name === "—" && entry.value <= 1
                          ? "#cbd5e1"
                          : COR_CATEGORIA_PIE[entry.categoria]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatBRLFull(Number(v ?? 0))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-300">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-4 w-4 text-teal-600" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Top contratos — total pago (último progresso na dica)</p>
          </div>
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topContratos} layout="vertical" margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis type="number" tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} className="fill-slate-500" />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} className="fill-slate-500" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as { total: number; progressoLabel: string };
                    return (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs shadow-md">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">Total pago: {formatBRLFull(row.total)}</p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">Progresso (última N/M): {row.progressoLabel}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="total" name="Total pago" fill="#f97316" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {contratosOrdenados.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Detalhe por contrato</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Mediana da parcela, competências e última parcela lida. Em «Meses», o número principal conta folhas com PDF;
              «(+N inf.)» são competências só inferidas pela sequência N/M entre meses já anexados — anexe a folha para
              validar. Coluna «IF ref.»: COMPE + nome curados (Bacen / portais) quando a rubrica e o indício de consignado
              coincidem com a tabela interna — conferência manual no PDF continua obrigatória.
            </p>
          </div>
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-500">Rubrica (sem N/M)</th>
                  <th className="text-left px-2 py-2 font-semibold text-slate-500">IF ref.</th>
                  <th className="text-left px-2 py-2 font-semibold text-slate-500">Cód.</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500">Mediana</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500">Total</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500" title="Folhas com PDF + inferidos por N/M">
                    Meses
                  </th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500">Conf.</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Última N/M</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {contratosOrdenados.map((c) => {
                  const nReais = c.ocorrencias.filter((o) => !o.inferidoSemFolha).length;
                  const nInf = c.ocorrencias.filter((o) => o.inferidoSemFolha).length;
                  return (
                  <tr key={c.chave} className="bg-white dark:bg-slate-900">
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200 max-w-[220px] truncate" title={c.label}>
                      {c.label}
                    </td>
                    <td className="px-2 py-2 align-top text-[10px] leading-tight max-w-[120px]">
                      {c.confirmacaoInstituicao ? (
                        <div className="space-y-0.5 text-slate-600 dark:text-slate-400">
                          <div className="font-mono text-slate-800 dark:text-slate-200">
                            {c.confirmacaoInstituicao.compe} · {c.confirmacaoInstituicao.confiancaRef === "alta" ? "alta" : "média"}
                          </div>
                          <div className="truncate" title={c.confirmacaoInstituicao.nome}>
                            {c.confirmacaoInstituicao.nome}
                          </div>
                          <div className="flex flex-wrap gap-x-1.5">
                            {c.confirmacaoInstituicao.urlsReferencia.slice(0, 3).map((u) => (
                              <a
                                key={u}
                                href={u}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 underline-offset-2 hover:underline"
                              >
                                {labelLinkInstituicao(u)}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-slate-500 font-mono">{c.code ?? "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatBRLFull(c.valorMediano)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{formatBRLFull(c.totalPago)}</td>
                    <td
                      className="px-2 py-2 text-right tabular-nums"
                      title={
                        nInf > 0
                          ? `${nInf} competência(ns) inferida(s) só pela lógica N/M (sem PDF neste mês). Anexe a folha em andamento para validar.`
                          : undefined
                      }
                    >
                      <span>{nReais}</span>
                      {nInf > 0 ? (
                        <span className="text-violet-600 dark:text-violet-400 ml-1 whitespace-nowrap">
                          (+{nInf} inf.)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span
                        className={
                          c.confianca === "alta"
                            ? "inline-block rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 font-semibold"
                            : c.confianca === "media"
                              ? "inline-block rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 font-semibold"
                              : "inline-block rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 font-semibold"
                        }
                        title={
                          c.sequenciaParcelaCoerente
                            ? "Sequência de parcelas coerente entre meses consecutivos"
                            : !c.ultimaParcela
                              ? "Sem N/M confiável"
                              : "Leia com reserva"
                        }
                      >
                        {c.confianca === "alta" ? "Alta" : c.confianca === "media" ? "Média" : "Baixa"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {c.ultimaParcela
                        ? `${String(c.ultimaParcela.atual).padStart(2, "0")}/${String(c.ultimaParcela.total).padStart(2, "0")}`
                        : "—"}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(padroesDetectados.length > 0 || sugestoesResolucao.length > 0) && (
        <div
          className={
            padroesDetectados.length > 0 && sugestoesResolucao.length > 0
              ? "grid grid-cols-1 lg:grid-cols-2 gap-4"
              : "grid grid-cols-1 gap-4"
          }
        >
          {padroesDetectados.length > 0 && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Padrões entre os anexos</p>
              </div>
              <p className="text-[11px] text-emerald-800/90 dark:text-emerald-200/80 mb-3">
                Cruzamento automático: mesma rubrica com valores parecidos, contratos âncora (leitura estável) e hiato de
                desconto quando ainda havia outros empréstimos na folha (indício de quitação ou troca de linha).
              </p>
              <ul className="space-y-2 text-xs text-emerald-950/95 dark:text-emerald-50/90 list-disc pl-4">
                {padroesDetectados.map((pad, i) => (
                  <li key={i}>
                    {pad.mensagem}
                    {pad.contratos && pad.contratos.length > 0 && (
                      <span className="block mt-1 text-[10px] text-emerald-700/80 dark:text-emerald-300/70 font-medium">
                        Ref.: {pad.contratos.slice(0, 4).join(" · ")}
                        {pad.contratos.length > 4 ? "…" : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sugestoesResolucao.length > 0 && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Plano de resolução (app + revisão)</p>
              </div>
              <p className="text-[11px] text-blue-800/90 dark:text-blue-200/80 mb-3">
                Priorize o topo. No assistente, pode colar o título ou a rubrica e pedir para cruzar com o PDF do
                contracheque ou do contrato.
              </p>
              <div className="space-y-2">
                {sugestoesResolucao.map((s, i) => (
                  <div
                    key={i}
                    className={
                      s.prioridade === "alta"
                        ? "border-l-4 border-l-red-500 bg-white/70 dark:bg-slate-900/60 rounded-r-lg px-3 py-2"
                        : s.prioridade === "media"
                          ? "border-l-4 border-l-amber-500 bg-white/70 dark:bg-slate-900/60 rounded-r-lg px-3 py-2"
                          : "border-l-4 border-l-slate-400 bg-white/70 dark:bg-slate-900/60 rounded-r-lg px-3 py-2"
                    }
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={
                          s.prioridade === "alta"
                            ? "text-[10px] font-bold uppercase text-red-700 dark:text-red-300"
                            : s.prioridade === "media"
                              ? "text-[10px] font-bold uppercase text-amber-800 dark:text-amber-200"
                              : "text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400"
                        }
                      >
                        {s.prioridade === "alta" ? "Prioridade alta" : s.prioridade === "media" ? "Média" : "Baixa"}
                      </span>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{s.titulo}</p>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{s.detalhe}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {exibirPainelPendencias ? (
        <PendenciasAnaliseRevisaoPanel pendencias={pendencias} contratos={contratosOrdenados} ultimaCompetencia={ultimaCompetencia} />
      ) : null}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/40 p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Dicas, oportunidades e anexos</p>
            <ul className="list-disc pl-4 space-y-1.5">
              <li>
                Descontos duplicados no mesmo mês e na mesma rubrica foram unificados; a confiança da coluna «Conf.» usa
                só meses com folha anexada (inferidos não contam para mediana nem para «parcela no último mês»).
              </li>
              <li>
                Quando a sequência de parcelas (ex.: 01/48 … 03/48) e o total M batem entre dois meses já na base, meses
                intermediários em branco podem ser preenchidos automaticamente como estimativa — aparecem como «(+N
                inf.)» até você anexar o PDF da competência.
              </li>
              <li>
                Oportunidade: cada folha a mais reduz hiato, melhora o cruzamento com cadastros de empréstimo e deixa o
                gráfico mensal mais fiel ao que saiu na margem.
              </li>
            </ul>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 border-t border-slate-200/80 dark:border-slate-600/60 text-[11px] text-slate-700 dark:text-slate-200">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
              <span>
                Anexe as competências ainda <strong>em andamento</strong> (meses sem PDF na pasta de folhas) em{" "}
                <Link
                  href="/dashboard/contracheque"
                  className="font-medium text-blue-600 dark:text-blue-400 underline-offset-2 hover:underline"
                >
                  Contracheque → anexos (folha)
                </Link>
                .
              </span>
              {mesesInferidosParcela > 0 ? (
                <span className="w-full text-violet-700 dark:text-violet-300">
                  Hoje há {mesesInferidosParcela} linha(s) de competência inferida só por N/M; priorize anexar esses meses
                  para substituir a estimativa pelo valor real da folha.
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
