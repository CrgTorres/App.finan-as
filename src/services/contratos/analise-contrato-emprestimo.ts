/**
 * Consolida análises já existentes do contrato em um único JSON padronizado.
 * Não substitui `gerarAnaliseJuridicoFinanceiraContrato`, `validarPlausibilidadeContratoCredito`
 * nem `auditarConfiabilidadeContrato` — apenas agrega os resultados.
 */

import type { ContratoExtraido, AlertaPlausibilidadeContrato } from "@/types/contrato-extraido";
import type {
  AlertaAnaliseJuridicaFinanceira,
  AnaliseJuridicoFinanceiraContrato,
} from "@/types/analise-juridico-financeira-contrato";
import type {
  AlertaContratoEmprestimo,
  AnaliseContratoEmprestimo,
  CalculosAnaliseContratoEmprestimo,
  CategoriaAlertaContratoEmprestimo,
  DimensaoAnaliseContratoEmprestimo,
  PendenciaConferenciaContratoEmprestimo,
  PontoJuridicoContratoEmprestimo,
  RecomendacaoContratoEmprestimo,
  RiscoGeralContratoEmprestimo,
  SeveridadeAlertaContratoEmprestimo,
  SeveridadeDimensaoAnaliseContrato,
} from "@/types/analise-contrato-emprestimo";
import type { StatusAnaliseJuridicaFinanceira } from "@/types/analise-juridico-financeira-contrato";
import {
  gerarAnaliseJuridicoFinanceiraContrato,
  type ContextoAnaliseJuridicaFinanceira,
} from "@/services/contratos/analise-juridico-financeira-contrato";
import { auditarConfiabilidadeContrato } from "@/services/contratos/auditar-confiabilidade-contrato";
import { validarPlausibilidadeContratoCredito } from "@/services/contratos/validar-plausibilidade-contrato-credito";
import { checarFinanciamentoVsCalculadoraCidadao } from "@/services/contratos/bcb-calculadora-cidadao-financiamento";
import {
  compararCustoContratoReferenciaBacen,
  type ReferenciaTaxaInformadaUsuario,
} from "@/services/contratos/comparar-custo-contrato-referencia-bacen";
import {
  ALERTA_PARCELA_REDUZIDA_CUSTO_TOTAL,
  detectarParcelaReduzidaCustoTotalVsContratoAnterior,
  type ContratosAnterioresCandidatos,
} from "@/services/contratos/comparar-contrato-anterior-mesmo-banco";
import {
  ALERTA_REFINANCIAMENTO_SUCESSIVO,
  detectarRefinanciamentoSucessivo,
} from "@/services/contratos/detectar-refinanciamento-sucessivo";
import { calcularTrocoQuitacaoContrato } from "@/services/contratos/calcular-troco-quitacao-contrato";
import {
  cruzarContratoRendaLiquida,
  type ContextoCruzamentoRendaLiquida,
} from "@/services/contratos/cruzar-contrato-renda-liquida";
import {
  ALERTA_SEGURO_SERVICO_EMBUTIDO,
  ALERTA_VENDA_CASADA_SEM_RECUSA,
} from "@/services/contratos/termos-acessorios-embutidos-ocr";
import {
  gerarPendenciasCamposContratoObrigatorios,
  listarCamposObrigatoriosContratoAusentes,
} from "@/services/contratos/gerar-pendencias-campos-contrato";
import { listarCamposContratoExtraidoAusentes } from "@/services/contratos/pontuar-confianca-leitura";
import type {
  ComparacaoContratoAnteriorResumo,
  ComparacaoRefinanciamentoResumo,
  CalculoTrocoQuitacaoResumo,
  CruzamentoRendaLiquidaResumo,
  ComparacaoTaxaReferenciaContrato,
} from "@/types/analise-contrato-emprestimo";

const COD_JUROS_ABUSIVOS = new Set([
  "bcb_implicito_vs_juros_forte",
  "bcb_implicito_vs_juros",
  "juros_mensal_anual",
]);

const COD_CET_INCOMPATIVEL = new Set([
  "cet_mensal_anual",
  "bcb_implicito_vs_cet",
  "cet_muito_alto",
]);

const COD_SEGURO_EMBUTIDO = new Set([
  "seguro_servico_embutido_ocr",
  "seguro_valor_quadro",
  "seguro_restante_alto",
  "acessorios_financiados",
  "acessorios_financiados_residual",
  "seguro_premio",
  "seguro_prestamista_texto",
  "seguro_so_texto_sem_valor_financiado",
  "seguro_so_texto_sem_valor",
  "acessorios_valor",
]);

const COD_VENDA_CASADA = new Set([
  "venda_casada_sem_recusa_ocr",
  "indicio_venda_casada_seguro",
  "seguro_sem_clausula_opcional",
]);

const COD_REFINANCIAMENTO = new Set([
  "refinanciamento",
  "quitar_contrato_anterior",
  "refinanciamento_sucessivo_identificado",
  "refinanciamento_flag",
  "quitacao_dominante_troco_pequeno",
]);

const COD_REDUCAO_PARCELA = new Set([
  "bcb_prestacao_modelo_simples",
  "parcela_vezes_n_vs_total",
  "parcela_reduzida_custo_total_expressivo",
  "parcela_abaixo_modelo_taxa_declarada",
  "total_pago_acima_soma_parcelas",
]);

const COD_SUPERENDIVIDAMENTO = new Set(["margem_50"]);

const COD_MARGEM = new Set([
  "margem_30",
  "margem_35",
  "margem_40",
  "margem_50",
  "parcela_contrato_vs_renda",
  "sem_renda_contracheque",
  "sem_renda_cadastrada",
]);

const COD_TOTAL_PAGO = new Set(["acrescimo_total_elevado"]);

const COD_DADOS_ESSENCIAIS = new Set([
  "campos_essenciais_ausentes",
  "bloqueio_confiabilidade",
  "parcela_maior_que_credito",
]);

export type OpcoesAnaliseContratoEmprestimo = {
  textoBruto?: string;
  /** Se informado, gera também `analise_juridico_financeira` em `fontes` (margem, superendividamento, etc.). */
  contextoJuridico?: ContextoAnaliseJuridicaFinanceira;
  /** Reutiliza análise jurídica já calculada (evita recomputar). */
  analiseJuridicaExistente?: AnaliseJuridicoFinanceiraContrato | null;
  /** Taxa de referência (% a.m. ou a.a.) — média de mercado / BACEN informada pelo usuário. */
  taxaReferencia?: ReferenciaTaxaInformadaUsuario;
  /** Contratos/evidências anteriores para comparar parcela, prazo e total (mesmo banco). */
  contratosAnteriores?: ContratosAnterioresCandidatos;
  /** Renda líquida (contracheque) e empréstimos ativos — cruzamento sem gerar análise jurídica completa. */
  cruzamentoRenda?: ContextoCruzamentoRendaLiquida;
};

export type { ContextoCruzamentoRendaLiquida };

function resolverContextoCruzamentoRenda(
  opcoes?: OpcoesAnaliseContratoEmprestimo,
): ContextoCruzamentoRendaLiquida | null {
  if (opcoes?.cruzamentoRenda) return opcoes.cruzamentoRenda;
  if (opcoes?.contextoJuridico) {
    return {
      renda: opcoes.contextoJuridico.renda,
      loans: opcoes.contextoJuridico.loans,
      loanIdVinculado: opcoes.contextoJuridico.loanIdVinculado,
      usarParcelaDoContratoNaSoma: opcoes.contextoJuridico.usarParcelaDoContratoNaSoma,
    };
  }
  return null;
}

function mapCruzamentoResumo(
  calculo: NonNullable<ReturnType<typeof cruzarContratoRendaLiquida>["calculo"]>,
): CruzamentoRendaLiquidaResumo {
  return {
    renda_liquida_mensal: calculo.renda_liquida_mensal,
    fonte_renda: calculo.fonte_renda,
    soma_parcelas_ativas: calculo.soma_parcelas_ativas,
    parcela_este_contrato_incluida: calculo.parcela_este_contrato_incluida,
    percentual_renda_comprometida: calculo.percentual_renda_comprometida,
    percentual_somente_este_contrato: calculo.percentual_somente_este_contrato,
    renda_restante_apos_descontos: calculo.renda_restante_apos_descontos,
    limiar_atingido: calculo.limiar_atingido,
  };
}

function severidadeAlertaCruzamentoRenda(
  s: "info" | "atencao" | "alto" | "critico",
): SeveridadeAlertaContratoEmprestimo {
  return s;
}

function categoriaAlertaCruzamentoRenda(codigo: string): CategoriaAlertaContratoEmprestimo {
  if (codigo === "margem_50") return "superendividamento";
  if (COD_MARGEM.has(codigo)) return "margem_comprometida";
  return "outro";
}

export type { ContratosAnterioresCandidatos };

function severidadeDePlausibilidade(s: AlertaPlausibilidadeContrato["severidade"]): SeveridadeDimensaoAnaliseContrato {
  if (s === "critico") return "critico";
  return "atencao";
}

function severidadeDeJuridica(s: AlertaAnaliseJuridicaFinanceira["severidade"]): SeveridadeDimensaoAnaliseContrato {
  if (s === "critico") return "critico";
  if (s === "alto") return "alto";
  if (s === "atencao") return "atencao";
  return "info";
}

function maxSeveridade(
  atual: SeveridadeDimensaoAnaliseContrato,
  nova: SeveridadeDimensaoAnaliseContrato,
): SeveridadeDimensaoAnaliseContrato {
  const ord: SeveridadeDimensaoAnaliseContrato[] = ["nenhum", "info", "atencao", "alto", "critico"];
  return ord.indexOf(nova) > ord.indexOf(atual) ? nova : atual;
}

function dimensaoVazia(): DimensaoAnaliseContratoEmprestimo {
  return { ativo: false, severidade: "nenhum", resumo: null, codigos: [] };
}

function montarDimensao(
  codigos: string[],
  mensagens: string[],
  severidade: SeveridadeDimensaoAnaliseContrato,
): DimensaoAnaliseContratoEmprestimo {
  if (codigos.length === 0) return dimensaoVazia();
  const unicos = [...new Set(codigos)];
  const resumo = mensagens.filter(Boolean).slice(0, 2).join(" ") || null;
  return {
    ativo: true,
    severidade,
    resumo,
    codigos: unicos,
  };
}

function alertasPlausibilidadeEfetivos(
  extraido: ContratoExtraido,
  textoBruto?: string,
): AlertaPlausibilidadeContrato[] {
  const existentes = extraido.alertasPlausibilidade ?? [];
  if (existentes.length > 0) return existentes;
  return validarPlausibilidadeContratoCredito(extraido, textoBruto ?? extraido.textoExtraido);
}

function heuristicaJurosAbusivos(extraido: ContratoExtraido): {
  codigos: string[];
  mensagens: string[];
  severidade: SeveridadeDimensaoAnaliseContrato;
} {
  const codigos: string[] = [];
  const mensagens: string[] = [];
  let severidade: SeveridadeDimensaoAnaliseContrato = "nenhum";

  if (extraido.jurosAnual != null && extraido.jurosAnual > 80) {
    codigos.push("juros_anual_muito_alto");
    mensagens.push(`Juros anual declarado ${extraido.jurosAnual}% — acima de patamar usual de mercado (triagem).`);
    severidade = maxSeveridade(severidade, "alto");
  } else if (extraido.jurosMensal != null && extraido.jurosMensal > 6.5) {
    codigos.push("juros_mensal_muito_alto");
    mensagens.push(`Juros mensal declarado ${extraido.jurosMensal}% — conferir abusividade e CET (triagem).`);
    severidade = maxSeveridade(severidade, "atencao");
  }

  const q0 = extraido.valorFinanciado ?? extraido.valorSolicitado;
  if (q0 != null && extraido.parcela != null && extraido.parcelas != null) {
    const chk = checarFinanciamentoVsCalculadoraCidadao({
      valorFinanciado: q0,
      prestacao: extraido.parcela,
      numMeses: Math.round(extraido.parcelas),
      jurosMensalPct: extraido.jurosMensal,
    });
    if (chk?.diffDeclaradoPP != null && chk.diffDeclaradoPP > 1.5) {
      codigos.push("taxa_implicita_muito_acima_declarada");
      mensagens.push(
        `Taxa implícita (BCB) ~${chk.taxaImplicitaMensalPct.toFixed(2)}% a.m. vs juros declarados — indício de encargos ocultos ou juros efetivos maiores.`,
      );
      severidade = maxSeveridade(severidade, "alto");
    }
  }

  return { codigos, mensagens, severidade };
}

function heuristicaAlongamento(extraido: ContratoExtraido, texto: string): {
  codigos: string[];
  mensagens: string[];
  severidade: SeveridadeDimensaoAnaliseContrato;
} {
  const n = extraido.parcelas != null ? Math.round(extraido.parcelas) : null;
  if (n == null || n < 1) return { codigos: [], mensagens: [], severidade: "nenhum" };

  const codigos: string[] = [];
  const mensagens: string[] = [];
  let severidade: SeveridadeDimensaoAnaliseContrato = "nenhum";

  if (n >= 120) {
    codigos.push("prazo_muito_longo_120");
    mensagens.push(`Prazo de ${n} meses (10 anos) — alongamento relevante para revisar custo total.`);
    severidade = "alto";
  } else if (n >= 84) {
    codigos.push("prazo_longo_84");
    mensagens.push(`Prazo de ${n} meses — verifique se o alongamento compensa a parcela menor.`);
    severidade = "atencao";
  }

  if (/alongamento|prorroga[cç][aã]o|amplia[cç][aã]o\s+de\s+prazo|novo\s+prazo/i.test(texto)) {
    codigos.push("texto_alongamento");
    mensagens.push("Texto menciona alongamento ou prorrogação de prazo.");
    severidade = maxSeveridade(severidade, "atencao");
  }

  if (extraido.refinanciamento && n >= 60) {
    codigos.push("refin_com_prazo_longo");
    mensagens.push("Refinanciamento com prazo longo — risco de custo total maior no encadeamento.");
    severidade = maxSeveridade(severidade, "atencao");
  }

  return { codigos, mensagens, severidade };
}

function heuristicaReducaoParcela(extraido: ContratoExtraido): {
  codigos: string[];
  mensagens: string[];
  severidade: SeveridadeDimensaoAnaliseContrato;
} {
  const q0 = extraido.valorFinanciado ?? extraido.valorSolicitado;
  if (q0 == null || extraido.parcela == null || extraido.parcelas == null) {
    return { codigos: [], mensagens: [], severidade: "nenhum" };
  }

  const n = Math.round(extraido.parcelas);
  const chk = checarFinanciamentoVsCalculadoraCidadao({
    valorFinanciado: q0,
    prestacao: extraido.parcela,
    numMeses: n,
    jurosMensalPct: extraido.jurosMensal,
    cetMensalPct: extraido.cetMensal,
  });

  const codigos: string[] = [];
  const mensagens: string[] = [];
  let severidade: SeveridadeDimensaoAnaliseContrato = "nenhum";

  if (chk?.prestacaoEsperadaNaTaxaDeclarada != null && extraido.jurosMensal != null) {
    const esperada = chk.prestacaoEsperadaNaTaxaDeclarada;
    const diff = esperada - extraido.parcela;
    const tol = Math.max(5, extraido.parcela * 0.05);
    if (diff > tol) {
      codigos.push("parcela_abaixo_modelo_taxa_declarada");
      mensagens.push(
        `Parcela extraída menor que a prevista pelo modelo BCB à taxa declarada (esperada ~${esperada.toFixed(2)} vs ${extraido.parcela.toFixed(2)}) — pode indicar alongamento ou taxa efetiva maior.`,
      );
      severidade = "atencao";
    }
  }

  if (
    extraido.valorTotalPago != null &&
    extraido.parcela > 0 &&
    n > 0 &&
    extraido.valorTotalPago > extraido.parcela * n * 1.08
  ) {
    codigos.push("total_pago_acima_soma_parcelas");
    mensagens.push(
      "Valor total pago superior à soma nominal das parcelas — encargos embutidos ou leitura parcial.",
    );
    severidade = maxSeveridade(severidade, "atencao");
  }

  return { codigos, mensagens, severidade };
}

function aplicarAlertasPlausibilidade(
  dimensoes: Record<string, DimensaoAnaliseContratoEmprestimo>,
  alertas: AlertaPlausibilidadeContrato[],
) {
  const buckets: Record<string, { codigos: string[]; msgs: string[]; sev: SeveridadeDimensaoAnaliseContrato }> = {
    juros_abusivos: { codigos: [], msgs: [], sev: "nenhum" },
    cet_incompativel: { codigos: [], msgs: [], sev: "nenhum" },
    seguro_embutido: { codigos: [], msgs: [], sev: "nenhum" },
    venda_casada: { codigos: [], msgs: [], sev: "nenhum" },
    reducao_artificial_parcela: { codigos: [], msgs: [], sev: "nenhum" },
    contrato_sem_dados_essenciais: { codigos: [], msgs: [], sev: "nenhum" },
  };

  const mapCodigoDimensao: [Set<string>, keyof typeof buckets][] = [
    [COD_JUROS_ABUSIVOS, "juros_abusivos"],
    [COD_CET_INCOMPATIVEL, "cet_incompativel"],
    [COD_SEGURO_EMBUTIDO, "seguro_embutido"],
    [COD_VENDA_CASADA, "venda_casada"],
    [COD_REDUCAO_PARCELA, "reducao_artificial_parcela"],
    [COD_DADOS_ESSENCIAIS, "contrato_sem_dados_essenciais"],
  ];

  for (const al of alertas) {
    const sev = severidadeDePlausibilidade(al.severidade);
    for (const [set, key] of mapCodigoDimensao) {
      if (set.has(al.codigo)) {
        const b = buckets[key]!;
        b.codigos.push(al.codigo);
        b.msgs.push(al.mensagem);
        b.sev = maxSeveridade(b.sev, sev);
      }
    }
  }

  for (const [key, b] of Object.entries(buckets)) {
    if (b.codigos.length === 0) continue;
    const atual = dimensoes[key]!;
    dimensoes[key] = montarDimensao(
      [...atual.codigos, ...b.codigos],
      [...(atual.resumo ? [atual.resumo] : []), ...b.msgs],
      maxSeveridade(atual.severidade, b.sev),
    );
  }
}

function aplicarAlertasJuridicos(
  dimensoes: Record<string, DimensaoAnaliseContratoEmprestimo>,
  alertas: AlertaAnaliseJuridicaFinanceira[],
) {
  const mapCodigoDimensao: [Set<string>, string][] = [
    [COD_CET_INCOMPATIVEL, "cet_incompativel"],
    [COD_REFINANCIAMENTO, "refinanciamento_sucessivo"],
    [COD_SUPERENDIVIDAMENTO, "superendividamento"],
    [COD_MARGEM, "margem_comprometida"],
    [COD_TOTAL_PAGO, "total_pago_elevado"],
    [COD_DADOS_ESSENCIAIS, "contrato_sem_dados_essenciais"],
    [COD_SEGURO_EMBUTIDO, "seguro_embutido"],
  ];

  for (const al of alertas) {
    const sev = severidadeDeJuridica(al.severidade);
    for (const [set, key] of mapCodigoDimensao) {
      if (set.has(al.codigo)) {
        const atual = dimensoes[key] ?? dimensaoVazia();
        dimensoes[key] = montarDimensao(
          [...atual.codigos, al.codigo],
          [...(atual.resumo ? [atual.resumo] : []), al.mensagem],
          maxSeveridade(atual.severidade, sev),
        );
      }
    }
  }
}

function mesclarDimensao(
  base: DimensaoAnaliseContratoEmprestimo,
  extra: { codigos: string[]; mensagens: string[]; severidade: SeveridadeDimensaoAnaliseContrato },
): DimensaoAnaliseContratoEmprestimo {
  if (extra.codigos.length === 0) return base;
  return montarDimensao(
    [...base.codigos, ...extra.codigos],
    [...(base.resumo ? [base.resumo] : []), ...extra.mensagens],
    maxSeveridade(base.severidade, extra.severidade),
  );
}

const ROTULO_DIMENSAO: Record<CategoriaAlertaContratoEmprestimo, string> = {
  juros_acima_referencia_bacen: "Juros acima da referência BACEN",
  juros_abusivos: "Juros abusivos",
  cet_incompativel: "CET incompatível",
  seguro_embutido: "Seguro embutido",
  venda_casada: "Venda casada",
  refinanciamento_sucessivo: "Refinanciamento sucessivo",
  reducao_artificial_parcela: "Redução artificial de parcela",
  alongamento_excessivo_prazo: "Alongamento excessivo de prazo",
  superendividamento: "Superendividamento",
  margem_comprometida: "Margem comprometida",
  total_pago_elevado: "Total pago elevado",
  contrato_sem_dados_essenciais: "Contrato sem dados essenciais",
  outro: "Outro",
};

const CHAVES_DIMENSAO: CategoriaAlertaContratoEmprestimo[] = [
  "juros_abusivos",
  "cet_incompativel",
  "seguro_embutido",
  "venda_casada",
  "refinanciamento_sucessivo",
  "reducao_artificial_parcela",
  "alongamento_excessivo_prazo",
  "superendividamento",
  "margem_comprometida",
  "total_pago_elevado",
  "contrato_sem_dados_essenciais",
];

function severidadeDimensaoParaAlerta(s: SeveridadeDimensaoAnaliseContrato): SeveridadeAlertaContratoEmprestimo {
  if (s === "critico") return "critico";
  if (s === "alto") return "alto";
  if (s === "atencao") return "atencao";
  return "info";
}

function severidadeJuridicaParaAlerta(s: AlertaAnaliseJuridicaFinanceira["severidade"]): SeveridadeAlertaContratoEmprestimo {
  if (s === "critico") return "critico";
  if (s === "alto") return "alto";
  if (s === "atencao") return "atencao";
  return "info";
}

function inferirCategoriaAlerta(codigo: string): CategoriaAlertaContratoEmprestimo {
  if (codigo === "juros_acima_referencia_bacen") return "juros_acima_referencia_bacen";
  if (COD_JUROS_ABUSIVOS.has(codigo) || codigo.startsWith("juros_") || codigo.startsWith("taxa_implicita"))
    return "juros_abusivos";
  if (COD_CET_INCOMPATIVEL.has(codigo) || codigo.startsWith("cet_") || codigo.startsWith("bcb_implicito_vs_cet"))
    return "cet_incompativel";
  if (COD_SEGURO_EMBUTIDO.has(codigo) || codigo.startsWith("seguro")) return "seguro_embutido";
  if (COD_VENDA_CASADA.has(codigo)) return "venda_casada";
  if (COD_REFINANCIAMENTO.has(codigo) || codigo.includes("refin")) return "refinanciamento_sucessivo";
  if (COD_REDUCAO_PARCELA.has(codigo) || codigo.includes("parcela_")) return "reducao_artificial_parcela";
  if (codigo.startsWith("prazo_") || codigo.includes("alongamento")) return "alongamento_excessivo_prazo";
  if (COD_SUPERENDIVIDAMENTO.has(codigo) || codigo === "margem_50") return "superendividamento";
  if (COD_MARGEM.has(codigo)) return "margem_comprometida";
  if (COD_TOTAL_PAGO.has(codigo) || codigo.includes("acrescimo")) return "total_pago_elevado";
  if (COD_DADOS_ESSENCIAIS.has(codigo) || codigo.includes("campos_") || codigo.includes("bloqueio"))
    return "contrato_sem_dados_essenciais";
  return "outro";
}

function montarCalculos(
  extraido: ContratoExtraido,
  analiseJuridica: AnaliseJuridicoFinanceiraContrato | null,
  comparacaoTaxa: ComparacaoTaxaReferenciaContrato | null,
  comparacaoAnterior: ComparacaoContratoAnteriorResumo | null,
  comparacaoRefinanciamento: ComparacaoRefinanciamentoResumo | null,
  calculoTrocoQuitacao: CalculoTrocoQuitacaoResumo | null,
  cruzamentoRenda: CruzamentoRendaLiquidaResumo | null,
): CalculosAnaliseContratoEmprestimo {
  const valor_liberado = Math.max(extraido.valorFinanciado ?? 0, extraido.valorSolicitado ?? 0, 0);
  const valor_parcela = extraido.parcela ?? 0;
  const quantidade_parcelas =
    extraido.parcelas != null && extraido.parcelas > 0 ? Math.round(extraido.parcelas) : 0;

  const ind = analiseJuridica?.indicadores;
  const total_pago_estimado =
    ind?.totalPagoEstimado && ind.totalPagoEstimado > 0
      ? ind.totalPagoEstimado
      : extraido.valorTotalPago != null && extraido.valorTotalPago > 0
        ? extraido.valorTotalPago
        : valor_parcela > 0 && quantidade_parcelas > 0
          ? Math.round(valor_parcela * quantidade_parcelas * 100) / 100
          : 0;

  const diferenca_total =
    ind?.diferencaTotalPagoVsBase != null
      ? ind.diferencaTotalPagoVsBase
      : total_pago_estimado > 0 && valor_liberado > 0
        ? Math.round((total_pago_estimado - valor_liberado) * 100) / 100
        : 0;

  const multiplicador_divida =
    valor_liberado > 0 && total_pago_estimado > 0
      ? Math.round((total_pago_estimado / valor_liberado) * 100) / 100
      : 0;

  const percentual_acrescimo =
    ind?.percentualAcrescimoSobreBase != null
      ? ind.percentualAcrescimoSobreBase
      : valor_liberado > 0 && diferenca_total > 0
        ? Math.round((diferenca_total / valor_liberado) * 1000) / 10
        : 0;

  const renda_liquida =
    cruzamentoRenda?.renda_liquida_mensal ?? ind?.rendaMensalReferencia ?? null;
  const percentual_renda_comprometida =
    cruzamentoRenda?.percentual_renda_comprometida ??
    ind?.percentualRendaTotalComprometida ??
    ind?.percentualRendaParcelaContrato ??
    null;

  return {
    valor_liberado,
    valor_parcela,
    quantidade_parcelas,
    total_pago_estimado,
    diferenca_total,
    multiplicador_divida,
    percentual_acrescimo,
    renda_liquida,
    percentual_renda_comprometida,
    comparacao_taxa_referencia: comparacaoTaxa,
    comparacao_contrato_anterior: comparacaoAnterior,
    comparacao_refinanciamento: comparacaoRefinanciamento,
    calculo_troco_quitacao: calculoTrocoQuitacao,
    cruzamento_renda_liquida: cruzamentoRenda,
  };
}

function alertaDeComparacaoTaxaReferencia(
  comparacao: ComparacaoTaxaReferenciaContrato,
  alerta: NonNullable<ReturnType<typeof compararCustoContratoReferenciaBacen>["alerta"]>,
): AlertaContratoEmprestimo {
  return {
    codigo: alerta.codigo,
    severidade: alerta.severidade,
    titulo: alerta.titulo,
    mensagem: alerta.mensagem,
    categoria: "juros_acima_referencia_bacen",
    taxa_contrato: comparacao.taxa_contrato,
    taxa_referencia: comparacao.taxa_referencia,
    diferenca_percentual: comparacao.diferenca_percentual,
    classificacao: comparacao.classificacao,
  };
}

function alertasDeDimensoes(
  dimensoes: Record<string, DimensaoAnaliseContratoEmprestimo>,
): AlertaContratoEmprestimo[] {
  const out: AlertaContratoEmprestimo[] = [];
  for (const cat of CHAVES_DIMENSAO) {
    const d = dimensoes[cat];
    if (!d?.ativo) continue;
    for (const codigo of d.codigos) {
      out.push({
        codigo,
        severidade: severidadeDimensaoParaAlerta(d.severidade),
        titulo: ROTULO_DIMENSAO[cat],
        mensagem: d.resumo ?? ROTULO_DIMENSAO[cat],
        categoria: cat,
      });
    }
  }
  return out;
}

function tituloAlertaPlausibilidade(a: AlertaPlausibilidadeContrato): string {
  if (a.codigo === "seguro_servico_embutido_ocr") return ALERTA_SEGURO_SERVICO_EMBUTIDO;
  if (a.codigo === "venda_casada_sem_recusa_ocr") return ALERTA_VENDA_CASADA_SEM_RECUSA;
  if (a.codigo === "parcela_reduzida_custo_total_expressivo") return ALERTA_PARCELA_REDUZIDA_CUSTO_TOTAL;
  if (a.codigo === "refinanciamento_sucessivo_identificado") return ALERTA_REFINANCIAMENTO_SUCESSIVO;
  return inferirCategoriaAlerta(a.codigo).replace(/_/g, " ");
}

function alertasDePlausibilidade(alertas: AlertaPlausibilidadeContrato[]): AlertaContratoEmprestimo[] {
  return alertas.map((a) => ({
    codigo: a.codigo,
    severidade: a.severidade === "critico" ? "critico" : "atencao",
    titulo: tituloAlertaPlausibilidade(a),
    mensagem: a.mensagem,
    categoria: inferirCategoriaAlerta(a.codigo),
  }));
}

function alertasDeJuridico(alertas: AlertaAnaliseJuridicaFinanceira[]): AlertaContratoEmprestimo[] {
  return alertas.map((a) => ({
    codigo: a.codigo,
    severidade: severidadeJuridicaParaAlerta(a.severidade),
    titulo: a.titulo,
    mensagem: a.mensagem,
    categoria: inferirCategoriaAlerta(a.codigo),
    base_legal: a.baseLegal,
  }));
}

function deduplicarAlertas(alertas: AlertaContratoEmprestimo[]): AlertaContratoEmprestimo[] {
  const vistos = new Set<string>();
  return alertas.filter((a) => {
    const k = `${a.codigo}|${a.categoria}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

function pontosJuridicosDeAlertas(alertas: AlertaContratoEmprestimo[]): PontoJuridicoContratoEmprestimo[] {
  return alertas
    .filter((a) => a.severidade === "alto" || a.severidade === "critico" || a.base_legal)
    .map((a) => ({
      codigo: a.codigo,
      tema: a.titulo,
      descricao: a.mensagem,
      base_legal: a.base_legal,
    }));
}

function recomendacoesDeJuridico(
  analise: AnaliseJuridicoFinanceiraContrato | null,
): RecomendacaoContratoEmprestimo[] {
  if (!analise) return [];
  return analise.recomendacoes.map((r) => ({
    id: r.id,
    prioridade: r.prioridade,
    texto: r.texto,
  }));
}

function pendenciasDeConferencia(
  extraido: ContratoExtraido,
  auditoria: ReturnType<typeof auditarConfiabilidadeContrato>,
  camposAusentes: (keyof ContratoExtraido)[],
  essenciaisJuridico: string[],
  analiseJuridica: AnaliseJuridicoFinanceiraContrato | null,
): PendenciaConferenciaContratoEmprestimo[] {
  const out: PendenciaConferenciaContratoEmprestimo[] = [];

  out.push(...gerarPendenciasCamposContratoObrigatorios(extraido));

  for (const [i, bloqueio] of auditoria.bloqueiosConfirmacao.entries()) {
    out.push({
      id: `bloqueio_${i}`,
      tipo: "bloqueio_leitura",
      descricao: bloqueio,
      prioridade: "alta",
    });
  }

  for (const p of auditoria.pendencias) {
    out.push({
      id: `auditoria_${out.length}`,
      tipo: "auditoria",
      descricao: p,
      prioridade: "media",
    });
  }

  if (essenciaisJuridico.length > 0) {
    out.push({
      id: "campos_essenciais",
      tipo: "dados_essenciais",
      descricao: `Conferir no PDF: ${essenciaisJuridico.join(", ")}.`,
      prioridade: essenciaisJuridico.length >= 4 ? "alta" : "media",
    });
  }

  if (camposAusentes.length >= 6) {
    out.push({
      id: "ocr_incompleto",
      tipo: "leitura_ocr",
      descricao: `${camposAusentes.length} campos não extraídos do contrato — reforçar OCR ou revisão manual.`,
      prioridade: "media",
    });
  }

  if (analiseJuridica?.status === "revisao_juridica") {
    out.push({
      id: "revisao_juridica_sugerida",
      tipo: "revisao_juridica",
      descricao: "Triagem indica revisão jurídica ou negociação antes de decisão definitiva.",
      prioridade: "alta",
    });
  }

  if (!auditoria.podeConfirmar && auditoria.bloqueiosConfirmacao.length === 0) {
    out.push({
      id: "nao_confirmar",
      tipo: "confiabilidade",
      descricao: "Leitura ainda não atende critérios mínimos para confirmação automática.",
      prioridade: "media",
    });
  }

  return out;
}

function calcularScore(
  alertas: AlertaContratoEmprestimo[],
  analiseJuridica: AnaliseJuridicoFinanceiraContrato | null,
): number {
  const peso: Record<SeveridadeAlertaContratoEmprestimo, number> = {
    info: 3,
    atencao: 10,
    alto: 20,
    critico: 32,
  };
  let score = 0;
  const codigos = new Set<string>();
  for (const a of alertas) {
    if (codigos.has(a.codigo)) continue;
    codigos.add(a.codigo);
    score += peso[a.severidade];
  }
  if (analiseJuridica?.status === "revisao_juridica") score += 18;
  else if (analiseJuridica?.status === "alto_risco") score += 12;
  else if (analiseJuridica?.status === "atencao") score += 6;
  return Math.min(100, score);
}

function riscoGeralDeStatusJuridico(status: StatusAnaliseJuridicaFinanceira): RiscoGeralContratoEmprestimo {
  if (status === "revisao_juridica") return "revisao_juridica";
  if (status === "alto_risco") return "alto";
  if (status === "atencao") return "medio";
  return "baixo";
}

function resolverRiscoGeral(
  score: number,
  alertas: AlertaContratoEmprestimo[],
  analiseJuridica: AnaliseJuridicoFinanceiraContrato | null,
): RiscoGeralContratoEmprestimo {
  if (analiseJuridica) return riscoGeralDeStatusJuridico(analiseJuridica.status);
  if (alertas.some((a) => a.severidade === "critico") || score >= 70) return "revisao_juridica";
  if (alertas.some((a) => a.severidade === "alto") || score >= 42) return "alto";
  if (alertas.length > 0 || score >= 15) return "medio";
  return "baixo";
}

/**
 * Recebe dados extraídos do contrato e devolve análise padronizada em JSON único.
 * Análises legadas ficam preservadas em `fontes`.
 */
export function analisarContratoEmprestimo(
  extraido: ContratoExtraido,
  opcoes?: OpcoesAnaliseContratoEmprestimo,
): AnaliseContratoEmprestimo {
  const texto = opcoes?.textoBruto ?? extraido.textoExtraido ?? "";
  const alertasPlaus = alertasPlausibilidadeEfetivos(extraido, texto);
  const auditoria = extraido.sinteseConfiabilidade ?? auditarConfiabilidadeContrato(extraido);
  const camposAusentes = listarCamposContratoExtraidoAusentes(extraido);

  let analiseJuridica: AnaliseJuridicoFinanceiraContrato | null =
    opcoes?.analiseJuridicaExistente ?? null;
  if (!analiseJuridica && opcoes?.contextoJuridico) {
    analiseJuridica = gerarAnaliseJuridicoFinanceiraContrato(extraido, opcoes.contextoJuridico);
  }

  const dimensoes: Record<string, DimensaoAnaliseContratoEmprestimo> = {
    juros_abusivos: dimensaoVazia(),
    cet_incompativel: dimensaoVazia(),
    seguro_embutido: dimensaoVazia(),
    venda_casada: dimensaoVazia(),
    refinanciamento_sucessivo: dimensaoVazia(),
    reducao_artificial_parcela: dimensaoVazia(),
    alongamento_excessivo_prazo: dimensaoVazia(),
    superendividamento: dimensaoVazia(),
    margem_comprometida: dimensaoVazia(),
    total_pago_elevado: dimensaoVazia(),
    contrato_sem_dados_essenciais: dimensaoVazia(),
  };

  aplicarAlertasPlausibilidade(dimensoes, alertasPlaus);
  if (analiseJuridica) aplicarAlertasJuridicos(dimensoes, analiseJuridica.alertas);

  dimensoes.juros_abusivos = mesclarDimensao(dimensoes.juros_abusivos!, heuristicaJurosAbusivos(extraido));
  dimensoes.alongamento_excessivo_prazo = mesclarDimensao(
    dimensoes.alongamento_excessivo_prazo!,
    heuristicaAlongamento(extraido, texto),
  );
  dimensoes.reducao_artificial_parcela = mesclarDimensao(
    dimensoes.reducao_artificial_parcela!,
    heuristicaReducaoParcela(extraido),
  );

  const compAnterior = detectarParcelaReduzidaCustoTotalVsContratoAnterior(
    extraido,
    opcoes?.contratosAnteriores,
  );
  const comparacaoAnteriorResumo: ComparacaoContratoAnteriorResumo | null = compAnterior.comparacao;

  if (compAnterior.detectado && compAnterior.alerta) {
    dimensoes.reducao_artificial_parcela = mesclarDimensao(dimensoes.reducao_artificial_parcela!, {
      codigos: [compAnterior.alerta.codigo],
      mensagens: [compAnterior.alerta.mensagem],
      severidade: compAnterior.alerta.severidade === "alto" ? "alto" : "atencao",
    });
  }

  const compRefin = detectarRefinanciamentoSucessivo(
    extraido,
    opcoes?.contratosAnteriores,
    texto,
  );
  const comparacaoRefinResumo: ComparacaoRefinanciamentoResumo | null = compRefin.comparacao
    ? {
        ...compRefin.comparacao,
        sinais: compRefin.sinais,
      }
    : null;

  if (compRefin.detectado && compRefin.alerta) {
    dimensoes.refinanciamento_sucessivo = montarDimensao(
      [compRefin.alerta.codigo],
      [compRefin.alerta.mensagem],
      compRefin.alerta.severidade === "alto" ? "alto" : "atencao",
    );
  } else if (extraido.refinanciamento && !dimensoes.refinanciamento_sucessivo!.ativo) {
    dimensoes.refinanciamento_sucessivo = montarDimensao(
      ["refinanciamento_flag"],
      ["Campo refinanciamento marcado na extração."],
      "atencao",
    );
  }

  const trocoQuitacao = calcularTrocoQuitacaoContrato(extraido, texto);
  const calculoTrocoQuitacaoResumo: CalculoTrocoQuitacaoResumo | null = trocoQuitacao.calculo
    ? {
        valor_novo_contrato: trocoQuitacao.calculo.valor_novo_contrato,
        saldo_quitado: trocoQuitacao.calculo.saldo_quitado,
        troco_liberado: trocoQuitacao.calculo.troco_liberado,
        diferenca_equacao: trocoQuitacao.calculo.diferenca_equacao,
        equacao_fecha: trocoQuitacao.calculo.equacao_fecha,
        percentual_troco_sobre_novo: trocoQuitacao.calculo.percentual_troco_sobre_novo,
        percentual_quitacao_sobre_novo: trocoQuitacao.calculo.percentual_quitacao_sobre_novo,
      }
    : null;

  if (trocoQuitacao.alerta) {
    dimensoes.refinanciamento_sucessivo = mesclarDimensao(dimensoes.refinanciamento_sucessivo!, {
      codigos: [trocoQuitacao.alerta.codigo],
      mensagens: [trocoQuitacao.alerta.mensagem],
      severidade: trocoQuitacao.alerta.severidade === "alto" ? "alto" : "atencao",
    });
  }

  const ctxRenda = resolverContextoCruzamentoRenda(opcoes);
  let cruzamentoRendaResumo: CruzamentoRendaLiquidaResumo | null = null;
  const alertasCruzamentoRenda: AlertaContratoEmprestimo[] = [];

  if (ctxRenda) {
    const cruzamentoRenda = cruzarContratoRendaLiquida(extraido, ctxRenda);
    if (cruzamentoRenda.calculo) {
      cruzamentoRendaResumo = mapCruzamentoResumo(cruzamentoRenda.calculo);
    }
    if (!analiseJuridica) {
      for (const al of cruzamentoRenda.alertas) {
        alertasCruzamentoRenda.push({
          codigo: al.codigo,
          severidade: severidadeAlertaCruzamentoRenda(al.severidade),
          titulo: al.titulo,
          mensagem: al.mensagem,
          categoria: categoriaAlertaCruzamentoRenda(al.codigo),
          base_legal: al.baseLegal,
        });
        const sevDim: SeveridadeDimensaoAnaliseContrato =
          al.severidade === "critico"
            ? "critico"
            : al.severidade === "alto"
              ? "alto"
              : al.severidade === "atencao"
                ? "atencao"
                : "info";
        if (al.codigo === "margem_50") {
          dimensoes.superendividamento = mesclarDimensao(dimensoes.superendividamento!, {
            codigos: [al.codigo],
            mensagens: [al.mensagem],
            severidade: sevDim,
          });
        } else if (COD_MARGEM.has(al.codigo)) {
          dimensoes.margem_comprometida = mesclarDimensao(dimensoes.margem_comprometida!, {
            codigos: [al.codigo],
            mensagens: [al.mensagem],
            severidade: sevDim,
          });
        }
      }
    }
  }

  const essenciaisJuridico = analiseJuridica?.camposEssenciaisAusentes ?? [];
  if (essenciaisJuridico.length >= 2 && !dimensoes.contrato_sem_dados_essenciais!.ativo) {
    dimensoes.contrato_sem_dados_essenciais = montarDimensao(
      ["campos_essenciais_juridico"],
      [`Campos essenciais ausentes: ${essenciaisJuridico.join(", ")}.`],
      essenciaisJuridico.length >= 4 ? "alto" : "atencao",
    );
  }

  if (auditoria.bloqueiosConfirmacao.length > 0) {
    const atual = dimensoes.contrato_sem_dados_essenciais!;
    dimensoes.contrato_sem_dados_essenciais = montarDimensao(
      [...atual.codigos, "bloqueio_auditoria"],
      [...(atual.resumo ? [atual.resumo] : []), auditoria.bloqueiosConfirmacao[0]!],
      maxSeveridade(atual.severidade, "critico"),
    );
  }

  if (camposAusentes.length >= 8 && !dimensoes.contrato_sem_dados_essenciais!.ativo) {
    dimensoes.contrato_sem_dados_essenciais = montarDimensao(
      ["muitos_campos_ausentes_ocr"],
      [`Leitura incompleta: ${camposAusentes.length} campos não extraídos.`],
      "atencao",
    );
  }

  const {
    textoExtraido: _t,
    sinteseConfiabilidade: _s,
    alertasPlausibilidade: _a,
    datasExtraidas: _d,
    ...extraidoResumo
  } = extraido;

  const comparacaoBcb = compararCustoContratoReferenciaBacen(extraido, opcoes?.taxaReferencia);
  const comparacaoTaxa: ComparacaoTaxaReferenciaContrato | null = comparacaoBcb.comparacao
    ? {
        taxa_contrato: comparacaoBcb.comparacao.taxa_contrato,
        taxa_referencia: comparacaoBcb.comparacao.taxa_referencia,
        diferenca_percentual: comparacaoBcb.comparacao.diferenca_percentual,
        classificacao: comparacaoBcb.comparacao.classificacao,
      }
    : null;

  const calculos = montarCalculos(
    extraido,
    analiseJuridica,
    comparacaoTaxa,
    comparacaoAnteriorResumo,
    comparacaoRefinResumo,
    calculoTrocoQuitacaoResumo,
    cruzamentoRendaResumo,
  );

  const alertasComparacaoTaxa: AlertaContratoEmprestimo[] = [];
  const alertasComparacaoAnterior: AlertaContratoEmprestimo[] = [];
  const alertasRefinanciamento: AlertaContratoEmprestimo[] = [];
  const alertasTrocoQuitacao: AlertaContratoEmprestimo[] = [];
  const alertasMargemRenda = alertasCruzamentoRenda;
  if (compRefin.detectado && compRefin.alerta) {
    alertasRefinanciamento.push({
      codigo: compRefin.alerta.codigo,
      severidade: compRefin.alerta.severidade,
      titulo: compRefin.alerta.titulo,
      mensagem: compRefin.alerta.mensagem,
      categoria: "refinanciamento_sucessivo",
    });
  }
  if (trocoQuitacao.alerta) {
    alertasTrocoQuitacao.push({
      codigo: trocoQuitacao.alerta.codigo,
      severidade: trocoQuitacao.alerta.severidade,
      titulo: trocoQuitacao.alerta.titulo,
      mensagem: trocoQuitacao.alerta.mensagem,
      categoria: "refinanciamento_sucessivo",
    });
  }
  if (compAnterior.detectado && compAnterior.alerta && compAnterior.comparacao) {
    alertasComparacaoAnterior.push({
      codigo: compAnterior.alerta.codigo,
      severidade: compAnterior.alerta.severidade,
      titulo: compAnterior.alerta.titulo,
      mensagem: compAnterior.alerta.mensagem,
      categoria: "reducao_artificial_parcela",
    });
  }
  if (comparacaoBcb.comparacao && comparacaoBcb.alerta) {
    alertasComparacaoTaxa.push(
      alertaDeComparacaoTaxaReferencia(comparacaoBcb.comparacao, comparacaoBcb.alerta),
    );
    if (comparacaoBcb.comparacao.classificacao !== "normal") {
      dimensoes.juros_abusivos = mesclarDimensao(dimensoes.juros_abusivos!, {
        codigos: [comparacaoBcb.alerta.codigo],
        mensagens: [comparacaoBcb.alerta.mensagem],
        severidade:
          comparacaoBcb.comparacao.classificacao === "alto_risco" ? "alto" : "atencao",
      });
    }
  }

  const alertas = deduplicarAlertas([
    ...alertasRefinanciamento,
    ...alertasTrocoQuitacao,
    ...alertasMargemRenda,
    ...alertasComparacaoAnterior,
    ...alertasComparacaoTaxa,
    ...alertasDePlausibilidade(alertasPlaus),
    ...alertasDeJuridico(analiseJuridica?.alertas ?? []),
    ...alertasDeDimensoes(dimensoes),
  ]);
  const score = calcularScore(alertas, analiseJuridica);
  const risco_geral = resolverRiscoGeral(score, alertas, analiseJuridica);

  return {
    versao: 2,
    geradaEm: new Date().toISOString(),
    risco_geral,
    score,
    alertas,
    calculos,
    pontos_juridicos: pontosJuridicosDeAlertas(alertas),
    recomendacoes: recomendacoesDeJuridico(analiseJuridica),
    pendencias_conferencia: pendenciasDeConferencia(
      extraido,
      auditoria,
      camposAusentes,
      essenciaisJuridico,
      analiseJuridica,
    ),
    fontes: {
      extraido_resumo: extraidoResumo,
      alertas_plausibilidade: alertasPlaus,
      analise_juridico_financeira: analiseJuridica,
      auditoria_confiabilidade: auditoria,
      campos_ausentes_leitura: camposAusentes,
      campos_obrigatorios_ausentes: listarCamposObrigatoriosContratoAusentes(extraido).map(
        (c) => c.rotulo,
      ),
    },
  };
}
