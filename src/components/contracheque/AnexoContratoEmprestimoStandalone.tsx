"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import type { Loan } from "@/types/contracheque";
import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { StatusConferenciaLeitura } from "@/types/loan-evidence";
import {
  LOAN_EVIDENCES_STORAGE_BUCKET,
  TIPOS_EVIDENCIA_EMPRESTIMO,
  fingerprintEvidenciaStandalone,
  mensagemErroEvidenciaSupabase,
} from "@/lib/anexos/evidencias-emprestimos";
import type { ResultadoLeituraAutomaticaEvidencia } from "@/services/evidencias/pipeline-leitura-automatica";
import { executarPipelineLeituraAutomaticaEvidencia } from "@/services/evidencias/pipeline-leitura-automatica";
import { processarContratoAnexoParaPersistencia } from "@/services/evidencias/processar-contrato-anexo-para-persistencia";
import { enriquecerContratoExtraido } from "@/services/contratos/enriquecer-contrato-extraido";
import {
  cruzarExtraidoComLoan,
  melhorLoanParaExtraido,
  patchSyncLoanFromExtraido,
  sugerirLoansPorExtraido,
} from "@/services/contratos/cruzar-extraido-com-loan";
import { carregarPerfilTitularParaSessao } from "@/lib/contratos/carregar-perfil-titular";
import type { PerfilTitularApp } from "@/lib/contratos/perfil-titular-app";
import type { CampoConferenciaEditavel } from "@/components/contracheque/ConferenciaContratoExtraidoGrid";
import { LeituraAutomaticaEvidenciaPanel } from "@/components/contracheque/LeituraAutomaticaEvidenciaPanel";
import { RadarDoContratoCard } from "@/components/contracheque/RadarDoContratoCard";
import { AvisoTriagemAnaliseContrato } from "@/components/contratos/AvisoTriagemAnaliseContrato";
import { obterRendaReferenciaUsuario } from "@/lib/contratos/renda-referencia-usuario";
import type { RendaReferenciaUsuario } from "@/lib/contratos/renda-referencia-usuario";
import {
  carregarFontesCruzamentoContrato,
  contextoMotorDeFontesCarregadas,
} from "@/lib/contratos/carregar-fontes-cruzamento-contrato";
import type { StatusConferenciaAnaliseJuridica } from "@/types/analise-juridico-financeira-contrato";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

/**
 * Formulário para anexar PDF/imagem de proposta / contrato (ex.: «Orçamento da Operação» Daycoval).
 * Grava em `loan_evidences` + Storage; reutiliza o pipeline de OCR/extração da análise.
 */
export function AnexoContratoEmprestimoStandalone() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loansLoading, setLoansLoading] = useState(true);
  const [selectedLoanId, setSelectedLoanId] = useState<string>("");
  const [tipo, setTipo] = useState<(typeof TIPOS_EVIDENCIA_EMPRESTIMO)[number]["value"]>(
    "contrato_formal",
  );

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [leitura, setLeitura] = useState<ResultadoLeituraAutomaticaEvidencia | null>(null);
  const [extraidoRevisado, setExtraidoRevisado] = useState<ContratoExtraido | null>(null);
  const [leituraBusy, setLeituraBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [conferenciaDecisao, setConferenciaDecisao] = useState<StatusConferenciaLeitura | null>(null);
  const [conferenciaObservacao, setConferenciaObservacao] = useState("");
  const [rendaRef, setRendaRef] = useState<RendaReferenciaUsuario>({
    rendaLiquidaMensal: null,
    fonte: null,
  });
  const [analiseConferencia, setAnaliseConferencia] =
    useState<StatusConferenciaAnaliseJuridica>("pendente");

  const [dataDocumento, setDataDocumento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [perfilTitular, setPerfilTitular] = useState<PerfilTitularApp | null>(null);
  const [tabelaEvidenciasAusente, setTabelaEvidenciasAusente] = useState(false);
  const autoVinculoChaveRef = useRef<string | null>(null);

  const extraidoAtual = extraidoRevisado ?? leitura?.extraido ?? null;

  const sugestoesLoan = useMemo(() => {
    if (!extraidoAtual || loans.length === 0) return [];
    return sugerirLoansPorExtraido(extraidoAtual, loans, 5);
  }, [extraidoAtual, loans]);

  const loanSelecionado = selectedLoanId ? loans.find((l) => l.id === selectedLoanId) : undefined;

  const cruzamentoLoan = useMemo(() => {
    if (!extraidoAtual || !loanSelecionado) return null;
    return cruzarExtraidoComLoan(extraidoAtual, loanSelecionado);
  }, [extraidoAtual, loanSelecionado]);

  const refreshLoans = useCallback(async () => {
    setLoansLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("loans")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn(error);
      setLoans([]);
    } else {
      setLoans((data as Loan[]) ?? []);
    }
    setLoansLoading(false);
  }, []);

  useEffect(() => {
    void refreshLoans();
  }, [refreshLoans]);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const r = await obterRendaReferenciaUsuario(supabase);
      setRendaRef(r);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const p = await carregarPerfilTitularParaSessao(supabase);
      setPerfilTitular(p.cpfDigitos || p.nome ? p : null);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const { error } = await supabase.from("loan_evidences").select("id").limit(0);
      if (error && /could not find the table|schema cache/i.test(error.message)) {
        setTabelaEvidenciasAusente(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!extraidoAtual || loans.length === 0 || !file) return;
    const chave = `${file.name}:${file.size}:${file.lastModified}`;
    if (autoVinculoChaveRef.current === chave) return;
    const sug = melhorLoanParaExtraido(extraidoAtual, loans);
    if (sug?.cruzamento.parcelaOk) {
      setSelectedLoanId(sug.loanId);
      autoVinculoChaveRef.current = chave;
      toast.message(`Empréstimo pré-selecionado: ${sug.resumo}`);
    }
  }, [extraidoAtual, loans, file]);

  function aplicarCampoConferencia(campo: CampoConferenciaEditavel, valor: string) {
    setExtraidoRevisado((prev) => {
      const base = prev ?? leitura?.extraido;
      if (!base) return prev;
      if (campo === "parcelas") {
        const n = parseInt(valor, 10);
        return enriquecerContratoExtraido({ ...base, parcelas: n > 0 ? n : undefined }, perfilTitular);
      }
      const t = valor.trim();
      return enriquecerContratoExtraido({ ...base, [campo]: t || undefined }, perfilTitular);
    });
    if (
      (campo === "dataContratacao" || campo === "dataDocumento") &&
      valor.trim()
    ) {
      setDataDocumento(valor.trim());
    }
    setConferenciaDecisao(null);
  }

  async function processarLeituraAutomatica(f: File | null) {
    setLeitura(null);
    setExtraidoRevisado(null);
    setOcrProgress(null);
    setConferenciaDecisao(null);
    autoVinculoChaveRef.current = null;
    if (!f) return;
    setLeituraBusy(true);
    try {
      const supabase = createClient();
      const titular =
        perfilTitular?.cpfDigitos || perfilTitular?.nome
          ? perfilTitular
          : await carregarPerfilTitularParaSessao(supabase);
      if (!perfilTitular?.cpfDigitos && (titular.cpfDigitos || titular.nome)) {
        setPerfilTitular(titular);
      }
      const fontes = await carregarFontesCruzamentoContrato(supabase, {
        excluirLoanId: selectedLoanId || undefined,
      });
      setRendaRef(fontes.renda);
      const motorAnalise = contextoMotorDeFontesCarregadas(fontes, {
        titular,
        loanIdVinculado: selectedLoanId || null,
      });
      const r = await executarPipelineLeituraAutomaticaEvidencia(f, [], {
        titular,
        motorAnalise,
        onProgress: (p) => {
          if (p.kind === "pdf_text_layer" && p.phase === "start") setOcrProgress("A extrair texto do PDF…");
          if (p.kind === "pdf_text_layer" && p.phase === "done") setOcrProgress("Texto do PDF processado.");
          if (p.kind === "pdf_ocr") setOcrProgress(`OCR do PDF: página ${p.page} / ${p.totalPages}`);
          if (p.kind === "image_ocr") setOcrProgress(p.status ?? "OCR em imagem…");
          if (p.kind === "image_ocr_deep")
            setOcrProgress(`OCR reforçado: passo ${p.pass} / ${p.totalPasses}`);
        },
      });
      setLeitura(r);
      setExtraidoRevisado(r.extraido);
      setOcrProgress(null);
      const dataDoc =
        r.extraido.dataDocumento ?? r.extraido.dataContratacao ?? r.extraido.dataAssinatura;
      if (dataDoc) {
        setDataDocumento((prev) => prev || dataDoc);
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha na leitura automática.");
      setLeitura(null);
    } finally {
      setLeituraBusy(false);
      setOcrProgress(null);
    }
  }

  function confirmarExtracaoStandalone() {
    const sintese = extraidoAtual?.sinteseConfiabilidade;
    if (sintese && !sintese.podeConfirmar) {
      toast.error(
        sintese.bloqueiosConfirmacao[0] ??
          "Corrija os bloqueios indicados na síntese de confiabilidade antes de confirmar.",
      );
      return;
    }
    if (loanSelecionado && cruzamentoLoan && !cruzamentoLoan.podeConfirmar) {
      toast.error(
        "A parcela do contrato não coincide com o empréstimo selecionado. Escolha outro cadastro ou guarde sem vínculo.",
      );
      return;
    }
    setConferenciaDecisao(selectedLoanId ? "confirmado" : "sem_vinculo");
    toast.message(
      selectedLoanId
        ? cruzamentoLoan?.podeConfirmar
          ? "Dados conferidos e alinhados às parcelas do cadastro. Ao guardar, o empréstimo será atualizado."
          : "Leitura associada ao empréstimo selecionado. Pode guardar."
        : "Documento sem vínculo a cadastro — aparecerá nas evidências. Pode guardar.",
    );
  }

  function selecionarLoanSugerido(loanId: string) {
    setSelectedLoanId(loanId);
    setConferenciaDecisao(null);
  }

  function ignorarLeituraAutomatica() {
    setConferenciaDecisao("ignorado");
    toast.message("Leitura ignorada. Pode guardar só o ficheiro (útil se o OCR falhar).");
  }

  function reprocessarOcr() {
    if (!file) {
      toast.error("Selecione um ficheiro primeiro.");
      return;
    }
    void processarLeituraAutomatica(file);
  }

  async function guardar() {
    if (!file) {
      toast.error("Selecione um ficheiro.");
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

    const loan = selectedLoanId ? loans.find((l) => l.id === selectedLoanId) : undefined;

    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").slice(0, 8).replace(/[^a-z0-9]/gi, "");
      const folderKey = loan != null ? loan.id : "sem-vinculo";
      const objectPath = `${user.id}/${folderKey}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(LOAN_EVIDENCES_STORAGE_BUCKET)
        .upload(objectPath, file, { upsert: false });

      if (upErr) {
        toast.error(
          upErr.message.includes("Bucket not found")
            ? "Bucket «loan-evidences» inexistente. Execute supabase/patch_loan_evidences_storage_rls.sql no Supabase."
            : mensagemErroEvidenciaSupabase(upErr.message, "storage"),
        );
        return;
      }

      const titular =
        perfilTitular?.cpfDigitos || perfilTitular?.nome
          ? perfilTitular
          : await carregarPerfilTitularParaSessao(supabase);
      const fontes = await carregarFontesCruzamentoContrato(supabase, {
        excluirLoanId: loan?.id,
      });
      const motorAnalise = contextoMotorDeFontesCarregadas(fontes, {
        titular,
        loanIdVinculado: loan?.id ?? null,
      });

      const processado = await processarContratoAnexoParaPersistencia(file, {
        tipoEvidencia: tipo,
        leituraExistente: leitura,
        extraidoRevisado: extraidoRevisado ?? undefined,
        contratosCandidatos: [],
        titular,
        renda: fontes.renda,
        loans: fontes.loans,
        loanIdVinculado: loan?.id ?? null,
        contratosAnteriores: fontes.contratosAnteriores,
        motorAnalise,
        conferenciaObservacao: conferenciaObservacao,
      });

      if (processado.leitura) {
        setLeitura(processado.leitura);
        if (!extraidoRevisado) {
          setExtraidoRevisado(processado.leitura.extraido);
        }
      }
      for (const aviso of processado.avisosPipeline) {
        toast.message(aviso);
      }

      const semLoan = !loan?.id;
      const baseRow: Record<string, unknown> = {
        user_id: user.id,
        loan_id: loan?.id ?? null,
        contrato_inferido_fingerprint: semLoan ? fingerprintEvidenciaStandalone(user.id) : null,
        tipo_evidencia: tipo,
        nome_arquivo: file.name,
        storage_path: objectPath,
        data_documento: dataDocumento.trim() || null,
        observacao: observacao.trim() || null,
      };

      const leituraCols = processado.leituraCols;
      const rowPayload = { ...baseRow, ...leituraCols };
      let insErr = (await supabase.from("loan_evidences").insert(rowPayload)).error;

      if (insErr && Object.keys(leituraCols).length > 0) {
        const rowSlim = { ...baseRow };
        insErr = (await supabase.from("loan_evidences").insert(rowSlim)).error;
        if (!insErr) {
          toast.message(
            "Guardado sem metadados de leitura. Rode `patch_loan_evidences_leitura_automatica.sql` no Supabase se necessário.",
          );
        }
      }

      if (insErr) {
        toast.error(mensagemErroEvidenciaSupabase(insErr.message, "insert"));
        return;
      }

      if (
        loan &&
        conferenciaDecisao === "confirmado" &&
        leitura &&
        cruzamentoLoan?.podeConfirmar
      ) {
        const fonte = extraidoRevisado ?? leitura.extraido;
        const patch = patchSyncLoanFromExtraido(fonte, loan);
        if (Object.keys(patch).length > 0) {
          const { error: syncErr } = await supabase.from("loans").update(patch).eq("id", loan.id);
          if (syncErr) {
            toast.message("Anexo guardado, mas não foi possível sincronizar o cadastro do empréstimo.");
          } else {
            toast.message("Cadastro do empréstimo atualizado com os valores do contrato.");
            void refreshLoans();
          }
        }
      }

      toast.success("Contrato / proposta anexada.");
      setFile(null);
      setLeitura(null);
      setExtraidoRevisado(null);
      setConferenciaDecisao(null);
      setObservacao("");
      setDataDocumento("");
      setConferenciaObservacao("");
      setAnaliseConferencia("pendente");
      autoVinculoChaveRef.current = null;
      window.dispatchEvent(new CustomEvent(DASHBOARD_DATA_UPDATED));
    } finally {
      setBusy(false);
    }
  }

  const temRadar = Boolean(leitura?.analiseContratoEmprestimo);

  return (
    <div className="space-y-6">
      <details className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-4 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300 list-none [&::-webkit-details-marker]:hidden">
          Modelo suportado (ex.: Daycoval) — o que o sistema lê
        </summary>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Secções A–G: consumidor, valores, IOF, parcelas, CET e datas. Resultado também em{" "}
          <Link href="/dashboard/analise" className="text-blue-600 dark:text-blue-400 hover:underline">
            Análise IA
          </Link>
          .
        </p>
      </details>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 md:p-6 space-y-5">
        {tabelaEvidenciasAusente ? (
          <p className="text-xs rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 leading-relaxed">
            A tabela <strong>loan_evidences</strong> não existe no Supabase. Execute no SQL Editor:{" "}
            <code className="text-[10px]">supabase/patch_loan_evidences.sql</code>, depois{" "}
            <code className="text-[10px]">patch_loan_evidences_storage_rls.sql</code> e{" "}
            <code className="text-[10px]">patch_loan_evidences_leitura_automatica.sql</code>.
          </p>
        ) : null}
        {!temRadar ? <AvisoTriagemAnaliseContrato compacto /> : null}
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-medium">
          <Upload className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
          Enviar documento
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="loan-select">Vincular a empréstimo cadastrado (opcional)</Label>
            <select
              id="loan-select"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedLoanId}
              disabled={loansLoading}
              onChange={(e) => {
                setSelectedLoanId(e.target.value);
                setConferenciaDecisao(null);
              }}
            >
              <option value="">— Sem vínculo (só evidência) —</option>
              {loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.institution_name || l.description} · R${" "}
                  {Number(l.installment_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
            {loans.length === 0 && !loansLoading ? (
              <p className="text-xs text-muted-foreground">
                Nenhum empréstimo em <code className="text-[10px]">loans</code>. Pode anexar mesmo assim ou
                cadastrar antes na análise.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo-evidencia">Tipo de documento</Label>
            <select
              id="tipo-evidencia"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as typeof tipo)}
            >
              {TIPOS_EVIDENCIA_EMPRESTIMO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="file-contrato">Ficheiro (PDF ou imagem)</Label>
          <Input
            id="file-contrato"
            type="file"
            accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff"
            disabled={leituraBusy}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              void processarLeituraAutomatica(f);
            }}
          />
        </div>

        {leitura?.analiseContratoEmprestimo ? (
          <RadarDoContratoCard
            analise={leitura.analiseContratoEmprestimo}
            conferencia={analiseConferencia}
            onConferenciaChange={setAnaliseConferencia}
            observacao={conferenciaObservacao}
            onObservacaoChange={setConferenciaObservacao}
            onVincularContratoAnterior={() => {
              if (sugestoesLoan[0]) {
                selecionarLoanSugerido(sugestoesLoan[0].loanId);
              }
            }}
          />
        ) : null}

        <LeituraAutomaticaEvidenciaPanel
          confiancaNivel={leitura?.leituraConfiancaNivel ?? "baixa"}
          confiancaScore={leitura?.leituraConfiancaScore ?? 0}
          extraido={extraidoRevisado ?? leitura?.extraido ?? null}
          camposAusentes={leitura?.camposNaoEncontrados ?? []}
          sugestoes={leitura?.sugestoesVinculo ?? []}
          ocrProgress={ocrProgress}
          temLeitura={!!leitura}
          conferenciaDecisao={conferenciaDecisao}
          contratosAlvo={[]}
          targetIdx={0}
          onTargetIdxChange={() => {}}
          mostrarSeletorManual={false}
          onConfirmarVinculoSugerido={() => {}}
          onAbrirVinculoManual={() => {}}
          onAplicarVinculoManual={() => {}}
          onSalvarSemVinculo={() => setConferenciaDecisao("sem_vinculo")}
          uploadStandalone
          onConfirmarExtracaoStandalone={confirmarExtracaoStandalone}
          onCampoConferenciaChange={aplicarCampoConferencia}
          perfilTitular={perfilTitular}
          cruzamentoLoan={cruzamentoLoan}
          sugestoesLoan={sugestoesLoan}
          onSelecionarLoanSugerido={selecionarLoanSugerido}
          syncCadastroAoGuardar={!!loanSelecionado && !!cruzamentoLoan?.podeConfirmar}
          parcelasPagasCadastro={loanSelecionado?.paid_installments ?? 0}
          onReprocessarOcr={reprocessarOcr}
          onIgnorarLeitura={ignorarLeituraAutomatica}
          reprocessarOcrDisabled={!file || leituraBusy}
          leituraBusy={leituraBusy}
          mostrarRodapeAcoes={false}
        />

        <footer className="flex flex-col gap-3 pt-4 mt-2 border-t border-border/50">
          {leitura ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" className="h-9" disabled={leituraBusy} onClick={confirmarExtracaoStandalone}>
                {conferenciaDecisao === "confirmado" || conferenciaDecisao === "sem_vinculo"
                  ? "Dados confirmados"
                  : "Confirmar dados"}
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9" disabled={!file || leituraBusy} onClick={reprocessarOcr}>
                Reprocessar
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={ignorarLeituraAutomatica}>
                Ignorar OCR
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            {leitura && !temRadar ? (
              <div className="flex-1 min-w-0 space-y-1 sm:max-w-xs">
                <Label htmlFor="conf-obs" className="text-xs text-muted-foreground">
                  Nota conferência
                </Label>
                <Input
                  id="conf-obs"
                  className="h-9 text-sm"
                  value={conferenciaObservacao}
                  onChange={(e) => setConferenciaObservacao(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            ) : null}
            {!(extraidoAtual?.dataDocumento ?? extraidoAtual?.dataContratacao) ? (
              <div className="space-y-1 sm:w-44 shrink-0">
                <Label htmlFor="data-doc" className="text-xs text-muted-foreground">
                  Data do documento
                </Label>
                <Input
                  id="data-doc"
                  type="date"
                  className="h-9"
                  value={dataDocumento}
                  onChange={(e) => setDataDocumento(e.target.value)}
                />
              </div>
            ) : null}
            <div className="flex-1 min-w-0 space-y-1">
              <Label htmlFor="obs-geral" className="text-xs text-muted-foreground">
                Observação interna
              </Label>
              <Input
                id="obs-geral"
                className="h-9"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <Button
              type="button"
              disabled={busy || !file || leituraBusy || tabelaEvidenciasAusente}
              className="h-9 w-full sm:w-auto sm:shrink-0"
              onClick={() => void guardar()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar anexo"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
