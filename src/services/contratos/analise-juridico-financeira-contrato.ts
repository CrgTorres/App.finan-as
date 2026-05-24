import type { Loan } from "@/types/contracheque";
import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { RendaReferenciaUsuario } from "@/lib/contratos/renda-referencia-usuario";
import {
  cruzarContratoRendaLiquida,
  limiarComprometimentoRenda,
} from "@/services/contratos/cruzar-contrato-renda-liquida";
import { auditarConfiabilidadeContrato } from "@/services/contratos/auditar-confiabilidade-contrato";
import { termoPrioritarioNaRubrica } from "@/lib/contracheque/detectar-cartao-saque-em-rubricas-contracheque";
import {
  ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE,
  TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE,
} from "@/types/cartao-saque-embutido";
import {
  AVISO_ANALISE_JURIDICA_FINANCEIRA,
  type AlertaAnaliseJuridicaFinanceira,
  type AnaliseJuridicoFinanceiraContrato,
  type ClassificacaoRiscoMargem,
  type IndicadoresAnaliseJuridicaFinanceira,
  type RecomendacaoPraticaAnalise,
  type StatusAnaliseJuridicaFinanceira,
  type TipoProdutoCreditoInferido,
} from "@/types/analise-juridico-financeira-contrato";

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

const CAMPOS_ESSENCIAIS: { chave: keyof ContratoExtraido; rotulo: string }[] = [
  { chave: "banco", rotulo: "Banco" },
  { chave: "parcela", rotulo: "Parcela" },
  { chave: "parcelas", rotulo: "Prazo" },
  { chave: "valorFinanciado", rotulo: "Valor financiado/liberado" },
  { chave: "cetAnual", rotulo: "CET anual" },
];

function inferirTipoProduto(e: ContratoExtraido, texto?: string): TipoProdutoCreditoInferido {
  const t = `${e.tipoContrato ?? ""} ${texto ?? e.textoExtraido ?? ""}`.toLowerCase();
  if (e.portabilidade) return "portabilidade";
  if (e.refinanciamento) return "refinanciamento";
  if (/ve[ií]culo|autom[oó]vel|cdc\s+ve[ií]culo|aquisi[cç][aã]o\s+de\s+bem/i.test(t)) return "veiculo";
  if (/im[oó]vel|imobili[aá]rio|sfh|sfi|habitacional|financiamento\s+imob/i.test(t)) return "imobiliario";
  if (/consignad|folha|desconto\s+em\s+folha|margem\s+consign/i.test(t)) return "consignado";
  if (/empr[eé]stimo|cr[eé]dito\s+pessoal|ccb|or[cç]amento\s+da\s+opera/i.test(t)) return "emprestimo_pessoal";
  return "indefinido";
}

function classificarMargem(pct: number | null): ClassificacaoRiscoMargem {
  if (pct == null) return "atencao";
  if (pct >= 50) return "critico";
  if (pct >= 35) return "alto";
  if (pct >= 30) return "atencao";
  return "baixo";
}

export type ContextoAnaliseJuridicaFinanceira = {
  loans: Loan[];
  renda: RendaReferenciaUsuario;
  loanIdVinculado?: string | null;
  /** Parcela já contada no loan vinculado — evita duplicar na soma. */
  usarParcelaDoContratoNaSoma?: boolean;
};

export function gerarAnaliseJuridicoFinanceiraContrato(
  extraido: ContratoExtraido,
  ctx: ContextoAnaliseJuridicaFinanceira,
): AnaliseJuridicoFinanceiraContrato {
  const alertas: AlertaAnaliseJuridicaFinanceira[] = [];
  const recomendacoes: RecomendacaoPraticaAnalise[] = [];
  const texto = extraido.textoExtraido ?? "";

  const parcela = extraido.parcela ?? null;
  const n = extraido.parcelas != null ? Math.round(extraido.parcelas) : null;
  const valorBase = Math.max(
    extraido.valorFinanciado ?? 0,
    extraido.valorSolicitado ?? 0,
    0,
  );
  const totalPagoEstimado =
    extraido.valorTotalPago != null && extraido.valorTotalPago > 0
      ? extraido.valorTotalPago
      : parcela != null && n != null && n > 0
        ? Math.round(parcela * n * 100) / 100
        : 0;

  const diferenca = totalPagoEstimado > 0 && valorBase > 0 ? totalPagoEstimado - valorBase : 0;
  const percentualAcrescimo =
    valorBase > 0 && totalPagoEstimado > 0
      ? Math.round((diferenca / valorBase) * 1000) / 10
      : null;

  const cruzamento = cruzarContratoRendaLiquida(extraido, {
    renda: ctx.renda,
    loans: ctx.loans,
    loanIdVinculado: ctx.loanIdVinculado,
    usarParcelaDoContratoNaSoma: ctx.usarParcelaDoContratoNaSoma,
  });
  alertas.push(...cruzamento.alertas);

  const renda = cruzamento.calculo?.renda_liquida_mensal ?? null;
  const somaParcelasAtivasMes = cruzamento.calculo?.soma_parcelas_ativas ?? 0;
  const parcelaIncluida = cruzamento.calculo?.parcela_este_contrato_incluida ?? 0;
  const pctRendaParcela = cruzamento.calculo?.percentual_somente_este_contrato ?? null;
  const pctRendaTotal = cruzamento.calculo?.percentual_renda_comprometida ?? null;
  const limiar =
    cruzamento.calculo?.limiar_atingido ??
    limiarComprometimentoRenda(pctRendaTotal ?? pctRendaParcela ?? 0);
  const classificacaoMargem = classificarMargem(pctRendaTotal ?? pctRendaParcela);

  const camposEssenciaisAusentes = CAMPOS_ESSENCIAIS.filter(({ chave }) => {
    const v = extraido[chave];
    return v === undefined || v === null || (typeof v === "string" && !v.trim());
  }).map((c) => c.rotulo);

  if (renda == null || renda <= 0) {
    recomendacoes.push({
      id: "importar_folha",
      prioridade: "alta",
      texto: "Importe o contracheque mais recente para o app estimar % da renda comprometida.",
    });
  }

  if (percentualAcrescimo != null && percentualAcrescimo >= 60) {
    alertas.push({
      codigo: "acrescimo_total_elevado",
      severidade: percentualAcrescimo >= 100 ? "alto" : "atencao",
      titulo: "Total pago muito superior ao liberado",
      mensagem: `Total nominal ${fmtBrl(totalPagoEstimado)} vs base ${fmtBrl(valorBase)} (+${fmtPct(percentualAcrescimo)}). Verifique CET, juros e encargos (CDC — transparência).`,
    });
  }

  if (extraido.cetAnual != null && extraido.cetAnual > 45) {
    alertas.push({
      codigo: "cet_muito_alto",
      severidade: "atencao",
      titulo: "CET anual elevado",
      mensagem: `CET anual ${extraido.cetAnual}% — compare com taxa média de mercado e simulador do Banco Central.`,
    });
  }

  if (extraido.refinanciamento) {
    alertas.push({
      codigo: "refinanciamento",
      severidade: "atencao",
      titulo: "Indício de refinanciamento",
      mensagem:
        "Documento indica refinanciamento. Localize contrato anterior, saldo quitado e se houve alongamento que aumenta custo total.",
    });
    recomendacoes.push({
      id: "buscar_contrato_anterior",
      prioridade: "alta",
      texto: "Anexe ou localize o contrato refinanciado e compare saldo devedor × novo total pago.",
    });
  }

  if (
    /quita[cç][aã]o\s+(de\s+)?saldo|liquida[cç][aã]o\s+(de\s+)?contrato\s+anterior|refinanciamento\s+de\s+d[ií]vida|substitui[cç][aã]o\s+de\s+contrato/i.test(
      texto,
    )
  ) {
    alertas.push({
      codigo: "quitar_contrato_anterior",
      severidade: "atencao",
      titulo: "Indício de quitação de contrato anterior",
      mensagem:
        "O texto sugere liquidação ou substituição de operação prévia. Compare saldo quitado, CET e se o novo total pago compensa o encadeamento.",
    });
    recomendacoes.push({
      id: "comparar_anterior",
      prioridade: "alta",
      texto: "Busque o contrato ou extrato da operação anterior antes de aceitar o novo encadeamento.",
    });
  }

  if (extraido.portabilidade) {
    alertas.push({
      codigo: "portabilidade",
      severidade: "info",
      titulo: "Portabilidade",
      mensagem: "Verifique se valores e prazos refletem portabilidade regulada (Res. CMN/Bacen) e não duplicidade de cadastro.",
    });
  }

  const sintese = extraido.sinteseConfiabilidade;
  const seguro = sintese?.seguro;
  if (seguro?.situacao === "premio_no_quadro") {
    alertas.push({
      codigo: "seguro_premio",
      severidade: "atencao",
      titulo: "Seguro/acessório com valor",
      mensagem: seguro.resumo,
    });
    recomendacoes.push({
      id: "revisar_seguro",
      prioridade: "media",
      texto: "Confira se o seguro foi opcional e se integra o CET; guarde prova de opt-in ou recusa.",
    });
  } else if (seguro?.situacao === "so_mencao_contratual") {
    alertas.push({
      codigo: "seguro_texto",
      severidade: "info",
      titulo: "Menção a seguro no texto",
      mensagem: "Sem prémio claro no quadro — não confundir cláusula padrão com contratação.",
    });
  }

  if ((extraido.seguro != null && extraido.seguro > 0) || (extraido.tarifas != null && extraido.tarifas > 0)) {
    const parts: string[] = [];
    if (extraido.seguro) parts.push(`seguro ${fmtBrl(extraido.seguro)}`);
    if (extraido.tarifas) parts.push(`tarifas ${fmtBrl(extraido.tarifas)}`);
    alertas.push({
      codigo: "acessorios_valor",
      severidade: "atencao",
      titulo: "Acessórios com valor em R$",
      mensagem: `${parts.join(", ")} — exigem destaque contratual (venda casada, CDC art. 39).`,
      baseLegal: "CDC art. 39",
    });
  }

  if (camposEssenciaisAusentes.length >= 3) {
    alertas.push({
      codigo: "campos_essenciais_ausentes",
      severidade: "atencao",
      titulo: "Dados essenciais incompletos",
      mensagem: `Não lidos ou ausentes: ${camposEssenciaisAusentes.join(", ")}. Reprocesse OCR ou confira o PDF antes de decisão jurídica.`,
    });
  }

  const contratoDadosOk =
    (extraido.parcela != null && extraido.parcela > 0) &&
    (extraido.parcelas != null && extraido.parcelas > 0) &&
    (extraido.valorFinanciado != null && extraido.valorFinanciado > 0) &&
    (extraido.cetAnual != null && extraido.cetAnual > 0);

  const termoCartaoContrato = termoPrioritarioNaRubrica(texto);
  if (termoCartaoContrato) {
    alertas.push({
      codigo: "cartao_saque_texto_contrato",
      severidade: termoCartaoContrato.riscoBase === "alto" ? "alto" : "atencao",
      titulo: TITULO_CARTAO_SAQUE_NO_CONTRACHEQUE,
      mensagem: `${ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE} Termo no contrato: «${termoCartaoContrato.termo}». Confira também o desconto na folha.`,
    });
  }

  const audit = auditarConfiabilidadeContrato(extraido);
  if (audit.bloqueiosConfirmacao.length > 0) {
    alertas.push({
      codigo: "bloqueio_confiabilidade",
      severidade: "critico",
      titulo: "Leitura não confiável para decisão",
      mensagem: audit.bloqueiosConfirmacao[0]!,
    });
  }

  const tipoProduto = inferirTipoProduto(extraido, texto);
  const banco = extraido.banco ?? "Instituição não lida";
  const resumoContrato = [
    tipoProduto !== "indefinido" ? tipoProduto.replace(/_/g, " ") : "Crédito",
    banco,
    parcela != null && n != null ? `${fmtBrl(parcela)} × ${n}` : null,
    valorBase > 0 ? `base ${fmtBrl(valorBase)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  let status: StatusAnaliseJuridicaFinanceira = "sem_alerta";

  const temCritico = alertas.some((a) => a.severidade === "critico");
  const temAlto = alertas.some((a) => a.severidade === "alto");

  if (
    temCritico ||
    camposEssenciaisAusentes.length >= 4 ||
    (pctRendaTotal != null && pctRendaTotal >= 50) ||
    audit.bloqueiosConfirmacao.length > 0
  ) {
    status = "revisao_juridica";
  } else if (
    temAlto ||
    (pctRendaTotal != null && pctRendaTotal >= 40) ||
    (percentualAcrescimo != null && percentualAcrescimo >= 80) ||
    extraido.refinanciamento ||
    (extraido.cetAnual != null && extraido.cetAnual > 40) ||
    (termoCartaoContrato?.riscoBase === "alto")
  ) {
    status = "alto_risco";
  } else if (
    alertas.length > 0 ||
    classificacaoMargem !== "baixo" ||
    camposEssenciaisAusentes.length > 0
  ) {
    status = "atencao";
  }

  if (status === "sem_alerta") {
    recomendacoes.push({
      id: "guardar",
      prioridade: "baixa",
      texto: "Indicadores dentro de faixa moderada — guarde o anexo e mantenha cadastro alinhado ao contracheque.",
    });
  }
  if (status === "atencao" || status === "alto_risco") {
    recomendacoes.push({
      id: "comparar_folha",
      prioridade: "alta",
      texto: "Compare descontos do contracheque com parcela e prazo deste contrato.",
    });
  }
  if (status === "revisao_juridica" || status === "alto_risco") {
    recomendacoes.push({
      id: "analise_juridica",
      prioridade: "alta",
      texto: "Marque para análise jurídica ou negociação (Procon, consumidor.gov, Bacen) com PDF e este diagnóstico.",
    });
  }

  const indicadores: IndicadoresAnaliseJuridicaFinanceira = {
    totalPagoEstimado,
    valorBaseLiberado: valorBase,
    diferencaTotalPagoVsBase: diferenca,
    percentualAcrescimoSobreBase: percentualAcrescimo,
    parcelaMensalContrato: parcela,
    rendaMensalReferencia: renda,
    fonteRenda: ctx.renda.fonte,
    somaParcelasAtivasMes,
    parcelaDesteContratoIncluida: parcelaIncluida,
    percentualRendaParcelaContrato: pctRendaParcela,
    percentualRendaTotalComprometida: pctRendaTotal,
    limiarMargemAtingido: limiar,
  };

  const { textoExtraido: _t, sinteseConfiabilidade: _s, alertasPlausibilidade: _a, datasExtraidas: _d, ...resumoEx } =
    extraido;

  return {
    versao: 1,
    geradaEm: new Date().toISOString(),
    status,
    classificacaoMargem,
    tipoProduto,
    resumoContrato,
    indicadores,
    alertas,
    recomendacoes,
    avisoLegal: AVISO_ANALISE_JURIDICA_FINANCEIRA,
    extraidoResumo: resumoEx,
    camposEssenciaisAusentes,
    cartaoSaqueEmbutido: null,
  };
}
