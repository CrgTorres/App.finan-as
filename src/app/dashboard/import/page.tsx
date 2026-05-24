"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  extratoImportacaoParseComParser,
  extrairTextoExtratoPdf,
  parsePDF,
  parseExtratoPdfTabelaGenerico,
} from "@/lib/import/pdf-parser";
import { extratoBrutoParaImportedRowsAutoComRastreio } from "@/lib/extratos/extrato-import-pipeline";
import {
  avaliarQualidadeImportacaoExtrato,
  nivelQualidadeImportacaoParaTituloPt,
  type ResultadoScoreQualidadeImportacao,
} from "@/lib/extratos/score-qualidade-importacao";
import { ExtratoLayoutNaoReconhecidoError } from "@/lib/extratos/registry-extratos";
import { amostrarBlocosExtrato } from "@/lib/extratos/amostras-layout-extrato";
import type { BankStatementParserProfileRow } from "@/lib/extratos/bank-statement-parser-profiles-types";
import {
  inserirPerfilExtratoParser,
  listarPerfisExtratoPorUsuario,
} from "@/lib/extratos/bank-statement-parser-profiles-service";
import { categorize } from "@/lib/import/categorizer";
import { PdfPasswordError } from "@/lib/reading/contracheque-ficha-document-text";
import { FileDropzone } from "@/components/import/file-dropzone";
import { ImportHistory } from "@/components/import/import-history";
import { ImportPreview } from "@/components/import/import-preview";
import type { ImportedRow } from "@/lib/import/types";
import { Loader2, FileUp, CheckCircle2, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import {
  buildExtratoSourceRefFingerprint,
  normalizeExtratoDescriptionForRef,
  sha256HexOfFile,
} from "@/lib/import/extrato-source-fingerprint";
import {
  probeTransactionsSourceTrackingColumns,
  isMissingDbColumnError,
} from "@/lib/supabase/transactions-source-columns";
import { applyImportedExtratoDedupeFilters } from "@/lib/import/extrato-dedupe-query";
import { listarClassificationRulesUsuario } from "@/lib/transacoes/classification-rules-service";
import { classificarLinhaImportacaoExtrato } from "@/lib/transacoes/classificar-extrato-regras";
import { extrairReferenciaTransacao } from "@/lib/transacoes/extrair-referencia-transacao";
import {
  normalizarSemanticaTransacao,
  rotuloExtratoInferidoPorNomeArquivo,
} from "@/lib/transacoes/normalizacao-semantica-transacao";
import {
  isErroCheckCategoriaTransactions,
  mapearCategoriaParaDbLegada10,
  sanitizarCategoriaParaInsertTransactions,
} from "@/lib/transacoes/categorias-supabase-check";
import {
  getImportPdfAutoPasswordCandidates,
  rememberImportPdfPasswordForDevice,
} from "@/lib/import/import-pdf-auto-password";
import { cn } from "@/lib/utils";

type Step = "upload" | "parsing" | "preview" | "success" | "layout_novo";

const DEFAULT_COLUMNS_MAP_JSON = `{
  "splitter": "multi_space",
  "col_data": 0,
  "col_descricao": 1,
  "col_valor": 2,
  "debitos_positivos": true
}`;

export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [pdfAwaitingPassword, setPdfAwaitingPassword] = useState<File | null>(null);
  const [pdfPasswordInput, setPdfPasswordInput] = useState("");
  const [lembrarSenhaPdf, setLembrarSenhaPdf] = useState(false);
  /** Perfis salvos no Supabase (detecção antes do parser genérico). */
  const [parserProfiles, setParserProfiles] = useState<BankStatementParserProfileRow[]>(
    [],
  );
  const [layoutDesconhecido, setLayoutDesconhecido] = useState<{
    texto: string;
    fileName: string;
    digest: string;
    blocosAmostra: string[];
  } | null>(null);

  /** Formulário "Salvar perfil deste banco" */
  const [salvarDialogOpen, setSalvarDialogOpen] = useState(false);
  const [perfilNomeBanco, setPerfilNomeBanco] = useState("");
  const [perfilDetectores, setPerfilDetectores] = useState("");
  const [perfilPadraoData, setPerfilPadraoData] = useState("DD/MM/YYYY");
  const [perfilValorFormato, setPerfilValorFormato] = useState("br_pt");
  const [perfilMapaCols, setPerfilMapaCols] = useState(DEFAULT_COLUMNS_MAP_JSON);
  const [perfilIgnorar, setPerfilIgnorar] = useState("");
  const [salvarPerfilCarregando, setSalvarPerfilCarregando] = useState(false);
  /** SHA-256 (hex) do arquivo de extrato, para `source_file_hash` quando existir no banco. */
  const [importFileSha256, setImportFileSha256] = useState<string | null>(null);
  const [qualidadeLeitura, setQualidadeLeitura] =
    useState<ResultadoScoreQualidadeImportacao | null>(null);

  async function refreshParserProfiles() {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setParserProfiles([]);
      return;
    }
    const res = await listarPerfisExtratoPorUsuario(sb, user.id);
    if (!res.error) setParserProfiles(res.data);
    else console.warn("[import] perfis extrato:", res.error.message);
  }

  useEffect(() => {
    void refreshParserProfiles();
  }, []);

  function entrarFluxoLayoutNovo(texto: string, fname: string, digest: string) {
    const blocos = amostrarBlocosExtrato(texto, 5);
    setLayoutDesconhecido({ texto, fileName: fname, digest, blocosAmostra: blocos });
    setParseError("");
    setPdfAwaitingPassword(null);
    setPdfPasswordInput("");
    setLembrarSenhaPdf(false);
    setStep("layout_novo");
  }

  async function usarParserGenericoSomente() {
    const pend = layoutDesconhecido;
    if (!pend) return;
    setParseError("");
    setStep("parsing");
    try {
      const parsed = parseExtratoPdfTabelaGenerico(pend.texto);
      setImportFileSha256(pend.digest);
      await applyParsedRows(parsed, {
        parserId: "pdf_tabela_generico",
        textoExtratoBruto: pend.texto,
        layoutForcadoGenerico: true,
        nomeArquivoExtrato: pend.fileName,
      });
      setLayoutDesconhecido(null);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao aplicar parser genérico.");
      setStep("layout_novo");
    }
  }

  function voltarAoUploadDeLayout() {
    setLayoutDesconhecido(null);
    setStep("upload");
  }

  function abrirDialogSalvarPerfil() {
    const base = layoutDesconhecido?.fileName ?? "";
    setPerfilNomeBanco(base.replace(/\.[^.]+$/, ""));
    setPerfilDetectores("");
    setPerfilPadraoData("DD/MM/YYYY");
    setPerfilValorFormato("br_pt");
    setPerfilMapaCols(DEFAULT_COLUMNS_MAP_JSON);
    setPerfilIgnorar("");
    setSalvarDialogOpen(true);
  }

  async function submitSalvarPerfilDialog() {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      toast.error("Faça login para salvar o perfil.");
      return;
    }
    let mapaObj: Record<string, unknown>;
    try {
      mapaObj = JSON.parse(perfilMapaCols.trim()) as Record<string, unknown>;
      if (!mapaObj || typeof mapaObj !== "object" || Array.isArray(mapaObj)) throw new Error("invalid");
    } catch {
      toast.error("Mapa de colunas: JSON inválido.");
      return;
    }
    const detectores = perfilDetectores
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!detectores.length) {
      toast.error("Informe pelo menos uma palavra-detectora (linha ou vírgulas).");
      return;
    }
    const ignorar = perfilIgnorar
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    setSalvarPerfilCarregando(true);
    const res = await inserirPerfilExtratoParser(sb, {
      user_id: user.id,
      bank_name: perfilNomeBanco.trim() || null,
      detector_keywords: detectores,
      date_pattern: perfilPadraoData,
      value_format: perfilValorFormato,
      columns_map: mapaObj,
      ignore_keywords: ignorar,
    });
    setSalvarPerfilCarregando(false);
    if (res.error) {
      toast.error(`Não foi possível salvar: ${res.error.message}`);
      return;
    }
    toast.success(
      "Perfil guardado. Na próxima importação será tentado antes do parser genérico."
    );
    setSalvarDialogOpen(false);
    await refreshParserProfiles();
  }

  type MetaQualidadeExtrato = {
    parserId: string;
    textoExtratoBruto?: string | null;
    layoutForcadoGenerico?: boolean;
    nomeArquivoExtrato?: string;
  };

  async function applyParsedRows(parsed: ImportedRow[], meta?: MetaQualidadeExtrato) {
    if (parsed.length === 0) {
      setQualidadeLeitura(null);
      setParseError(
        "Nenhuma transação foi detectada no arquivo. Verifique se o formato é suportado."
      );
      setPdfAwaitingPassword(null);
      setPdfPasswordInput("");
      setLembrarSenhaPdf(false);
      setStep("upload");
      return;
    }
    setPdfAwaitingPassword(null);
    setPdfPasswordInput("");
    setLembrarSenhaPdf(false);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const rules = user ? (await listarClassificationRulesUsuario(supabase, user.id)).data : [];

    const rotuloExtratoDoArquivo =
      rotuloExtratoInferidoPorNomeArquivo(meta?.nomeArquivoExtrato)?.trim() ||
      meta?.nomeArquivoExtrato?.replace(/\.[^.]+$/i, "").trim() ||
      undefined;

    const enriched = parsed.map((row) => {
      const { category, autoClass } = classificarLinhaImportacaoExtrato(row, rules);
      const descNorm = row.description.normalize("NFC").trim();
      const ref = extrairReferenciaTransacao(descNorm);
      const semantic = normalizarSemanticaTransacao({
        descricao: row.description,
        descricaoOriginal: row.description,
        tipo: row.type,
        valor: row.amount,
        favorecido: ref.favorecido,
        documento: row.idOperacao ?? ref.documento,
        banco: rotuloExtratoDoArquivo,
        extratoParserId: row.extratoParserId,
      });
      return { ...row, category, autoClass, semantic };
    });

    if (meta) {
      setQualidadeLeitura(
        avaliarQualidadeImportacaoExtrato({
          parserId: meta.parserId,
          transacoes: enriched.map((r) => ({
            amount: r.amount,
            type: r.type,
            description: r.description,
          })),
          textoExtratoBruto: meta.textoExtratoBruto,
          layoutForcadoGenerico: meta.layoutForcadoGenerico,
        })
      );
    } else {
      setQualidadeLeitura(null);
    }

    setRows(enriched);
    setStep("preview");
    setLayoutDesconhecido(null);
  }

  /**
   * Importa PDF com senha opcional; trata layout desconhecido como no fluxo original.
   */
  async function tentarImportarPdfComSenha(
    file: File,
    digest: string,
    password?: string,
  ): Promise<void> {
    try {
      const r = await parsePDF(file, {
        perfisUsuario: parserProfiles,
        ...(password !== undefined ? { password } : {}),
      });
      setImportFileSha256(digest);
      await applyParsedRows(r.rows, {
        parserId: r.parserId,
        textoExtratoBruto: r.textoExtrato,
        nomeArquivoExtrato: file.name,
      });
    } catch (e) {
      if (e instanceof ExtratoLayoutNaoReconhecidoError) {
        try {
          const texto = await extrairTextoExtratoPdf(
            file,
            password !== undefined ? { password } : undefined,
          );
          setImportFileSha256(digest);
          entrarFluxoLayoutNovo(texto, file.name, digest);
        } catch (io) {
          console.error(io);
          if (io instanceof PdfPasswordError) {
            throw io;
          }
          setParseError(
            "Não foi possível ler o PDF para sugerir um layout. Tente outro arquivo.",
          );
          setStep("upload");
        }
        return;
      }
      throw e;
    }
  }

  async function submitLockedPdfPassword() {
    const f = pdfAwaitingPassword;
    if (!f) return;
    setParseError("");
    setStep("parsing");

    const digest = ((await sha256HexOfFile(f)) ?? "").trim();

    try {
      await tentarImportarPdfComSenha(f, digest, pdfPasswordInput);
      if (lembrarSenhaPdf && pdfPasswordInput.trim()) {
        rememberImportPdfPasswordForDevice(pdfPasswordInput);
      }
      setLembrarSenhaPdf(false);
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        if (err.kind === "incorrect") {
          toast.error(err.message);
        } else {
          setParseError(err.message);
        }
        setStep("upload");
        return;
      }
      console.error(err);
      setParseError(
        "Erro ao processar o arquivo. Certifique-se de que é um CSV ou PDF de extrato bancário válido."
      );
      setStep("upload");
    }
  }

  function cancelLockedPdf() {
    setPdfAwaitingPassword(null);
    setPdfPasswordInput("");
    setLembrarSenhaPdf(false);
    setParseError("");
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setParseError("");
    setPdfAwaitingPassword(null);
    setPdfPasswordInput("");
    setLembrarSenhaPdf(false);
    setImportFileSha256(null);
    setLayoutDesconhecido(null);
    setQualidadeLeitura(null);
    setStep("parsing");

    try {
      const digestRaw = await sha256HexOfFile(file);
      const digest = (digestRaw ?? "").trim();

      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "pdf") {
        try {
          await tentarImportarPdfComSenha(file, digest);
          return;
        } catch (e) {
          if (e instanceof PdfPasswordError && e.kind === "required") {
            const candidatos = getImportPdfAutoPasswordCandidates();
            for (const pw of candidatos) {
              try {
                await tentarImportarPdfComSenha(file, digest, pw);
                return;
              } catch (e2) {
                if (
                  e2 instanceof PdfPasswordError &&
                  (e2.kind === "incorrect" || e2.kind === "required")
                ) {
                  continue;
                }
                throw e2;
              }
            }
            setPdfAwaitingPassword(file);
            setPdfPasswordInput(candidatos[0] ?? "");
            setParseError(e.message);
            setStep("upload");
            return;
          }
          throw e;
        }
      } else if (ext === "ofx" || ext === "qif" || ext === "xml") {
        const text = await file.text();
        let parserId = "ofx";
        let parsed = parseOFX(text);
        if (parsed.length === 0 && ext === "xml") {
          const { rows, csvWarnings, parserId: pid } = extratoImportacaoParseComParser(
            text,
            file.name
          );
          parsed = rows;
          parserId = pid;
          csvWarnings.forEach((w) => toast.warning(w));
        }
        setImportFileSha256(digest);
        await applyParsedRows(parsed, {
          parserId,
          textoExtratoBruto: text,
          nomeArquivoExtrato: file.name,
        });
        return;
      } else {
        const text = await file.text();
        try {
          const { rows, parserId } = extratoBrutoParaImportedRowsAutoComRastreio(
            text,
            file.name,
            parserProfiles
          );
          setImportFileSha256(digest);
          await applyParsedRows(rows, {
            parserId,
            textoExtratoBruto: text,
            nomeArquivoExtrato: file.name,
          });
          return;
        } catch (e) {
          if (e instanceof ExtratoLayoutNaoReconhecidoError) {
            setImportFileSha256(digest);
            entrarFluxoLayoutNovo(text, file.name, digest);
            return;
          }
          throw e;
        }
      }
    } catch (err) {
      if (err instanceof PdfPasswordError && err.kind === "required") {
        setPdfAwaitingPassword(file);
        setPdfPasswordInput(getImportPdfAutoPasswordCandidates()[0] ?? "");
        setParseError(err.message);
        setStep("upload");
        return;
      }
      console.error(err);
      setParseError(
        "Erro ao processar o arquivo. Certifique-se de que é um CSV ou PDF de extrato bancário válido."
      );
      setStep("upload");
    }
  }

  /**
   * Parser OFX — suporta OFX 1.x (SGML, tags não fechadas) e OFX 2.x (XML).
   *
   * OFX 1.x usa `<TAG>valor` sem fechamento, comum nos bancos brasileiros.
   * OFX 2.x é XML válido com `<TAG>valor</TAG>`.
   * Ambos são capturados pelo mesmo regex de extração de valor por tag.
   */
  function parseOFX(text: string): ImportedRow[] {
    const txs: ImportedRow[] = [];

    // Extrai valor de uma tag OFX (funciona para SGML e XML)
    function getTag(block: string, tag: string): string {
      return block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"))?.[1]?.trim() ?? "";
    }

    // Tenta blocos XML (<STMTTRN>...</STMTTRN>) primeiro
    const xmlBlocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];
    // Fallback: SGML blocks (no closing tag, bounded by next STMTTRN or end)
    const sgmlBlocks = xmlBlocks.length === 0
      ? [...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi)]
      : xmlBlocks;

    for (const match of sgmlBlocks) {
      const block    = match[1];
      const rawDate  = getTag(block, "DTPOSTED").replace(/\[.*\]/, "").slice(0, 8);
      const rawAmt   = getTag(block, "TRNAMT").replace(",", ".");
      const memo     = getTag(block, "MEMO") || getTag(block, "NAME") || "Transação";
      const trnType  = getTag(block, "TRNTYPE").toUpperCase(); // DEBIT/CREDIT/OTHER

      if (!rawDate || rawDate.length < 8) continue;
      const date   = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      const amount = parseFloat(rawAmt);
      if (!amount) continue;

      // OFX sign convention: negative = debit/expense, positive = credit/income
      // Some banks always send positive values and rely on TRNTYPE
      const inferredNeg = trnType === "DEBIT" || trnType === "DEP";
      const type: "receita" | "despesa" =
        amount < 0 || (amount > 0 && inferredNeg) ? "despesa" : "receita";

      txs.push({
        id: crypto.randomUUID(),
        description: memo,
        amount: Math.abs(amount),
        date,
        type,
        category: categorize(memo),
        selected: true,
      });
    }
    return txs;
  }

  async function handleImport(selected: ImportedRow[]) {
    setImporting(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Sessão expirada. Faça login novamente.");
      setImporting(false);
      return;
    }

    const truncatedName =
      fileName.length > 180 ? `${fileName.slice(0, 177)}…` : fileName;
    const cols = await probeTransactionsSourceTrackingColumns(supabase);

    const fingerprints =
      cols.sourceRef && fileName
        ? await Promise.all(
            selected.map((r) =>
              buildExtratoSourceRefFingerprint({
                date: r.date,
                description: r.description,
                amount: r.amount,
                type: r.type,
                fileName,
                idOperacao: r.idOperacao,
              })
            )
          )
        : selected.map(() => null as string | null);

    type ExtratoRow = {
      user_id: string;
      description: string;
      amount: number;
      date: string;
      type: "receita" | "despesa";
      category: string;
      source_ref?: string;
      source_file_name?: string;
      source_file_hash?: string;
      source_imported_at?: string;
    };

    const importedAtIso = cols.sourceImportedAt ? new Date().toISOString() : undefined;

    const rawPayload: ExtratoRow[] = selected.map((r, i) => {
      const row: ExtratoRow = {
        user_id: user.id,
        description: r.description.charAt(0).toUpperCase() + r.description.slice(1),
        amount: r.amount,
        date: r.date,
        type: r.type,
        category: sanitizarCategoriaParaInsertTransactions(r.category),
      };

      const fp = fingerprints[i];
      if (cols.sourceRef && fp) row.source_ref = fp;
      if (cols.sourceFileName) row.source_file_name = truncatedName;
      if (cols.sourceFileHash && importFileSha256) {
        row.source_file_hash = importFileSha256;
      }
      if (importedAtIso) row.source_imported_at = importedAtIso;
      return row;
    });

    const seen = new Set<string>();
    const payload = rawPayload.filter((r) => {
      const key = `${r.date}|${r.type}|${Number(r.amount).toFixed(2)}|${normalizeExtratoDescriptionForRef(r.description)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const dates = payload.map((p) => p.date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const baseSelect = "date, type, amount, description";
    const extraCols = [
      cols.sourceRef ? "source_ref" : null,
      cols.sourceFileName ? "source_file_name" : null,
      cols.sourceFileHash ? "source_file_hash" : null,
    ].filter(Boolean);
    const selectClause =
      extraCols.length > 0 ? `${baseSelect}, ${extraCols.join(", ")}` : baseSelect;

    type ExtratoDedupeRow = {
      date: string;
      type: string;
      amount: number;
      description: string | null;
    };

    const fpList = fingerprints.filter((f): f is string => Boolean(f));

    let existingQ = supabase
      .from("transactions")
      .select(selectClause)
      .eq("user_id", user.id)
      .gte("date", minDate)
      .lte("date", maxDate);

    existingQ = applyImportedExtratoDedupeFilters(existingQ, cols, {
      fileHashHex: importFileSha256,
      fileNameTruncated: truncatedName,
      sourceRefFingerprints: fpList,
    });

    const resExisting = await existingQ;

    let existingRows: ExtratoDedupeRow[] =
      ((resExisting.data ?? []) as unknown) as ExtratoDedupeRow[];
    let existingErr = resExisting.error;

    if (existingErr && isMissingDbColumnError(existingErr)) {
      const fb = await supabase
        .from("transactions")
        .select(baseSelect)
        .eq("user_id", user.id)
        .gte("date", minDate)
        .lte("date", maxDate);
      existingRows = ((fb.data ?? []) as unknown) as ExtratoDedupeRow[];
      existingErr = fb.error;
    }

    if (existingErr) {
      toast.error(`Falha ao validar duplicidade do extrato: ${existingErr.message}`);
      setImporting(false);
      return;
    }

    const existingKeys = new Set(
      existingRows.map(
        (r) =>
          `${r.date}|${r.type}|${Number(r.amount).toFixed(2)}|${normalizeExtratoDescriptionForRef(String(r.description ?? ""))}`
      )
    );

    const payloadFresh = payload.filter((r) => {
      const key = `${r.date}|${r.type}|${Number(r.amount).toFixed(2)}|${normalizeExtratoDescriptionForRef(r.description)}`;
      return !existingKeys.has(key);
    });

    if (!payloadFresh.length) {
      toast.warning("Nenhuma transação nova para importar (tudo já lançado).");
      setImporting(false);
      return;
    }

    const stripTracking = (rows: ExtratoRow[]): ExtratoRow[] =>
      rows.map(
        ({
          source_ref: _ref,
          source_file_name: _fn,
          source_file_hash: _fh,
          source_imported_at: _si,
          ...rest
        }) => rest as ExtratoRow
      );

    const tryInsertTransactions = async (rows: ExtratoRow[]) => {
      let res = await supabase.from("transactions").insert(rows);
      if (res.error && isMissingDbColumnError(res.error)) {
        res = await supabase.from("transactions").insert(stripTracking(rows));
      }
      return res.error;
    };

    let insertErr = await tryInsertTransactions(payloadFresh);

    if (insertErr && isErroCheckCategoriaTransactions(insertErr)) {
      const payloadLegacy: ExtratoRow[] = payloadFresh.map((r) => ({
        ...r,
        category: mapearCategoriaParaDbLegada10(
          sanitizarCategoriaParaInsertTransactions(r.category),
        ),
      }));
      insertErr = await tryInsertTransactions(payloadLegacy);
      if (!insertErr) {
        const skipped = selected.length - payloadFresh.length;
        toast.success(
          skipped > 0
            ? `${payloadLegacy.length} transações novas importadas (${skipped} duplicadas ignoradas). Categorias foram simplificadas para o esquema actual do Supabase — no SQL Editor executa supabase/patch_transactions_source_pets.sql para todas as categorias.`
            : `${payloadLegacy.length} transações importadas! Categorias simplificadas para o teu banco — executa supabase/patch_transactions_source_pets.sql no SQL Editor para desbloquear todas as categorias da app.`,
          { duration: 14_000 },
        );
        emitDashboardDataUpdated({ origin: "import_extrato" });
        setStep("success");
        setImporting(false);
        return;
      }

      const payloadSoOutros: ExtratoRow[] = payloadFresh.map((r) => ({
        ...r,
        category: "Outros",
      }));
      insertErr = await tryInsertTransactions(payloadSoOutros);
      if (!insertErr) {
        const skipped = selected.length - payloadFresh.length;
        toast.success(
          skipped > 0
            ? `${payloadSoOutros.length} transações novas (${skipped} duplicadas ignoradas), todas em «Outros». O CHECK de categorias no Supabase está desactualizado — executa supabase/patch_transactions_source_pets.sql (SQL Editor).`
            : `${payloadSoOutros.length} transações importadas como «Outros». Actualiza o Supabase com supabase/patch_transactions_source_pets.sql para voltar a usar todas as categorias.`,
          { duration: 16_000 },
        );
        emitDashboardDataUpdated({ origin: "import_extrato" });
        setStep("success");
        setImporting(false);
        return;
      }
    }

    if (insertErr) {
      const hints =
        insertErr.message.includes("category") || insertErr.message.includes("check")
          ? " No Supabase (SQL Editor), execute supabase/patch_transactions_source_pets.sql ou supabase/migrations/expand_transaction_categories_v2.sql para alinhar as categorias da tabela à app."
          : insertErr.message.includes("source_ref") ||
              insertErr.message.includes("column")
            ? " Execute no Supabase o ficheiro supabase/migrations/add_transactions_source_ref.sql (ou alinhe o schema)."
            : "";
      toast.error(`Erro ao importar: ${insertErr.message}.${hints}`);
      setImporting(false);
      return;
    }

    const skipped = selected.length - payloadFresh.length;
    toast.success(
      skipped > 0
        ? `${payloadFresh.length} transações novas importadas (${skipped} duplicadas ignoradas).`
        : `${payloadFresh.length} transações importadas com sucesso!`
    );
    emitDashboardDataUpdated({ origin: "import_extrato" });
    setStep("success");
    setImporting(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          Importar Extrato
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Importe transações a partir de extratos bancários (CSV, PDF, OFX)
        </p>
      </div>

      {/* Etapa: upload */}
      {step === "upload" && (
        <div className="space-y-4">
          {parseError && (
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">{parseError}</p>
            </div>
          )}

          {pdfAwaitingPassword && (
            <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900 dark:bg-blue-950/30">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    PDF protegido por senha
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 break-all">
                    {pdfAwaitingPassword.name}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdf-import-password" className="text-slate-700 dark:text-slate-300">
                  Senha do documento
                </Label>
                <Input
                  id="pdf-import-password"
                  type="password"
                  autoComplete="off"
                  value={pdfPasswordInput}
                  onChange={(e) => setPdfPasswordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitLockedPdfPassword();
                  }}
                />
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 dark:border-slate-600"
                    checked={lembrarSenhaPdf}
                    onChange={(e) => setLembrarSenhaPdf(e.target.checked)}
                  />
                  Lembrar neste dispositivo (armazenado só no navegador)
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void submitLockedPdfPassword()}>
                  Continuar
                </Button>
                <Button type="button" variant="outline" onClick={cancelLockedPdf}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <FileDropzone onFile={handleFile} loading={false} />

          {/* Dicas de compatibilidade */}
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Bancos e formatos compatíveis
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600 dark:text-slate-400">
              {[
                { bank: "Nubank", fmt: "CSV" },
                { bank: "Itaú",   fmt: "CSV / OFX" },
                { bank: "Bradesco", fmt: "CSV / OFX" },
                { bank: "Santander", fmt: "CSV / OFX" },
                { bank: "Inter",  fmt: "CSV" },
                { bank: "C6 Bank", fmt: "CSV" },
                { bank: "Sicoob", fmt: "OFX" },
                { bank: "Sicredi", fmt: "OFX" },
              ].map(({ bank, fmt }) => (
                <div key={bank} className="flex flex-col gap-0.5 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{bank}</span>
                  <span className="text-slate-400">{fmt}</span>
                </div>
              ))}
            </div>
          </div>

          <ImportHistory />
        </div>
      )}

      {/* Etapa: parsing */}
      {step === "parsing" && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Lendo <span className="font-semibold text-blue-600">{fileName}</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Categorizando transações automaticamente…
            </p>
          </div>
        </div>
      )}

      {step === "layout_novo" && layoutDesconhecido && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/85 dark:bg-amber-950/35 dark:border-amber-800 p-5 space-y-4 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Layout novo detectado
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Não conseguimos mapear automaticamente este ficheiro:{" "}
                  <span className="font-medium break-all">{layoutDesconhecido.fileName}</span>.
                  Confira até 5 blocos detectados no texto ou avance manualmente.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Amostra (até 5 blocos)
              </p>
              <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {(layoutDesconhecido.blocosAmostra.length
                  ? layoutDesconhecido.blocosAmostra
                  : ["(Sem blocos destacados — tente o parser genérico ou salvar um perfil com colunas explícitas.)"]
                ).map((b, i) => (
                  <li
                    key={i}
                    className="text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words leading-relaxed"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" onClick={() => void usarParserGenericoSomente()}>
                Usar parser genérico
              </Button>
              <Button type="button" variant="outline" onClick={abrirDialogSalvarPerfil}>
                Salvar perfil deste banco
              </Button>
              <Button type="button" variant="ghost" onClick={voltarAoUploadDeLayout}>
                Voltar ao upload
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Etapa: preview */}
      {step === "preview" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <FileUp className="h-4 w-4" />
            <span>
              Arquivo: <span className="font-medium text-slate-700 dark:text-slate-300">{fileName}</span>
            </span>
            <button
              className="ml-auto text-xs text-blue-600 hover:underline"
              onClick={() => {
                setStep("upload");
                setRows([]);
                setPdfAwaitingPassword(null);
                setPdfPasswordInput("");
                setLembrarSenhaPdf(false);
                setImportFileSha256(null);
                setLayoutDesconhecido(null);
                setQualidadeLeitura(null);
              }}
            >
              Trocar arquivo
            </button>
          </div>

          {qualidadeLeitura && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Qualidade da leitura: {qualidadeLeitura.score}% —{" "}
              {nivelQualidadeImportacaoParaTituloPt(qualidadeLeitura.nivel)}
            </p>
          )}

          <ImportPreview
            rows={rows}
            onRowsChange={setRows}
            onImport={handleImport}
            loading={importing}
          />
        </div>
      )}

      {/* Etapa: sucesso */}
      {step === "success" && (
        <div className="flex flex-col items-center justify-center py-20 gap-5">
          <div className="p-5 bg-emerald-50 dark:bg-emerald-950/40 rounded-full">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Importação concluída!
            </p>
            <p className="text-sm text-slate-500">
              As transações já estão disponíveis no seu dashboard.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setRows([]);
                setPdfAwaitingPassword(null);
                setPdfPasswordInput("");
                setLembrarSenhaPdf(false);
                setImportFileSha256(null);
                setLayoutDesconhecido(null);
                setQualidadeLeitura(null);
              }}
            >
              Importar outro arquivo
            </Button>
            <Button onClick={() => router.push("/dashboard")}>
              Ver Dashboard
            </Button>
          </div>
        </div>
      )}

      <Dialog open={salvarDialogOpen} onOpenChange={setSalvarDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Salvar perfil deste banco</DialogTitle>
            <DialogDescription>
              Todas as palavras-detectoras devem aparecer no texto do extrato (comparação sem acentos).
              Colunas usam índices a partir de 0.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 max-h-[62vh] overflow-y-auto pr-1 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="perfil-banco">Nome do banco / layout</Label>
              <Input
                id="perfil-banco"
                value={perfilNomeBanco}
                onChange={(e) => setPerfilNomeBanco(e.target.value)}
                placeholder="Ex.: Meu banco conta corrente"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="perfil-det">Palavras-detectoras</Label>
              <textarea
                id="perfil-det"
                rows={3}
                value={perfilDetectores}
                onChange={(e) => setPerfilDetectores(e.target.value)}
                placeholder={"Uma por linha ou separadas por vírgula\nEX.: EXTRATO CONTA\nCORRENTE"}
                className={cn(
                  "flex w-full min-h-[72px] resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none",
                  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  "dark:bg-input/30",
                )}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="perfil-data">Formato de data</Label>
                <select
                  id="perfil-data"
                  value={perfilPadraoData}
                  onChange={(e) => setPerfilPadraoData(e.target.value)}
                  className={cn(
                    "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
                  )}
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perfil-val">Formato de valor</Label>
                <select
                  id="perfil-val"
                  value={perfilValorFormato}
                  onChange={(e) => setPerfilValorFormato(e.target.value)}
                  className={cn(
                    "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
                  )}
                >
                  <option value="br_pt">Brasil (R$ 1.234,56)</option>
                  <option value="en">Internacional (1,234.56)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="perfil-map">Mapa de colunas (JSON)</Label>
              <textarea
                id="perfil-map"
                rows={8}
                spellCheck={false}
                value={perfilMapaCols}
                onChange={(e) => setPerfilMapaCols(e.target.value)}
                className={cn(
                  "flex w-full min-h-[140px] resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
                )}
              />
              <p className="text-[11px] text-muted-foreground leading-snug">
                splitter: tabs | multi_space | semicolon | comma — debitos_positivos: true faz valores
                positivos contarem como despesa (padrão em muitos extratos BR).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="perfil-ign">Palavras ignoradas (linhas)</Label>
              <textarea
                id="perfil-ign"
                rows={2}
                value={perfilIgnorar}
                onChange={(e) => setPerfilIgnorar(e.target.value)}
                placeholder={"SALDO ANTERIOR\nTOTAL DO PERÍODO"}
                className={cn(
                  "flex w-full min-h-[52px] resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none",
                  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
                )}
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-end gap-2 border-t-0 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={salvarPerfilCarregando}
              onClick={() => setSalvarDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={salvarPerfilCarregando}
              onClick={() => void submitSalvarPerfilDialog()}
            >
              {salvarPerfilCarregando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  A guardar…
                </>
              ) : (
                "Salvar perfil"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
