import type {
  AlertaContratoEmprestimo,
  AnaliseContratoEmprestimo,
  RiscoGeralContratoEmprestimo,
} from "@/types/analise-contrato-emprestimo";

const PESO_SEVERIDADE: Record<AlertaContratoEmprestimo["severidade"], number> = {
  critico: 4,
  alto: 3,
  atencao: 2,
  info: 1,
};

export type SinalRadarContrato = {
  ativo: boolean;
  rotulo: string;
  resumo: string;
  severidade: "ok" | "atencao" | "alto" | "critico";
};

export type ResumoRadarContrato = {
  alertasPrincipais: AlertaContratoEmprestimo[];
  liberadoVsTotal: {
    valorLiberado: number;
    totalPago: number;
    multiplicador: number;
    percentualAcrescimo: number;
  };
  margemComprometida: {
    percentual: number | null;
    rendaLiquida: number | null;
    rendaRestante: number | null;
    somaParcelas: number | null;
    fonteRenda: string | null;
  };
  seguroVendaCasada: SinalRadarContrato;
  refinanciamento: SinalRadarContrato;
  reducaoArtificialParcela: SinalRadarContrato;
  recomendacaoFinal: string;
};

function ordenarAlertasPrincipais(alertas: AlertaContratoEmprestimo[]): AlertaContratoEmprestimo[] {
  return [...alertas]
    .sort((a, b) => PESO_SEVERIDADE[b.severidade] - PESO_SEVERIDADE[a.severidade])
    .slice(0, 5);
}

function sinalDeCategorias(
  alertas: AlertaContratoEmprestimo[],
  categorias: AlertaContratoEmprestimo["categoria"][],
  rotulo: string,
  resumoComparacao?: string | null,
): SinalRadarContrato {
  const filtrados = alertas.filter((a) => categorias.includes(a.categoria));
  if (filtrados.length === 0 && !resumoComparacao) {
    return { ativo: false, rotulo, resumo: "Nenhum indício na triagem automática.", severidade: "ok" };
  }
  const pior = filtrados.reduce<AlertaContratoEmprestimo["severidade"] | null>((acc, a) => {
    if (!acc || PESO_SEVERIDADE[a.severidade] > PESO_SEVERIDADE[acc]) return a.severidade;
    return acc;
  }, null);
  const severidade: SinalRadarContrato["severidade"] =
    pior === "critico"
      ? "critico"
      : pior === "alto"
        ? "alto"
        : pior === "atencao"
          ? "atencao"
          : resumoComparacao
            ? "atencao"
            : "ok";
  const titulosUnicos = [...new Set(filtrados.map((a) => a.titulo.trim()).filter(Boolean))];
  const resumo =
    resumoComparacao ??
    (titulosUnicos.slice(0, 2).join(" · ") || "Indício identificado — conferir PDF.");
  return { ativo: true, rotulo, resumo, severidade };
}

function montarRecomendacaoFinal(analise: AnaliseContratoEmprestimo): string {
  const alta = analise.recomendacoes.find((r) => r.prioridade === "alta");
  if (alta) return alta.texto;
  const media = analise.recomendacoes.find((r) => r.prioridade === "media");
  if (media) return media.texto;

  const pendAlta = analise.pendencias_conferencia.find((p) => p.prioridade === "alta");
  if (pendAlta) return pendAlta.descricao;

  const mapa: Record<RiscoGeralContratoEmprestimo, string> = {
    baixo:
      "Triagem sem alertas relevantes — guarde o PDF, mantenha cadastro alinhado ao contracheque e monitore parcelas.",
    medio:
      "Há pontos de atenção — compare valores e descontos no holerite antes de confirmar o vínculo.",
    alto:
      "Risco elevado na triagem — priorize conferência campo a campo e documentação de encargos (CET, seguro, prazo).",
    revisao_juridica:
      "Recomenda-se revisão jurídica ou negociação (Procon, consumidor.gov, Bacen) com este PDF e o diagnóstico.",
  };
  return mapa[analise.risco_geral];
}

export function obterResumoRadarContrato(analise: AnaliseContratoEmprestimo): ResumoRadarContrato {
  const { calculos, alertas } = analise;
  const cruz = calculos.cruzamento_renda_liquida;

  const refinResumo = calculos.comparacao_refinanciamento
    ? `Refinanciamento (${calculos.comparacao_refinanciamento.banco}): ${calculos.comparacao_refinanciamento.sinais.slice(0, 2).join("; ")}`
    : null;

  const reducaoResumo = calculos.comparacao_contrato_anterior
    ? `Parcela ${calculos.comparacao_contrato_anterior.parcela_anterior.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} → ${calculos.comparacao_contrato_anterior.parcela_nova.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}; total maior`
    : null;

  return {
    alertasPrincipais: ordenarAlertasPrincipais(alertas),
    liberadoVsTotal: {
      valorLiberado: calculos.valor_liberado,
      totalPago: calculos.total_pago_estimado,
      multiplicador: calculos.multiplicador_divida,
      percentualAcrescimo: calculos.percentual_acrescimo,
    },
    margemComprometida: {
      percentual:
        cruz?.percentual_renda_comprometida ?? calculos.percentual_renda_comprometida,
      rendaLiquida: cruz?.renda_liquida_mensal ?? calculos.renda_liquida,
      rendaRestante: cruz?.renda_restante_apos_descontos ?? null,
      somaParcelas: cruz?.soma_parcelas_ativas ?? null,
      fonteRenda: cruz?.fonte_renda ?? null,
    },
    seguroVendaCasada: sinalDeCategorias(alertas, ["seguro_embutido", "venda_casada"], "Seguro / venda casada"),
    refinanciamento: sinalDeCategorias(
      alertas,
      ["refinanciamento_sucessivo"],
      "Refinanciamento",
      refinResumo,
    ),
    reducaoArtificialParcela: sinalDeCategorias(
      alertas,
      ["reducao_artificial_parcela"],
      "Redução artificial de parcela",
      reducaoResumo,
    ),
    recomendacaoFinal: montarRecomendacaoFinal(analise),
  };
}
