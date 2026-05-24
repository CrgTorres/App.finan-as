"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Landmark, Newspaper, Scale, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuditoriaInsightBanner, AuditoriaTimelineBar } from "@/components/dashboard/analise/premium";
import { createClient } from "@/lib/supabase/client";
import {
  DASHBOARD_DATA_UPDATED,
  subscribeDashboardDataUpdated,
  type DashboardDataUpdatedDetail,
} from "@/lib/dashboard-data-events";
import type { Loan, Payslip } from "@/types/contracheque";

type Headline = {
  id: string;
  /** Texto completo (painel expandido / fallback). */
  text: string;
  href?: string;
  /** Versão curta para destaque + ticker — evita “muro de texto”. */
  brief?: string;
};

const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PANORAMA_HIDDEN_KEY = "dashboard_panorama_base_hidden_v1";

/** Dicas de ganho bancário e análise minuciosa com documentos — caráter informativo, não recomendação de produto específico. */
const BANK_HEADLINES: Headline[] = [
  {
    id: "b1",
    text: "Ganho de margem: renegociar consignados com taxa menor ou prazo menor pode liberar líquido — simule antes de aceitar novo contrato.",
    href: "/dashboard/contracheque",
  },
  {
    id: "b2",
    text: "Antecipação de parcelas: em muitos bancos há desconto sobre juros futuros — peça extrato da dívida e compare com o desconto ofertado na quitação parcial.",
    href: "/dashboard/contracheque",
  },
  {
    id: "b3",
    text: "Análise minuciosa: ao anexar o PDF do contracheque (ou ficha financeira), confira código + descrição + valor lado a lado com o contrato físico ou aditivo.",
    href: "/dashboard/contracheque",
  },
  {
    id: "b4",
    text: "Rubricas repetidas ou códigos iguais com parcelas diferentes: use o Comparativo da folha para evitar gravar financiamentos duplicados por engano.",
    href: "/dashboard/contracheque",
  },
  {
    id: "b4b",
    text: "Consignados na folha SEAD: após o nome do empréstimo costuma aparecer a parcela (ex. 01/48). O app lê esse par para análise e cruza o mesmo contrato entre meses — confira se o OCR não cortou o fim da linha.",
    href: "/dashboard/contracheque",
  },
  {
    id: "b5",
    text: "Portabilidade/CET: sempre compare custo efetivo total de um empréstimo ao atual antes de migrar instituições.",
    href: "/dashboard/import",
  },
  {
    id: "b6",
    text: "Concentração bancária: se vários descontos somam forte no líquido, priorizar quitar primeiro o que mais come folga mensal pode ser mais eficiente que ordem cronológica.",
    href: "/dashboard/analise",
  },
  {
    id: "b7",
    text: "Contracheques retroativos: importar série completa aumenta precisão de gráficos, empréstimos em curso e correção de OCR em parcelas tipo PARC 12/48.",
    href: "/dashboard/contracheque",
  },
];

/** Tema Oportunidade — defesa do consumidor financeiro e redução legal de dívidas (somente orientação genérica). */
const OPPORTUNITY_HEADLINES: Headline[] = [
  {
    id: "o1",
    text: "OPORTUNIDADE — Juros abusivos e encargos: o CDC trata cláusulas abusivas; reunir contrato, termos do empréstimo e série de parcelas na folha fortalece análise com advogado ou Defensoria — vitórias costumam reduzir saldo ou mensalidades.",
    href: "/dashboard/contracheque",
  },
  {
    id: "o2",
    text: "OPORTUNIDADE — Venda casada em crédito: condicionar empréstimo a seguro, cartão ou pacote obrigatório sem alternativa pode ser objeto de reclamação — guarde prints, áudios e o PDF do contrato; compare com cada desconto no contracheque.",
    href: "/dashboard/contracheque",
  },
  {
    id: "o3",
    text: "OPORTUNIDADE — Superendividamento: a Lei 14.181/2021 e normas de crédito ao consumidor preveem trilhas de renegociação e mediação — com extratos e contracheques (ou ficha financeira) organizados você acelera atendimento em Procon, consumidor.gov ou defesa do consumidor.",
    href: "/dashboard/import",
  },
  {
    id: "o4",
    text: "OPORTUNIDADE — Reclamações ao banco/Bacen e Procon: registrar formalmente incoerências (taxas, IOF não informados, amortização duvidosa) com histórico de valores costuma preceder revisão ou proposta melhor.",
    href: "/dashboard/transactions",
  },
  {
    id: "o5",
    text: "OPORTUNIDADE — Quitação/antecipação após revisão: se reduziram juros ilegais ou tarifas, use o novo saldo devedor para negociar desconto em quitação — o app ajuda a ver impacto no seu fluxo mensal.",
    href: "/dashboard/analise",
  },
  {
    id: "o6",
    text: "OPORTUNIDADE — Evite empresas milagrosas: priorize canais públicos, OAB, Defensoria ou negociação direta com prova organizada — importe dados reais antes de aceitar novo contrato/refin da mesma instituição.",
    href: "/dashboard/contracheque",
  },
];

/** Headlines cuja bola do ticker deve ser âmbar (oportunidade / defesa do consumidor). */
function headlineIsOpportunity(h: Headline): boolean {
  return h.id.startsWith("o");
}

function truncateWithEllipsis(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trim()}…`;
}

type HeroPayload = {
  title: string;
  subtitle: string;
  href: string;
  statusLabel: string;
  statusTone: "neutral" | "attention" | "positive";
};

function displayLine(h: Headline, maxLen: number): string {
  const raw = (h.brief ?? h.text).trim();
  return truncateWithEllipsis(raw, maxLen);
}

function deriveHeroPayload(items: Headline[], loadError: boolean): HeroPayload {
  if (loadError) {
    return {
      title: "Não foi possível carregar o resumo da base",
      subtitle: "Abra Contracheque para atualizar antes das análises e do comparativo de empréstimos.",
      href: "/dashboard/contracheque",
      statusLabel: "Falha de leitura",
      statusTone: "attention",
    };
  }
  const assistenteFlash = items.find((x) => x.id === "assistente-flash");
  if (assistenteFlash) {
    return {
      title: displayLine(assistenteFlash, 100),
      subtitle: "Dados sincronizados · Panorama e Análise usam o que você acabou de gravar.",
      href: assistenteFlash.href ?? "/dashboard/analise",
      statusLabel: "Sincronização",
      statusTone: "positive",
    };
  }
  if (items.length === 0) {
    return {
      title: "Importe contracheques para montar o panorama",
      subtitle: "Série mensal melhora gráficos, cruzamento com o PDF e análise de consignados.",
      href: "/dashboard/contracheque",
      statusLabel: "Aguardando documentos",
      statusTone: "neutral",
    };
  }
  const h =
    items.find((x) => x.id === "assistente-base") ??
    items.find((x) => x.id === "insight-serie") ??
    items.find((x) => x.id === "pend-cadastro") ??
    items.find((x) => headlineIsOpportunity(x)) ??
    items[0];
  const title = displayLine(h, 110);
  const subtitle = headlineIsOpportunity(h)
    ? "Conteúdo informativo sobre direitos típicos do consumidor. Valide com advogado ou órgão antes de reclamar ou aceitar acordo."
    : h.id === "insight-serie"
      ? "Resumo da sua série gravada — intervalo real na base, sem janela fixa de semestre."
      : h.id === "pend-cadastro"
        ? "Cruzamento folha × cadastro: confira parcelas no PDF atual da folha."
        : h.id === "assistente-base"
          ? "Resumo da série gravada — detalhes na faixa abaixo ou em «Mais»."
          : "Dicas de folha, banco e oportunidade — role a faixa ou abra «Mais».";
  let statusLabel = "Monitoramento";
  let statusTone: HeroPayload["statusTone"] = "neutral";
  if (headlineIsOpportunity(h)) {
    statusLabel = "Leitura jurídica";
    statusTone = "attention";
  } else if (h.id === "insight-serie") {
    statusLabel = "Série documental";
  } else if (h.id === "pend-cadastro") {
    statusLabel = "Cruzamento cadastro";
    statusTone = "attention";
  } else if (h.id === "assistente-base") {
    statusLabel = "Panorama da base";
    statusTone = "positive";
  }
  return {
    title,
    subtitle,
    href: h.href ?? "/dashboard",
    statusLabel,
    statusTone,
  };
}

/** Relógio do ticker estilo canal (HH:MM, pt-BR). Só atualiza no cliente (evita hydration mismatch). */
function useBrClockTick(intervalMs = 30000) {
  const format = () =>
    new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  const [s, setS] = useState("--:--");
  useEffect(() => {
    const tick = () => setS(format());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return s;
}

function payslipCoverageKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Mensagem curta para o ticker quando o app sinaliza gravação de documento. */
function textoAssistenteDoEvento(detail: DashboardDataUpdatedDetail): string | null {
  const src = detail.origin;
  if (!src) return null;
  if (src === "payslip" && detail.payslipMeta?.month && detail.payslipMeta?.year) {
    const { month: m, year: y, documentKind: dk } = detail.payslipMeta;
    const label =
      dk === "ficha_financeira"
        ? "Ficha financeira"
        : dk === "contracheque_mensal"
          ? "Contracheque"
          : "Anexo de folha";
    return `${label} ${MONTH_SHORT[m - 1]}/${y} gravado — dashboard e Análise IA sincronizados.`;
  }
  const map: Record<string, string> = {
    nota_fiscal: "Nota fiscal salva — totais e recorte do período alinhados.",
    import_extrato: "Extrato importado — transações e gráficos atualizados.",
    transacao_manual: "Lançamento registrado — resumo financeiro recalculado.",
    transacao_delete: "Transação removida — saldo do período atualizado.",
  };
  return map[src] ?? null;
}

function buildAssistenteSnapshotHeadline(rows: Payslip[]): Headline | null {
  if (rows.length === 0) return null;
  const years = rows.map((r) => r.year);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const meses2025 = new Set(
    rows.filter((r) => r.year === 2025).map((r) => payslipCoverageKey(r.year, r.month))
  ).size;
  const last = rows.reduce((a, b) =>
    new Date(b.created_at).getTime() >= new Date(a.created_at).getTime() ? b : a
  );
  const fichaN = rows.filter((r) => r.document_kind === "ficha_financeira").length;
  const demaisN = rows.length - fichaN;
  const ultima = new Date(last.created_at).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return {
    id: "assistente-base",
    text: `Assistente pessoal: ${rows.length} documento(s) na base (ficha ${fichaN} · demais ${demaisN}). Em 2025 há ${meses2025}/12 competência(s) com folha gravada. Anos ${minY}–${maxY}. Última gravação: ${ultima}.`,
    brief: `${rows.length} documento(s) na base · Ficha ${fichaN}, demais ${demaisN} · 2025: ${meses2025}/12 meses com folha · Séries ${minY}–${maxY} · Última gravação ${ultima}`,
    href: "/dashboard/analise",
  };
}

function mergeLatestPayslipPerMonth(rows: Payslip[]): Set<string> {
  const map = new Map<string, Payslip>();
  for (const p of rows) {
    const key = payslipCoverageKey(p.year, p.month);
    const cur = map.get(key);
    if (!cur || new Date(p.created_at).getTime() >= new Date(cur.created_at).getTime()) {
      map.set(key, p);
    }
  }
  return new Set(map.keys());
}

/** Competências distintas ordenadas (série civil). */
function competenciasOrdenadasNaBase(rows: Payslip[]): Array<{ year: number; month: number; key: string }> {
  const keys = [...mergeLatestPayslipPerMonth(rows)];
  const parsed = keys
    .map((k) => {
      const [ys, ms] = k.split("-");
      const year = Number(ys);
      const month = Number(ms);
      if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
      return { year, month, key: k };
    })
    .filter((x): x is { year: number; month: number; key: string } => x != null);
  parsed.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
  return parsed;
}

function mesesCivisEntreInclusive(y0: number, m0: number, y1: number, m1: number): number {
  return y1 * 12 + m1 - (y0 * 12 + m0) + 1;
}

/** Resumo da série real na base — substitui avisos genéricos de «últimos 6 meses». */
function buildSerieGravadaHeadline(rows: Payslip[]): Headline | null {
  if (rows.length === 0) return null;
  const ord = competenciasOrdenadasNaBase(rows);
  if (ord.length === 0) return null;
  const first = ord[0]!;
  const last = ord[ord.length - 1]!;
  const labelFirst = `${MONTH_SHORT[first.month - 1]}/${String(first.year).slice(-2)}`;
  const labelLast = `${MONTH_SHORT[last.month - 1]}/${String(last.year).slice(-2)}`;
  const nComp = ord.length;
  const span = mesesCivisEntreInclusive(first.year, first.month, last.year, last.month);
  const buracos = Math.max(0, span - nComp);
  const textoBuraco =
    buracos >= 4
      ? ` Há cerca de ${buracos} mês(es) civil(is) sem anexo entre o primeiro e o último registo — preencha só se quiser gráficos contínuos ou histórico completo.`
      : "";
  return {
    id: "insight-serie",
    text: `Série na base: ${labelFirst} a ${labelLast} (${nComp} competência(s) com documento). O app funde folha mensal e folha especial no mesmo mês; rubricas iguais em PDFs distintos não duplicam por engano.${textoBuraco} Manutenção familiar (pensão) e Amazon Prev são tratados em regras separadas em Análise IA.`,
    brief: `Série ${labelFirst}–${labelLast} · ${nComp} competência(s) · mensal + especial fundidos · pensão ≠ Amazon Prev.`,
    href: "/dashboard/analise",
  };
}

export function DashboardInfoTickerFooter() {
  const [open, setOpen] = useState(false);
  const [panoramaHidden, setPanoramaHidden] = useState(false);
  const [panoramaAutoCollapsed, setPanoramaAutoCollapsed] = useState(false);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [dataRefreshTick, setDataRefreshTick] = useState(0);
  /** Destaque temporário após gravar anexo / import / lançamento. */
  const [assistenteFlash, setAssistenteFlash] = useState<string | null>(null);
  const assistenteFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPanoramaHidden(window.localStorage.getItem(PANORAMA_HIDDEN_KEY) === "1");
    const id = setTimeout(() => setPanoramaAutoCollapsed(true), 12_000);
    return () => clearTimeout(id);
  }, []);

  const loadTickerData = useCallback(async () => {
    try {
      const supabase = createClient();
      const [{ data: ps }, { data: ls }] = await Promise.all([
        supabase.from("payslips").select("*"),
        supabase.from("loans").select("*"),
      ]);
      setPayslips((ps as Payslip[]) ?? []);
      setLoans((ls as Loan[]) ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void loadTickerData();
  }, [loadTickerData, dataRefreshTick]);

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

  useEffect(() => {
    const onDocSync = (e: Event) => {
      const detail = (e as CustomEvent<DashboardDataUpdatedDetail>).detail;
      const t = textoAssistenteDoEvento(detail ?? {});
      if (!t) return;
      if (assistenteFlashTimerRef.current) clearTimeout(assistenteFlashTimerRef.current);
      setAssistenteFlash(t);
      assistenteFlashTimerRef.current = setTimeout(() => {
        setAssistenteFlash(null);
        assistenteFlashTimerRef.current = null;
      }, 3 * 60_000);
    };
    window.addEventListener(DASHBOARD_DATA_UPDATED, onDocSync);
    return () => {
      window.removeEventListener(DASHBOARD_DATA_UPDATED, onDocSync);
      if (assistenteFlashTimerRef.current) clearTimeout(assistenteFlashTimerRef.current);
    };
  }, []);

  const { activeLoansCount, seriePainel } = useMemo(() => {
    const activeLoansCount = loans.filter((l) => l.status === "ativo").length;
    if (payslips.length === 0) {
      return { activeLoansCount, seriePainel: null };
    }
    const ord = competenciasOrdenadasNaBase(payslips);
    const first = ord[0];
    const last = ord.length ? ord[ord.length - 1] : undefined;
    const nComp = ord.length;
    const span =
      first && last ? mesesCivisEntreInclusive(first.year, first.month, last.year, last.month) : 0;
    const buracos = Math.max(0, span - nComp);
    const labelFirst = first ? `${MONTH_SHORT[first.month - 1]}/${String(first.year).slice(-2)}` : "";
    const labelLast = last ? `${MONTH_SHORT[last.month - 1]}/${String(last.year).slice(-2)}` : "";
    return {
      activeLoansCount,
      seriePainel: first && last ? { labelFirst, labelLast, nComp, buracos, span } : null,
    };
  }, [payslips, loans]);

  const tickerItems = useMemo(() => {
    const extra: Headline[] = [];

    if (assistenteFlash) {
      extra.push({
        id: "assistente-flash",
        text: assistenteFlash,
        href: "/dashboard/analise",
      });
    }

    const snap = buildAssistenteSnapshotHeadline(payslips);
    if (snap) extra.push(snap);

    const serie = buildSerieGravadaHeadline(payslips);
    if (serie) extra.push(serie);

    if (activeLoansCount > 0) {
      extra.push({
        id: "pend-cadastro",
        text: `Há ${activeLoansCount} empréstimo(s) ativo(s) no cadastro — confira parcelas e valores no último PDF da folha antes de decidir só pelo app.`,
        brief: `${activeLoansCount} empréstimo(s) ativo(s) cadastrado(s) · confira com o PDF da folha.`,
        href: "/dashboard/contracheque",
      });
    }

    return [...extra, ...OPPORTUNITY_HEADLINES, ...BANK_HEADLINES];
  }, [assistenteFlash, activeLoansCount, payslips]);

  const hero = useMemo(() => deriveHeroPayload(tickerItems, loadError), [tickerItems, loadError]);
  const clock = useBrClockTick();
  const showPanoramaStrip = !panoramaHidden && !panoramaAutoCollapsed;

  const ocultarPanorama = () => {
    setPanoramaHidden(true);
    window.localStorage.setItem(PANORAMA_HIDDEN_KEY, "1");
  };

  const mostrarPanorama = () => {
    setPanoramaHidden(false);
    setPanoramaAutoCollapsed(false);
    window.localStorage.removeItem(PANORAMA_HIDDEN_KEY);
  };

  const renderMarqueeItem = (h: Headline, loopSuffix: number) => {
    const opp = headlineIsOpportunity(h);
    const label = displayLine(h, 220);
    const linkCls = cn(
      "font-medium tracking-normal text-[#CBD5E1] underline-offset-2 hover:text-white hover:underline",
      opp && "text-amber-200/95 hover:text-amber-100",
    );
    const body = h.href ? (
      <Link href={h.href} className={linkCls} title={h.text}>
        {label}
      </Link>
    ) : (
      <span className={cn("font-medium tracking-normal text-[#CBD5E1]", opp && "text-amber-200/95")}>
        {label}
      </span>
    );
    return (
      <span key={`${h.id}-${loopSuffix}`} className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-[10px] text-[#64748B] md:text-[11px]" aria-hidden>
          ▸
        </span>
        {body}
      </span>
    );
  };

  const marqueeBody = !loadError ? (
    <>
      {tickerItems.map((h) => renderMarqueeItem(h, 0))}
      {tickerItems.map((h) => renderMarqueeItem(h, 1))}
    </>
  ) : (
    <span className="text-[#94A3B8]">Erro ao carregar o resumo — abra Contracheque.</span>
  );

  return (
    <footer
      className={cn(
        "fixed inset-x-0 bottom-[4.5rem] z-40 md:bottom-0 md:left-64 flex w-full flex-col",
        "shadow-[0_-16px_48px_rgba(0,0,0,.22)] ring-1 ring-black/40 dark:shadow-[0_-20px_64px_rgba(0,0,0,.5)] dark:ring-white/[0.05]",
      )}
      aria-label="Linha de monitoramento, conformidade e insights para análise"
    >
      {open && (
        <div
          id="dashboard-info-expanded"
          className="border-t border-slate-700/80 bg-slate-900/95 px-5 py-6 md:px-8 md:py-8 space-y-6 text-base md:text-lg leading-relaxed max-h-[min(65vh,32rem)] overflow-y-auto overscroll-contain dark:bg-slate-950/95"
        >
          <div className="flex items-start gap-4 text-amber-50 bg-amber-950/40 border border-amber-600/50 rounded-xl px-5 py-4 text-base md:text-lg">
            <Newspaper className="h-7 w-7 shrink-0 mt-0.5 text-amber-300" aria-hidden />
            <p>
              Conteúdo <strong>informativo</strong> sobre folha, banco e direitos típicos do consumidor. Não substitui
              advogado, Defensoria ou órgão regulador — valide sempre com especialista antes de iniciar reclamações ou aceitar novos contratos.
            </p>
          </div>

          <div className="rounded-xl border-2 border-amber-500/55 bg-gradient-to-br from-amber-950/50 to-slate-950/70 p-5 md:p-6 space-y-4 shadow-lg shadow-amber-950/30">
            <div className="flex flex-wrap items-center gap-3 text-xl md:text-2xl font-black text-white">
              <Scale className="h-8 w-8 text-amber-400 shrink-0" aria-hidden />
              Oportunidade — defesa e redução de dívidas
            </div>
            <p className="text-amber-100/95 font-medium text-[0.98rem] md:text-lg leading-relaxed border-l-4 border-amber-500 pl-4">
              Ações bem fundamentadas contra <strong>juros abusivos</strong>, <strong>tarifas e cláusulas vedadas</strong>,{" "}
              <strong>venda casada</strong> ou situações de <strong>superendividamento</strong> podem, quando procedentes,
              resultar em <strong>parcelas menores</strong>, <strong>antecipação com desconto</strong>, <strong>quitações
              revisadas</strong> ou nova base de negociação — use o app para manter prova numérica (extratos, contracheques,
              histórico de descontos) e cruzar com o contrato.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <ul className="list-disc list-outside ml-5 space-y-2.5 text-slate-100 marker:text-amber-400 text-[0.98rem] md:text-lg">
                <li>
                  <strong>Juros excessivos ou capitalização ilegal:</strong> documente cada competência na folha; compare com CET e cláusula do pacto antes de reclamar formalmente.
                </li>
                <li>
                  <strong>Venda casada:</strong> anote o que foi oferecido “em pacote” com o crédito e se havia opção real de recusar sem perder taxa pré-aprovada.
                </li>
                <li>
                  <strong>Superendividamento:</strong> reúna todas as dívidas (folha + fora da folha) para ver percentual sobre renda ao buscar reorganização oficial ou extrajudicial.
                </li>
              </ul>
              <ul className="list-disc list-outside ml-5 space-y-2.5 text-slate-100 marker:text-amber-400 text-[0.98rem] md:text-lg">
                <li>
                  <strong>Ganhar passa também por menos despesa fictícia:</strong> erro de rubrica cortado na revisão volta como folga na folha mesmo antes de novo empréstimo.
                </li>
                <li>
                  <strong>Canais úteis (genérico):</strong> atendimento do banco, Procon estadual/ municipal, BACEN reclamações, consumidor.gov — cada um pede dados objetivos que este painel ajuda a montar.
                </li>
                <li>
                  <strong>Registrar no app:</strong>{" "}
                  <Link href="/dashboard/import" className="text-blue-400 font-bold underline hover:text-blue-300">
                    extratos
                  </Link>
                  ,{" "}
                  <Link href="/dashboard/contracheque" className="text-blue-400 font-bold underline hover:text-blue-300">
                    contracheques
                  </Link>{" "}
                  e{" "}
                  <Link href="/dashboard/transactions" className="text-blue-400 font-bold underline hover:text-blue-300">
                    lançamentos e anotações
                  </Link>{" "}
                  de eventos (ligação, protocolo, proposta de quitação).
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border-2 border-amber-800/60 bg-black/35 p-5 md:p-6 space-y-4">
            <div className="flex items-center gap-3 text-xl md:text-2xl font-black text-white">
              <Landmark className="h-8 w-8 text-red-400" aria-hidden />
              Situação na sua conta (automático)
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-600/70 bg-slate-950/60 p-4 space-y-2">
                <p className="text-lg md:text-xl font-bold text-white">Série gravada na base</p>
                {seriePainel ? (
                  <>
                    <p className="text-emerald-300 font-semibold text-lg md:text-xl tabular-nums">
                      {seriePainel.labelFirst} → {seriePainel.labelLast}
                    </p>
                    <p className="text-slate-200 font-medium">
                      <strong>{seriePainel.nComp}</strong> competência(s) distinta(s) com documento (uma por mês, já fundindo mensal + especial).
                    </p>
                    {seriePainel.buracos >= 4 ? (
                      <p className="text-amber-200/95 text-base leading-snug">
                        Entre o primeiro e o último mês há cerca de <strong>{seriePainel.buracos}</strong> mês(es) civil(is)
                        sem anexo — só importa se quiser uma linha do tempo contínua; histórico esparsa continua válido para análise.
                      </p>
                    ) : null}
                    <p className="text-slate-400 text-[0.95rem] leading-snug">
                      <strong>Manutenção familiar</strong> (várias rubricas) e <strong>Amazon Prev</strong> seguem regras diferentes: veja os cartões em{" "}
                      <Link href="/dashboard/analise" className="text-blue-400 font-bold underline hover:text-blue-300">
                        Análise IA
                      </Link>
                      .
                    </p>
                    <Link
                      href="/dashboard/contracheque"
                      className="inline-block mt-2 text-blue-400 font-bold text-lg underline hover:text-blue-300"
                    >
                      Anexar ou revisar contracheques
                    </Link>
                  </>
                ) : (
                  <p className="text-slate-300 font-medium">
                    Nenhum contracheque encontrado na base — comece pela aba Contracheque (análise mensal ou ficha).
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-slate-600/70 bg-slate-950/60 p-4 space-y-2">
                <p className="text-lg md:text-xl font-bold text-white">Cadastro manual de empréstimos (ativos)</p>
                {activeLoansCount > 0 ? (
                  <>
                    <p className="text-amber-200 font-bold text-lg md:text-xl">
                      {activeLoansCount} contrato(s) ativo(s) — pendente conferir contra o PDF atual da folha.
                    </p>
                    <Link href="/dashboard/contracheque" className="inline-block text-blue-400 font-bold text-lg underline hover:text-blue-300">
                      Comparar parcelas na folha
                    </Link>
                  </>
                ) : (
                  <p className="text-slate-300 font-medium">
                    Sem empréstimos manuais ativos cadastrados. Rubricas bancárias podem estar só nos contracheques importados — veja{" "}
                    <strong>Empréstimos</strong> para leitura automática da folha.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-5 space-y-4">
              <p className="font-black text-xl text-white">Possíveis ganhos no âmbito bancário</p>
              <ul className="list-disc list-outside ml-6 space-y-3 text-slate-200 marker:text-red-400">
                <li>Portabilidade e renegociação com CET menor podem liberar caixa quando o novo fluxo sai melhor que o atual.</li>
                <li>Quitações parciais com desconto real em juros (conferindo extrato oficial) cortam anos de financiamento.</li>
                <li>Centralizar dados no app evita gravar dois contratos parecidos e superestimar o que já foi abatido na folha.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-5 space-y-4">
              <p className="font-black text-xl text-white">Análise minuciosa ao anexar contratos / PDF</p>
              <ul className="list-disc list-outside ml-6 space-y-3 text-slate-200 marker:text-red-400">
                <li>Valide totais oficiais (TOTAL DE GANHOS, DESCONTOS, LÍQUIDO) antes de salvar o mês.</li>
                <li>
                  <strong>Parcelas de consignado (ex. 01/48):</strong> muitos contracheques trazem após o nome do
                  contrato quantas prestações já foram descontadas e o total do plano — essencial para saber quanto falta
                  e para o app cruzar o mesmo empréstimo mês a mês (a chave ignora só o contador N/M).
                </li>
                <li>Compare cada rubrica de consignado com cláusula de parcela, taxa e banco contratante no contrato físico/digital.</li>
                <li>Para OCR (escaneados), cheque se código e texto da rubrica batem entre meses vizinhos evitando ruptura nas séries dos gráficos.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/25 p-5 space-y-3 sm:col-span-2 lg:col-span-1">
              <p className="font-black text-xl text-white">Incluir dados agora → análises melhores</p>
              <ul className="space-y-3 text-lg font-semibold">
                <li>
                  →{" "}
                  <Link href="/dashboard/contracheque" className="text-emerald-400 underline hover:text-emerald-300">
                    Contracheque
                  </Link>
                  {" · "}
                  PDF do mês
                </li>
                <li>
                  →{" "}
                  <Link href="/dashboard/import" className="text-blue-400 underline hover:text-blue-300">
                    Extrato
                  </Link>
                  {" + "}
                  <Link href="/dashboard/nota-fiscal" className="text-blue-400 underline hover:text-blue-300">
                    NF
                  </Link>
                </li>
                <li>
                  →{" "}
                  <Link href="/dashboard/analise" className="text-violet-400 underline hover:text-violet-300">
                    Análise IA
                  </Link>{" "}
                  sobre o período fechado
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <AuditoriaTimelineBar
        clock={clock}
        ticker={marqueeBody}
        expanded={open}
        onToggleExpanded={() => setOpen((v) => !v)}
        expandLabelClosed="Mais"
        expandLabelOpen="Fechar"
        topStrip={
          showPanoramaStrip ? (
            <div className="relative pr-10">
              <AuditoriaInsightBanner
                layout="footer"
                titulo={hero.title}
                subtitulo={hero.subtitle}
                href={hero.href}
                statusLabel={hero.statusLabel}
                statusTone={hero.statusTone}
                verDetalhesLabel="Ver detalhes"
              />
              <button
                type="button"
                className="absolute right-0 top-0 rounded-md border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 hover:bg-white/[0.08] hover:text-white"
                onClick={ocultarPanorama}
                title="Ocultar panorama"
                aria-label="Ocultar panorama"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#0F1724]/80 px-3 py-1 text-[11px] text-slate-400">
              <span>Panorama recolhido</span>
              <button
                type="button"
                className="font-semibold text-sky-300 underline-offset-2 hover:text-sky-200 hover:underline"
                onClick={mostrarPanorama}
              >
                Mostrar panorama
              </button>
            </div>
          )
        }
        endBadge={
          <>
            <span className="text-[9px] font-semibold uppercase leading-tight text-[#94A3B8] md:text-[10px]">Auditoria</span>
            <span className="text-sm font-bold leading-none tracking-wide text-[#E5E7EB] md:text-base">360°</span>
          </>
        }
      />
    </footer>
  );
}
