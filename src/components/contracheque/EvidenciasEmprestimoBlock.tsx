"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import type { GrupoConsolidadoEmprestimo } from "@/lib/anexos/consolidacao-logica-emprestimos";
import type { Loan } from "@/types/contracheque";
import type { LoanEvidence, TipoEvidenciaEmprestimo, StatusConferenciaLeitura } from "@/types/loan-evidence";
import {
  LOAN_EVIDENCES_STORAGE_BUCKET,
  TIPOS_EVIDENCIA_EMPRESTIMO,
  evidenciasDoGrupoConsolidado,
  evidenciasParaContratoInferido,
  fingerprintContratoInferido,
  labelTipoEvidencia,
  loanRelacionadoAoContratoInferido,
  mensagemErroEvidenciaSupabase,
} from "@/lib/anexos/evidencias-emprestimos";
import type { ResultadoLeituraAutomaticaEvidencia } from "@/services/evidencias/pipeline-leitura-automatica";
import { carregarPerfilTitularParaSessao } from "@/lib/contratos/carregar-perfil-titular";
import { executarPipelineLeituraAutomaticaEvidencia } from "@/services/evidencias/pipeline-leitura-automatica";
import { processarContratoAnexoParaPersistencia } from "@/services/evidencias/processar-contrato-anexo-para-persistencia";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Paperclip, ExternalLink } from "lucide-react";
import { toast } from "sonner";

async function carregarUrlEvidencia(storagePath: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(LOAN_EVIDENCES_STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function ContratoAnexoOptionLabel(c: EmprestimoContratoAnalise, idx: number): string {
  const short = c.descricao.length > 42 ? `${c.descricao.slice(0, 42)}…` : c.descricao;
  return `${idx + 1}. ${short} (${fingerprintContratoInferido(c).slice(0, 28)}…)`;
}

type PropsContrato = {
  mode: "contrato";
  contrato: EmprestimoContratoAnalise;
  loans: Loan[];
  evidencias: LoanEvidence[];
  onRefresh: () => void;
  /** Atalhos que abrem o diálogo já com o tipo pré-selecionado. */
  mostrarAtalhosTipos?: boolean;
};

type PropsGrupo = {
  mode: "grupo";
  grupo: GrupoConsolidadoEmprestimo;
  loans: Loan[];
  evidencias: LoanEvidence[];
  onRefresh: () => void;
  mostrarAtalhosTipos?: boolean;
};

export type EvidenciasEmprestimoBlockProps = PropsContrato | PropsGrupo;

const ATALHOS_INFERIDOS: { tipo: TipoEvidenciaEmprestimo; label: string }[] = [
  { tipo: "contrato_formal", label: "Contrato" },
  { tipo: "extrato_bancario", label: "Extrato" },
  { tipo: "autorizacao_desconto", label: "Autorização" },
  { tipo: "comprovante_quitacao", label: "Quitação" },
  { tipo: "decisao_judicial", label: "Decisão" },
  { tipo: "taxa_seguro", label: "Taxa / seguro" },
];

export function EvidenciasEmprestimoBlock(props: EvidenciasEmprestimoBlockProps) {
  const { loans, evidencias, onRefresh, mostrarAtalhosTipos = false } = props;
  const listaEvidencias =
    props.mode === "contrato"
      ? evidenciasParaContratoInferido(props.contrato, loans, evidencias)
      : evidenciasDoGrupoConsolidado(props.grupo, loans, evidencias);

  const contratosAlvo: EmprestimoContratoAnalise[] =
    props.mode === "contrato" ? [props.contrato] : props.grupo.contratosOriginais;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [targetIdx, setTargetIdx] = useState(0);
  const [tipo, setTipo] = useState<TipoEvidenciaEmprestimo>("contrato_formal");
  const [dataDocumento, setDataDocumento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [leitura, setLeitura] = useState<ResultadoLeituraAutomaticaEvidencia | null>(null);
  const [leituraBusy, setLeituraBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [conferenciaDecisao, setConferenciaDecisao] = useState<StatusConferenciaLeitura | null>(null);
  const [mostrarSeletorManual, setMostrarSeletorManual] = useState(false);
  const [conferenciaObservacao, setConferenciaObservacao] = useState("");
  const [rendaRef, setRendaRef] = useState<RendaReferenciaUsuario>({
    rendaLiquidaMensal: null,
    fonte: null,
  });
  const [analiseConferencia, setAnaliseConferencia] =
    useState<StatusConferenciaAnaliseJuridica>("pendente");
  const [analiseObservacao, setAnaliseObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const supabase = createClient();
      const r = await obterRendaReferenciaUsuario(supabase);
      setRendaRef(r);
    })();
  }, [open]);

  const loanVinculoAnalise = useMemo(() => {
    if (!leitura || contratosAlvo.length === 0) return undefined;
    const alvo = contratosAlvo[targetIdx] ?? contratosAlvo[0]!;
    return loanRelacionadoAoContratoInferido(alvo, loans);
  }, [leitura, contratosAlvo, targetIdx, loans]);

  async function processarLeituraAutomatica(f: File | null) {
    setLeitura(null);
    setOcrProgress(null);
    setConferenciaDecisao(null);
    setMostrarSeletorManual(false);
    if (!f) return;
    setLeituraBusy(true);
    try {
      const supabase = createClient();
      const titular = await carregarPerfilTitularParaSessao(supabase);
      const fontes = await carregarFontesCruzamentoContrato(supabase, {
        excluirLoanId: loanVinculoAnalise?.id,
      });
      setRendaRef(fontes.renda);
      const motorAnalise = contextoMotorDeFontesCarregadas(fontes, {
        titular,
        loanIdVinculado: loanVinculoAnalise?.id ?? null,
      });
      const r = await executarPipelineLeituraAutomaticaEvidencia(f, contratosAlvo, {
        titular,
        motorAnalise,
        onProgress: (p) => {
          if (p.kind === "pdf_text_layer" && p.phase === "start") setOcrProgress("A extrair texto do PDF…");
          if (p.kind === "pdf_text_layer" && p.phase === "done") setOcrProgress("Texto do PDF processado.");
          if (p.kind === "pdf_ocr") setOcrProgress(`OCR do PDF: página ${p.page} / ${p.totalPages}`);
          if (p.kind === "image_ocr") setOcrProgress(p.status ?? "OCR em imagem…");
          if (p.kind === "image_ocr_deep") setOcrProgress(`OCR reforçado: passo ${p.pass} / ${p.totalPasses}`);
        },
      });
      setLeitura(r);
      setOcrProgress(null);
      if (r.extraido.dataContratacao) {
        setDataDocumento((prev) => prev || r.extraido.dataContratacao!);
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

  function confirmarVinculoSugerido() {
    const top = leitura?.sugestoesVinculo[0];
    if (!top) {
      toast.error("Não há vínculo sugerido para confirmar.");
      return;
    }
    const ix = contratosAlvo.findIndex((c) => fingerprintContratoInferido(c) === top.fingerprint);
    if (ix < 0) {
      toast.error("O contrato sugerido não está na lista deste diálogo.");
      return;
    }
    setTargetIdx(ix);
    setConferenciaDecisao("confirmado");
    setMostrarSeletorManual(false);
    toast.message("Vínculo sugerido aceite. Pode guardar a evidência.");
  }

  function aplicarVinculoManual() {
    setConferenciaDecisao("ajustado_manual");
    setMostrarSeletorManual(false);
    toast.message("Vínculo manual registado. Pode guardar.");
  }

  function escolherSalvarSemVinculo() {
    setConferenciaDecisao("sem_vinculo");
    setMostrarSeletorManual(false);
    toast.message("Ao guardar, ficará sem vínculo a contrato inferido (requer patch SQL de conferência).");
  }

  function ignorarLeituraAutomatica() {
    setConferenciaDecisao("ignorado");
    setMostrarSeletorManual(false);
    toast.message("Leitura ignorada para o vínculo: usará a linha inferida selecionada acima ao guardar.");
  }

  function reprocessarOcr() {
    if (!file) {
      toast.error("Selecione um ficheiro primeiro.");
      return;
    }
    void processarLeituraAutomatica(file);
  }

  async function submeter() {
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

    setBusy(true);
    try {
      const alvoFinal = contratosAlvo[targetIdx] ?? contratosAlvo[0]!;
      const loanSemVinculo = conferenciaDecisao === "sem_vinculo";
      const loan = loanSemVinculo ? null : loanRelacionadoAoContratoInferido(alvoFinal, loans);
      const fpInferido =
        loanSemVinculo ? null : loan != null ? null : fingerprintContratoInferido(alvoFinal);
      const ext = (file.name.split(".").pop() || "bin").slice(0, 8).replace(/[^a-z0-9]/gi, "");
      const folderKey = loanSemVinculo
        ? "sem-vinculo"
        : loan != null
          ? loan.id
          : fpInferido!.replace(/[^a-z0-9]/gi, "-").slice(0, 72);
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

      const baseRow = {
        user_id: user.id,
        loan_id: loanSemVinculo ? null : loan?.id ?? null,
        contrato_inferido_fingerprint: loanSemVinculo ? null : loan != null ? null : fpInferido,
        tipo_evidencia: tipo,
        nome_arquivo: file.name,
        storage_path: objectPath,
        data_documento: dataDocumento.trim() || null,
        observacao: observacao.trim() || null,
      };

      const titular = await carregarPerfilTitularParaSessao(supabase);
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
        contratosCandidatos: contratosAlvo,
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
      }
      for (const aviso of processado.avisosPipeline) {
        toast.message(aviso);
      }

      const leituraCols = processado.leituraCols;
      const rowPayload = { ...baseRow, ...leituraCols };
      let insErr = (await supabase.from("loan_evidences").insert(rowPayload)).error;

      if (insErr && Object.keys(leituraCols).length > 0) {
        insErr = (await supabase.from("loan_evidences").insert(baseRow)).error;
        if (!insErr) {
          toast.message(
            "Evidência guardada sem metadados de leitura automática. Execute no Supabase o ficheiro supabase/patch_loan_evidences_leitura_automatica.sql.",
          );
        }
      }

      if (insErr) {
        toast.error(mensagemErroEvidenciaSupabase(insErr.message, "insert"));
        return;
      }

      if (tipo === "decisao_judicial") {
        const { registrarDecisaoJudicialDeEvidencia } = await import(
          "@/lib/juridico/base-atualizacoes-juridicas"
        );
        registrarDecisaoJudicialDeEvidencia({
          processo: observacao.trim() || undefined,
          resumo: observacao.trim() || `Decisão judicial — ${file?.name ?? "anexo"}`,
          data: dataDocumento || new Date().toISOString().slice(0, 10),
          fonte: file?.name ?? "loan_evidence",
        });
      }

      toast.success("Evidência registada.");
      setOpen(false);
      setFile(null);
      setObservacao("");
      setDataDocumento("");
      setLeitura(null);
      setOcrProgress(null);
      setConferenciaDecisao(null);
      setMostrarSeletorManual(false);
      setConferenciaObservacao("");
      setAnaliseConferencia("pendente");
      setAnaliseObservacao("");
      emitDashboardDataUpdated({ origin: "evidencia_emprestimo" });
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  function abrirComTipo(t: TipoEvidenciaEmprestimo) {
    setTipo(t);
    setOpen(true);
  }

  return (
    <div className="space-y-1.5 min-w-[140px]">
      {mostrarAtalhosTipos ? (
        <div className="flex flex-wrap gap-1">
          {ATALHOS_INFERIDOS.map((a) => (
            <Button
              key={a.tipo}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-1.5 text-[9px]"
              onClick={() => abrirComTipo(a.tipo)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
      <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => setOpen(true)}>
        <Paperclip className="h-3 w-3" aria-hidden />
        Anexar evidência
      </Button>
      {listaEvidencias.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">Nenhuma evidência.</p>
      ) : (
        <ul className="text-[10px] text-muted-foreground space-y-0.5 max-w-[200px]">
          {listaEvidencias.slice(0, 4).map((e) => (
            <li key={e.id} className="flex items-start gap-1">
              <button
                type="button"
                className="text-left hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-0.5"
                onClick={() =>
                  void carregarUrlEvidencia(e.storage_path).then((url) => {
                    if (url) window.open(url, "_blank", "noopener,noreferrer");
                    else toast.error("Não foi possível gerar o link do ficheiro.");
                  })
                }
              >
                <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                <span className="line-clamp-2">
                  {labelTipoEvidencia(e.tipo_evidencia)} — {e.nome_arquivo}
                </span>
              </button>
            </li>
          ))}
          {listaEvidencias.length > 4 ? (
            <li className="text-muted-foreground/80">+{listaEvidencias.length - 4} mais…</li>
          ) : null}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setFile(null);
            setLeitura(null);
            setOcrProgress(null);
            setLeituraBusy(false);
            setConferenciaDecisao(null);
            setMostrarSeletorManual(false);
            setConferenciaObservacao("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" showCloseButton>
          <DialogHeader>
            <DialogTitle>Anexar evidência</DialogTitle>
            <DialogDescription>
              Documento associado ao contrato na base documental. Isto não gera conclusão jurídica automática.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {tipo === "contrato_formal" || tipo === "taxa_seguro" ? (
              <AvisoTriagemAnaliseContrato compacto />
            ) : null}
            {contratosAlvo.length > 1 ? (
              <label className="block text-xs space-y-1">
                <span className="text-muted-foreground">Vincular a qual linha inferida do grupo?</span>
                <select
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  value={targetIdx}
                  onChange={(e) => setTargetIdx(Number(e.target.value))}
                >
                  {contratosAlvo.map((c, i) => (
                    <option key={fingerprintContratoInferido(c)} value={i}>
                      {ContratoAnexoOptionLabel(c, i)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block text-xs space-y-1">
              <span className="text-muted-foreground">Tipo de evidência</span>
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoEvidenciaEmprestimo)}
              >
                {TIPOS_EVIDENCIA_EMPRESTIMO.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs space-y-1">
              <span className="text-muted-foreground">Ficheiro</span>
              <Input
                type="file"
                accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff"
                className="text-xs h-auto py-1.5"
                disabled={leituraBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  void processarLeituraAutomatica(f);
                }}
              />
            </label>

            <LeituraAutomaticaEvidenciaPanel
              confiancaNivel={leitura?.leituraConfiancaNivel ?? "baixa"}
              confiancaScore={leitura?.leituraConfiancaScore ?? 0}
              extraido={leitura?.extraido ?? null}
              camposAusentes={leitura?.camposNaoEncontrados ?? []}
              sugestoes={leitura?.sugestoesVinculo ?? []}
              ocrProgress={ocrProgress}
              temLeitura={!!leitura}
              conferenciaDecisao={conferenciaDecisao}
              contratosAlvo={contratosAlvo}
              targetIdx={targetIdx}
              onTargetIdxChange={setTargetIdx}
              mostrarSeletorManual={mostrarSeletorManual}
              onConfirmarVinculoSugerido={confirmarVinculoSugerido}
              onAbrirVinculoManual={() => setMostrarSeletorManual(true)}
              onAplicarVinculoManual={aplicarVinculoManual}
              onSalvarSemVinculo={escolherSalvarSemVinculo}
              onReprocessarOcr={reprocessarOcr}
              onIgnorarLeitura={ignorarLeituraAutomatica}
              reprocessarOcrDisabled={!file || leituraBusy}
              leituraBusy={leituraBusy}
            />

            {leitura?.analiseContratoEmprestimo ? (
              <RadarDoContratoCard
                analise={leitura.analiseContratoEmprestimo}
                conferencia={analiseConferencia}
                onConferenciaChange={setAnaliseConferencia}
                observacao={analiseObservacao}
                onObservacaoChange={setAnaliseObservacao}
                onVincularContratoAnterior={() => {
                  setMostrarSeletorManual(true);
                  if (contratosAlvo.length > 0) setTargetIdx(0);
                }}
              />
            ) : null}

            {leitura ? (
              <label className="block text-xs space-y-1">
                <span className="text-muted-foreground">Nota da conferência (opcional)</span>
                <textarea
                  className="w-full min-h-[56px] rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  value={conferenciaObservacao}
                  onChange={(e) => setConferenciaObservacao(e.target.value)}
                  placeholder="Ex.: conferi valores com o PDF assinado"
                />
              </label>
            ) : null}

            <label className="block text-xs space-y-1">
              <span className="text-muted-foreground">Data do documento (opcional)</span>
              <Input type="date" value={dataDocumento} onChange={(e) => setDataDocumento(e.target.value)} />
            </label>

            <label className="block text-xs space-y-1">
              <span className="text-muted-foreground">Observação (opcional)</span>
              <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Nota interna" />
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !file}
              onClick={() => void submeter()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
