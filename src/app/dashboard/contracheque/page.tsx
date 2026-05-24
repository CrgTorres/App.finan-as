"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  readContrachequeFichaDocumentText,
  MAX_SCANNED_PDF_OCR_PAGES,
  type ContrachequeReadMetadata,
} from "@/lib/reading/contracheque-ficha-document-text";
import type { ParsedPayslipPayload } from "@/lib/anexos/sead-payslip-parse";
import {
  parseFichaFinanceiraMeses,
  isFichaFinanceiraTexto,
  type FichaMesExtraido,
} from "@/lib/anexos/sead-ficha-parse";
import { inferirParcelasPorVizinhancaMeses } from "@/lib/anexos/parcela-vizinhanca";
import { descricaoOrigemCompetencia, type CompetenciaSugestao } from "@/lib/anexos/competencia";
import { upsertSalaryTransactionFromPayslip } from "@/lib/anexos/sync-salary-from-payslip";
import { DASHBOARD_DATA_UPDATED, emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import {
  camposCartaoSaqueParaGravarPayslip,
  camposCartaoSaqueLocalParaGravar,
  historicoRubricaDePayslips,
} from "@/lib/contracheque/campos-cartao-saque-ao-gravar-payslip";
import type { PayslipHistoricoRubricaMin } from "@/lib/contracheque/detectar-cartao-saque-em-rubricas-contracheque";
import {
  executarPipelineLeituraAutomaticaContracheque,
  executarPipelineLeituraAutomaticaContrachequeDeTexto,
  finalizarLeituraContrachequeParsed,
} from "@/services/contracheques";
import type { ContrachequeFichaReadProgress } from "@/services/ocr/extrair-texto-documento";
import {
  CartaoSaqueEmbutidoFolhaCard,
  CartaoSaqueEmbutidoPainel,
  CartaoSaqueEmbutidoResumoTopo,
} from "@/components/contracheque/CartaoSaqueEmbutidoPainel";
import { resumoCartaoSaqueEmPayslips } from "@/lib/contracheque/analisar-cartao-saque-em-payslips";
import type {
  AnaliseCartaoSaqueContracheque,
  StatusConferenciaCartaoSaqueEmbutido,
} from "@/types/cartao-saque-embutido";
import { ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE } from "@/types/cartao-saque-embutido";
import type { Payslip, PayslipDocumentKind, PayslipFolhaEmitKind } from "@/types/contracheque";
import {
  compararDescontosComHistorico,
  compararGanhosComHistorico,
  alertaPorIndiceDesconto,
  alertaPorIndiceRubrica,
  historicoDescontosPorChave,
  historicoGanhosPorChave,
  rubricaPareceConsignadoEmprestimo,
} from "@/lib/anexos/payslip-desconto-historico";
import {
  auditarBaseGravadaInconsistente,
  conferirPayslipAntesInsercao,
  normalizarParsedComConferencia,
  type ResultadoConferenciaInsercao,
} from "@/lib/anexos/payslip-conferencia-insercao";
import { formatarParcelaExibicao } from "@/lib/anexos/parcela-consignado";
import { confirmacaoBancoCurado } from "@/lib/reading/instituicoes-financeiras";
import {
  avisosDecimoTerceiroRevisaoContracheque,
  avisosDecimoTerceiroFichaCorrida,
  isFolhaEspecialDecimoTerceiroParcialJunho,
} from "@/lib/anexos/decimo-terceiro-coerencia";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileUp, Loader2, Save, CheckCircle2, Info, LayoutList, FileText, Sparkles,
  AlertTriangle, ScanLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type TabId = "mensal" | "ficha" | "cartao" | "tipos";

const MESES_PT_CURTO = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

/** 1990 … ano civil corrente + 3 (competências futuras raras, ex. 13º). */
function listaAnosCompetenciaParaSelect(): number[] {
  const now = new Date().getFullYear();
  const end = now + 3;
  const n = end - 1990 + 1;
  return Array.from({ length: n }, (_, i) => 1990 + i);
}

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function RubricaComParcelaVisual({ it, descMaxLen }: { it: { description: string; parcelaAtual?: number; parcelaTotal?: number }; descMaxLen?: number }) {
  const desc = descMaxLen != null && descMaxLen > 0 ? it.description.slice(0, descMaxLen) : it.description;
  const par =
    it.parcelaAtual != null && it.parcelaTotal != null
      ? formatarParcelaExibicao(it.parcelaAtual, it.parcelaTotal)
      : null;
  return (
    <div className="min-w-0 max-w-[min(100%,26rem)]">
      <div className="font-medium leading-snug" title={it.description}>
        {desc}
      </div>
      {par ? (
        <div className="mt-0.5 text-[11px] leading-snug tabular-nums text-muted-foreground">
          Parcela {par}
        </div>
      ) : null}
    </div>
  );
}

/** Leitura razoável para OCR: totais coerentes com rubricas ou várias linhas. */
function parsePareceUtil(p: ParsedPayslipPayload): boolean {
  const g = p.grossSalary;
  const n = p.netSalary;
  const d = p.totalDiscounts;
  const nz = p.items.filter((i) => i.value > 0);
  const sumV = nz.filter((i) => i.type === "vantagem").reduce((s, i) => s + i.value, 0);
  const sumD = nz.filter((i) => i.type === "desconto").reduce((s, i) => s + i.value, 0);
  if (sumV > 800 && sumD > 200 && g > 0 && g < sumV * 0.88) {
    return false;
  }
  if (n > 0 && g > 0) {
    const tol = Math.max(120, g * 0.15);
    return Math.abs(g - (d + n)) <= tol || nz.length >= 3;
  }
  return nz.length >= 4 && (g > 0 || n > 0);
}

type AlertaBancoOficial = {
  idx: number;
  rubrica: string;
  codigo?: string;
};

function conferenciaExigeConfirmacaoTotais(conf: ResultadoConferenciaInsercao): boolean {
  return conf.alertas.some(
    (a) =>
      a.severidade === "critico" &&
      (a.categoria === "totais_cabecalho" || a.categoria === "totais_coerencia"),
  );
}

function prepararParsedParaGravar(
  parsed: ParsedPayslipPayload,
  payslipsHistorico: Payslip[],
  month: number,
  year: number,
): { parsed: ParsedPayslipPayload; conferencia: ResultadoConferenciaInsercao } {
  const conferencia = conferirPayslipAntesInsercao(parsed, payslipsHistorico, { mes: month, ano: year });
  return {
    parsed: normalizarParsedComConferencia(parsed, conferencia),
    conferencia,
  };
}

function precisaConfirmacaoManualGravar(
  rev: MensalRevisaoOk,
  conf?: ResultadoConferenciaInsercao | null,
): boolean {
  return (
    !parsePareceUtil(rev.parsed) ||
    Boolean(rev.parsed.leituraPossivelmenteIncompleta && !rev.ocrReforcoRealizado) ||
    Boolean(conf && conferenciaExigeConfirmacaoTotais(conf))
  );
}

function fichaPrecisaConfirmacaoManual(
  row: FichaMesExtraido,
  conf: ResultadoConferenciaInsercao,
): boolean {
  const parsed: ParsedPayslipPayload = {
    grossSalary: row.grossSalary,
    netSalary: row.netSalary,
    totalDiscounts: row.totalDiscounts,
    items: row.items,
    rawText: row.rawText,
    instituicoesDetectadas: row.instituicoesDetectadas,
  };
  return !parsePareceUtil(parsed) || conferenciaExigeConfirmacaoTotais(conf);
}

function supabaseErrText(e: unknown): string {
  if (e == null) return "";
  if (typeof e === "object" && e !== null) {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter((x) => typeof x === "string") as string[];
    return parts.join(" | ");
  }
  return String(e);
}

function omitRowKeys(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const o = { ...row };
  for (const k of keys) delete o[k];
  return o;
}

function payslipPayloadSignature(p: Record<string, unknown>): string {
  return Object.keys(p)
    .sort()
    .join(",");
}

function stripCartaoSaqueCols(row: Record<string, unknown>): Record<string, unknown> {
  const o = { ...row };
  for (const k of Object.keys(o)) {
    if (k.startsWith("cartao_saque_")) delete o[k];
  }
  return o;
}

function isRecoverablePayslipSchemaError(msg: string): boolean {
  return /does not exist|schema cache|could not find|42703|42P01|PGRST204|PGRST/i.test(msg);
}

/** Variantes para BD antiga (sem `document_kind` / `folha_emit_kind` / colunas cartão). */
function buildPayslipPayloadVariants(
  row: Record<string, unknown>,
  opts: { preferMinimalFirst: boolean; omitCartao: boolean },
): Record<string, unknown>[] {
  const bases = [
    row,
    omitRowKeys(row, ["folha_emit_kind"]),
    omitRowKeys(row, ["document_kind"]),
    omitRowKeys(row, ["folha_emit_kind", "document_kind"]),
  ].map((p) => (opts.omitCartao ? stripCartaoSaqueCols(p) : p));

  const ordered = opts.preferMinimalFirst ? [...bases].reverse() : bases;
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const p of ordered) {
    const sig = payslipPayloadSignature(p);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(p);
  }
  return out;
}

function novoIdRevisaoMensal() {
  return globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Um contracheque mensal por ficheiro; pode haver vários em fila antes de gravar. */
type MensalRevisaoOk = {
  id: string;
  fileName: string;
  /** Original em memória para «Re-ler OCR reforçado» (mesma sessão). */
  sourceFile: File;
  parsed: ParsedPayslipPayload;
  metaCompetencia: CompetenciaSugestao;
  periodoEdicao: { month: number; year: number };
  competenciaConfirmada: boolean;
  /** Dois PDFs por competência — não sobrepõe linha principal (BD: `patch_payslips_folha_emit.sql`). */
  emitKind: Extract<PayslipFolhaEmitKind, "mensal_principal" | "folha_especial">;
  /**
   * `false` quando a primeira leitura foi marcada como incompleta — gravar exige releitura OCR reforçada
   * (ou fica bloqueado até o utilizador o fizer; após releitura passa a `true`).
   */
  ocrReforcoRealizado: boolean;
};

type MensalRevisaoErro = {
  id: string;
  fileName: string;
  error: string;
};

type MensalRevisao = MensalRevisaoOk | MensalRevisaoErro;

function isMensalRevisaoOk(r: MensalRevisao): r is MensalRevisaoOk {
  return "parsed" in r;
}

const EMIT_MENSAL_OPTIONS: ReadonlyArray<{
  id: MensalRevisaoOk["emitKind"];
  label: string;
  descr: string;
}> = [
  {
    id: "mensal_principal",
    label: "Mensal (principal)",
    descr: "Folha completa — soldo, descontos, consignados, totais ordinários.",
  },
  {
    id: "folha_especial",
    label: "Folha especial / 13º",
    descr: "2.º PDF no mesmo DATA (ex.: só 13º salário adiantado, sem rubricas ordinárias). Grava linha apartada na base.",
  },
];

function emitMensalLabel(kind: MensalRevisaoOk["emitKind"]): string {
  return EMIT_MENSAL_OPTIONS.find((x) => x.id === kind)?.label ?? kind;
}

/** Máx. por lote (evita bloqueio longo no browser). */
const MAX_CONTRACHEQUES_MENSAL_EM_LOTE = 32;

const ANALISE_CARTAO_SAQUE_VAZIA: AnaliseCartaoSaqueContracheque = {
  versao: 2,
  foco: "rubricas_desconto_contracheque",
  encontrado: false,
  nivel_risco_global: "baixo",
  alerta: null,
  recomendacao: null,
  rubricas: [],
  competencia: { mes: 1, ano: 2000 },
  status: null,
};

async function gravarPayslipNoSupabase(opts: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  parsed: ParsedPayslipPayload;
  month: number;
  year: number;
  fileName: string;
  documentKind: PayslipDocumentKind;
  folhaEmitKind: PayslipFolhaEmitKind;
  syncSalary: boolean;
  /** Em lote («Gravar todos»), false evita dezenas de syncs e recarregamentos. */
  notificarDashboard?: boolean;
  /** Ficha corrida em massa: 1–2 tentativas de gravação, sem fetch de histórico por linha. */
  modoLote?: boolean;
  historicoCartao?: PayslipHistoricoRubricaMin[];
  /** Quando informado, corrige totais do cabeçalho a partir das rubricas antes de gravar. */
  payslipsHistorico?: Payslip[];
}): Promise<string | null> {
  const {
    supabase,
    userId,
    parsed: parsedIn,
    month,
    year,
    fileName,
    documentKind,
    folhaEmitKind,
    syncSalary,
    notificarDashboard = true,
    modoLote = false,
    historicoCartao = [],
    payslipsHistorico,
  } = opts;

  const parsed =
    payslipsHistorico != null
      ? prepararParsedParaGravar(parsedIn, payslipsHistorico, month, year).parsed
      : parsedIn;

  let cartaoCols: Record<string, unknown> = {};
  try {
    if (modoLote) {
      cartaoCols = camposCartaoSaqueLocalParaGravar(parsed, month, year, historicoCartao);
    } else {
      cartaoCols = await camposCartaoSaqueParaGravarPayslip(supabase, userId, parsed, month, year);
    }
  } catch {
    cartaoCols = {};
  }

  const row: Record<string, unknown> = {
    user_id: userId,
    month,
    year,
    gross_salary: parsed.grossSalary,
    net_salary: parsed.netSalary,
    total_discounts: parsed.totalDiscounts,
    items: parsed.items,
    raw_text: parsed.rawText.slice(0, 400_000),
    file_name: fileName.slice(0, 400),
    document_kind: documentKind,
    folha_emit_kind: folhaEmitKind,
    ...cartaoCols,
  };

  const trySaveOnce = async (payload: Record<string, unknown>): Promise<unknown | null | undefined> => {
    const filterEmit =
      Object.prototype.hasOwnProperty.call(payload, "folha_emit_kind") &&
      payload.folha_emit_kind != null &&
      String(payload.folha_emit_kind).length > 0;
    let lookup = supabase
      .from("payslips")
      .select("id, created_at")
      .eq("user_id", userId)
      .eq("month", month)
      .eq("year", year)
      .order("created_at", { ascending: false })
      .limit(1);
    if (filterEmit) lookup = lookup.eq("folha_emit_kind", payload.folha_emit_kind as string);
    const { data: exRows, error: selErr } = await lookup;
    if (selErr) return selErr;
    const ex = exRows?.[0];
    if (ex?.id) {
      const { user_id: _u, ...updates } = payload;
      const { error } = await supabase.from("payslips").update(updates).eq("id", ex.id);
      return error ?? null;
    }
    const { error } = await supabase.from("payslips").insert(payload);
    return error ?? null;
  };

  const preferMinimalFirst =
    modoLote && documentKind !== "ficha_financeira" && folhaEmitKind !== "ficha_import";
  let variantRows = buildPayslipPayloadVariants(row, {
    preferMinimalFirst,
    omitCartao: modoLote,
  });

  let lastErrText = "";
  let omitCartaoFallback = false;
  for (let vi = 0; vi < variantRows.length; vi++) {
    let payload = variantRows[vi]!;
    if (omitCartaoFallback) payload = stripCartaoSaqueCols(payload);
    const err = await trySaveOnce(payload);
    if (!err) {
      lastErrText = "";
      break;
    }
    const t = supabaseErrText(err);
    lastErrText = t || "Erro ao gravar contracheque.";
    const recoverable =
      isRecoverablePayslipSchemaError(t) &&
      (/folha_emit_kind|document_kind|cartao_saque/i.test(t) || /PGRST204/i.test(t));
    if (!recoverable) break;
    if (/cartao_saque/i.test(t) && !omitCartaoFallback) {
      omitCartaoFallback = true;
      variantRows = buildPayslipPayloadVariants(omitRowKeys(row, []), {
        preferMinimalFirst,
        omitCartao: true,
      });
      vi = -1;
      continue;
    }
  }

  if (lastErrText) return lastErrText;

  const podeSincSalario =
    syncSalary &&
    parsed.netSalary > 0 &&
    opts.folhaEmitKind !== "folha_especial";

  if (podeSincSalario) {
    const sync = await upsertSalaryTransactionFromPayslip({
      supabase,
      userId,
      month,
      year,
      netSalary: parsed.netSalary,
    });
    if (!sync.ok) return `Payslip salvo, mas transação Salário: ${sync.message}`;
  }
  if (notificarDashboard) {
    emitDashboardDataUpdated({
      origin: "payslip",
      payslipMeta: {
        documentKind,
        month,
        year,
        folhaEmitKind,
      },
    });
  }
  return null;
}

export default function AnexosFolhaPage() {
  const [tab, setTab] = useState<TabId>("mensal");
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [leituraStatus, setLeituraStatus] = useState<string | null>(null);
  /** Nome do último PDF de ficha (uma competência gravada associa ao ficheiro origem). */
  const [uploadName, setUploadName] = useState<string | null>(null);

  /** Um ou vários contracheques mensais (lidas em lote ao arrastar múltiplos ficheiros). */
  const [mensalRevisoes, setMensalRevisoes] = useState<MensalRevisao[]>([]);

  const [fichaMeses, setFichaMeses] = useState<FichaMesExtraido[]>([]);
  /** Último PDF da ficha (releitura OCR / texto reforçado na mesma sessão). */
  const [fichaSourceFile, setFichaSourceFile] = useState<File | null>(null);
  /** Marcadores `- MES/ANO(CONTINUA…)` detectados no PDF bruto (antes da união automática). */
  const [fichaContinuacoesDetectadas, setFichaContinuacoesDetectadas] = useState(0);
  const [fichaReocrBusy, setFichaReocrBusy] = useState(false);
  const [syncSalario, setSyncSalario] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const savingKeyRef = useRef<string | null>(null);
  const [fichaLoteProgress, setFichaLoteProgress] = useState<{ atual: number; total: number } | null>(
    null,
  );
  /** Releitura OCR reforçada em curso (id da revisão mensal). */
  const [reocrBusyId, setReocrBusyId] = useState<string | null>(null);
  /** Contracheques já gravados — para comparar descontos recorrentes com o extrato em revisão. */
  const [payslipsHistorico, setPayslipsHistorico] = useState<Payslip[]>([]);
  /** Utilizador confirmou rubricas de desconto assinalhadas (desvio ou sem histórico). */
  const [confirmacaoDescontosRevisados, setConfirmacaoDescontosRevisados] = useState<Record<string, boolean>>(
    {}
  );
  /** Ganhos/receitas da folha assinalados vs. histórico (ficha + mensais). */
  const [confirmacaoGanhosRevisados, setConfirmacaoGanhosRevisados] = useState<Record<string, boolean>>({});
  /** Utilizador confirmou linhas de empréstimo com banco não confirmado em base curada (COMPE/sigla/nome). */
  const [confirmacaoBancosOficiaisRevisados, setConfirmacaoBancosOficiaisRevisados] = useState<
    Record<string, boolean>
  >({});
  /** Confirmar gravação com totais fracos ou leitura incompleta sem OCR reforçado (revisão manual). */
  const [confirmacaoGravacaoManualPorRevId, setConfirmacaoGravacaoManualPorRevId] = useState<
    Record<string, boolean>
  >({});
  const [confirmacaoGravacaoManualFicha, setConfirmacaoGravacaoManualFicha] = useState<Record<string, boolean>>({});
  const [corrigindoTotaisBase, setCorrigindoTotaisBase] = useState(false);
  const corrigiuTotaisBaseRef = useRef(false);
  const [ocultarFichaAoGravar, setOcultarFichaAoGravar] = useState(true);
  const [fichaOcultasAposGravar, setFichaOcultasAposGravar] = useState<Record<string, string>>({});

  const resetFluxo = () => {
    setUploadName(null);
    setMensalRevisoes([]);
    setFichaMeses([]);
    setFichaSourceFile(null);
    setFichaContinuacoesDetectadas(0);
    setConfirmacaoGravacaoManualPorRevId({});
    setConfirmacaoGravacaoManualFicha({});
    setFichaOcultasAposGravar({});
    setProgress(0);
    setLeituraStatus(null);
  };

  const patchRevisaoMensal = (id: string, patch: Partial<MensalRevisaoOk>) => {
    setMensalRevisoes((prev) =>
      prev.map((r) => (isMensalRevisaoOk(r) && r.id === id ? { ...r, ...patch } : r))
    );
  };

  const revisaoEhAdiantamentoParcial130 = (rev: MensalRevisaoOk): boolean =>
    isFolhaEspecialDecimoTerceiroParcialJunho({
      month: rev.periodoEdicao.month,
      year: rev.periodoEdicao.year,
      folha_emit_kind: rev.emitKind,
      gross_salary: rev.parsed.grossSalary,
      net_salary: rev.parsed.netSalary,
      total_discounts: rev.parsed.totalDiscounts,
      items: rev.parsed.items,
    });

  const onProgressLeituraContracheque =
    (index: number, total: number) => (p: ContrachequeFichaReadProgress) => {
      const base = total > 0 ? Math.round((index / total) * 82) : 0;
      if (p.kind === "pdf_text_layer") {
        if (p.phase === "start") {
          setLeituraStatus("A abrir PDF…");
          setProgress(base + 2);
        } else {
          setLeituraStatus("A segmentar competências…");
          setProgress(base + 76);
        }
      } else if (p.kind === "pdf_text_layer_page") {
        setLeituraStatus(`A ler página ${p.page}/${p.totalPages}…`);
        const frac = p.page / Math.max(p.totalPages, 1);
        setProgress(base + Math.round(frac * 74));
      } else if (p.kind === "pdf_segmentar") {
        setLeituraStatus(
          p.phase === "start" ? "A unificar CONTINUAÇÃO e segmentar meses…" : "A concluir…",
        );
        setProgress(base + (p.phase === "start" ? 80 : 88));
      } else if (p.kind === "pdf_ocr") {
        setLeituraStatus(`OCR página ${p.page}/${p.totalPages}…`);
        setProgress(
          base + Math.round((10 / Math.max(total, 1)) * (p.page / Math.max(p.totalPages, 1))),
        );
      } else if (p.kind === "image_ocr") {
        setLeituraStatus(p.status || "OCR…");
        setProgress(base + Math.round((12 / Math.max(total, 1)) * p.progress));
      } else if (p.kind === "image_ocr_deep") {
        setLeituraStatus(`OCR reforçado ${p.pass}/${p.totalPasses}…`);
        setProgress(
          base +
            Math.round((12 / Math.max(total, 1)) * (p.pass / Math.max(p.totalPasses, 1))),
        );
      }
    };

  async function segmentarFichaMeses(text: string): Promise<FichaMesExtraido[]> {
    setLeituraStatus("A extrair competências da ficha…");
    setProgress(92);
    await new Promise<void>((r) => setTimeout(r, 0));
    const meses = parseFichaFinanceiraMeses(text);
    setProgress(96);
    return meses;
  }

  /** Lê texto de um file com progress por índice de lote (0..total-1). */
  const readDocumentTextComProgressIndex = async (
    file: File,
    index: number,
    total: number,
    forceDeepOcr?: boolean,
    onReadMetadata?: (m: ContrachequeReadMetadata) => void
  ) =>
    readContrachequeFichaDocumentText(file, {
      forceDeepOcr: forceDeepOcr === true,
      onReadMetadata,
      onProgress: onProgressLeituraContracheque(index, total),
      onLargePdfUsesTextLayerOnly: ({ numPages, limit, forceDeepOcr: deep }) => {
        toast.message(
          deep
            ? `PDF com ${numPages} páginas: «Re-ler reforçado» usou a camada de texto completa (OCR limitado a ${limit} pág. no navegador). Confira totais nos meses críticos.`
            : `PDF com ${numPages} páginas: leitura pela camada de texto (sem OCR completo no navegador).`,
          { duration: 10_000 },
        );
      },
    });

  async function releOcrMensalReforcado(id: string) {
    const rev = mensalRevisoes.find((x) => x.id === id);
    if (!rev || !isMensalRevisaoOk(rev)) return;
    setReocrBusyId(id);
    setProgress(8);
    try {
      const resultado = await executarPipelineLeituraAutomaticaContracheque(rev.sourceFile, {
        fileName: rev.fileName,
        forceDeepOcr: true,
        historicoPayslips: payslipsHistorico,
        competencia: rev.periodoEdicao,
        onProgress: onProgressLeituraContracheque(0, 1),
      });
      setProgress(90);
      patchRevisaoMensal(id, {
        parsed: resultado.parsed,
        metaCompetencia: resultado.metaCompetencia,
        periodoEdicao: {
          month: resultado.metaCompetencia.month,
          year: resultado.metaCompetencia.year,
        },
        competenciaConfirmada: resultado.metaCompetencia.confiavel,
        emitKind: resultado.emitKind,
        ocrReforcoRealizado: resultado.ocrReforcoRealizado,
      });
      if (resultado.parsed.leituraPossivelmenteIncompleta) {
        toast.warning(
          "OCR reforçado terminou, mas a folha ainda parece incompleta (só SOLDO / sem descontos). Prefira PDF oficial ou PNG em alta resolução."
        );
      } else {
        toast.success("Releitura OCR reforçada concluída — confira totais e rubricas antes de gravar.");
      }
      if (resultado.analiseCartaoSaque.encontrado) {
        toast.warning(ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE, { duration: 8000 });
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha na releitura.");
    } finally {
      setReocrBusyId(null);
      setProgress(100);
    }
  }

  async function releFichaPdfReforcado(forceDeepOcr: boolean) {
    if (!fichaSourceFile) {
      toast.error("Não há ficheiro em memória — importe de novo o PDF da ficha.");
      return;
    }
    setFichaReocrBusy(true);
    setProgress(10);
    try {
      const text = await readDocumentTextComProgressIndex(
        fichaSourceFile,
        0,
        1,
        forceDeepOcr,
        (m) => setFichaContinuacoesDetectadas(m.continuacoesMarcadorPdf)
      );
      const meses = await segmentarFichaMeses(text);
      setFichaMeses(meses);
      if (meses.length === 0) {
        toast.warning(
          forceDeepOcr
            ? "Releitura concluída, mas nenhuma competência segmentada — confira o PDF."
            : "Nenhuma competência após releitura."
        );
      } else {
        toast.success(
          forceDeepOcr
            ? `Ficha re-lida (${meses.length} competência(s)). Confira totais nos meses que cortavam página.`
            : `Ficha reprocessada: ${meses.length} competência(s).`
        );
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha ao re-ler a ficha.");
    } finally {
      setFichaReocrBusy(false);
      setLeituraStatus(null);
      setProgress(100);
    }
  }

  const processarArquivo = useCallback(async (listaEntrada: File[], modo: "mensal" | "ficha") => {
    const raw = [...listaEntrada].filter(Boolean);
    resetFluxo();
    setProgress(8);
    if (raw.length === 0) {
      setProgress(0);
      return;
    }

    if (modo === "ficha") {
      const file = raw[0];
      if (raw.length > 1) {
        toast.info(
          `No separador «Ficha financeira» só é tratado um PDF de cada vez. A ler apenas: ${file.name}`
        );
      }
      setUploadName(file.name);
      setBusy(true);
      try {
        const text = await readDocumentTextComProgressIndex(file, 0, 1, undefined, (m) =>
          setFichaContinuacoesDetectadas(m.continuacoesMarcadorPdf)
        );
        setFichaSourceFile(file);
        const meses = await segmentarFichaMeses(text);
        setFichaMeses(meses);
        setTab("ficha");
        if (meses.length === 0) {
          toast.warning(
            "Ficha não segmentada. Para ficha corrida SEAD confira marcadores MES/AAAA ou DATA MM/AAAA por bloco."
          );
        } else {
          toast.success(
            `${meses.length} competência(s). Revise e grave por competência (ou «Gravar todos»).`
          );
        }
      } catch (e) {
        console.error(e);
        toast.error(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
      } finally {
        setBusy(false);
        setLeituraStatus(null);
        setProgress(100);
        if (fileRef.current) fileRef.current.value = "";
      }
      return;
    }

    setTab("mensal");
    setBusy(true);
    const revisoes: MensalRevisao[] = [];
    const nTotal = Math.min(raw.length, MAX_CONTRACHEQUES_MENSAL_EM_LOTE);
    if (raw.length > MAX_CONTRACHEQUES_MENSAL_EM_LOTE) {
      toast.warning(
        `Limite de ${MAX_CONTRACHEQUES_MENSAL_EM_LOTE} ficheiros por lote — a processar os primeiros.`
      );
    }

    for (let i = 0; i < nTotal; i++) {
      const file = raw[i];
      try {
        const text = await readDocumentTextComProgressIndex(
          file,
          i,
          nTotal,
          undefined,
          nTotal === 1 ? (m) => setFichaContinuacoesDetectadas(m.continuacoesMarcadorPdf) : undefined
        );
        setProgress(Math.min(93, Math.round(((i + 0.92) / nTotal) * 90)));

        if (isFichaFinanceiraTexto(text)) {
          if (nTotal === 1) {
            setUploadName(file.name);
            const meses = await segmentarFichaMeses(text);
            setFichaSourceFile(file);
            setFichaMeses(meses);
            setTab("ficha");
            setMensalRevisoes([]);
            if (meses.length === 0) {
              toast.warning(
                "Ficha não segmentada — use marcadores por mês ou o separador com o PDF adequado."
              );
            } else {
              toast.success(
                `Ficha corrida (${meses.length} blocos). Abrimos «Ficha financeira».`
              );
            }
            setBusy(false);
            setProgress(100);
            if (fileRef.current) fileRef.current.value = "";
            return;
          }
          toast.warning(
            `«${file.name}» parece ficha corrida ou multi‑mês — ignorado neste lote mensal (use «Ficha financeira» só com esse tipo de PDF ou envie só contracheques mensais).`
          );
          continue;
        }

        const resultado = executarPipelineLeituraAutomaticaContrachequeDeTexto(text, {
          fileName: file.name,
          historicoPayslips: payslipsHistorico,
        });
        revisoes.push({
          id: novoIdRevisaoMensal(),
          fileName: file.name,
          sourceFile: file,
          parsed: resultado.parsed,
          metaCompetencia: resultado.metaCompetencia,
          periodoEdicao: {
            month: resultado.metaCompetencia.month,
            year: resultado.metaCompetencia.year,
          },
          competenciaConfirmada: resultado.metaCompetencia.confiavel,
          emitKind: resultado.emitKind,
          ocrReforcoRealizado: resultado.ocrReforcoRealizado,
        });
      } catch (e) {
        console.error(e);
        revisoes.push({
          id: novoIdRevisaoMensal(),
          fileName: file.name,
          error: e instanceof Error ? e.message : "Falha ao ler o arquivo.",
        });
      }
    }

    let finalRevisoes = revisoes;
    const okList = revisoes.filter(isMensalRevisaoOk);
    if (okList.length >= 2) {
      const sortedOk = [...okList].sort(
        (a, b) =>
          a.metaCompetencia.year * 12 +
          a.metaCompetencia.month -
          (b.metaCompetencia.year * 12 + b.metaCompetencia.month)
      );
      const meses = sortedOk.map((r) => ({
        month: r.metaCompetencia.month,
        year: r.metaCompetencia.year,
        items: r.parsed.items,
      }));
      const inferidos = inferirParcelasPorVizinhancaMeses(meses);
      const idToItems = new Map(sortedOk.map((r, i) => [r.id, inferidos[i]!.items]));
      finalRevisoes = revisoes.map((r) => {
        if (!isMensalRevisaoOk(r) || !idToItems.has(r.id)) return r;
        const parsedComParcelas = { ...r.parsed, items: idToItems.get(r.id)! };
        const finalizado = finalizarLeituraContrachequeParsed(
          r.parsed.rawText,
          parsedComParcelas,
          {
            fileName: r.fileName,
            month: r.periodoEdicao.month,
            year: r.periodoEdicao.year,
            metaCompetencia: r.metaCompetencia,
            historicoPayslips: payslipsHistorico,
          },
        );
        return { ...r, parsed: finalizado.parsed };
      });
    }

    setMensalRevisoes(finalRevisoes);
    const okCount = revisoes.filter(isMensalRevisaoOk).length;
    if (revisoes.length === 1 && revisoes[0] && !isMensalRevisaoOk(revisoes[0])) {
      toast.error(revisoes[0].error ?? "Erro ao processar.");
    } else if (okCount === 0 && revisoes.length > 0) {
      toast.warning("Nenhum contracheque mensal ficou válido neste lote.");
    } else if (okCount === 1) {
      const r = revisoes.find(isMensalRevisaoOk);
      if (r && !parsePareceUtil(r.parsed)) {
        toast.warning(
          "Leitura fraca neste único documento — confira valores. Renomeie o ficheiro (ex.: dez2025.pdf) se ajudar."
        );
      } else if (r) {
        toast.success("Documento lido — confira competência e rubricas antes de gravar.");
      }
    } else if (okCount > 1) {
      toast.success(
        `${okCount} contracheques lidos em conjunto — ajuste mês/ano e confirme cada bloco; depois use «Gravar prontos» ou grave um a um.`
      );
    }

    setBusy(false);
    setProgress(100);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const gravarUmMensalPorId = async (id: string) => {
    const rev = mensalRevisoes.find((x) => x.id === id);
    if (!rev || !isMensalRevisaoOk(rev)) return;
    if (revisoesComDuplicidadeDeTipo.has(id)) {
      toast.error(
        "Há outro documento na fila com o mesmo mês/ano e o mesmo tipo de extrato. Altere o tipo ou remova um deles antes de gravar."
      );
      return;
    }
    if (revisaoEhAdiantamentoParcial130(rev)) {
      toast.info(
        "Este documento é a 1ª parcela parcial do 13º em junho, sem descontos. Ele fica fora da gravação automática; use a folha especial completa de dezembro para os totais."
      );
      return;
    }
    if (!rev.competenciaConfirmada) {
      toast.error("Confirme mês e ano neste documento antes de gravar.");
      return;
    }
    const confInsercao = conferenciaPorRevId[rev.id];
    if (
      precisaConfirmacaoManualGravar(rev, confInsercao) &&
      !confirmacaoGravacaoManualPorRevId[rev.id]
    ) {
      toast.error(
        confInsercao && conferenciaExigeConfirmacaoTotais(confInsercao)
          ? "Conferência automática: cabeçalho diverge das rubricas — leia o alerta vermelho e marque a confirmação antes de gravar."
          : "Marque «Revisei manualmente totais/rubricas…» abaixo ou use «Re-ler com OCR reforçado» antes de gravar."
      );
      return;
    }
    const adv = alertasDescontoPorRevId[id];
    if (adv?.bloqueiaSemConfirmacao && !confirmacaoDescontosRevisados[id]) {
      toast.error(
        "Há descontos assinalhados — leia o aviso, confira no PDF e marque «Revisei os descontos assinalhados» antes de gravar."
      );
      return;
    }
    const advG = alertasGanhoPorRevId[id];
    if (advG?.bloqueiaSemConfirmacao && !confirmacaoGanhosRevisados[id]) {
      toast.error(
        "Há ganhos/receitas divergentes — confira no PDF e marque «Revisei os ganhos assinalados» antes de gravar."
      );
      return;
    }
    const bancosPendentes = alertasBancoOficialPorRevId[id] ?? [];
    if (bancosPendentes.length > 0 && !confirmacaoBancosOficiaisRevisados[id]) {
      toast.error(
        "Há rubricas de empréstimo sem confirmação em base oficial (COMPE/sigla/nome). Revise e marque «Revisei os bancos não confirmados» antes de gravar."
      );
      return;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Faça login novamente.");
      return;
    }
    setSavingKey(`mensal:${id}`);
    const msg = await gravarPayslipNoSupabase({
      supabase,
      userId: user.id,
      parsed: rev.parsed,
      month: rev.periodoEdicao.month,
      year: rev.periodoEdicao.year,
      fileName: rev.fileName,
      documentKind: "contracheque_mensal",
      folhaEmitKind: rev.emitKind,
      syncSalary: syncSalario,
      payslipsHistorico,
    });
    setSavingKey(null);
    if (msg) toast.error(msg);
    else {
      toast.success(
        `${rev.periodoEdicao.month}/${rev.periodoEdicao.year} gravado (${rev.fileName}). Dados aparecem em Análise IA e Boletins.`
      );
      setMensalRevisoes((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const gravarTodosMensalConfirmados = async () => {
    const bloqueioManual = mensalRevisoes.filter(
      (r) =>
        isMensalRevisaoOk(r) &&
        r.competenciaConfirmada &&
        precisaConfirmacaoManualGravar(r, conferenciaPorRevId[r.id]) &&
        !confirmacaoGravacaoManualPorRevId[r.id]
    );
    if (bloqueioManual.length > 0) {
      toast.error(
        `Há ${bloqueioManual.length} documento(s) com totais fracos ou leitura incompleta — marque «Revisei manualmente…» em cada cartão ou use «Re-ler com OCR reforçado».`
      );
      return;
    }
    const lista = mensalRevisoes.filter(
      (r): r is MensalRevisaoOk =>
        isMensalRevisaoOk(r) &&
        r.competenciaConfirmada &&
        !revisaoEhAdiantamentoParcial130(r) &&
        (!precisaConfirmacaoManualGravar(r, conferenciaPorRevId[r.id]) ||
          confirmacaoGravacaoManualPorRevId[r.id])
    );
    if (lista.length === 0) {
      toast.error("Nenhum documento pronto para gravar em lote — confira competências e totais.");
      return;
    }
    if (lotesMesmoMesTipoDuplo.length > 0) {
      toast.error(
        "Resolva os conflitos de duplicidade na fila antes de gravar: mesmo mês/ano não pode ter dois documentos com o mesmo tipo."
      );
      return;
    }
    const bloqueadosPorDesconto = lista.filter(
      (r) =>
        (alertasDescontoPorRevId[r.id]?.bloqueiaSemConfirmacao ?? false) &&
        !confirmacaoDescontosRevisados[r.id]
    );
    if (bloqueadosPorDesconto.length > 0) {
      toast.error(
        `Marque «Revisei os descontos assinalhados» nos cartões: ${bloqueadosPorDesconto.map((r) => r.fileName).slice(0, 3).join(", ")}${bloqueadosPorDesconto.length > 3 ? "…" : ""}.`
      );
      return;
    }
    const bloqueadosPorGanho = lista.filter(
      (r) =>
        (alertasGanhoPorRevId[r.id]?.bloqueiaSemConfirmacao ?? false) &&
        !confirmacaoGanhosRevisados[r.id]
    );
    if (bloqueadosPorGanho.length > 0) {
      toast.error(
        `Marque «Revisei os ganhos assinalados» nos cartões: ${bloqueadosPorGanho.map((r) => r.fileName).slice(0, 3).join(", ")}${bloqueadosPorGanho.length > 3 ? "…" : ""}.`
      );
      return;
    }
    const bloqueadosPorBanco = lista.filter(
      (r) =>
        (alertasBancoOficialPorRevId[r.id]?.length ?? 0) > 0 &&
        !confirmacaoBancosOficiaisRevisados[r.id]
    );
    if (bloqueadosPorBanco.length > 0) {
      toast.error(
        `Marque «Revisei os bancos não confirmados» nos cartões: ${bloqueadosPorBanco.map((r) => r.fileName).slice(0, 3).join(", ")}${bloqueadosPorBanco.length > 3 ? "…" : ""}.`
      );
      return;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Faça login novamente.");
      return;
    }
    setSavingKey("mensal:todos");
    let ok = 0;
    const falhas: string[] = [];
    const gravadosIds: string[] = [];
    const historicoCartao = historicoRubricaDePayslips(payslipsHistorico);
    try {
      for (const rev of lista) {
        const msg = await gravarPayslipNoSupabase({
          supabase,
          userId: user.id,
          parsed: rev.parsed,
          month: rev.periodoEdicao.month,
          year: rev.periodoEdicao.year,
          fileName: rev.fileName,
          documentKind: "contracheque_mensal",
          folhaEmitKind: rev.emitKind,
          syncSalary: syncSalario,
          notificarDashboard: false,
          modoLote: true,
          historicoCartao,
          payslipsHistorico,
        });
        if (msg) falhas.push(`${rev.fileName}: ${msg}`);
        else {
          ok++;
          gravadosIds.push(rev.id);
        }
      }
    } finally {
      setSavingKey(null);
    }
    await recarregarPayslipsHistorico();
    if (ok > 0) {
      emitDashboardDataUpdated({
        origin: "payslip_lote",
        sincronizarFontes: false,
        payslipMeta: { documentKind: "contracheque_mensal" },
      });
    }
    if (gravadosIds.length > 0) {
      setMensalRevisoes((prev) => prev.filter((r) => !gravadosIds.includes(r.id)));
    }
    const errLinha =
      falhas.length > 0 ? ` Primeiras falhas: ${falhas.slice(0, 2).join("; ").slice(0, 420)}.` : "";
    if (falhas.length === 0) {
      toast.success(`${ok} contracheque(s) gravado(s).`);
    } else if (ok > 0) {
      toast.warning(`Gravados ${ok}; ${falhas.length} erro(s).${errLinha}`);
    } else {
      toast.error(falhas[0]?.slice(0, 380) ?? "Não foi possível gravar o lote.");
    }
  };

  const salvarFichaLinha = async (row: FichaMesExtraido) => {
    if (!uploadName) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Faça login.");
      return;
    }
    const k = `${row.year}-${row.month}`;
    const confFicha = conferenciaFichaPorKey[k];
    if (fichaPrecisaConfirmacaoManual(row, confFicha) && !confirmacaoGravacaoManualFicha[k]) {
      toast.error(
        conferenciaExigeConfirmacaoTotais(confFicha)
          ? "Conferência: totais do cabeçalho divergem das rubricas — confirme na linha antes de gravar."
          : "Marque «Revisei manualmente…» nesta linha ou ajuste os totais antes de gravar."
      );
      return;
    }
    setSavingKey(k);
    const parsed: ParsedPayslipPayload = {
      grossSalary: row.grossSalary,
      netSalary: row.netSalary,
      totalDiscounts: row.totalDiscounts,
      items: row.items,
      rawText: row.rawText,
      instituicoesDetectadas: row.instituicoesDetectadas,
    };
    const msg = await gravarPayslipNoSupabase({
      supabase,
      userId: user.id,
      parsed,
      month: row.month,
      year: row.year,
      fileName: uploadName,
      documentKind: "ficha_financeira",
      folhaEmitKind: "ficha_import",
      syncSalary: syncSalario,
      payslipsHistorico,
    });
    setSavingKey(null);
    if (msg) toast.error(msg);
    else {
      if (ocultarFichaAoGravar) {
        setFichaOcultasAposGravar((p) => ({ ...p, [k]: row.label }));
      }
      toast.success(
        ocultarFichaAoGravar
          ? `${row.label} gravado e ocultado da revisão.`
          : `${row.label} gravado na base.`
      );
    }
  };

  const gravandoAlgumaLinhaFicha =
    fichaReocrBusy ||
    savingKey === "ficha_todos" ||
    (savingKey !== null && savingKey !== "mensal" && /^(\d{4})-(\d{1,2})$/.test(savingKey));

  const fichaMesesVisiveis = useMemo(
    () => fichaMeses.filter((r) => !fichaOcultasAposGravar[`${r.year}-${r.month}`]),
    [fichaMeses, fichaOcultasAposGravar]
  );
  const fichaOcultasCount = Object.keys(fichaOcultasAposGravar).length;

  const lotesMesmoMesTipoDuplo = useMemo(() => {
    const cont = new Map<string, { key: string; label: string; ids: string[] }>();
    for (const r of mensalRevisoes) {
      if (!isMensalRevisaoOk(r)) continue;
      const monthYear = `${r.periodoEdicao.year}-${String(r.periodoEdicao.month).padStart(2, "0")}`;
      const key = `${monthYear}|${r.emitKind}`;
      const label = `${monthYear.replace("-", "/")} — ${emitMensalLabel(r.emitKind)}`;
      const prev = cont.get(key);
      if (prev) prev.ids.push(r.id);
      else cont.set(key, { key, label, ids: [r.id] });
    }
    return [...cont.values()].filter((x) => x.ids.length > 1);
  }, [mensalRevisoes]);

  const revisoesComDuplicidadeDeTipo = useMemo(() => {
    return new Set(lotesMesmoMesTipoDuplo.flatMap((x) => x.ids));
  }, [lotesMesmoMesTipoDuplo]);

  const salvarTodasFichaLinhas = async () => {
    if (!uploadName) return;
    const gravaveis = fichaMesesVisiveis.filter((r) => {
      const k = `${r.year}-${r.month}`;
      const conf = conferenciaFichaPorKey[k];
      return !fichaPrecisaConfirmacaoManual(r, conf) || confirmacaoGravacaoManualFicha[k];
    });
    const ignoradas = fichaMesesVisiveis.length - gravaveis.length;
    if (gravaveis.length === 0) {
      toast.warning(
        "Nenhuma competência válida para gravar em lote — confira totais e rubricas em cada linha (ícone gravar só naquelas)."
      );
      return;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Faça login.");
      return;
    }
    const { error: probeCol } = await supabase.from("payslips").select("document_kind").limit(1);
    const faltaDocumentKind =
      !!probeCol && /document_kind/i.test(supabaseErrText(probeCol)) && isRecoverablePayslipSchemaError(supabaseErrText(probeCol));
    if (faltaDocumentKind) {
      toast.message(
        "A tabela payslips no Supabase ainda não tem a coluna document_kind — gravando com esquema básico. No SQL Editor: alter table public.payslips add column if not exists document_kind text;",
        { duration: 14_000 },
      );
    }

    setSavingKey("ficha_todos");
    setFichaLoteProgress({ atual: 0, total: gravaveis.length });
    const toastId = toast.loading(`Gravando 0/${gravaveis.length} competências…`, { duration: 120_000 });

    let ok = 0;
    const falhas: string[] = [];
    const ocultarDepois: Record<string, string> = {};
    let historicoCartao: PayslipHistoricoRubricaMin[] = historicoRubricaDePayslips(payslipsHistorico);
    try {
      const { data: histRows } = await supabase
        .from("payslips")
        .select("month, year, items")
        .eq("user_id", user.id)
        .limit(250);
      if (histRows?.length) {
        historicoCartao = (histRows as { month: number; year: number; items: Payslip["items"] }[]).map(
          (r) => ({ mes: r.month, ano: r.year, items: r.items ?? [] }),
        );
      }

      for (let i = 0; i < gravaveis.length; i++) {
        const row = gravaveis[i]!;
        const parsed: ParsedPayslipPayload = {
          grossSalary: row.grossSalary,
          netSalary: row.netSalary,
          totalDiscounts: row.totalDiscounts,
          items: row.items,
          rawText: row.rawText,
          instituicoesDetectadas: row.instituicoesDetectadas,
        };
        const msg = await gravarPayslipNoSupabase({
          supabase,
          userId: user.id,
          parsed,
          month: row.month,
          year: row.year,
          fileName: uploadName,
          documentKind: "ficha_financeira",
          folhaEmitKind: "ficha_import",
          syncSalary: false,
          notificarDashboard: false,
          modoLote: true,
          historicoCartao,
          payslipsHistorico,
        });
        if (msg) falhas.push(`${row.label}: ${msg}`);
        else {
          ok++;
          ocultarDepois[`${row.year}-${row.month}`] = row.label;
          historicoCartao.push({ mes: row.month, ano: row.year, items: row.items ?? [] });
        }
        setFichaLoteProgress({ atual: i + 1, total: gravaveis.length });
        toast.loading(`Gravando ${i + 1}/${gravaveis.length}…`, { id: toastId, duration: 120_000 });
        if ((i + 1) % 4 === 0) {
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    } finally {
      setSavingKey(null);
      setFichaLoteProgress(null);
      toast.dismiss(toastId);
    }
    await recarregarPayslipsHistorico();
    if (ok > 0) {
      emitDashboardDataUpdated({
        origin: "payslip_lote",
        sincronizarFontes: false,
        payslipMeta: { documentKind: "ficha_financeira" },
      });
    }
    if (ocultarFichaAoGravar && ok > 0) {
      setFichaOcultasAposGravar((p) => ({ ...p, ...ocultarDepois }));
    }

    const sufixoIgnoradas =
      ignoradas > 0 ? `${ignoradas} linha(s) com leitura fraca foram ignoradas.` : "";

    if (falhas.length === 0) {
      toast.success(
        `${ok} competência(s) gravadas.${sufixoIgnoradas ? ` ${sufixoIgnoradas}` : ""}`,
      );
    } else if (ok > 0) {
      toast.warning(
        `Gravadas ${ok} competência(s); ${falhas.length} falha(s). Primeira: ${falhas[0]?.slice(0, 220) ?? ""}${sufixoIgnoradas ? ` ${sufixoIgnoradas}` : ""}`
      );
    } else {
      toast.error(falhas[0]?.slice(0, 260) ?? "Não foi possível gravar as competências.");
    }
  };

  const mensalConfirmadosParaLoteCount = mensalRevisoes.filter(
    (r): r is MensalRevisaoOk =>
      isMensalRevisaoOk(r) &&
      r.competenciaConfirmada &&
      !revisaoEhAdiantamentoParcial130(r) &&
      (!precisaConfirmacaoManualGravar(r, conferenciaPorRevId[r.id]) ||
        confirmacaoGravacaoManualPorRevId[r.id])
  ).length;

  const recarregarPayslipsHistorico = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("payslips")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(200);
    if (!error) setPayslipsHistorico((data as Payslip[]) ?? []);
  }, []);

  const recarregarPayslipsDebouncedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    savingKeyRef.current = savingKey;
  }, [savingKey]);

  useEffect(() => {
    void recarregarPayslipsHistorico();
    const onAtualizado = (e: Event) => {
      if (savingKeyRef.current === "ficha_todos" || savingKeyRef.current === "mensal:todos") return;
      const origin = (e as CustomEvent<{ origin?: string }>).detail?.origin;
      if (origin === "sincronizar_fontes_analise") return;
      if (recarregarPayslipsDebouncedRef.current) clearTimeout(recarregarPayslipsDebouncedRef.current);
      recarregarPayslipsDebouncedRef.current = setTimeout(() => {
        recarregarPayslipsDebouncedRef.current = null;
        void recarregarPayslipsHistorico();
      }, 800);
    };
    window.addEventListener(DASHBOARD_DATA_UPDATED, onAtualizado);
    return () => {
      window.removeEventListener(DASHBOARD_DATA_UPDATED, onAtualizado);
      if (recarregarPayslipsDebouncedRef.current) clearTimeout(recarregarPayslipsDebouncedRef.current);
    };
  }, [recarregarPayslipsHistorico]);

  const resumoCartaoSaque = useMemo(
    () => resumoCartaoSaqueEmPayslips(payslipsHistorico),
    [payslipsHistorico],
  );

  useEffect(() => {
    setConfirmacaoDescontosRevisados({});
    setConfirmacaoGanhosRevisados({});
  }, [payslipsHistorico]);

  useEffect(() => {
    setConfirmacaoBancosOficiaisRevisados({});
  }, [mensalRevisoes.length]);

  const alertasDescontoPorRevId = useMemo(() => {
    const out: Record<string, ReturnType<typeof compararDescontosComHistorico>> = {};
    for (const r of mensalRevisoes) {
      if (!isMensalRevisaoOk(r)) continue;
      const hist = historicoDescontosPorChave(payslipsHistorico, {
        mes: r.periodoEdicao.month,
        ano: r.periodoEdicao.year,
      });
      out[r.id] = compararDescontosComHistorico(r.parsed.items, hist);
    }
    return out;
  }, [mensalRevisoes, payslipsHistorico]);

  const alertasGanhoPorRevId = useMemo(() => {
    const out: Record<string, ReturnType<typeof compararGanhosComHistorico>> = {};
    for (const r of mensalRevisoes) {
      if (!isMensalRevisaoOk(r)) continue;
      const hist = historicoGanhosPorChave(payslipsHistorico, {
        mes: r.periodoEdicao.month,
        ano: r.periodoEdicao.year,
      });
      out[r.id] = compararGanhosComHistorico(r.parsed.items, hist);
    }
    return out;
  }, [mensalRevisoes, payslipsHistorico]);

  const conferenciaPorRevId = useMemo(() => {
    const out: Record<string, ResultadoConferenciaInsercao> = {};
    for (const r of mensalRevisoes) {
      if (!isMensalRevisaoOk(r)) continue;
      out[r.id] = conferirPayslipAntesInsercao(r.parsed, payslipsHistorico, {
        mes: r.periodoEdicao.month,
        ano: r.periodoEdicao.year,
      });
    }
    return out;
  }, [mensalRevisoes, payslipsHistorico]);

  const conferenciaFichaPorKey = useMemo(() => {
    const out: Record<string, ResultadoConferenciaInsercao> = {};
    for (const row of fichaMeses) {
      const k = `${row.year}-${row.month}`;
      const parsed: ParsedPayslipPayload = {
        grossSalary: row.grossSalary,
        netSalary: row.netSalary,
        totalDiscounts: row.totalDiscounts,
        items: row.items,
        rawText: row.rawText,
        instituicoesDetectadas: row.instituicoesDetectadas,
      };
      out[k] = conferirPayslipAntesInsercao(parsed, payslipsHistorico, {
        mes: row.month,
        ano: row.year,
      });
    }
    return out;
  }, [fichaMeses, payslipsHistorico]);

  const baseGravadaTotaisInconsistentes = useMemo(
    () => auditarBaseGravadaInconsistente(payslipsHistorico),
    [payslipsHistorico],
  );

  const corrigirTotaisBaseGravada = useCallback(async () => {
    setCorrigindoTotaisBase(true);
    try {
      const res = await fetch("/api/payslips/corrigir-totais", { method: "POST" });
      const body = (await res.json()) as {
        corrigidos?: number;
        erros?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Não foi possível corrigir os totais na base.");
      }
      await recarregarPayslipsHistorico();
      emitDashboardDataUpdated({ origin: "payslip_corrigir_totais", sincronizarFontes: true });
      const n = body.corrigidos ?? 0;
      if (n > 0) {
        toast.success(
          `${n} competência${n === 1 ? "" : "s"} corrigida${n === 1 ? "" : "s"} automaticamente (totais alinhados às rubricas).`,
        );
      } else {
        toast.info("Nenhuma competência precisava de correção de totais.");
      }
      if ((body.erros ?? 0) > 0) {
        toast.warning(`Algumas linhas falharam ao gravar (${body.erros}).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao corrigir totais na base.");
    } finally {
      setCorrigindoTotaisBase(false);
    }
  }, [recarregarPayslipsHistorico]);

  useEffect(() => {
    if (corrigiuTotaisBaseRef.current) return;
    if (payslipsHistorico.length === 0) return;
    if (baseGravadaTotaisInconsistentes.length === 0) return;
    corrigiuTotaisBaseRef.current = true;
    void corrigirTotaisBaseGravada();
  }, [
    payslipsHistorico.length,
    baseGravadaTotaisInconsistentes.length,
    corrigirTotaisBaseGravada,
  ]);

  const alertasHistoricoFichaPorKey = useMemo(() => {
    const out: Record<
      string,
      { descontos: ReturnType<typeof compararDescontosComHistorico>; ganhos: ReturnType<typeof compararGanhosComHistorico> }
    > = {};
    for (const row of fichaMeses) {
      const k = `${row.year}-${row.month}`;
      const opts = { mes: row.month, ano: row.year };
      out[k] = {
        descontos: compararDescontosComHistorico(
          row.items,
          historicoDescontosPorChave(payslipsHistorico, opts),
        ),
        ganhos: compararGanhosComHistorico(row.items, historicoGanhosPorChave(payslipsHistorico, opts)),
      };
    }
    return out;
  }, [fichaMeses, payslipsHistorico]);

  const alertasBancoOficialPorRevId = useMemo(() => {
    const out: Record<string, AlertaBancoOficial[]> = {};
    for (const r of mensalRevisoes) {
      if (!isMensalRevisaoOk(r)) continue;
      const alertas: AlertaBancoOficial[] = [];
      r.parsed.items.forEach((it, idx) => {
        if (it.type !== "desconto" || it.value <= 0) return;
        if (!rubricaPareceConsignadoEmprestimo(it.description, { code: it.code })) return;
        if (it.bancoConfirmacao || confirmacaoBancoCurado(it.description)) return;
        alertas.push({
          idx,
          rubrica: it.description,
          codigo: it.code,
        });
      });
      out[r.id] = alertas;
    }
    return out;
  }, [mensalRevisoes]);

  const avisos130PorRevId = useMemo(() => {
    const o: Record<string, ReturnType<typeof avisosDecimoTerceiroRevisaoContracheque>> = {};
    for (const r of mensalRevisoes) {
      if (!isMensalRevisaoOk(r)) continue;
      o[r.id] = avisosDecimoTerceiroRevisaoContracheque({
        mes: r.periodoEdicao.month,
        ano: r.periodoEdicao.year,
        items: r.parsed.items,
        emitKind: r.emitKind,
        payslipsGravados: payslipsHistorico,
      });
    }
    return o;
  }, [mensalRevisoes, payslipsHistorico]);

  const avisosFicha130 = useMemo(
    () =>
      avisosDecimoTerceiroFichaCorrida(
        fichaMeses.map((m) => ({ month: m.month, year: m.year, items: m.items }))
      ),
    [fichaMeses]
  );

  const algumMensalBloqueadoPorDesconto = useMemo(
    () =>
      mensalRevisoes.some(
        (r) =>
          isMensalRevisaoOk(r) &&
          r.competenciaConfirmada &&
          parsePareceUtil(r.parsed) &&
          (alertasDescontoPorRevId[r.id]?.bloqueiaSemConfirmacao ?? false) &&
          !confirmacaoDescontosRevisados[r.id]
      ),
    [mensalRevisoes, alertasDescontoPorRevId, confirmacaoDescontosRevisados]
  );

  const algumMensalBloqueadoPorGanho = useMemo(
    () =>
      mensalRevisoes.some(
        (r) =>
          isMensalRevisaoOk(r) &&
          r.competenciaConfirmada &&
          (alertasGanhoPorRevId[r.id]?.bloqueiaSemConfirmacao ?? false) &&
          !confirmacaoGanhosRevisados[r.id]
      ),
    [mensalRevisoes, alertasGanhoPorRevId, confirmacaoGanhosRevisados]
  );

  const algumMensalBloqueadoPorBancoNaoConfirmado = useMemo(
    () =>
      mensalRevisoes.some(
        (r) =>
          isMensalRevisaoOk(r) &&
          r.competenciaConfirmada &&
          (alertasBancoOficialPorRevId[r.id]?.length ?? 0) > 0 &&
          !confirmacaoBancosOficiaisRevisados[r.id]
      ),
    [mensalRevisoes, alertasBancoOficialPorRevId, confirmacaoBancosOficiaisRevisados]
  );

  const algumMensalBloqueadoPorConfirmacaoManual = useMemo(
    () =>
      mensalRevisoes.some(
        (r) =>
          isMensalRevisaoOk(r) &&
          r.competenciaConfirmada &&
          precisaConfirmacaoManualGravar(r, conferenciaPorRevId[r.id]) &&
          !confirmacaoGravacaoManualPorRevId[r.id]
      ),
    [mensalRevisoes, confirmacaoGravacaoManualPorRevId, conferenciaPorRevId]
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-28">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Anexos da folha
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Contracheque mensal e ficha financeira (SEAD/AM ou equivalente): leitura alinhada aos PDFs oficiais.
          Em consignados, quando a rubrica traz <strong>parcela paga / total</strong> (ex.: 01/48 após o contrato), o app
          extrai esse par para a tabela e para cruzar o mesmo empréstimo entre meses. Os registos gravados alimentam{" "}
          <strong>Análise IA</strong>, <strong>Boletins</strong>, o painel inferior e a categoria <strong>Salário</strong>{" "}
          nas transações (opcional).
        </p>
      </div>

      <CartaoSaqueEmbutidoResumoTopo resumo={resumoCartaoSaque} />

      {(baseGravadaTotaisInconsistentes.length > 0 || corrigindoTotaisBase) && (
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm space-y-2">
          <p className="font-semibold text-red-900 dark:text-red-100 flex items-center gap-2">
            {corrigindoTotaisBase ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            )}
            {corrigindoTotaisBase
              ? "Corrigindo totais na base a partir das rubricas…"
              : `Base com totais inconsistentes (${baseGravadaTotaisInconsistentes.length} competência${baseGravadaTotaisInconsistentes.length === 1 ? "" : "s"})`}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            O app recalcula bruto, descontos e líquido pela soma das linhas de ganhos e despesas (sem revisão manual).
            {corrigindoTotaisBase
              ? " Aguarde alguns segundos."
              : " A correção automática roda ao abrir esta página; use o botão abaixo para repetir."}
          </p>
          {!corrigindoTotaisBase && baseGravadaTotaisInconsistentes.length > 0 && (
            <ul className="text-[11px] font-mono tabular-nums space-y-0.5 max-h-28 overflow-auto">
              {baseGravadaTotaisInconsistentes.slice(0, 12).map((b) => (
                <li key={`${b.ano}-${b.mes}`}>
                  {String(b.mes).padStart(2, "0")}/{b.ano}: gravado bruto {formatBRL(b.brutoGravado)} — soma
                  ganhos {formatBRL(b.somaGanhos)} ({b.rubricas} rubricas)
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={corrigindoTotaisBase}
            onClick={() => {
              corrigiuTotaisBaseRef.current = false;
              void corrigirTotaisBaseGravada();
            }}
          >
            {corrigindoTotaisBase ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                Corrigindo…
              </>
            ) : (
              "Corrigir totais na base agora"
            )}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-muted/60 border border-border">
        {(
          [
            ["mensal", "Contracheque mensal"],
            ["ficha", "Ficha financeira"],
            ["cartao", "Cartão/Saque no Contracheque"],
            ["tipos", "Tipos aceites"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              tab === id
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === "mensal" || tab === "ficha") && (
        <div
          className={cn(
            "rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center transition-colors cursor-pointer hover:border-blue-400"
          )}
          onClick={() => !busy && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const modo = tab === "ficha" ? "ficha" : "mensal";
            const daLista = modo === "ficha" ? 1 : MAX_CONTRACHEQUES_MENSAL_EM_LOTE;
            const files = [...e.dataTransfer.files].slice(0, daLista).filter(Boolean);
            if (files.length > 0 && !busy) void processarArquivo(files, modo);
          }}
        >
          <FileUp className="h-10 w-10 mx-auto text-slate-400 mb-3" aria-hidden />
          <p className="font-medium text-slate-800 dark:text-slate-100">
            {tab === "mensal"
              ? "Arraste um ou vários contracheques (PDF/imagem)"
              : "Arraste a ficha financeira (vários meses)"}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Contracheque mensal: até {MAX_CONTRACHEQUES_MENSAL_EM_LOTE} ficheiros de cada vez são lidos em sequência; confira depois competência por documento.
            {" · "}
            PDF com texto ou escaneado, PNG, JPG, WebP · TXT.
          </p>
          <input
            ref={fileRef}
            type="file"
            multiple={tab === "mensal"}
            className="hidden"
            accept="application/pdf,.pdf,image/*,.txt,.TXT,.webp,.tif,.tiff,.heic"
            onChange={(e) => {
              const modo = tab === "ficha" ? "ficha" : "mensal";
              const max = modo === "ficha" ? 1 : MAX_CONTRACHEQUES_MENSAL_EM_LOTE;
              const files = [...(e.target.files ?? [])].slice(0, max).filter(Boolean);
              if (files.length > 0) void processarArquivo(files, modo);
            }}
          />
          {busy && (
            <div className="mt-4 flex flex-col items-center justify-center gap-1 text-sm text-blue-600">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {leituraStatus ?? "A ler…"} {progress}%
              </div>
              {progress > 0 && progress < 100 && (
                <div className="h-1.5 w-full max-w-xs rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={syncSalario}
          onChange={(e) => setSyncSalario(e.target.checked)}
          className="rounded border-input"
        />
        Sincronizar receita «Salário» no 1º dia do mês (transações — igual à lista mensal típica)
      </label>

      {tab === "mensal" && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 px-4 py-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed space-y-2">
          <p className="font-medium text-slate-800 dark:text-slate-200">
            Dois contracheques no mesmo mês (SEAD — folha normal + folha especial)
          </p>
          <p>
            No Amazonas o <abbr title="Secretaria de Estado da Administração e Gestão">SEAD</abbr> pode emitir
            <strong className="font-medium text-foreground/90"> dois PDFs com a mesma DATA</strong> (ex.{" "}
            <span className="font-mono">06/2025</span>): um <strong>mensal completo</strong> (soldo, rubricas,
            consignados) e outro só para <strong>13º antecipado / folha especial</strong>. São documentos
            diferentes: cada um tem os seus totais e rubricas; não se somam num único papel.
          </p>
          <p>
            Nesta página, escolha <strong className="text-foreground/90">Tipo de extrato</strong> em cada cartão:{" "}
            <em>Mensal (principal)</em> para o holerite “cheio”, e <em>Folha especial / 13º</em> para o segundo
            PDF. Assim gravamos <strong className="text-foreground/90">duas linhas na base</strong> (mesmo mês/ano,
            sem apagar uma com a outra — desde que o Supabase tenha{" "}
            <code className="rounded bg-muted px-1 text-[11px]">folha_emit_kind</code>). A sincronização automática do
            «Salário» nas transações usa só o <strong className="text-foreground/90">mensal principal</strong>, não a
            folha especial (evita substituir o líquido por um adiantamento de 13º).
          </p>
          <p className="text-muted-foreground">
            <strong className="text-foreground/90">13º em duas etapas:</strong> a 1.ª parcela (ex. junho) aparece em
            ganhos; na quitação de dezembro o valor já antecipado volta como <strong className="text-foreground/90">desconto</strong>{" "}
            (ex. DESC.13.SAL.ADIANT). O app classifica por texto da rubrica e mostra avisos para não somar o 13º duas vezes
            em totais anuais — use o <strong className="text-foreground/90">líquido</strong> ou compare adiantamento (jun.)
            com abate (dez.).
          </p>
        </div>
      )}

      {tab === "mensal" && mensalRevisoes.length > 0 && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0" aria-hidden /> Revisão — contracheque(s)
            </h2>
            {mensalRevisoes.length >= 2 && (
              <Button
                type="button"
                size="sm"
                title="Grava só os documentos com competência confirmada e leitura com totais aceites; os restantes ficam na fila."
                disabled={
                  busy ||
                  mensalConfirmadosParaLoteCount === 0 ||
                  savingKey !== null ||
                  algumMensalBloqueadoPorDesconto ||
                  algumMensalBloqueadoPorGanho ||
                  algumMensalBloqueadoPorBancoNaoConfirmado ||
                  algumMensalBloqueadoPorConfirmacaoManual ||
                  lotesMesmoMesTipoDuplo.length > 0
                }
                onClick={() => void gravarTodosMensalConfirmados()}
              >
                {savingKey === "mensal:todos" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                ) : (
                  <Save className="h-4 w-4 mr-2" aria-hidden />
                )}
                Gravar prontos ({mensalConfirmadosParaLoteCount} de {mensalRevisoes.length})
              </Button>
            )}
          </div>
          {mensalRevisoes.length >= 2 && (
            <p className="text-xs text-muted-foreground -mt-1">
              «Documento i/n» é a posição na fila de ficheiros que carregou (n contracheques diferentes na revisão).
              O botão mostra quantos estão <strong className="text-foreground/90">prontos para gravar já</strong> —
              com «Confirmar competência» e leitura aceite (ou com a caixa de confirmação manual assinalada). Os outros
              ficam na fila. Pode gravar em lotes parciais (ex. 2 agora, 14 depois). Rubricas de empréstimo sem banco
              confirmado na base curada (COMPE/sigla/nome) pedem confirmação manual.
            </p>
          )}

          {lotesMesmoMesTipoDuplo.length > 0 && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-medium">
                Conflito na fila: há documentos com o mesmo mês/ano e o mesmo tipo de extrato (
                {lotesMesmoMesTipoDuplo.map((x) => x.label).join("; ")}).
              </p>
              <p>
                No SEAD pode haver folha normal e folha especial na mesma DATA, mas cada competência deve ter no máximo
                um cartão como «Mensal (principal)» e um como «Folha especial / 13º». Ajuste o tipo, mês/ano ou remova o
                duplicado antes de gravar para evitar substituição indevida.
              </p>
            </div>
          )}

          <div className="space-y-6">
            {mensalRevisoes.map((rev, idxRev) => (
              <div
                key={rev.id}
                className={cn(
                  "rounded-xl border p-5 space-y-4",
                  !isMensalRevisaoOk(rev)
                    ? "border-destructive/50 bg-destructive/5"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
                  <span className="font-medium text-sm text-slate-800 dark:text-slate-100 break-all">
                    {rev.fileName}
                  </span>
                  {isMensalRevisaoOk(rev) && mensalRevisoes.length > 1 && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      Documento {idxRev + 1}/{mensalRevisoes.length}
                    </span>
                  )}
                </div>

                {!isMensalRevisaoOk(rev) ? (
                  <p className="text-sm text-destructive">{rev.error}</p>
                ) : (
                  <>
                    <div
                      className={cn(
                        "rounded-lg border p-4 space-y-3",
                        rev.competenciaConfirmada
                          ? "border-green-500/40 bg-green-500/5"
                          : "border-amber-500/50 bg-amber-500/5"
                      )}
                    >
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        Competência (mês de referência deste extrato)
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Pré-visualização:{" "}
                        <strong className="text-foreground">
                          {MESES_PT_CURTO[rev.periodoEdicao.month - 1]} de {rev.periodoEdicao.year} (
                          {String(rev.periodoEdicao.month).padStart(2, "0")}/{rev.periodoEdicao.year})
                        </strong>
                        {" · "}
                        Origem: {descricaoOrigemCompetencia(rev.metaCompetencia.origem)}
                      </p>

                      {rev.competenciaConfirmada ? (
                        <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                          Competência confirmada para gravação.
                        </p>
                      ) : (
                        <p className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                          <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                          Ajuste mês e ano se necessário e clique em «Confirmar competência». Use{" "}
                          <code className="text-xs bg-muted/80 px-1 rounded">DATA MM/AAAA</code> ou renomeie o ficheiro
                          (ex. <code className="text-xs bg-muted/80 px-1 rounded">dez2025.pdf</code>).
                        </p>
                      )}

                      <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor={`comp-mes-${rev.id}`} className="text-xs">
                            Mês
                          </Label>
                          <Select
                            value={String(rev.periodoEdicao.month)}
                            onValueChange={(v) => {
                              if (!v) return;
                              const mo = parseInt(v, 10);
                              if (mo >= 1 && mo <= 12)
                                patchRevisaoMensal(rev.id, {
                                  periodoEdicao: { ...rev.periodoEdicao, month: mo },
                                });
                            }}
                          >
                            <SelectTrigger id={`comp-mes-${rev.id}`} className="w-[min(100%,11rem)] h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MESES_PT_CURTO.map((labelM, mi) => (
                                <SelectItem key={`${rev.id}-${labelM}`} value={(mi + 1).toString()}>
                                  {labelM}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`comp-ano-${rev.id}`} className="text-xs">
                            Ano
                          </Label>
                          <Select
                            value={String(rev.periodoEdicao.year)}
                            onValueChange={(v) => {
                              if (!v) return;
                              const y = parseInt(v, 10);
                              if (!Number.isNaN(y))
                                patchRevisaoMensal(rev.id, {
                                  periodoEdicao: { ...rev.periodoEdicao, year: y },
                                });
                            }}
                          >
                            <SelectTrigger id={`comp-ano-${rev.id}`} className="h-9 w-[5.5rem] font-mono">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {listaAnosCompetenciaParaSelect().map((y) => (
                                <SelectItem key={`${rev.id}-${y}`} value={String(y)}>
                                  {y}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {!rev.competenciaConfirmada && (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-9"
                            onClick={() => patchRevisaoMensal(rev.id, { competenciaConfirmada: true })}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden />
                            Confirmar competência
                          </Button>
                        )}
                      </div>

                      <div className="space-y-1.5 pt-1 border-t border-border/60">
                        <Label htmlFor={`emit-${rev.id}`} className="text-xs font-medium">
                          Tipo de extrato (mesmo mês pode ter 2 PDFs)
                        </Label>
                        <Select
                          value={rev.emitKind}
                          onValueChange={(v) => {
                            if (v === "mensal_principal" || v === "folha_especial")
                              patchRevisaoMensal(rev.id, { emitKind: v });
                          }}
                        >
                          <SelectTrigger id={`emit-${rev.id}`} className="h-9 w-full max-w-md text-left">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EMIT_MENSAL_OPTIONS.map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {EMIT_MENSAL_OPTIONS.find((o) => o.id === rev.emitKind)?.descr}
                        </p>
                        {revisoesComDuplicidadeDeTipo.has(rev.id) && (
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 leading-snug">
                            Duplicidade: já existe outro cartão nesta fila com o mesmo mês/ano e este mesmo tipo de extrato.
                          </p>
                        )}
                        {isMensalRevisaoOk(rev) && revisaoEhAdiantamentoParcial130(rev) && (
                          <p className="text-[11px] font-medium text-blue-700 dark:text-blue-300 leading-snug">
                            Autoexcluído: junho é só a 1ª parcela parcial do 13º, sem descontos. A quitação completa entra na folha especial de dezembro.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center text-sm">
                      <div className="rounded-lg bg-blue-500/10 p-3">
                        <div className="text-xs text-muted-foreground">Bruto</div>
                        <div className="font-bold text-blue-600 tabular-nums">
                          {formatBRL(rev.parsed.grossSalary)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-red-500/10 p-3">
                        <div className="text-xs text-muted-foreground">Descontos</div>
                        <div className="font-bold text-red-600 tabular-nums">
                          {formatBRL(rev.parsed.totalDiscounts)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-green-500/10 p-3">
                        <div className="text-xs text-muted-foreground">Líquido</div>
                        <div className="font-bold text-green-600 tabular-nums">
                          {formatBRL(rev.parsed.netSalary)}
                        </div>
                      </div>
                    </div>

                    {rev.parsed.leituraPossivelmenteIncompleta && (
                      <div
                        className={cn(
                          "rounded-lg border px-3 py-3 text-xs flex flex-col sm:flex-row gap-3 items-start",
                          !rev.ocrReforcoRealizado
                            ? "border-destructive/55 bg-destructive/10 text-destructive-foreground dark:bg-destructive/15 dark:text-red-100"
                            : "border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                        )}
                      >
                        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
                        <div className="space-y-2.5 flex-1 min-w-0">
                          <p className="font-semibold text-sm">
                            {!rev.ocrReforcoRealizado
                              ? "Leitura incompleta — gravar está bloqueado até reforçar o OCR"
                              : "Leitura ainda parece incompleta após OCR reforçado"}
                          </p>
                          <p className="leading-relaxed text-[13px] opacity-95">
                            A primeira passagem não trouxe o padrão típico (rubricas de desconto, totais no texto). Pode
                            ser PNG fraco, captura de ecrã escuro ou PDF parcial. O botão abaixo volta a ler o{" "}
                            <strong className="font-semibold">mesmo ficheiro</strong> em modo intensivo (vários algoritmos
                            de segmentação + pré-processamento). Prefira o PDF oficial do SEAD quando possível.
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <Button
                              type="button"
                              size="sm"
                              variant={!rev.ocrReforcoRealizado ? "default" : "secondary"}
                              disabled={
                                reocrBusyId === rev.id || busy || savingKey !== null
                              }
                              onClick={() => void releOcrMensalReforcado(rev.id)}
                              className="shrink-0"
                            >
                              {reocrBusyId === rev.id ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                              ) : (
                                <ScanLine className="h-4 w-4 mr-2" aria-hidden />
                              )}
                              Re-ler com OCR reforçado
                            </Button>
                            {rev.ocrReforcoRealizado && (
                              <span className="text-[11px] text-muted-foreground">
                                Releitura já executada — pode gravar, mas confira no portal se faltar descontos.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <CartaoSaqueEmbutidoFolhaCard
                      embutido
                      competencia={{
                        mes: rev.periodoEdicao.month,
                        ano: rev.periodoEdicao.year,
                      }}
                      analise={
                        rev.parsed.cartaoSaqueContracheque ?? {
                          ...ANALISE_CARTAO_SAQUE_VAZIA,
                          competencia: {
                            mes: rev.periodoEdicao.month,
                            ano: rev.periodoEdicao.year,
                          },
                        }
                      }
                      {...(() => {
                        const gravado = payslipsHistorico.find(
                          (p) =>
                            p.month === rev.periodoEdicao.month &&
                            p.year === rev.periodoEdicao.year,
                        );
                        return {
                          payslipId: gravado?.id,
                          statusInicial:
                            (gravado?.cartao_saque_status_conferencia as StatusConferenciaCartaoSaqueEmbutido | null) ??
                            null,
                          bancoColuna: gravado?.cartao_saque_banco_possivel,
                          valorMensalColuna: gravado?.cartao_saque_valor_mensal ?? undefined,
                        };
                      })()}
                    />

                    {(avisos130PorRevId[rev.id]?.length ?? 0) > 0 && (
                      <div className="space-y-2">
                        {avisos130PorRevId[rev.id]!.map((a) => (
                          <div
                            key={a.id}
                            className={cn(
                              "rounded-lg border p-3 text-xs leading-relaxed",
                              a.severidade === "aviso"
                                ? "border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                                : "border-sky-500/40 bg-sky-500/5 text-slate-800 dark:text-slate-200"
                            )}
                          >
                            <p className="font-medium flex items-center gap-2">
                              <Info className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                              {a.titulo}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1.5">{a.detalhe}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {rev.parsed.instituicoesDetectadas.length > 0 && (
                      <div className="text-xs flex flex-wrap gap-1">
                        <span className="text-muted-foreground">Instituições reconhecidas:</span>
                        {rev.parsed.instituicoesDetectadas.map((b) => (
                          <span key={`${rev.id}-${b.compe}`} className="px-2 py-0.5 rounded bg-muted">
                            {b.compe} {b.nome}
                          </span>
                        ))}
                      </div>
                    )}

                    {conferenciaPorRevId[rev.id] != null &&
                      conferenciaPorRevId[rev.id]!.alertas.length > 0 && (
                        <div
                          className={cn(
                            "rounded-lg border p-3 text-xs space-y-2",
                            conferenciaExigeConfirmacaoTotais(conferenciaPorRevId[rev.id]!)
                              ? "border-red-500/55 bg-red-500/10 text-red-950 dark:text-red-100"
                              : "border-border bg-muted/35",
                          )}
                        >
                          <p className="font-medium flex items-center gap-2">
                            <AlertTriangle
                              className={cn(
                                "h-4 w-4 shrink-0",
                                conferenciaExigeConfirmacaoTotais(conferenciaPorRevId[rev.id]!)
                                  ? "text-red-600"
                                  : "text-amber-600",
                              )}
                              aria-hidden
                            />
                            Conferência automática (ganhos, despesas e mês anterior)
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Soma das rubricas vs. cabeçalho do OCR e comparação com a base histórica. Na gravação,
                            totais incoerentes com as linhas são corrigidos a partir das rubricas.
                          </p>
                          {conferenciaPorRevId[rev.id]!.totaisCorrigidos && (
                            <p className="text-[11px] font-medium tabular-nums">
                              Totais que serão gravados: bruto{" "}
                              {formatBRL(conferenciaPorRevId[rev.id]!.totaisCorrigidos!.bruto)}, descontos{" "}
                              {formatBRL(conferenciaPorRevId[rev.id]!.totaisCorrigidos!.descontos)}, líquido{" "}
                              {formatBRL(conferenciaPorRevId[rev.id]!.totaisCorrigidos!.liquido)}
                            </p>
                          )}
                          {conferenciaPorRevId[rev.id]!.mesAnterior && (
                            <p className="text-[11px] text-muted-foreground tabular-nums">
                              Mês anterior ({String(conferenciaPorRevId[rev.id]!.mesAnterior!.mes).padStart(2, "0")}/
                              {conferenciaPorRevId[rev.id]!.mesAnterior!.ano}): ganhos{" "}
                              {formatBRL(conferenciaPorRevId[rev.id]!.mesAnterior!.somaGanhos)}, descontos{" "}
                              {formatBRL(conferenciaPorRevId[rev.id]!.mesAnterior!.somaDescontos)}
                            </p>
                          )}
                          <ul className="list-disc pl-4 space-y-1 text-[11px] leading-snug max-h-40 overflow-auto">
                            {conferenciaPorRevId[rev.id]!.alertas
                              .filter((a) => a.categoria !== "rubrica_desconto" && a.categoria !== "rubrica_ganho")
                              .map((a) => (
                                <li key={a.id}>
                                  <span
                                    className={
                                      a.severidade === "critico"
                                        ? "text-red-700 dark:text-red-300 font-medium"
                                        : ""
                                    }
                                  >
                                    {a.titulo}: {a.descricao}
                                  </span>
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}

                    {alertasDescontoPorRevId[rev.id] != null &&
                      alertasDescontoPorRevId[rev.id]!.alertas.length > 0 && (
                        <div
                          className={cn(
                            "rounded-lg border p-3 text-xs space-y-2",
                            alertasDescontoPorRevId[rev.id]!.bloqueiaSemConfirmacao
                              ? "border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                              : "border-border bg-muted/40"
                          )}
                        >
                          <p className="font-medium flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                            Descontos vs. histórico gravado (ficha + mensais)
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Rubricas repetidas costumam ter valores estáveis. Desvios grandes ou rubricas novas são
                            assinalhadas — confira no PDF (OCR pode trocar dígitos).
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-[11px] leading-snug">
                            {alertasDescontoPorRevId[rev.id]!.alertas.map((a) => (
                              <li key={`${rev.id}-d-${a.idx}`}>
                                <span className="font-mono text-[10px] opacity-80">L{a.idx + 1}</span>{" "}
                                {a.rubrica.slice(0, 56)}
                                {a.rubrica.length > 56 ? "…" : ""} —{" "}
                                <span
                                  className={
                                    a.nivel === "desvio"
                                      ? "text-red-600 dark:text-red-400 font-medium"
                                      : "text-amber-800 dark:text-amber-300"
                                  }
                                >
                                  {a.mensagem}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {alertasDescontoPorRevId[rev.id]!.bloqueiaSemConfirmacao && (
                            <label className="flex items-start gap-2 cursor-pointer pt-1 border-t border-amber-500/30">
                              <input
                                type="checkbox"
                                className="rounded border-input mt-0.5"
                                checked={Boolean(confirmacaoDescontosRevisados[rev.id])}
                                onChange={(e) =>
                                  setConfirmacaoDescontosRevisados((p) => ({
                                    ...p,
                                    [rev.id]: e.target.checked,
                                  }))
                                }
                              />
                              <span>
                                Revisei os descontos assinalhados na tabela e no PDF — posso gravar este extrato.
                              </span>
                            </label>
                          )}
                        </div>
                      )}

                    {alertasGanhoPorRevId[rev.id] != null &&
                      alertasGanhoPorRevId[rev.id]!.alertas.length > 0 && (
                        <div
                          className={cn(
                            "rounded-lg border p-3 text-xs space-y-2",
                            alertasGanhoPorRevId[rev.id]!.bloqueiaSemConfirmacao
                              ? "border-sky-500/50 bg-sky-500/10 text-sky-950 dark:text-sky-100"
                              : "border-border bg-muted/40"
                          )}
                        >
                          <p className="font-medium flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                            Ganhos (receitas) vs. histórico gravado (ficha + mensais)
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Gratificações e soldo costumam repetir mês a mês (com reajuste gradual). Valores muito
                            diferentes ou rubricas novas são assinaladas — o histórico usa a ficha já gravada.
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-[11px] leading-snug">
                            {alertasGanhoPorRevId[rev.id]!.alertas.map((a) => (
                              <li key={`${rev.id}-g-${a.idx}`}>
                                <span className="font-mono text-[10px] opacity-80">L{a.idx + 1}</span>{" "}
                                {a.rubrica.slice(0, 56)}
                                {a.rubrica.length > 56 ? "…" : ""} —{" "}
                                <span
                                  className={
                                    a.nivel === "desvio"
                                      ? "text-red-600 dark:text-red-400 font-medium"
                                      : "text-amber-800 dark:text-amber-300"
                                  }
                                >
                                  {a.mensagem}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {alertasGanhoPorRevId[rev.id]!.bloqueiaSemConfirmacao && (
                            <label className="flex items-start gap-2 cursor-pointer pt-1 border-t border-sky-500/30">
                              <input
                                type="checkbox"
                                className="rounded border-input mt-0.5"
                                checked={Boolean(confirmacaoGanhosRevisados[rev.id])}
                                onChange={(e) =>
                                  setConfirmacaoGanhosRevisados((p) => ({
                                    ...p,
                                    [rev.id]: e.target.checked,
                                  }))
                                }
                              />
                              <span>
                                Revisei os ganhos/receitas assinalados na tabela e no PDF — posso gravar este extrato.
                              </span>
                            </label>
                          )}
                        </div>
                      )}

                    {(alertasBancoOficialPorRevId[rev.id]?.length ?? 0) > 0 && (
                      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100 p-3 text-xs space-y-2">
                        <p className="font-medium flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                          Instituição bancária sem confirmação oficial
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Há rubricas de empréstimo/consignado sem COMPE/sigla/nome confirmado na base curada. Confira no PDF e, se
                          necessário, valide no Bacen e no site do banco antes de gravar.
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-[11px] leading-snug">
                          {alertasBancoOficialPorRevId[rev.id]!.slice(0, 8).map((a) => (
                            <li key={`${rev.id}-b-${a.idx}`}>
                              <span className="font-mono text-[10px] opacity-80">L{a.idx + 1}</span>{" "}
                              {a.codigo ? `[${a.codigo}] ` : ""}
                              {a.rubrica.slice(0, 68)}
                              {a.rubrica.length > 68 ? "…" : ""}
                            </li>
                          ))}
                        </ul>
                        <label className="flex items-start gap-2 cursor-pointer pt-1 border-t border-amber-500/30">
                          <input
                            type="checkbox"
                            className="rounded border-input mt-0.5"
                            checked={Boolean(confirmacaoBancosOficiaisRevisados[rev.id])}
                            onChange={(e) =>
                              setConfirmacaoBancosOficiaisRevisados((p) => ({
                                ...p,
                                [rev.id]: e.target.checked,
                              }))
                            }
                          />
                          <span>
                            Revisei os bancos não confirmados (sigla/nome/COMPE) no PDF e em fonte oficial — posso gravar.
                          </span>
                        </label>
                      </div>
                    )}

                    {rev.parsed.items.length === 0 &&
                      (rev.parsed.grossSalary > 0 || rev.parsed.netSalary > 0) && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Totais do rodapé lidos; a tabela de rubricas depende das linhas do PDF. Se ficar vazia, exporte ou
                          use PDF com texto selecionável.
                        </p>
                      )}

                    <div className="max-h-64 overflow-auto rounded-lg border border-border text-xs font-mono">
                      <table className="w-full">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left px-2 py-1">Cód.</th>
                            <th className="text-left px-2 py-1">Rubrica</th>
                            <th className="text-left px-2 py-1 w-[104px]">IF ref.</th>
                            <th className="text-left px-2 py-1">Parcela</th>
                            <th className="text-left px-2 py-1">Tipo</th>
                            <th className="text-right px-2 py-1">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const advMap = alertaPorIndiceDesconto(
                              alertasDescontoPorRevId[rev.id]?.alertas ?? []
                            );
                            const gMap = alertaPorIndiceRubrica(
                              alertasGanhoPorRevId[rev.id]?.alertas ?? []
                            );
                            return rev.parsed.items.map((it, idx) => {
                              const dAlert = it.type === "desconto" ? advMap.get(idx) : undefined;
                              const gAlert = it.type === "vantagem" ? gMap.get(idx) : undefined;
                              return (
                            <tr
                              key={`${rev.id}-${idx}-${it.description}-${it.value}`}
                              className={cn(
                                "border-t border-border/70",
                                (dAlert?.nivel === "desvio" || gAlert?.nivel === "desvio") &&
                                  "bg-red-500/12 dark:bg-red-950/35",
                                (dAlert?.nivel === "incerto" || gAlert?.nivel === "incerto") &&
                                  "bg-amber-500/10 dark:bg-amber-950/25"
                              )}
                            >
                              <td className="px-2 py-1">{it.code ?? "—"}</td>
                              <td className="px-2 py-1">
                                <RubricaComParcelaVisual it={it} descMaxLen={80} />
                              </td>
                              <td className="px-2 py-1 align-top text-[10px] leading-tight text-muted-foreground">
                                {it.bancoConfirmacao ? (
                                  <div className="space-y-0.5">
                                    <div className="font-mono text-foreground/90">
                                      {it.bancoConfirmacao.compe} · {it.bancoConfirmacao.confiancaRef === "alta" ? "ref. alta" : "ref. média"}
                                    </div>
                                    <div className="truncate max-w-[96px]" title={it.bancoConfirmacao.nome}>
                                      {it.bancoConfirmacao.nome}
                                    </div>
                                    <div className="flex flex-wrap gap-x-1.5">
                                      {it.bancoConfirmacao.urlsReferencia.slice(0, 3).map((u) => (
                                        <a
                                          key={u}
                                          href={u}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-primary underline-offset-2 hover:underline shrink-0"
                                        >
                                          {u.includes("bcb.gov.br") ? "Bacen" : u.includes("caixa.gov.br") ? "Caixa" : u.includes("bb.com.br") ? "BB" : u.includes("sicoob") ? "Sicoob" : "Site"}
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                ) : it.banco ? (
                                  <span className="font-mono text-foreground/80" title={it.banco.nome}>
                                    {it.banco.compe}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-2 py-1 tabular-nums text-muted-foreground">
                                {it.parcelaAtual != null && it.parcelaTotal != null
                                  ? formatarParcelaExibicao(it.parcelaAtual, it.parcelaTotal)
                                  : "—"}
                              </td>
                              <td className="px-2 py-1">{it.type === "vantagem" ? "ganho" : "desconto"}</td>
                              <td className="text-right px-2 py-1 tabular-nums">{formatBRL(it.value)}</td>
                            </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>

                    {precisaConfirmacaoManualGravar(rev, conferenciaPorRevId[rev.id]) && (
                      <label
                        className={cn(
                          "flex items-start gap-2 cursor-pointer text-xs text-muted-foreground rounded-lg px-3 py-2",
                          conferenciaPorRevId[rev.id] &&
                            conferenciaExigeConfirmacaoTotais(conferenciaPorRevId[rev.id]!)
                            ? "border border-red-500/40 bg-red-500/8"
                            : "border border-amber-500/35 bg-amber-500/8",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-input mt-0.5"
                          checked={Boolean(confirmacaoGravacaoManualPorRevId[rev.id])}
                          onChange={(e) =>
                            setConfirmacaoGravacaoManualPorRevId((p) => ({
                              ...p,
                              [rev.id]: e.target.checked,
                            }))
                          }
                        />
                        <span>
                          {conferenciaPorRevId[rev.id] &&
                          conferenciaExigeConfirmacaoTotais(conferenciaPorRevId[rev.id]!)
                            ? "Revisei a conferência automática (cabeçalho vs rubricas; totais serão corrigidos na gravação) — posso gravar."
                            : "Revisei manualmente totais e rubricas neste extrato (ou aceito leitura incompleta) — posso gravar na base mesmo assim."}
                        </span>
                      </label>
                    )}

                    <Button
                      disabled={
                        savingKey !== null ||
                        reocrBusyId === rev.id ||
                        !rev.competenciaConfirmada ||
                        revisaoEhAdiantamentoParcial130(rev) ||
                        revisoesComDuplicidadeDeTipo.has(rev.id) ||
                        (precisaConfirmacaoManualGravar(rev, conferenciaPorRevId[rev.id]) &&
                          !confirmacaoGravacaoManualPorRevId[rev.id]) ||
                        ((alertasBancoOficialPorRevId[rev.id]?.length ?? 0) > 0 &&
                          !confirmacaoBancosOficiaisRevisados[rev.id]) ||
                        Boolean(
                          alertasDescontoPorRevId[rev.id]?.bloqueiaSemConfirmacao &&
                            !confirmacaoDescontosRevisados[rev.id]
                        ) ||
                        Boolean(
                          alertasGanhoPorRevId[rev.id]?.bloqueiaSemConfirmacao &&
                            !confirmacaoGanhosRevisados[rev.id]
                        )
                      }
                      onClick={() => void gravarUmMensalPorId(rev.id)}
                      variant="outline"
                      className="w-full sm:w-auto"
                    >
                      {savingKey === `mensal:${rev.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                      ) : (
                        <Save className="h-4 w-4 mr-2" aria-hidden />
                      )}
                      Gravar este extrato
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "ficha" && fichaMeses.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          {(busy || fichaReocrBusy) && leituraStatus && (
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200/60 text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              {leituraStatus} ({progress}%)
            </div>
          )}
          <div className="p-4 border-b border-border space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <LayoutList className="h-4 w-4 shrink-0" aria-hidden />
                <span className="font-semibold">Meses extraídos (ficha corrida)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || fichaReocrBusy || !fichaSourceFile}
                  onClick={() => void releFichaPdfReforcado(false)}
                  title="Volta a ler o PDF e segmenta (útil após atualização do app ou para confirmar a união CONTINUAÇÃO)."
                >
                  {fichaReocrBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" aria-hidden />
                  )}
                  Re-processar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy || fichaReocrBusy || !fichaSourceFile}
                  onClick={() => void releFichaPdfReforcado(true)}
                  title={`PDF: camada de texto em todas as páginas; OCR canvas só até ${MAX_SCANNED_PDF_OCR_PAGES} páginas (fichas longas usam principalmente o texto do PDF).`}
                >
                  {fichaReocrBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                  ) : (
                    <ScanLine className="h-4 w-4 mr-2" aria-hidden />
                  )}
                  Re-ler PDF (reforçado)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="shrink-0"
                  disabled={
                    busy ||
                    fichaReocrBusy ||
                    gravandoAlgumaLinhaFicha ||
                    fichaMesesVisiveis.filter((r) => {
                      const k = `${r.year}-${r.month}`;
                      const conf = conferenciaFichaPorKey[k];
                      return (
                        !fichaPrecisaConfirmacaoManual(r, conf) ||
                        confirmacaoGravacaoManualFicha[k]
                      );
                    }).length === 0
                  }
                  onClick={() => void salvarTodasFichaLinhas()}
                >
                  {savingKey === "ficha_todos" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                  ) : (
                    <Save className="h-4 w-4 mr-2" aria-hidden />
                  )}
                  {fichaLoteProgress
                    ? `Gravando ${fichaLoteProgress.atual}/${fichaLoteProgress.total}…`
                    : "Gravar todos"}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="rounded border-input"
                  checked={ocultarFichaAoGravar}
                  onChange={(e) => setOcultarFichaAoGravar(e.target.checked)}
                />
                Ao gravar, ocultar a competência e avançar para o próximo mês.
              </label>
              {fichaOcultasCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setFichaOcultasAposGravar({})}
                >
                  Mostrar gravados ({fichaOcultasCount})
                </Button>
              )}
            </div>
            {fichaContinuacoesDetectadas > 0 && (
              <div className="rounded-lg border border-sky-500/45 bg-sky-500/8 px-3 py-2.5 text-xs text-slate-800 dark:text-sky-100 flex gap-2 items-start">
                <Info className="h-4 w-4 shrink-0 mt-0.5 opacity-90" aria-hidden />
                <p className="leading-relaxed">
                  Foram encontrados <strong>{fichaContinuacoesDetectadas}</strong> marcador(es){" "}
                  <code className="rounded bg-muted px-1">(CONTINUAÇÃO)</code> no ficheiro — típico quando cabem ~3
                  competências por página e a seguinte continua na folha seguinte. O texto foi <strong>unificado</strong>{" "}
                  automaticamente (remove o cabeçalho duplicado antes das rubricas). Se algum mês ficar com totais estranhos,
                  use <strong>Re-ler PDF (reforçado)</strong>.
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cada linha corresponde a <strong className="text-foreground/90">uma competência</strong> (por exemplo
              Janeiro/2012 … Dezembro/2025). Pode usar <strong className="text-foreground/90">Gravar</strong> na linha ou{" "}
              <strong className="text-foreground/90">Gravar todos</strong> nas linhas com leitura válida ou com confirmação
              manual na linha. Contracheque de <strong className="text-foreground/90">um</strong> mês vai ao
              separador «Contracheque mensal».
            </p>
            {avisosFicha130.length > 0 && (
              <div className="space-y-2 pt-1">
                {avisosFicha130.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "rounded-lg border p-3 text-xs leading-relaxed",
                      a.severidade === "aviso"
                        ? "border-amber-500/50 bg-amber-500/10"
                        : "border-sky-500/40 bg-sky-500/5"
                    )}
                  >
                    <p className="font-medium flex items-center gap-2">
                      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {a.titulo}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">{a.detalhe}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] uppercase">
              <tr>
                <th className="text-left px-3 py-2">Competência</th>
                <th className="text-right px-3 py-2">Bruto</th>
                <th className="text-right px-3 py-2">Desc.</th>
                <th className="text-right px-3 py-2">Líquido</th>
                <th className="px-3 py-2 min-w-[9rem]">Ação</th>
              </tr>
            </thead>
            <tbody>
              {fichaMesesVisiveis.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Todas as competências visíveis foram gravadas/ocultadas. Use «Mostrar gravados» para revisar novamente.
                  </td>
                </tr>
              ) : fichaMesesVisiveis.map((row) => {
                const k = `${row.year}-${row.month}`;
                const confLinha = conferenciaFichaPorKey[k];
                const fraco = fichaPrecisaConfirmacaoManual(row, confLinha);
                const descontos = row.items.filter((it) => it.type === "desconto" && it.value > 0);
                const ganhos = row.items.filter((it) => it.type === "vantagem" && it.value > 0);
                const histFicha = alertasHistoricoFichaPorKey[k];
                const alertasHistFicha = [
                  ...(histFicha?.descontos.alertas ?? []),
                  ...(histFicha?.ganhos.alertas ?? []),
                ];
                return (
                  <Fragment key={k}>
                    <tr key={`${k}:totais`} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">
                        {row.label}
                        {confLinha.totaisCorrigidos && (
                          <span className="block text-[10px] font-normal text-red-600 dark:text-red-400 mt-0.5">
                            Cabeçalho diverge — na gravação: bruto {formatBRL(confLinha.totaisCorrigidos.bruto)}
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums text-blue-600">{formatBRL(row.grossSalary)}</td>
                      <td className="text-right px-3 py-2 tabular-nums text-red-600">{formatBRL(row.totalDiscounts)}</td>
                      <td className="text-right px-3 py-2 tabular-nums text-green-600">{formatBRL(row.netSalary)}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-col gap-2">
                          {fraco && (
                            <label className="flex items-start gap-1.5 cursor-pointer text-[11px] text-muted-foreground">
                              <input
                                type="checkbox"
                                className="rounded border-input mt-0.5 shrink-0"
                                checked={Boolean(confirmacaoGravacaoManualFicha[k])}
                                onChange={(e) =>
                                  setConfirmacaoGravacaoManualFicha((p) => ({
                                    ...p,
                                    [k]: e.target.checked,
                                  }))
                                }
                              />
                              <span>
                                {conferenciaExigeConfirmacaoTotais(confLinha)
                                  ? "Confirmo conferência (cabeçalho vs rubricas) e gravação com totais corrigidos."
                                  : "Confirmo gravação após revisão manual dos totais."}
                              </span>
                            </label>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="self-start"
                            disabled={
                              savingKey === k || savingKey === "ficha_todos" || (fraco && !confirmacaoGravacaoManualFicha[k])
                            }
                            onClick={() => void salvarFichaLinha(row)}
                          >
                            {savingKey === k ? <Loader2 className="h-3 w-3 animate-spin" /> : "Gravar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    <tr key={`${k}:rubricas`} className="border-t border-border/50 bg-muted/15">
                      <td colSpan={5} className="px-3 py-2">
                        <details className="group">
                          <summary className="cursor-pointer select-none text-xs font-medium text-slate-700 dark:text-slate-200 hover:underline">
                            Ver rubricas de {row.label}: {descontos.length} desconto(s), {ganhos.length} ganho(s)
                            {row.items.length === 0 ? " — nenhuma rubrica lida" : ""}
                            {alertasHistFicha.length > 0
                              ? ` — ${alertasHistFicha.length} aviso(s) vs. histórico`
                              : ""}
                          </summary>
                          {alertasHistFicha.length > 0 && (
                            <ul className="mt-2 list-disc pl-4 text-[10px] text-amber-800 dark:text-amber-200 space-y-0.5 max-h-24 overflow-y-auto">
                              {alertasHistFicha.slice(0, 6).map((a) => (
                                <li key={`${k}-h-${a.idx}-${a.chave}`}>
                                  L{a.idx + 1} {a.rubrica.slice(0, 40)} — {a.mensagem.slice(0, 72)}
                                  {a.mensagem.length > 72 ? "…" : ""}
                                </li>
                              ))}
                              {alertasHistFicha.length > 6 && (
                                <li>+{alertasHistFicha.length - 6} aviso(s)…</li>
                              )}
                            </ul>
                          )}
                          {row.items.length === 0 ? (
                            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                              Só os totais foram lidos para esta competência. Use «Re-ler PDF (reforçado)» ou confira o documento original antes de gravar.
                            </p>
                          ) : (
                            <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/70 uppercase text-[10px]">
                                  <tr>
                                    <th className="text-left px-2 py-1.5">Cód.</th>
                                    <th className="text-left px-2 py-1.5">Rubrica</th>
                                    <th className="text-left px-2 py-1.5">Parcela</th>
                                    <th className="text-left px-2 py-1.5">Tipo</th>
                                    <th className="text-right px-2 py-1.5">Valor</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(() => {
                                    const dMap = alertaPorIndiceDesconto(
                                      histFicha?.descontos.alertas ?? [],
                                    );
                                    const gMap = alertaPorIndiceRubrica(histFicha?.ganhos.alertas ?? []);
                                    return row.items.map((it, idx) => {
                                      const dAlert = it.type === "desconto" ? dMap.get(idx) : undefined;
                                      const gAlert = it.type === "vantagem" ? gMap.get(idx) : undefined;
                                      return (
                                    <tr
                                      key={`${k}:${idx}:${it.code ?? ""}:${it.description}:${it.value}`}
                                      className={cn(
                                        "border-t border-border/60",
                                        it.type === "desconto" ? "bg-red-500/5" : "bg-blue-500/5",
                                        (dAlert?.nivel === "desvio" || gAlert?.nivel === "desvio") &&
                                          "bg-red-500/15",
                                        (dAlert?.nivel === "incerto" || gAlert?.nivel === "incerto") &&
                                          "bg-amber-500/10"
                                      )}
                                    >
                                      <td className="px-2 py-1.5 font-mono">{it.code ?? "—"}</td>
                                      <td className="px-2 py-1.5">
                                        <RubricaComParcelaVisual it={it} />
                                      </td>
                                      <td className="px-2 py-1.5 font-mono">
                                        {it.parcelaAtual != null && it.parcelaTotal != null
                                          ? formatarParcelaExibicao(it.parcelaAtual, it.parcelaTotal)
                                          : "—"}
                                      </td>
                                      <td className="px-2 py-1.5">{it.type === "desconto" ? "desconto" : "ganho"}</td>
                                      <td
                                        className={cn(
                                          "px-2 py-1.5 text-right tabular-nums font-medium",
                                          it.type === "desconto" ? "text-red-600" : "text-blue-600"
                                        )}
                                      >
                                        {formatBRL(it.value)}
                                      </td>
                                    </tr>
                                      );
                                    });
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </details>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "cartao" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Rubricas de <strong>desconto</strong> com termos de cartão, RMC, RCC ou saque embutido. Pendente de conferência
            — não tratar como empréstimo comum no cadastro automático.
          </p>
          <CartaoSaqueEmbutidoPainel payslips={payslipsHistorico} />
        </div>
      )}

      {tab === "tipos" && (
        <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <Sparkles className="h-4 w-4" aria-hidden /> Documentos e extensibilidade
          </div>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Contracheque mensal:</strong> palavras-chave nos documentos oficiais (ex.: TOTAL DE GANHOS, DATA MM/AAAA, rubricas com código SEAD).
            </li>
            <li>
              <strong>Ficha financeira / ficha corrida:</strong> o mesmo PDF com vários meses/anos (ex. SEAD{" "}
              <code className="text-xs bg-muted px-1 rounded">JANEIRO/2012</code> … ou{" "}
              <code className="text-xs bg-muted px-1 rounded">DATA MM/AAAA</code> por bloco). O sistema abre a tabela com
              uma linha por competência; gravar confirma só essa linha. Títulos com letras espaçadas (
              <code className="text-xs bg-muted px-1 rounded">F I C H A … F I N A N C E I R A</code>) e intervalos{" "}
              <code className="text-xs bg-muted px-1 rounded">PERIODO JAN/AAAA A DEZ/AAAA</code> detetam ficha corrida mesmo
              no separador «Contracheque mensal». Em PDFs com <strong>vários blocos por página</strong>, o 4.º bloco pode
              partir para a página seguinte com{" "}
              <code className="text-xs bg-muted px-1 rounded">- MÊS/ANO(CONTINUAÇÃO)</code> (ou{" "}
              <code className="text-xs bg-muted px-1 rounded">CONTINUACAO</code> sem acento): o app remove esse marcador e o
              cabeçalho repetido <code className="text-xs bg-muted px-1 rounded">FOLHA MENSAL / COD DESCRICAO…</code> antes
              de segmentar, juntando as rubricas ao mesmo mês. Use os botões «Re-processar» / «Re-ler PDF (reforçado)» na
              revisão da ficha se algo falhar após mudar de versão ou com OCR fraco.
            </li>
            <li>
              <strong>Outros órgãos ou layouts:</strong> o mesmo motor (PDF texto + OCR) aceita PNG/JPG/WEBP/TIFF; novos parsers podem ser ligados mantendo{" "}
              <code className="text-xs bg-muted px-1 rounded">payslips</code> no Supabase como destino único para análises.
            </li>
          </ul>
          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            Se a gravação acusar coluna em falta (ex. <code className="bg-muted px-1 rounded">folha_emit_kind</code>), no
            SQL Editor do Supabase execute{" "}
            <code className="bg-muted px-1 rounded">supabase/patch_payslips_folha_emit.sql</code> (ou crie a tabela com{" "}
            <code className="bg-muted px-1 rounded">supabase/payslips.sql</code>).
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link href="/dashboard/analise" className="text-blue-600 underline text-sm dark:text-blue-400">
              Análise IA
            </Link>
            <Link href="/dashboard/boletins" className="text-blue-600 underline text-sm dark:text-blue-400">
              Boletins
            </Link>
            <Link href="/dashboard/transactions" className="text-blue-600 underline text-sm dark:text-blue-400">
              Transações
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
