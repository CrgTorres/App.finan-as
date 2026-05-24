"use client";

import { useMemo, useState } from "react";
import type { PerfilTitularApp } from "@/lib/contratos/perfil-titular-app";
import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { fingerprintContratoInferido } from "@/lib/anexos/evidencias-emprestimos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ContratoExtraido, NivelConfiancaLeitura, SugestaoVinculoContrato } from "@/types/contrato-extraido";
import type { StatusConferenciaLeitura } from "@/types/loan-evidence";
import {
  checarFinanciamentoVsCalculadoraCidadao,
  URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS,
} from "@/services/contratos/bcb-calculadora-cidadao-financiamento";
import type {
  CruzamentoExtraidoLoan,
  SugestaoLoanExtraido,
} from "@/services/contratos/cruzar-extraido-com-loan";
import {
  ConferenciaContratoExtraidoGrid,
  type CampoConferenciaEditavel,
} from "@/components/contracheque/ConferenciaContratoExtraidoGrid";
import { CronogramaContratoExtraidoBlock } from "@/components/contracheque/CronogramaContratoExtraidoBlock";
import { SinteseConfiabilidadeContratoBlock } from "@/components/contracheque/SinteseConfiabilidadeContratoBlock";
import { auditarConfiabilidadeContrato } from "@/services/contratos/auditar-confiabilidade-contrato";
import { AvisoTriagemAnaliseContrato } from "@/components/contratos/AvisoTriagemAnaliseContrato";
import { LeituraContratoUploadPanel } from "@/components/contracheque/LeituraContratoUploadPanel";

const LABEL_CAMPO: Partial<Record<keyof ContratoExtraido, string>> = {
  banco: "Banco",
  cnpj: "CNPJ",
  cliente: "Cliente",
  cpf: "CPF",
  parcela: "Valor da parcela",
  parcelas: "Quantidade de parcelas",
  valorSolicitado: "Valor solicitado",
  valorFinanciado: "Valor financiado",
  valorTotalPago: "Valor total pago",
  cetAnual: "CET anual (%)",
  cetMensal: "CET mensal (%)",
  jurosMensal: "Juros mensal (%)",
  jurosAnual: "Juros anual (%)",
  iof: "IOF",
  dataDocumento: "Data do documento (cabeçalho CCB)",
  dataContratacao: "Data do contrato / emissão",
  dataAssinatura: "Data na assinatura (rodapé)",
  ultimoVencimento: "Último vencimento (E.2)",
  localContratacao: "Local (assinatura / sec. G)",
  atendenteNome: "Atendente / correspondente",
  atendenteCpf: "CPF do atendente",
  atendenteMatricula: "Matrícula / código atendente",
  primeiroVencimento: "1º vencimento",
  numeroProposta: "Nº proposta",
  tipoContrato: "Tipo (documento)",
  refinanciamento: "Refinanciamento",
  portabilidade: "Portabilidade",
  seguro: "Seguro / acessório (R$ no quadro)",
  seguroPrestamistaMencionado: "Palavra «seguro prestamista» no OCR (não é valor em R$)",
  tarifas: "Tarifas",
  scoreConfianca: "Score interno",
};

function badgeNivel(n: NivelConfiancaLeitura) {
  if (n === "alta") return <Badge className="text-[10px] h-5 bg-emerald-600/90 hover:bg-emerald-600">Alta confiança</Badge>;
  if (n === "media") return <Badge className="text-[10px] h-5 bg-amber-600/90 hover:bg-amber-600">Média confiança</Badge>;
  return <Badge variant="secondary" className="text-[10px] h-5">Baixa confiança</Badge>;
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatIsoPt(iso?: string): string {
  if (!iso?.trim()) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const RE_ALERTA_TITULAR = /^(cpf_consumidor|titular_|nome_consumidor)/;
const RE_ALERTA_DATAS =
  /^(nenhuma_data|data_|vencimento_|validade_|prazo_ate|datas_contrato|data_contrato_omitida)/;
function formatCampo(k: keyof ContratoExtraido, v: ContratoExtraido[keyof ContratoExtraido]): string {
  if (v == null) return "—";
  if (k === "seguroPrestamistaMencionado") {
    return "Ver síntese de seguro (não é valor contratado)";
  }
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (k === "parcela" || k === "valorSolicitado" || k === "valorFinanciado" || k === "valorTotalPago" || k === "iof" || k === "seguro" || k === "tarifas") {
    if (typeof v === "number") return formatBRL(v);
  }
  if (typeof v === "number") return String(v);
  if (
    (k === "dataDocumento" ||
      k === "dataContratacao" ||
      k === "dataAssinatura" ||
      k === "primeiroVencimento" ||
      k === "ultimoVencimento") &&
    typeof v === "string"
  ) {
    return formatIsoPt(v);
  }
  return String(v);
}

function opcaoContrato(c: EmprestimoContratoAnalise, idx: number): string {
  const short = c.descricao.length > 42 ? `${c.descricao.slice(0, 42)}…` : c.descricao;
  return `${idx + 1}. ${short}`;
}

function badgeDecisao(d: StatusConferenciaLeitura) {
  const map: Record<StatusConferenciaLeitura, { label: string; className: string }> = {
    pendente: { label: "Pendente", className: "" },
    pendente_conferencia: {
      label: "Pendente conferência",
      className: "bg-sky-600/15 text-sky-900 dark:text-sky-100",
    },
    confirmado: { label: "Vínculo confirmado", className: "bg-emerald-600/20 text-emerald-800 dark:text-emerald-200" },
    ajustado_manual: { label: "Vínculo ajustado manualmente", className: "bg-sky-600/20 text-sky-900 dark:text-sky-100" },
    sem_vinculo: { label: "Sem vínculo a contrato inferido", className: "bg-muted text-foreground" },
    ignorado: { label: "Leitura ignorada (vínculo manual)", className: "bg-amber-600/15 text-amber-900 dark:text-amber-100" },
  };
  const x = map[d];
  return (
    <Badge variant="outline" className={`text-[10px] h-5 ${x.className}`}>
      {x.label}
    </Badge>
  );
}

type Props = {
  confiancaNivel: NivelConfiancaLeitura;
  confiancaScore: number;
  extraido: ContratoExtraido | null;
  camposAusentes: (keyof ContratoExtraido)[];
  sugestoes: SugestaoVinculoContrato[];
  ocrProgress?: string | null;
  temLeitura: boolean;
  conferenciaDecisao: StatusConferenciaLeitura | null;
  contratosAlvo: EmprestimoContratoAnalise[];
  targetIdx: number;
  onTargetIdxChange: (idx: number) => void;
  mostrarSeletorManual: boolean;
  onConfirmarVinculoSugerido: () => void;
  onAbrirVinculoManual: () => void;
  onAplicarVinculoManual: () => void;
  onSalvarSemVinculo: () => void;
  onReprocessarOcr: () => void;
  onIgnorarLeitura: () => void;
  reprocessarOcrDisabled?: boolean;
  leituraBusy?: boolean;
  /**
   * Upload fora do painel de análise (ex.: página «Contrato empréstimo»): não há contratos
   * inferidos para vínculo; mostra um único passo de confirmação dos dados lidos.
   */
  uploadStandalone?: boolean;
  onConfirmarExtracaoStandalone?: () => void;
  /** Override manual só quando necessário (datas vêm da convergência automática). */
  onCampoConferenciaChange?: (campo: CampoConferenciaEditavel, valor: string) => void;
  perfilTitular?: PerfilTitularApp | null;
  /** Cruzamento com empréstimo em `loans` (parcela / prazo / banco). */
  cruzamentoLoan?: CruzamentoExtraidoLoan | null;
  sugestoesLoan?: SugestaoLoanExtraido[];
  onSelecionarLoanSugerido?: (loanId: string) => void;
  /** Ao guardar, o cadastro será atualizado com os valores confirmados do contrato. */
  syncCadastroAoGuardar?: boolean;
  /** Parcelas já pagas no empréstimo vinculado (para quitação antecipada). */
  parcelasPagasCadastro?: number;
  mostrarRodapeAcoes?: boolean;
};

export function LeituraAutomaticaEvidenciaPanel(props: Props) {
  const {
    confiancaNivel,
    confiancaScore,
    extraido,
    camposAusentes,
    sugestoes,
    ocrProgress,
    temLeitura,
    conferenciaDecisao,
    contratosAlvo,
    targetIdx,
    onTargetIdxChange,
    mostrarSeletorManual,
    onConfirmarVinculoSugerido,
    onAbrirVinculoManual,
    onAplicarVinculoManual,
    onSalvarSemVinculo,
    onReprocessarOcr,
    onIgnorarLeitura,
    reprocessarOcrDisabled,
    leituraBusy = false,
    uploadStandalone = false,
    onConfirmarExtracaoStandalone,
    onCampoConferenciaChange,
    perfilTitular = null,
    cruzamentoLoan = null,
    sugestoesLoan = [],
    onSelecionarLoanSugerido,
    syncCadastroAoGuardar = false,
    parcelasPagasCadastro = 0,
    mostrarRodapeAcoes = true,
  } = props;

  const top = sugestoes[0];
  const scoreTop = top?.score ?? 0;
  const conferenciaPendente = temLeitura && conferenciaDecisao === null;

  const sintese = useMemo(() => {
    if (!extraido) return null;
    return auditarConfiabilidadeContrato(extraido, {
      parcelaOkCadastro: cruzamentoLoan?.parcelaOk === true,
      parcelaDivergeCadastro:
        Boolean(uploadStandalone && cruzamentoLoan && !cruzamentoLoan.podeConfirmar),
    });
  }, [extraido, cruzamentoLoan, uploadStandalone]);

  const scoreExibicao = sintese?.scoreAjustado ?? confiancaScore;
  const nivelExibicao = sintese?.nivelGeral ?? confiancaNivel;
  const baixaConfiancaGlobal = scoreExibicao < 70;
  const bloqueioConfirmacao =
    uploadStandalone && sintese != null && !sintese.podeConfirmar;

  const [corrigirDatasManual, setCorrigirDatasManual] = useState(false);

  const alertasPlaus = extraido?.alertasPlausibilidade ?? [];
  const alertasSeguroVenda = alertasPlaus.filter((x) =>
    /seguro|venda_casada|acessorios_financiados/.test(x.codigo),
  );
  const alertasTitular = alertasPlaus.filter((x) => RE_ALERTA_TITULAR.test(x.codigo));
  const alertasDatas = alertasPlaus.filter((x) => RE_ALERTA_DATAS.test(x.codigo));
  const alertasOutros = alertasPlaus.filter(
    (x) => !alertasSeguroVenda.includes(x) && !alertasTitular.includes(x) && !alertasDatas.includes(x),
  );
  const temAlertaCritico = alertasPlaus.some((x) => x.severidade === "critico");
  const temAlertaSeguroCritico = alertasSeguroVenda.some((x) => x.severidade === "critico");

  const resumoBcb = useMemo(() => {
    if (!extraido) return null;
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

  const notaSomatórioParcelas = useMemo(() => {
    if (!extraido?.valorTotalPago || extraido.parcela == null || extraido.parcelas == null) return null;
    const soma = extraido.parcela * extraido.parcelas;
    const tot = extraido.valorTotalPago;
    const fecha = Math.abs(soma - tot) <= Math.max(1, tot * 0.003);
    const principal = Math.max(extraido.valorFinanciado ?? 0, extraido.valorSolicitado ?? 0);
    if (!fecha || principal <= 0 || tot <= principal * 1.35) return null;
    return { soma, tot, principal };
  }, [extraido]);

  const chavesMostrar = (Object.keys(LABEL_CAMPO) as (keyof ContratoExtraido)[]).filter(
    (k) =>
      k !== "textoExtraido" &&
      k !== "scoreConfianca" &&
      k !== "alertasPlausibilidade" &&
      k !== "datasExtraidas" &&
      k !== "sinteseConfiabilidade" &&
      k !== "seguroPrestamistaMencionado" &&
      extraido &&
      extraido[k] !== undefined &&
      extraido[k] !== null &&
      !(typeof extraido[k] === "string" && !(extraido[k] as string).trim()),
  );

  const destaqueCampo = (k: keyof ContratoExtraido): string => {
    if (!extraido) return "";
    const ausente = camposAusentes.includes(k);
    const vazio =
      extraido[k] === undefined ||
      extraido[k] === null ||
      (typeof extraido[k] === "string" && !(extraido[k] as string).trim());
    if (cruzamentoLoan && k === "parcela" && !cruzamentoLoan.parcelaOk) {
      return "rounded border border-destructive/60 bg-destructive/10 px-1 py-0.5";
    }
    if (cruzamentoLoan && k === "parcelas" && !cruzamentoLoan.parcelasOk) {
      return "rounded border border-amber-500/60 bg-amber-500/5 px-1 py-0.5";
    }
    if (ausente || vazio) return "rounded border border-amber-500/60 bg-amber-500/5 px-1 py-0.5";
    if (baixaConfiancaGlobal) return "rounded border border-border/60 px-1 py-0.5";
    return "";
  };

  if (uploadStandalone && extraido && sintese) {
    return (
      <LeituraContratoUploadPanel
        confiancaNivel={nivelExibicao}
        confiancaScore={confiancaScore}
        extraido={extraido}
        camposAusentes={camposAusentes}
        ocrProgress={ocrProgress}
        conferenciaDecisao={conferenciaDecisao}
        onConfirmarExtracao={onConfirmarExtracaoStandalone}
        onCampoChange={onCampoConferenciaChange}
        perfilTitular={perfilTitular}
        cruzamentoLoan={cruzamentoLoan}
        sugestoesLoan={sugestoesLoan}
        onSelecionarLoanSugerido={onSelecionarLoanSugerido}
        parcelasPagasCadastro={parcelasPagasCadastro}
        onReprocessarOcr={onReprocessarOcr}
        onIgnorarLeitura={onIgnorarLeitura}
        reprocessarDisabled={reprocessarOcrDisabled}
        leituraBusy={leituraBusy}
        sintese={sintese}
        alertasTitular={alertasTitular}
        alertasDatas={alertasDatas}
        alertasSeguro={alertasSeguroVenda}
        alertasOutros={alertasOutros}
        bloqueioConfirmacao={bloqueioConfirmacao}
        syncCadastroAoGuardar={syncCadastroAoGuardar}
        mostrarRodapeAcoes={mostrarRodapeAcoes}
      />
    );
  }

  if (uploadStandalone && !extraido) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 px-4 py-6 text-center text-sm text-muted-foreground">
        {ocrProgress ? <p className="animate-pulse mb-2">{ocrProgress}</p> : null}
        Selecione um PDF ou imagem para extrair os dados do contrato.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/80 bg-muted/20 p-3 space-y-3 text-xs">
      {temLeitura ? <AvisoTriagemAnaliseContrato compacto /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">Leitura automática</span>
        {badgeNivel(nivelExibicao)}
        <span className="text-muted-foreground">Score ajustado: {scoreExibicao}/100</span>
        {top ? (
          <span className="text-[10px] text-muted-foreground">· Sugestão: {scoreTop}/100</span>
        ) : null}
      </div>
      {ocrProgress ? <p className="text-[10px] text-muted-foreground animate-pulse">{ocrProgress}</p> : null}

      {extraido && sintese ? (
        <SinteseConfiabilidadeContratoBlock sintese={sintese} scoreOcr={confiancaScore} />
      ) : null}

      {extraido && resumoBcb ? (
        <div className="rounded-md border border-sky-500/45 bg-sky-500/[0.07] dark:bg-sky-950/30 p-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold text-foreground">Calculadora do Cidadão (modelo no app)</p>
            <Badge variant="outline" className="text-[10px] h-5 border-sky-500/50">
              {alertasPlaus.length === 0 ? "Sem alertas de taxa" : `${alertasPlaus.length} alerta(s) na lista`}
            </Badge>
          </div>
          <p className="text-[10px] text-foreground/90 leading-snug">
            Taxa mensal <strong>implícita</strong> (prestações fixas, juros compostos mensais — BCB):{" "}
            <strong>
              {resumoBcb.taxaImplicitaMensalPct.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              })}
              % a.m.
            </strong>
            {extraido.jurosMensal != null ? (
              <>
                {" "}
                · Juros no documento: <strong>{extraido.jurosMensal}% a.m.</strong>
              </>
            ) : null}
            {extraido.cetMensal != null ? (
              <>
                {" "}
                · CET mensal: <strong>{extraido.cetMensal}% a.m.</strong>
              </>
            ) : (
              <>
                {" "}
                · <span className="text-amber-700 dark:text-amber-200">CET não lido pelo OCR</span> — convém
                reprocessar ou conferir o PDF (a comparação com o CET fica incompleta).
              </>
            )}
          </p>
          <p className="text-[9px] text-muted-foreground leading-snug">
            Valide sempre no simulador oficial:{" "}
            <a
              href={URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-700 dark:text-sky-300 underline font-medium"
            >
              Financiamento com prestações fixas (BCB)
            </a>
            .
          </p>
        </div>
      ) : null}

      {extraido && (perfilTitular?.cpf || perfilTitular?.nome || alertasTitular.length > 0) ? (
        <div
          className={`rounded-md border p-2 space-y-1.5 ${
            alertasTitular.some((x) => x.severidade === "critico")
              ? "border-destructive/60 bg-destructive/10"
              : "border-sky-500/45 bg-sky-500/[0.07]"
          }`}
        >
          <p className="text-[11px] font-semibold text-foreground">Titular da conta vs consumidor do contrato</p>
          {perfilTitular?.cpf || perfilTitular?.nome ? (
            <p className="text-[9px] text-muted-foreground leading-snug">
              Referência: {perfilTitular.nome ? `${perfilTitular.nome} · ` : ""}
              {perfilTitular.cpf ?? "—"}
              {perfilTitular.fontes.length > 0 ? ` (${perfilTitular.fontes.slice(0, 2).join("; ")})` : ""}
            </p>
          ) : (
            <p className="text-[9px] text-muted-foreground leading-snug">
              Defina <code className="text-[9px]">NEXT_PUBLIC_USER_CPF_DIGITS_FOR_PDF</code> e importe contracheque para
              detectar contrato de terceiros.
            </p>
          )}
          {alertasTitular.length > 0 ? (
            <ul className="space-y-1 text-[10px] text-foreground/90 list-disc pl-4">
              {alertasTitular.map((al) => (
                <li key={`tit-${al.codigo}`}>
                  <span className={al.severidade === "critico" ? "font-medium text-destructive" : ""}>
                    {al.severidade === "critico" ? "Crítico: " : ""}
                  </span>
                  {al.mensagem}
                </li>
              ))}
            </ul>
          ) : perfilTitular?.cpfDigitos ? (
            <p className="text-[10px] text-emerald-800 dark:text-emerald-200">
              Sem alerta de titularidade com os dados atuais (ainda confira sec. A no PDF).
            </p>
          ) : null}
        </div>
      ) : null}

      {extraido && (extraido.datasExtraidas?.length || alertasDatas.length > 0) ? (
        <div className="rounded-md border border-indigo-500/40 bg-indigo-500/[0.06] p-2 space-y-1.5">
          <p className="text-[11px] font-semibold text-foreground">Datas (convergência automática)</p>
          <p className="text-[10px] text-foreground/90 leading-snug">
            {extraido.dataDocumento ? (
              <>
                Documento: <strong>{formatIsoPt(extraido.dataDocumento)}</strong>
                {" · "}
              </>
            ) : null}
            Assinatura: <strong>{formatIsoPt(extraido.dataAssinatura)}</strong>
            {" · "}
            1º venc.: <strong>{formatIsoPt(extraido.primeiroVencimento)}</strong>
            {" · "}
            Último: <strong>{formatIsoPt(extraido.ultimoVencimento)}</strong>
          </p>
          {alertasDatas.map((al) => (
            <p
              key={`dt-${al.codigo}`}
              className={`text-[10px] leading-snug ${al.severidade === "critico" ? "text-destructive font-medium" : "text-muted-foreground"}`}
            >
              {al.mensagem}
            </p>
          ))}
          {extraido.datasExtraidas && extraido.datasExtraidas.length > 0 ? (
            <details className="text-[9px] text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground/80">
                {extraido.datasExtraidas.length} data(s) lidas no OCR
              </summary>
              <ul className="mt-1 list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">
                {extraido.datasExtraidas.map((d, i) => (
                  <li key={`${d.data}-${d.papel}-${i}`}>
                    {formatIsoPt(d.data)} — {d.papel.replace(/_/g, " ")} ({d.confianca}%)
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {extraido && alertasSeguroVenda.length > 0 ? (
        <div
          className={`rounded-md border p-2 space-y-1.5 ${
            temAlertaSeguroCritico
              ? "border-violet-500/60 bg-violet-500/10"
              : "border-violet-500/45 bg-violet-500/[0.07]"
          }`}
        >
          <p className="text-[11px] font-semibold text-foreground">Seguro prestamista / possível venda casada</p>
          <p className="text-[9px] text-muted-foreground leading-snug">
            Alerta heurístico (CDC, art. 39): financiar seguro sem opt-in destacado pode ser abusivo. Confira sec. C e o
            PDF assinado — não é parecer jurídico.
          </p>
          <ul className="space-y-1 text-[10px] text-foreground/90 list-disc pl-4">
            {alertasSeguroVenda.map((al) => (
              <li key={`seg-${al.codigo}`}>
                <span className={al.severidade === "critico" ? "font-medium text-destructive" : ""}>
                  {al.severidade === "critico" ? "Atenção: " : ""}
                </span>
                {al.mensagem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {extraido && alertasOutros.length > 0 ? (
        <div
          className={`rounded-md border p-2 space-y-1.5 ${
            alertasOutros.some((x) => x.severidade === "critico")
              ? "border-destructive/60 bg-destructive/10"
              : "border-amber-500/50 bg-amber-500/5"
          }`}
        >
          <p className="text-[11px] font-semibold text-foreground">
            {alertasOutros.some((x) => x.severidade === "critico")
              ? "Incoerências detectadas (revisar PDF)"
              : "Avisos de plausibilidade"}
          </p>
          <ul className="space-y-1 text-[10px] text-foreground/90 list-disc pl-4">
            {alertasOutros.map((al) => (
              <li key={`${al.codigo}-${al.mensagem.slice(0, 24)}`}>
                <span className={al.severidade === "critico" ? "font-medium text-destructive" : ""}>
                  {al.severidade === "critico" ? "Erro provável: " : ""}
                </span>
                {al.mensagem}
              </li>
            ))}
          </ul>
          <p className="text-[9px] text-muted-foreground leading-snug">
            Inclui, quando há valor financiado, parcela e prazo, confronto com a metodologia «Financiamento com prestações
            fixas» da Calculadora do Cidadão (BCB — juros compostos mensais). O site do BC pode usar arredondamentos ou
            campos adicionais; isto não substitui o simulador oficial para o seu caso concreto.
          </p>
        </div>
      ) : null}

      {extraido ? (
        <>
          {temLeitura ? (
            <div
              className={`rounded-md border p-2 space-y-2 ${
                conferenciaPendente
                  ? "border-amber-500/50 bg-amber-500/5"
                  : "border-emerald-500/35 bg-emerald-500/5"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-foreground">Conferência necessária</p>
                {conferenciaDecisao ? badgeDecisao(conferenciaDecisao) : null}
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                O sistema não grava o vínculo sozinho. Confirme os dados abaixo e escolha uma ação antes de clicar em
                Guardar.
                {baixaConfiancaGlobal ? (
                  <span className="block mt-1 text-amber-700 dark:text-amber-200 font-medium">
                    Score inferior a 70: confira com especial atenção; a sugestão não é considerada segura.
                  </span>
                ) : (
                  <span className="block mt-1">
                    Mesmo com score ≥ 70, a confirmação visual é obrigatória antes de guardar.
                  </span>
                )}
                {temAlertaCritico ? (
                  <span className="block mt-1 text-destructive font-medium">
                    Foram detectadas incoerências fortes (ex.: valores vs crédito ou CET) — não confirme sem comparar com o
                    PDF e, se quiser, com o simulador do Banco Central.
                  </span>
                ) : null}
                {bloqueioConfirmacao && sintese ? (
                  <span className="block mt-1 text-destructive font-medium">
                    {sintese.bloqueiosConfirmacao[0] ??
                      "Há pendências na síntese de confiabilidade — resolva antes de confirmar."}
                  </span>
                ) : null}
                {syncCadastroAoGuardar && cruzamentoLoan?.podeConfirmar ? (
                  <span className="block mt-1 text-emerald-800 dark:text-emerald-200">
                    Ao guardar, o cadastro do empréstimo será alinhado à parcela, prazo e banco confirmados neste documento.
                  </span>
                ) : null}
              </p>

              {uploadStandalone && (cruzamentoLoan || sugestoesLoan.length > 0) ? (
                <div
                  className={`rounded-md border p-2 space-y-1.5 ${
                    cruzamentoLoan?.podeConfirmar
                      ? "border-emerald-500/45 bg-emerald-500/5"
                      : cruzamentoLoan
                        ? "border-destructive/50 bg-destructive/5"
                        : "border-border/70 bg-background/40"
                  }`}
                >
                  <p className="text-[11px] font-semibold text-foreground">Cruzamento com cadastro (parcelas)</p>
                  {cruzamentoLoan ? (
                    <>
                      <p className="text-[10px] text-foreground/90">
                        <span className="font-mono">{cruzamentoLoan.score}/100</span> —{" "}
                        {cruzamentoLoan.loan.institution_name || cruzamentoLoan.loan.description} · cadastro{" "}
                        {formatBRL(cruzamentoLoan.loan.installment_amount)} × {cruzamentoLoan.loan.total_installments}
                        {cruzamentoLoan.parcelaOk ? (
                          <span className="text-emerald-700 dark:text-emerald-300"> · parcela OK</span>
                        ) : (
                          <span className="text-destructive"> · parcela diferente do documento</span>
                        )}
                        {extraido?.parcela != null ? (
                          <span>
                            {" "}
                            · documento {formatBRL(extraido.parcela)}
                            {extraido.parcelas != null ? ` × ${Math.round(extraido.parcelas)}` : ""}
                          </span>
                        ) : null}
                      </p>
                      {cruzamentoLoan.divergencias.length > 0 ? (
                        <ul className="text-[10px] list-disc pl-4 space-y-0.5">
                          {cruzamentoLoan.divergencias.map((d) => (
                            <li
                              key={d.campo}
                              className={
                                d.severidade === "critico" ? "text-destructive" : "text-amber-900 dark:text-amber-100"
                              }
                            >
                              {d.label}: {d.valorExtraido} vs cadastro {d.valorCadastro}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                  {sugestoesLoan.length > 0 && onSelecionarLoanSugerido
                    ? sugestoesLoan.slice(0, 3).map((s) => (
                        <Button
                          key={s.loanId}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 text-[9px] mr-1 mt-1"
                          onClick={() => onSelecionarLoanSugerido(s.loanId)}
                        >
                          {s.score}/100 — {s.resumo.slice(0, 36)}
                        </Button>
                      ))
                    : null}
                </div>
              ) : null}

              {uploadStandalone ? (
                <p className="text-[9px] text-muted-foreground leading-snug rounded border border-border/50 bg-background/30 px-2 py-1.5">
                  <span className="font-medium text-foreground">Datas e titular: </span>
                  o sistema lê todas as datas do OCR, infere contratação/assinatura e 1º vencimento, e compara o consumidor
                  (sec. A) com o titular logado. Atendente no rodapé não é o mutuário — confira sempre o PDF.
                </p>
              ) : null}

              <div>
                <ConferenciaContratoExtraidoGrid
                  extraido={extraido}
                  camposAusentes={camposAusentes}
                  cpfTitularDigitos={
                    (perfilTitular?.cpfDigitos ?? perfilTitular?.cpf?.replace(/\D/g, "")) || null
                  }
                  nomeTitularReferencia={perfilTitular?.nome ?? null}
                  uploadStandalone={uploadStandalone}
                  corrigirDatasManual={corrigirDatasManual}
                  onToggleCorrigirDatas={() => setCorrigirDatasManual((v) => !v)}
                  onCampoChange={onCampoConferenciaChange}
                  destaqueCampo={destaqueCampo}
                  cetDetalhe={
                    resumoBcb ? (
                      <a
                        href={URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-1 text-[9px] text-sky-700 dark:text-sky-300 underline"
                      >
                        Simulador BCB — prestações fixas
                      </a>
                    ) : null
                  }
                />
                {extraido && extraido.parcela != null && extraido.parcelas != null ? (
                  <div className="mt-3">
                    <CronogramaContratoExtraidoBlock
                      extraido={extraido}
                      parcelasPagas={parcelasPagasCadastro}
                    />
                  </div>
                ) : null}
              </div>

              {!uploadStandalone ? (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Contrato inferido sugerido</p>
                {top ? (
                  <p className="text-[10px] text-foreground/90 rounded border border-border/60 bg-background/50 p-1.5">
                    <span className="font-mono text-muted-foreground">{top.score}/100</span> — {top.resumoContrato}
                    <br />
                    <span className="text-muted-foreground text-[9px]">{top.motivos.join("; ") || "—"}</span>
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground">Nenhuma sugestão automática neste contexto.</p>
                )}
              </div>
              ) : null}

              <div className="flex flex-wrap gap-1.5 pt-1">
                {uploadStandalone && contratosAlvo.length === 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={conferenciaDecisao ? "outline" : "default"}
                    className={`h-7 text-[10px] ${
                      !conferenciaDecisao && !leituraBusy
                        ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
                        : ""
                    }`}
                    disabled={leituraBusy || !onConfirmarExtracaoStandalone || bloqueioConfirmacao}
                    onClick={() => onConfirmarExtracaoStandalone?.()}
                  >
                    {conferenciaDecisao ? "Dados confirmados" : "Confirmo os dados extraídos"}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-[10px]"
                      disabled={!top || leituraBusy}
                      onClick={onConfirmarVinculoSugerido}
                    >
                      Confirmar vínculo sugerido
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={onAbrirVinculoManual}>
                      Alterar contrato vinculado
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={onSalvarSemVinculo}>
                      Salvar sem vínculo
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 text-[10px]"
                  disabled={reprocessarOcrDisabled}
                  onClick={onReprocessarOcr}
                >
                  Reprocessar OCR
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" onClick={onIgnorarLeitura}>
                  Ignorar leitura automática
                </Button>
              </div>

              {mostrarSeletorManual ? (
                <div className="rounded border border-border/70 bg-background/40 p-2 space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground">Vínculo manual</p>
                  <select
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                    value={targetIdx}
                    onChange={(e) => onTargetIdxChange(Number(e.target.value))}
                  >
                    {contratosAlvo.map((c, i) => (
                      <option key={fingerprintContratoInferido(c)} value={i}>
                        {opcaoContrato(c, i)}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" variant="default" className="h-7 text-[10px]" onClick={onAplicarVinculoManual}>
                    Usar este contrato vinculado
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {notaSomatórioParcelas ? (
            <div className="rounded-md border border-violet-500/35 bg-violet-500/5 p-2 text-[10px] text-foreground/90 leading-snug">
              <span className="font-semibold text-foreground">Sobre o valor total pago: </span>
              {formatBRL(notaSomatórioParcelas.tot)} fecha com parcela × quantidade (
              {formatBRL(notaSomatórioParcelas.soma)}). É o somatório nominal (juros incluídos), não o principal (
              {formatBRL(notaSomatórioParcelas.principal)}); não indica por si só erro de OCR nem «valor 3× o empréstimo».
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Todos os dados extraídos</p>
            <ul className="grid gap-1 sm:grid-cols-2 text-[10px]">
              {chavesMostrar.map((k) => (
                <li key={k} className="flex gap-1">
                  <span className="text-muted-foreground shrink-0">{LABEL_CAMPO[k] ?? k}:</span>
                  <span className={`font-medium text-foreground break-all ${destaqueCampo(k)}`}>
                    {formatCampo(k, extraido[k])}
                  </span>
                </li>
              ))}
              {chavesMostrar.length === 0 ? (
                <li className="text-muted-foreground">Nenhum campo estruturado adicional.</li>
              ) : null}
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Campos não encontrados (triagem)</p>
            {camposAusentes.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">Nenhum na lista — ainda pode haver erros de OCR.</p>
            ) : (
              <p className="text-[10px] text-foreground/90">{camposAusentes.map((k) => LABEL_CAMPO[k] ?? k).join(", ")}</p>
            )}
          </div>

          {sugestoes.length > 1 ? (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Outras sugestões</p>
              <ol className="list-decimal pl-4 space-y-1 text-[10px]">
                {sugestoes.slice(1).map((s) => (
                  <li key={s.fingerprint}>
                    <span className="font-mono text-[9px] text-muted-foreground">{s.score}/100</span> — {s.resumoContrato}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <p className="text-[9px] text-muted-foreground leading-snug">
            O ficheiro original, o OCR bruto e o JSON extraído são guardados para auditoria (após aplicar os patches SQL).
            Isto não altera rubricas nem contracheques.
          </p>
        </>
      ) : (
        <p className="text-[10px] text-muted-foreground">Selecione um ficheiro para executar OCR e extração.</p>
      )}
    </div>
  );
}
