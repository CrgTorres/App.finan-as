"use client";

import { useMemo, useState } from "react";
import type { PerfilTitularApp } from "@/lib/contratos/perfil-titular-app";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ContratoExtraido, NivelConfiancaLeitura } from "@/types/contrato-extraido";
import type { StatusConferenciaLeitura } from "@/types/loan-evidence";
import type { AlertaPlausibilidadeContrato } from "@/types/contrato-extraido";
import { checarFinanciamentoVsCalculadoraCidadao } from "@/services/contratos/bcb-calculadora-cidadao-financiamento";
import type { CruzamentoExtraidoLoan, SugestaoLoanExtraido } from "@/services/contratos/cruzar-extraido-com-loan";
import {
  ConferenciaContratoExtraidoGrid,
  type CampoConferenciaEditavel,
} from "@/components/contracheque/ConferenciaContratoExtraidoGrid";
import { CronogramaContratoExtraidoBlock } from "@/components/contracheque/CronogramaContratoExtraidoBlock";
import { SinteseConfiabilidadeContratoBlock } from "@/components/contracheque/SinteseConfiabilidadeContratoBlock";
import { ResumoBcbCalculadoraCidadao } from "@/components/contracheque/ResumoBcbCalculadoraCidadao";
import type { SinteseConfiabilidadeContrato } from "@/services/contratos/auditar-confiabilidade-contrato";

const CODIGOS_ALERTA_INFORMATIVO = new Set([
  "cpf_consumidor_titular_ok",
  "seguro_mencionado_como_opcional",
]);

function badgeNivel(n: NivelConfiancaLeitura) {
  if (n === "alta") return <Badge className="text-[10px] h-5 bg-emerald-600/90">Alta</Badge>;
  if (n === "media") return <Badge className="text-[10px] h-5 bg-amber-600/90">Média</Badge>;
  return <Badge variant="secondary" className="text-[10px] h-5">Baixa</Badge>;
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function soDigitosCpf(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

function ScoreBar({ score, nivel }: { score: number; nivel: NivelConfiancaLeitura }) {
  const cor =
    nivel === "alta"
      ? "bg-emerald-500"
      : nivel === "media"
        ? "bg-amber-500"
        : "bg-muted-foreground/60";
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden" aria-hidden>
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-foreground">{score}</span>
    </div>
  );
}

function VinculoEmprestimo({
  cruzamentoLoan,
  sugestoesAlternativas,
  onSelecionarLoanSugerido,
}: {
  cruzamentoLoan?: CruzamentoExtraidoLoan | null;
  sugestoesAlternativas: SugestaoLoanExtraido[];
  onSelecionarLoanSugerido?: (loanId: string) => void;
}) {
  if (!cruzamentoLoan && sugestoesAlternativas.length === 0) return null;
  if (!onSelecionarLoanSugerido) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {cruzamentoLoan ? (
        <span
          className={`inline-flex items-center gap-1 text-[10px] rounded-full px-2.5 py-0.5 ${
            cruzamentoLoan.podeConfirmar
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          <span className="font-medium">
            {cruzamentoLoan.loan.institution_name || cruzamentoLoan.loan.description}
          </span>
          <span className="opacity-75">{cruzamentoLoan.podeConfirmar ? "· OK" : "· diverge"}</span>
        </span>
      ) : null}
      {sugestoesAlternativas.length > 0 ? (
        <details className="text-[10px] inline-block">
          <summary className="cursor-pointer text-muted-foreground list-none [&::-webkit-details-marker]:hidden hover:text-foreground">
            {cruzamentoLoan?.podeConfirmar ? "Trocar" : "Vincular"} ({sugestoesAlternativas.length})
          </summary>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {sugestoesAlternativas.slice(0, 4).map((s) => (
              <Button
                key={s.loanId}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                onClick={() => onSelecionarLoanSugerido(s.loanId)}
              >
                {s.resumo.slice(0, 36)}
              </Button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export type LeituraContratoUploadPanelProps = {
  confiancaNivel: NivelConfiancaLeitura;
  confiancaScore: number;
  extraido: ContratoExtraido;
  camposAusentes: (keyof ContratoExtraido)[];
  ocrProgress?: string | null;
  conferenciaDecisao: StatusConferenciaLeitura | null;
  onConfirmarExtracao?: () => void;
  onCampoChange?: (campo: CampoConferenciaEditavel, valor: string) => void;
  perfilTitular?: PerfilTitularApp | null;
  cruzamentoLoan?: CruzamentoExtraidoLoan | null;
  sugestoesLoan?: SugestaoLoanExtraido[];
  onSelecionarLoanSugerido?: (loanId: string) => void;
  parcelasPagasCadastro?: number;
  onReprocessarOcr?: () => void;
  onIgnorarLeitura?: () => void;
  reprocessarDisabled?: boolean;
  leituraBusy?: boolean;
  sintese: SinteseConfiabilidadeContrato;
  alertasTitular: AlertaPlausibilidadeContrato[];
  alertasDatas: AlertaPlausibilidadeContrato[];
  alertasSeguro: AlertaPlausibilidadeContrato[];
  alertasOutros: AlertaPlausibilidadeContrato[];
  bloqueioConfirmacao: boolean;
  syncCadastroAoGuardar?: boolean;
  /** Rodapé de confirmar/reprocessar fica no componente pai (junto com Guardar). */
  mostrarRodapeAcoes?: boolean;
};

export function LeituraContratoUploadPanel({
  confiancaNivel,
  confiancaScore,
  extraido,
  camposAusentes,
  ocrProgress,
  conferenciaDecisao,
  onConfirmarExtracao,
  onCampoChange,
  perfilTitular,
  cruzamentoLoan,
  sugestoesLoan = [],
  onSelecionarLoanSugerido,
  parcelasPagasCadastro = 0,
  onReprocessarOcr,
  onIgnorarLeitura,
  reprocessarDisabled,
  leituraBusy,
  sintese,
  alertasTitular,
  alertasDatas,
  alertasSeguro,
  alertasOutros,
  bloqueioConfirmacao,
  syncCadastroAoGuardar,
  mostrarRodapeAcoes = true,
}: LeituraContratoUploadPanelProps) {
  const [corrigirDatasManual, setCorrigirDatasManual] = useState(false);
  const scoreExibicao = sintese.scoreAjustado ?? confiancaScore;
  const nivelExibicao = sintese.nivelGeral ?? confiancaNivel;

  const alertasAtencao = useMemo(() => {
    const todos = [...alertasTitular, ...alertasDatas, ...alertasSeguro, ...alertasOutros];
    const porCodigo = new Map<string, AlertaPlausibilidadeContrato>();
    for (const a of todos) {
      if (!CODIGOS_ALERTA_INFORMATIVO.has(a.codigo)) porCodigo.set(a.codigo, a);
    }
    return [...porCodigo.values()].sort((a, b) =>
      a.severidade === "critico" && b.severidade !== "critico" ? -1 : 0,
    );
  }, [alertasTitular, alertasDatas, alertasSeguro, alertasOutros]);

  const alertasInformativos = useMemo(() => {
    const todos = [...alertasTitular, ...alertasDatas, ...alertasSeguro, ...alertasOutros];
    return todos.filter((a) => CODIGOS_ALERTA_INFORMATIVO.has(a.codigo));
  }, [alertasTitular, alertasDatas, alertasSeguro, alertasOutros]);

  const temCritico = alertasAtencao.some((a) => a.severidade === "critico");
  const totalPontos =
    alertasAtencao.length + sintese.pendencias.length + sintese.bloqueiosConfirmacao.length;

  const resumoBcb = useMemo(() => {
    const q0 = extraido.valorFinanciado ?? extraido.valorSolicitado;
    const p = extraido.parcela;
    const n = extraido.parcelas;
    if (q0 == null || p == null || n == null || q0 <= 0 || p <= 0 || n < 1) return null;
    return checarFinanciamentoVsCalculadoraCidadao({
      valorFinanciado: q0,
      prestacao: p,
      numMeses: Math.round(n),
      jurosMensalPct: extraido.jurosMensal,
      cetMensalPct: extraido.cetMensal,
    });
  }, [extraido]);

  const destaqueCampo = (k: keyof ContratoExtraido): string => {
    if (cruzamentoLoan && k === "parcela" && !cruzamentoLoan.parcelaOk) {
      return "rounded border border-destructive/50 bg-destructive/5 px-1";
    }
    if (camposAusentes.includes(k)) return "rounded border border-amber-500/50 bg-amber-500/5 px-1";
    return "";
  };

  const cpfTitularDigitos = (perfilTitular?.cpfDigitos ?? soDigitosCpf(perfilTitular?.cpf)) || null;
  const loanVinculadoId = cruzamentoLoan?.loan.id;
  const sugestoesAlternativas = sugestoesLoan.filter((s) => s.loanId !== loanVinculadoId);

  const linhaContrato = [
    extraido.parcela != null && extraido.parcelas != null
      ? `${formatBRL(extraido.parcela)} × ${Math.round(extraido.parcelas)}`
      : null,
    extraido.banco ? String(extraido.banco).replace(/^Banco\s+/i, "") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const conferido =
    conferenciaDecisao === "confirmado" || conferenciaDecisao === "sem_vinculo";

  return (
    <div className="space-y-4 text-xs">
      {/* Resumo */}
      <section className="rounded-lg border border-border/60 bg-card/40 px-3 py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-base font-semibold text-foreground leading-tight truncate">
              {linhaContrato || "Contrato extraído"}
            </p>
            <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{sintese.veredito}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <ScoreBar score={scoreExibicao} nivel={nivelExibicao} />
            <div className="flex items-center gap-1">
              {badgeNivel(nivelExibicao)}
              {conferido ? (
                <Badge
                  variant="outline"
                  className="text-[9px] h-5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                >
                  OK
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {bloqueioConfirmacao && sintese.bloqueiosConfirmacao[0] ? (
          <p className="text-[10px] text-destructive font-medium">{sintese.bloqueiosConfirmacao[0]}</p>
        ) : null}

        <VinculoEmprestimo
          cruzamentoLoan={cruzamentoLoan}
          sugestoesAlternativas={sugestoesAlternativas}
          onSelecionarLoanSugerido={onSelecionarLoanSugerido}
        />
      </section>

      {ocrProgress ? <p className="text-[10px] text-muted-foreground animate-pulse">{ocrProgress}</p> : null}

      {/* Pontos de atenção — único bloco (alertas + pendências, sem síntese duplicada) */}
      {totalPontos > 0 ? (
        <details
          open={temCritico || bloqueioConfirmacao}
          className={`rounded-lg border px-3 py-2 ${
            temCritico ? "border-destructive/35 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <summary className="cursor-pointer list-none text-xs font-medium text-foreground [&::-webkit-details-marker]:hidden">
            Pontos de atenção ({alertasAtencao.length + sintese.pendencias.length})
          </summary>
          <ul className="mt-2 space-y-1.5 text-[10px] leading-snug list-none">
            {alertasAtencao.map((a) => (
              <li
                key={a.codigo}
                className={`pl-2 border-l-2 ${
                  a.severidade === "critico"
                    ? "border-destructive text-destructive"
                    : "border-amber-500/60 text-foreground/90"
                }`}
              >
                {a.mensagem}
              </li>
            ))}
            {sintese.pendencias.map((p) => (
              <li key={p.slice(0, 48)} className="pl-2 border-l-2 border-amber-500/60 text-foreground/90">
                {p}
              </li>
            ))}
          </ul>
          {alertasInformativos.length > 0 ? (
            <p className="mt-2 text-[9px] text-muted-foreground">
              {alertasInformativos.map((a) => a.mensagem).join(" · ")}
            </p>
          ) : null}
        </details>
      ) : alertasInformativos.length > 0 ? (
        <p className="text-[10px] text-emerald-700/90 dark:text-emerald-300/90 px-1">
          {alertasInformativos[0]?.mensagem}
        </p>
      ) : null}

      {/* Conferência — sempre visível */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-foreground">Conferir dados do PDF</h3>
        <ConferenciaContratoExtraidoGrid
          extraido={extraido}
          camposAusentes={camposAusentes}
          compacto
          cpfTitularDigitos={cpfTitularDigitos}
          nomeTitularReferencia={perfilTitular?.nome ?? null}
          uploadStandalone
          corrigirDatasManual={corrigirDatasManual}
          onToggleCorrigirDatas={() => setCorrigirDatasManual((v) => !v)}
          onCampoChange={onCampoChange}
          destaqueCampo={destaqueCampo}
        />

      </section>

      <details className="rounded-lg border border-border/40 px-3 py-2 text-[10px]">
        <summary className="cursor-pointer list-none text-muted-foreground [&::-webkit-details-marker]:hidden hover:text-foreground">
          BCB, cronograma e síntese completa
        </summary>
        <div className="mt-3 space-y-3">
          {resumoBcb ? <ResumoBcbCalculadoraCidadao extraido={extraido} resumo={resumoBcb} /> : null}
          {extraido.parcela != null && extraido.parcelas != null ? (
            <CronogramaContratoExtraidoBlock extraido={extraido} parcelasPagas={parcelasPagasCadastro} />
          ) : null}
          <SinteseConfiabilidadeContratoBlock sintese={sintese} scoreOcr={confiancaScore} />
        </div>
      </details>

      {mostrarRodapeAcoes ? (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
          <Button
            type="button"
            size="sm"
            className="h-8 text-[11px]"
            disabled={leituraBusy || !onConfirmarExtracao || bloqueioConfirmacao}
            onClick={() => onConfirmarExtracao?.()}
          >
            {conferido ? "Confirmado" : "Confirmo os dados"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-[11px] text-muted-foreground"
            disabled={reprocessarDisabled}
            onClick={onReprocessarOcr}
          >
            Reprocessar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-[11px] text-muted-foreground"
            onClick={onIgnorarLeitura}
          >
            Ignorar OCR
          </Button>
        </div>
      ) : null}

      {mostrarRodapeAcoes && syncCadastroAoGuardar && cruzamentoLoan?.podeConfirmar ? (
        <p className="text-[10px] text-muted-foreground">Ao guardar, o empréstimo vinculado será atualizado.</p>
      ) : null}

      {!mostrarRodapeAcoes && bloqueioConfirmacao && sintese.bloqueiosConfirmacao[0] ? (
        <p className="text-[10px] text-destructive font-medium">{sintese.bloqueiosConfirmacao[0]}</p>
      ) : null}
    </div>
  );
}
