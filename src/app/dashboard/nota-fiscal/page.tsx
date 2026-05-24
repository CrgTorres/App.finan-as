"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  extractTextFromImage,
  extractTextFromPDF,
  extractTextFromScannedPdf,
} from "@/lib/nota-fiscal/ocr";
import { parseInvoiceText, parseInvoiceXML } from "@/lib/nota-fiscal/parser";
import type { InvoiceData } from "@/lib/nota-fiscal/parser";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import type { Category } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileImage, FileText, Upload, CheckCircle2, AlertTriangle,
  Sparkles, Info, ZoomIn, Sun, Move, FileCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";

type Step = "idle" | "processing" | "review" | "success";

const QUALITY_TIPS = [
  { icon: Sun,      text: "Boa iluminação, sem reflexos ou sombras sobre o documento" },
  { icon: ZoomIn,   text: "Imagem nítida — aproxime a câmera até o texto ficar legível" },
  { icon: Move,     text: "Documento plano e enquadrado, sem dobras ou amassados" },
  { icon: FileCheck,text: "Resolução mínima recomendada: 300 DPI (ou foto bem focada)" },
];

function formatAmountDisplay(value: number): string {
  if (!value) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function NotaFiscalPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("idle");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [isPDF, setIsPDF] = useState(false);

  // Formulário de revisão
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [description, setDescription] = useState("");
  const [amountDisplay, setAmountDisplay] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState("");
  const [category, setCategory] = useState<Category>("Outros");
  const [type, setType] = useState<"despesa" | "receita">("despesa");
  const [saving, setSaving] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  function handleAmountInput(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) { setAmountDisplay(""); setAmount(0); return; }
    const cents = parseInt(digits, 10);
    const val = cents / 100;
    setAmountDisplay(val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setAmount(val);
  }

  async function processFile(file: File) {
    setFileName(file.name);
    setIsPDF(file.name.toLowerCase().endsWith(".pdf"));
    setStep("processing");
    setProgress(0);
    setProgressLabel("Iniciando leitura…");

    // Preview para imagens
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let data: InvoiceData;

      if (ext === "xml") {
        // NF-e / NFC-e XML — leitura direta, sem OCR
        setProgressLabel("Lendo NF-e XML…");
        setProgress(0.5);
        const xmlText = await file.text();
        data = parseInvoiceXML(xmlText);
        setProgress(1);
      } else {
        let text = "";
        if (ext === "pdf") {
          setProgressLabel("Extraindo texto do PDF…");
          setProgress(0.3);
          text = await extractTextFromPDF(file);
          if (!text.trim()) {
            setProgressLabel("PDF escaneado detectado — usando OCR…");
            text = await extractTextFromScannedPdf(file, ({ status, progress: p }) => {
              setProgressLabel(translateStatus(status));
              setProgress(0.3 + p * 0.7);
            });
          } else {
            setProgress(1);
          }
        } else {
          text = await extractTextFromImage(file, ({ status, progress: p }) => {
            setProgressLabel(translateStatus(status));
            setProgress(p);
          });
        }

        if (!text.trim()) {
          toast.error("Não foi possível extrair texto. Verifique a qualidade da imagem.");
          setStep("idle");
          return;
        }
        data = parseInvoiceText(text);
      }
      setInvoice(data);
      setDescription(data.description.charAt(0).toUpperCase() + data.description.slice(1));
      setAmount(data.amount);
      setAmountDisplay(formatAmountDisplay(data.amount));
      setDate(data.date);
      setCategory(data.category);
      setStep("review");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao processar o arquivo. Tente com outra imagem.");
      setStep("idle");
    }
  }

  function translateStatus(s: string): string {
    if (s.includes("loading")) return "Carregando motor OCR (português)…";
    if (s.includes("initializing")) return "Inicializando…";
    if (s.includes("recognizing")) return "Reconhecendo texto…";
    if (s.includes("idle")) return "Concluindo…";
    return s;
  }

  async function handleSave() {
    if (!amount || amount <= 0) { toast.error("Informe um valor válido."); return; }
    if (!description.trim()) { toast.error("Informe uma descrição."); return; }

    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Sessão expirada."); setSaving(false); return; }

    const ch = invoice?.chaveNFe?.replace(/\D/g, "") ?? "";
    const ref =
      (ch.length >= 8 ? `NF-e …${ch.slice(-12)}` : null) || fileName.trim() || undefined;
    const normalizedDescription = description.charAt(0).toUpperCase() + description.slice(1);

    // Bloqueia duplicidade lógica de nota:
    // prioridade pela referência da NF-e (source_ref), com fallback por data+valor+tipo+descrição.
    const dupQuery = supabase
      .from("transactions")
      .select("id, source_ref, description, amount, date, type")
      .eq("user_id", user.id)
      .eq("date", date)
      .eq("type", type)
      .eq("amount", amount);
    const { data: possibleDupRows, error: dupErr } = await dupQuery;
    if (dupErr) {
      toast.error(`Falha ao validar duplicidade: ${dupErr.message}`);
      setSaving(false);
      return;
    }

    const hasDuplicate = (possibleDupRows ?? []).some((row) => {
      const sameRef =
        (ref ?? "").trim() &&
        (row.source_ref ?? "").trim() &&
        row.source_ref?.trim() === ref?.trim();
      const sameDescription =
        String(row.description ?? "").trim().toUpperCase() === normalizedDescription.trim().toUpperCase();
      return Boolean(sameRef || sameDescription);
    });
    if (hasDuplicate) {
      toast.warning("Essa nota já foi lançada antes (duplicidade detectada).");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      description: normalizedDescription,
      amount,
      date,
      type,
      category,
      source_ref: ref ?? null,
      source_imported_at: new Date().toISOString(),
    });

    if (error) {
      toast.error(error.message.includes("check") ? `Erro ao salvar (${error.message}). Rode o patch SQL em supabase/patch_transactions_source_pets.sql se ainda não rodou.` : `Erro ao salvar: ${error.message}`);
      setSaving(false);
      return;
    }

    toast.success("Nota fiscal adicionada com sucesso!");
    emitDashboardDataUpdated({ origin: "nota_fiscal" });
    setStep("success");
    setSaving(false);
    router.refresh();
  }

  function dashboardHrefForSavedDate() {
    const parts = date.split("-");
    if (parts.length >= 2) {
      const y = parts[0];
      const m = parseInt(parts[1], 10);
      if (!Number.isNaN(m) && m >= 1 && m <= 12) {
        return `/dashboard?year=${y}&month=${m}`;
      }
    }
    return "/dashboard";
  }

  function reset() {
    setStep("idle");
    setInvoice(null);
    setPreviewUrl(null);
    setProgress(0);
  }

  const pct = Math.round(progress * 100);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          Nota Fiscal
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Envie uma imagem ou PDF — o sistema extrai os dados automaticamente
        </p>
      </div>

      {/* ─── ESTADO IDLE / upload ─── */}
      {step === "idle" && (
        <div className="space-y-4">

          {/* Aviso de qualidade */}
          <Card className="border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 shadow-none">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400">
                <Info className="h-4 w-4 shrink-0" />
                Para uma leitura perfeita, siga estas dicas:
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <ul className="space-y-2">
                {QUALITY_TIPS.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2.5 text-sm text-blue-800 dark:text-blue-300">
                    <Icon className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                    {text}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-blue-500 dark:text-blue-400 mt-3 pt-3 border-t border-blue-100 dark:border-blue-800">
                Formatos aceitos: <strong>JPG, PNG, WEBP, HEIC, PDF, XML (NF-e)</strong>
              </p>
            </CardContent>
          </Card>

          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-14 cursor-pointer transition-all",
              dragging
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                : "border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.pdf,.xml,.XML,.webp,.WEBP,.tif,.tiff,.heic,.HEIC"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
            />
            <div className="flex items-center gap-3">
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <FileImage className="h-6 w-6 text-slate-500" />
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <FileText className="h-6 w-6 text-slate-500" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {dragging ? "Solte o arquivo aqui" : "Arraste a nota fiscal ou clique para selecionar"}
              </p>
              <p className="text-xs text-slate-400">Imagem ou PDF</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                OCR automático em português
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── ESTADO PROCESSING ─── */}
      {step === "processing" && (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center py-16 gap-5">
            {/* Preview da imagem se disponível */}
            {previewUrl && (
              <div className="relative w-48 h-48 rounded-xl overflow-hidden border-2 border-blue-200 dark:border-blue-800 shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Nota fiscal" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-blue-900/20 animate-pulse" />
              </div>
            )}
            {!previewUrl && (
              <div className="p-5 bg-slate-100 dark:bg-slate-800 rounded-full">
                <FileText className="h-10 w-10 text-slate-400 animate-pulse" />
              </div>
            )}

            <div className="w-full max-w-sm space-y-2">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{progressLabel}</span>
                <span className="tabular-nums">{pct}%</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 text-center">
                {pct < 30
                  ? "Na primeira execução, o motor OCR é baixado (~5 MB). Aguarde…"
                  : pct < 80
                  ? "Lendo e reconhecendo o texto da nota…"
                  : "Finalizando extração…"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── ESTADO REVIEW ─── */}
      {step === "review" && invoice && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Upload className="h-4 w-4" />
            <span>
              Arquivo: <strong className="text-slate-700 dark:text-slate-300">{fileName}</strong>
            </span>
            <button onClick={reset} className="ml-auto text-xs text-blue-600 hover:underline">
              Trocar arquivo
            </button>
          </div>

          {/* Preview miniatura */}
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm max-h-52 flex items-center justify-center bg-slate-50 dark:bg-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Nota fiscal" className="max-h-52 object-contain" />
            </div>
          )}

          {/* Dados extraídos */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-500 uppercase tracking-wide font-semibold">
                <Sparkles className="h-4 w-4 text-blue-500" />
                Dados extraídos — revise antes de salvar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tipo */}
              <div className="grid grid-cols-2 gap-3">
                {(["receita", "despesa"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "py-2.5 rounded-lg text-sm font-medium border-2 transition-all",
                      type === t
                        ? t === "receita"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-red-500 bg-red-50 text-red-700"
                        : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300"
                    )}
                  >
                    {t === "receita" ? "Receita" : "Despesa"}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nf-desc">Estabelecimento / Descrição</Label>
                <Input
                  id="nf-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Nome do estabelecimento"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="nf-amount">Valor (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500 pointer-events-none">R$</span>
                    <Input
                      id="nf-amount"
                      type="text"
                      inputMode="numeric"
                      placeholder="0,00"
                      value={amountDisplay}
                      onChange={handleAmountInput}
                      className="pl-9 tabular-nums"
                    />
                  </div>
                  {amount === 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Valor não detectado — informe manualmente
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nf-date">Data</Label>
                  <Input
                    id="nf-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Categoria detectada</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                          />
                          {cat}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {invoice.cnpj && (
                <p className="text-xs text-slate-400">
                  CNPJ detectado: <span className="font-mono">{invoice.cnpj}</span>
                </p>
              )}

              {/* Texto bruto (toggle) */}
              <div>
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                >
                  {showRaw ? "Ocultar texto extraído" : "Ver texto bruto extraído"}
                </button>
                {showRaw && (
                  <pre className="mt-2 text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {invoice.rawText}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={reset}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : `Adicionar ${type === "despesa" ? "despesa" : "receita"} · ${amount ? formatCurrency(amount) : "—"}`}
            </Button>
          </div>
        </div>
      )}

      {/* ─── ESTADO SUCCESS ─── */}
      {step === "success" && (
        <div className="flex flex-col items-center justify-center py-20 gap-5">
          <div className="p-5 bg-emerald-50 dark:bg-emerald-950/40 rounded-full">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Nota fiscal registrada!
            </p>
            <p className="text-sm text-slate-500">
              A transação já aparece no seu dashboard e na lista de transações.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={reset}>Adicionar outra nota</Button>
            <Button onClick={() => router.push(dashboardHrefForSavedDate())}>Ver Dashboard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
