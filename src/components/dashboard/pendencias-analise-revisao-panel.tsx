"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContratoEmprestimoAnalise } from "@/lib/anexos/emprestimos-analise-from-payslips";
import {
  type PendenciaAnaliseEnriquecida,
  type PendenciaRevisaoStatus,
  type PendenciaTipoUi,
  calcularResumoPainelGuiada,
  calcularResumoRevisao,
  carregarRevisaoPendenciasLocal,
  chaveOrdenacaoGuiada,
  compararPendenciasGuiada,
  enriquecerPendenciasAnalise,
  encontrarContratoPorLabel,
  formatarPeriodoContrato,
  LABEL_IMPACTO_PENDENCIA,
  LABEL_TIPO_PENDENCIA,
  montarSnapshotRevisaoParaDashboard,
  pendenciaConfirmadaParaResumo,
  pendenciaStatusEmAbertoParaSync,
  salvarRevisaoPendenciasLocal,
  situacaoContratoNaBase,
} from "@/lib/anexos/pendencias-analise-ui";
import { emitPendenciasAnaliseRevisaoAtualizada } from "@/lib/dashboard-data-events";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronRight, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FiltroPendencias =
  | "todas"
  | "revisar_agora"
  | "alta_prioridade"
  | "duplicidade"
  | "refinanciamento"
  | "ocr"
  | "resolvidas";

const FILTROS: { id: FiltroPendencias; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "revisar_agora", label: "Revisar agora" },
  { id: "alta_prioridade", label: "Alta prioridade" },
  { id: "duplicidade", label: "Duplicidade" },
  { id: "refinanciamento", label: "Refinanciamento" },
  { id: "ocr", label: "OCR" },
  { id: "resolvidas", label: "Resolvidas" },
];

const MAX_OBS = 140;

function labelConfianca(c: "alta" | "media" | "baixa"): string {
  if (c === "alta") return "Alta";
  if (c === "media") return "Média";
  return "Baixa";
}

function statusAberto(st: PendenciaRevisaoStatus | undefined): boolean {
  return st !== "resolvido" && st !== "ignorado";
}

function labelTriagem(st: PendenciaRevisaoStatus | undefined): string {
  if (!st) return "Em aberto";
  const map: Record<PendenciaRevisaoStatus, string> = {
    confirmado: "Problema confirmado",
    problema_confirmado: "Problema confirmado",
    marcado_ocr: "Marcado como OCR",
    contrato_diferente: "Contrato diferente",
    mesmo_contrato: "Mesmo contrato",
    eh_refinanciamento: "É refinanciamento",
    ignorado: "Ignorada",
    resolvido: "Resolvida",
    revisao_pendente: "Precisa revisar",
  };
  return map[st] ?? st;
}

function filtroRevisarAgora(
  it: PendenciaAnaliseEnriquecida,
  st: PendenciaRevisaoStatus | undefined,
): boolean {
  if (!statusAberto(st)) return false;
  return (
    it.impacto === "alto" ||
    it.tipo === "duplicidade" ||
    it.tipo === "possivel_refinanciamento" ||
    it.tipo === "ocr" ||
    it.guiadaParcelaForaSequencia ||
    st === "revisao_pendente" ||
    pendenciaConfirmadaParaResumo(st)
  );
}

function itemPassaFiltro(
  it: PendenciaAnaliseEnriquecida,
  filtro: FiltroPendencias,
  st: PendenciaRevisaoStatus | undefined,
): boolean {
  if (filtro === "todas") return true;
  if (filtro === "revisar_agora") return filtroRevisarAgora(it, st);
  if (filtro === "alta_prioridade") return statusAberto(st) && it.impacto === "alto";
  if (filtro === "duplicidade") return statusAberto(st) && it.tipo === "duplicidade";
  if (filtro === "refinanciamento") return statusAberto(st) && it.tipo === "possivel_refinanciamento";
  if (filtro === "ocr") return statusAberto(st) && (it.tipo === "ocr" || st === "marcado_ocr");
  if (filtro === "resolvidas") return st === "resolvido";
  return true;
}

type Props = {
  pendencias: string[];
  contratos: ContratoEmprestimoAnalise[];
  ultimaCompetencia: { year: number; month: number } | null;
  /** Layout neutro para etapa «Pendências» da auditoria. */
  variant?: "default" | "auditoria";
};

export function PendenciasAnaliseRevisaoPanel({
  pendencias,
  contratos,
  ultimaCompetencia,
  variant = "default",
}: Props) {
  const items = useMemo(() => enriquecerPendenciasAnalise(pendencias, contratos), [pendencias, contratos]);

  const [byId, setById] = useState<Record<string, PendenciaRevisaoStatus>>({});
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [filtro, setFiltro] = useState<FiltroPendencias>("revisar_agora");
  const [modoGuiado, setModoGuiado] = useState(true);

  useEffect(() => {
    const store = carregarRevisaoPendenciasLocal();
    setById(store.byId);
    setObservacoes(store.observacoes ?? {});
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const allowed = new Set(items.map((i) => i.id));
    setById((prev) => {
      const next: Record<string, PendenciaRevisaoStatus> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (allowed.has(k)) next[k] = v;
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && prevKeys.every((k) => prev[k] === next[k])) return prev;
      return next;
    });
    setObservacoes((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (allowed.has(k)) next[k] = v;
      }
      return next;
    });
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    salvarRevisaoPendenciasLocal({ version: 2, byId, observacoes });
  }, [byId, observacoes, hydrated]);

  const resumo = useMemo(() => calcularResumoRevisao(items, byId), [items, byId]);
  const resumoGuiada = useMemo(() => calcularResumoPainelGuiada(items, byId), [items, byId]);

  useEffect(() => {
    if (!hydrated) return;
    emitPendenciasAnaliseRevisaoAtualizada(montarSnapshotRevisaoParaDashboard(items, byId));
  }, [items, byId, hydrated]);

  const aplicarStatus = useCallback((id: string, status: PendenciaRevisaoStatus) => {
    setById((prev) => ({ ...prev, [id]: status }));
  }, []);

  const setObservacao = useCallback((id: string, texto: string) => {
    const t = texto.slice(0, MAX_OBS);
    setObservacoes((prev) => {
      const next = { ...prev };
      if (!t.trim()) delete next[id];
      else next[id] = t;
      return next;
    });
  }, []);

  const grupos = useMemo(() => {
    const m = new Map<string, PendenciaAnaliseEnriquecida[]>();
    for (const it of items) {
      if (!m.has(it.grupoLabel)) m.set(it.grupoLabel, []);
      m.get(it.grupoLabel)!.push(it);
    }
    return [...m.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base", numeric: true }),
    );
  }, [items]);

  const gruposFiltradosOrdenados = useMemo(() => {
    const blocos = grupos
      .map(([label, arr]) => {
        const vis = arr.filter((it) => itemPassaFiltro(it, filtro, byId[it.id]));
        let visOrd = vis;
        if (modoGuiado) {
          visOrd = [...vis].sort((a, b) => compararPendenciasGuiada(a, b, contratos, ultimaCompetencia));
        }
        const minK = visOrd[0] ? chaveOrdenacaoGuiada(visOrd[0]!, contratos, ultimaCompetencia) : [9, 9, 9, 9, 9, 9];
        return { label, todos: arr, visiveis: visOrd, minKey: minK as number[] };
      })
      .filter((g) => g.visiveis.length > 0);

    if (modoGuiado) {
      blocos.sort((a, b) => {
        for (let i = 0; i < 6; i++) {
          if (a.minKey[i] !== b.minKey[i]) return (a.minKey[i] ?? 0) - (b.minKey[i] ?? 0);
        }
        return a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base", numeric: true });
      });
    }
    return blocos;
  }, [grupos, filtro, byId, modoGuiado, contratos, ultimaCompetencia]);

  if (items.length === 0) return null;

  const isAud = variant === "auditoria";
  const shell = isAud
    ? "rounded-2xl border border-black/[0.06] bg-white/90 p-3 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[#0F1724]/95 sm:p-4"
    : "rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 sm:p-4";
  const titleCls = isAud
    ? "text-sm font-semibold text-foreground"
    : "text-sm font-semibold text-amber-900 dark:text-amber-100";
  const subCls = isAud
    ? "text-[10px] text-muted-foreground flex items-center gap-1"
    : "text-[10px] text-amber-800/80 dark:text-amber-200/80 flex items-center gap-1";

  return (
    <div className={shell}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className={`h-4 w-4 shrink-0 rotate-0 ${isAud ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`} />
          <div className="min-w-0">
            <p className={titleCls}>Triagem de pendências</p>
            <p className={subCls}>
              <ListOrdered className="h-3 w-3 shrink-0" />
              Prioridade e contrato; ações não alteram dados brutos
            </p>
          </div>
        </div>
        <label
          className={cn(
            "flex items-center gap-1.5 text-[10px] shrink-0 cursor-pointer select-none",
            isAud ? "text-muted-foreground" : "text-amber-900 dark:text-amber-100",
          )}
        >
          <input
            type="checkbox"
            className={cn("rounded", isAud ? "border-input" : "border-amber-500")}
            checked={modoGuiado}
            onChange={(e) => setModoGuiado(e.target.checked)}
          />
          Modo guiado
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-[10px] sm:text-[11px]">
        <div
          className={cn(
            "rounded-lg border px-2 py-1.5 bg-background/80",
            isAud ? "border-border/80" : "border-amber-300/60 dark:border-amber-800/50 bg-white/50 dark:bg-slate-900/40",
          )}
        >
          <p className="font-bold tabular-nums text-red-800 dark:text-red-200 text-sm">{resumoGuiada.criticasAbertas}</p>
          <p className={cn("leading-tight", isAud ? "text-muted-foreground" : "text-amber-900/80 dark:text-amber-200/80")}>
            Críticas abertas
          </p>
        </div>
        <div
          className={cn(
            "rounded-lg border px-2 py-1.5 bg-background/80",
            isAud ? "border-border/80" : "border-amber-300/60 dark:border-amber-800/50 bg-white/50 dark:bg-slate-900/40",
          )}
        >
          <p className="font-bold tabular-nums text-emerald-800 dark:text-emerald-200 text-sm">{resumoGuiada.resolvidas}</p>
          <p className={cn("leading-tight", isAud ? "text-muted-foreground" : "text-amber-900/80 dark:text-amber-200/80")}>
            Resolvidas
          </p>
        </div>
        <div
          className={cn(
            "rounded-lg border px-2 py-1.5 bg-background/80",
            isAud ? "border-border/80" : "border-amber-300/60 dark:border-amber-800/50 bg-white/50 dark:bg-slate-900/40",
          )}
        >
          <p className="font-bold tabular-nums text-sm text-foreground">{resumoGuiada.contratosPrecisamDocumento}</p>
          <p className={cn("leading-tight", isAud ? "text-muted-foreground" : "text-amber-900/80 dark:text-amber-200/80")}>
            Contratos → documento
          </p>
        </div>
        <div
          className={cn(
            "rounded-lg border px-2 py-1.5 bg-background/80",
            isAud ? "border-border/80" : "border-amber-300/60 dark:border-amber-800/50 bg-white/50 dark:bg-slate-900/40",
          )}
        >
          <p className="font-bold tabular-nums text-sm text-foreground">{resumoGuiada.contratosValidacaoManual}</p>
          <p className={cn("leading-tight", isAud ? "text-muted-foreground" : "text-amber-900/80 dark:text-amber-200/80")}>
            Validação manual
          </p>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-wrap gap-x-3 gap-y-1 text-[10px] sm:text-[11px] mb-3 border-b pb-2",
          isAud ? "text-muted-foreground border-border/70" : "text-amber-950/85 dark:text-amber-100/85 border-amber-200/60 dark:border-amber-800/40",
        )}
      >
        <span>
          <strong className="font-semibold">{resumo.total}</strong> total
        </span>
        <span>
          <strong className={cn("font-semibold", !isAud && "text-amber-800 dark:text-amber-200")}>{resumo.abertas}</strong>{" "}
          em aberto
        </span>
        <span>
          <strong className="font-semibold">{resumo.confirmadas}</strong> confirm.
        </span>
        <span>
          <strong className="font-semibold">{resumo.resolvidas}</strong> resolv.
        </span>
        <span>
          <strong className="font-semibold">{resumo.ignoradas}</strong> ignor.
        </span>
        <span>
          <strong className="font-semibold">{resumo.revisaoPendente}</strong> revisar
        </span>
        <span>
          <strong className="font-semibold">{resumo.contratosAfetados}</strong> contratos
        </span>
        <span>
          <strong className="font-semibold text-red-800/90 dark:text-red-200/90">{resumo.altoImpactoAbertas}</strong> alto
          impacto
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium border transition-colors",
              filtro === f.id
                ? isAud
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-amber-600 text-white border-amber-600 dark:bg-amber-500 dark:border-amber-500 dark:text-amber-950"
                : isAud
                  ? "bg-background border-border text-foreground hover:bg-muted/60"
                  : "bg-white/70 dark:bg-slate-900/50 border-amber-300/70 dark:border-amber-800/60 text-amber-950 dark:text-amber-100 hover:bg-amber-100/80 dark:hover:bg-amber-950/40",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {gruposFiltradosOrdenados.length === 0 ? (
        <p className={cn("text-xs py-2", isAud ? "text-muted-foreground" : "text-amber-900/80 dark:text-amber-200/80")}>
          Nenhuma pendência neste filtro.
        </p>
      ) : (
        <div className="max-h-[min(420px,50vh)] overflow-y-auto pr-1 space-y-2">
          {gruposFiltradosOrdenados.map(({ label, todos, visiveis }) => {
            const c = label !== "Geral" ? encontrarContratoPorLabel(label, contratos) : null;
            const periodo = c ? formatarPeriodoContrato(c) : null;
            const situacao = c ? situacaoContratoNaBase(c, ultimaCompetencia) : null;
            const nAlertas = visiveis.length;

            return (
              <details
                key={label}
                className={cn(
                  "group rounded-lg border overflow-hidden bg-background/60",
                  isAud ? "border-border/80" : "border-amber-200/80 dark:border-amber-800/50 bg-white/60 dark:bg-slate-900/35",
                )}
              >
                <summary className="cursor-pointer list-none flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-2 text-left [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90",
                      isAud ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300",
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-semibold min-w-0 flex-1",
                      isAud ? "text-foreground" : "text-amber-950 dark:text-amber-50",
                    )}
                  >
                    {label}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium rounded px-1.5 py-px",
                      isAud ? "bg-muted text-foreground" : "bg-amber-600/15 dark:bg-amber-400/15 text-amber-900 dark:text-amber-100",
                    )}
                  >
                    {nAlertas} alerta{nAlertas !== 1 ? "s" : ""}
                  </span>
                  {c ? (
                    <span className={cn("text-[10px]", isAud ? "text-muted-foreground" : "text-amber-800/90 dark:text-amber-200/90")}>
                      Conf.: {labelConfianca(c.confianca)}
                    </span>
                  ) : null}
                  {periodo ? (
                    <span
                      className={cn(
                        "text-[10px] hidden sm:inline",
                        isAud ? "text-muted-foreground" : "text-amber-800/80 dark:text-amber-200/80",
                      )}
                    >
                      {periodo}
                    </span>
                  ) : null}
                  {situacao ? (
                    <span
                      className={cn(
                        "text-[10px] rounded px-1 py-px border",
                        isAud ? "border-border" : "border-amber-400/40 dark:border-amber-600/40",
                      )}
                    >
                      {situacao === "ativo" ? "Ativo na base" : "Poss. encerrado"}
                    </span>
                  ) : null}
                </summary>
                <div
                  className={cn(
                    "border-t px-2 py-2 space-y-2",
                    isAud ? "border-border/60 bg-muted/20" : "border-amber-200/50 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-950/15",
                  )}
                >
                  <p className={cn("text-[10px]", isAud ? "text-muted-foreground" : "text-amber-900/70 dark:text-amber-200/70")}>
                    {todos.length} pendência{todos.length !== 1 ? "s" : ""} neste grupo
                    {filtro !== "todas" ? ` · ${nAlertas} no filtro` : ""}
                    {modoGuiado ? " · ordenação: impacto → ativo → dup. → refin. → sequência → OCR" : ""}.
                  </p>
                  {visiveis.map((it) => {
                    const st = byId[it.id];
                    const tooltipCorpo = [it.descricaoLinha, it.detalheImpacto].filter(Boolean).join(" — ") || it.raw;
                    const obs = observacoes[it.id] ?? "";
                    return (
                      <div
                        key={it.id}
                        className={cn(
                          "rounded-md border p-2 space-y-1.5",
                          isAud
                            ? "border-border/70 bg-background"
                            : "border-amber-200/60 dark:border-amber-800/35 bg-white/80 dark:bg-slate-900/50",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={cn(
                              "text-[10px] font-semibold rounded px-1 py-px",
                              it.impacto === "alto" && "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200",
                              it.impacto === "medio" &&
                                "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
                              it.impacto === "baixo" &&
                                "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
                            )}
                          >
                            {LABEL_IMPACTO_PENDENCIA[it.impacto]}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] rounded border px-1 py-px",
                              isAud
                                ? "border-border text-muted-foreground"
                                : "border-amber-400/35 dark:border-amber-600/35 text-amber-900 dark:text-amber-100",
                            )}
                          >
                            {LABEL_TIPO_PENDENCIA[it.tipo as PendenciaTipoUi]}
                          </span>
                          <span className="text-[10px] rounded bg-emerald-100/80 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 px-1 py-px">
                            {labelTriagem(st)}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "text-[11px] leading-snug line-clamp-2",
                            isAud ? "text-foreground" : "text-amber-950 dark:text-amber-50",
                          )}
                          title={tooltipCorpo.length > 120 ? tooltipCorpo : undefined}
                        >
                          {it.descricaoLinha}
                        </p>
                        {it.detalheImpacto ? (
                          <p
                            className={cn(
                              "text-[10px] line-clamp-2 cursor-help",
                              isAud ? "text-muted-foreground" : "text-amber-900/75 dark:text-amber-200/75",
                            )}
                            title={it.raw}
                          >
                            {it.detalheImpacto}
                          </p>
                        ) : null}
                        <div className="space-y-0.5">
                          <label className={cn("text-[10px]", isAud ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300")}>
                            Observação curta
                          </label>
                          <Input
                            value={obs}
                            maxLength={MAX_OBS}
                            placeholder="Nota para esta pendência…"
                            className="h-8 text-[11px] bg-white dark:bg-slate-950"
                            onChange={(e) => setObservacao(it.id, e.target.value)}
                          />
                          <p className={cn("text-[9px] text-right tabular-nums", isAud ? "text-muted-foreground" : "text-amber-800/70")}>
                            {obs.length}/{MAX_OBS}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {isAud ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant={st === "resolvido" ? "default" : "outline"}
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "resolvido")}
                              >
                                Resolver
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "ignorado")}
                              >
                                Ignorar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={st === "marcado_ocr" ? "secondary" : "outline"}
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "marcado_ocr")}
                              >
                                Marcar OCR
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={pendenciaConfirmadaParaResumo(st) ? "default" : "outline"}
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "problema_confirmado")}
                              >
                                Confirmar problema
                              </Button>
                              <details className="w-full min-w-0">
                                <summary className="cursor-pointer text-[10px] text-primary font-medium py-1 select-none">
                                  Mais ações de classificação
                                </summary>
                                <div className="flex flex-wrap gap-1 pt-1 border-t border-border/50 mt-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={st === "contrato_diferente" ? "secondary" : "outline"}
                                    className="h-7 text-[10px] px-2"
                                    onClick={() => aplicarStatus(it.id, "contrato_diferente")}
                                  >
                                    Contrato diferente
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={st === "mesmo_contrato" ? "secondary" : "outline"}
                                    className="h-7 text-[10px] px-2"
                                    onClick={() => aplicarStatus(it.id, "mesmo_contrato")}
                                  >
                                    Mesmo contrato
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={st === "eh_refinanciamento" ? "secondary" : "outline"}
                                    className="h-7 text-[10px] px-2"
                                    onClick={() => aplicarStatus(it.id, "eh_refinanciamento")}
                                  >
                                    Refinanciamento
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={st === "revisao_pendente" ? "secondary" : "outline"}
                                    className="h-7 text-[10px] px-2"
                                    onClick={() => aplicarStatus(it.id, "revisao_pendente")}
                                  >
                                    Precisa revisar
                                  </Button>
                                </div>
                              </details>
                            </>
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant={pendenciaConfirmadaParaResumo(st) ? "default" : "outline"}
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "problema_confirmado")}
                              >
                                Confirmar problema
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={st === "marcado_ocr" ? "secondary" : "outline"}
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "marcado_ocr")}
                              >
                                Marcar como OCR
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={st === "contrato_diferente" ? "secondary" : "outline"}
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "contrato_diferente")}
                              >
                                É contrato diferente
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={st === "mesmo_contrato" ? "secondary" : "outline"}
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "mesmo_contrato")}
                              >
                                É mesmo contrato
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={st === "eh_refinanciamento" ? "secondary" : "outline"}
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "eh_refinanciamento")}
                              >
                                É refinanciamento
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={st === "revisao_pendente" ? "secondary" : "outline"}
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "revisao_pendente")}
                              >
                                Precisa revisar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "ignorado")}
                              >
                                Ignorar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] px-2"
                                onClick={() => aplicarStatus(it.id, "resolvido")}
                              >
                                Resolvido
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
