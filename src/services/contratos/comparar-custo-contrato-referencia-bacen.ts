/**
 * Compara custo efetivo do contrato (CET / taxa implícita BCB) com referência do usuário
 * ou com a taxa nominal declarada no quadro (metodologia Calculadora do Cidadão / BCB).
 */

import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { ClassificacaoComparacaoTaxaContrato } from "@/types/analise-contrato-emprestimo";
import {
  checarFinanciamentoVsCalculadoraCidadao,
  URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS,
} from "@/services/contratos/bcb-calculadora-cidadao-financiamento";

export const ALERTA_JUROS_ACIMA_REFERENCIA_BACEN =
  "Possível juros acima da média/referência BACEN.";

export type OrigemReferenciaTaxaContrato = "usuario" | "bacen_juros_declarado" | "bacen_juros_anual";

export type OrigemTaxaContratoComparacao =
  | "cet_mensal"
  | "cet_anual_convertido"
  | "taxa_implicita_calculadora_bcb"
  | "juros_mensal";

export type ReferenciaTaxaInformadaUsuario = {
  /** Taxa de referência (% a.m.) — ex.: média de mercado informada pelo usuário. */
  mensalPct?: number;
  /** Alternativa: taxa anual (% a.a.) convertida para mensal equivalente. */
  anualPct?: number;
  rotulo?: string;
};

export type ComparacaoTaxaContratoReferencia = {
  taxa_contrato: number;
  taxa_referencia: number;
  diferenca_percentual: number;
  classificacao: ClassificacaoComparacaoTaxaContrato;
  origem_taxa_contrato: OrigemTaxaContratoComparacao;
  origem_referencia: OrigemReferenciaTaxaContrato;
  rotulo_referencia: string;
};

export type ResultadoComparacaoCustoContratoReferencia = {
  aplicavel: boolean;
  comparacao: ComparacaoTaxaContratoReferencia | null;
  alerta: {
    codigo: "juros_acima_referencia_bacen";
    titulo: string;
    mensagem: string;
    severidade: "atencao" | "alto" | "critico";
  } | null;
};

function arredondar2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Converte taxa anual composta para equivalente mensal (% a.m.). */
export function taxaAnualParaMensalPct(anualPct: number): number {
  if (anualPct <= 0) return 0;
  return (Math.pow(1 + anualPct / 100, 1 / 12) - 1) * 100;
}

function cetAnualParaMensalPct(cetAnual: number): number {
  return taxaAnualParaMensalPct(cetAnual);
}

export function contratoTemDadosParaComparacaoTaxa(e: ContratoExtraido): boolean {
  const valorLiberado = Math.max(e.valorFinanciado ?? 0, e.valorSolicitado ?? 0);
  const temCet = (e.cetMensal != null && e.cetMensal > 0) || (e.cetAnual != null && e.cetAnual > 0);
  return (
    e.jurosMensal != null &&
    e.jurosMensal > 0 &&
    e.jurosAnual != null &&
    e.jurosAnual > 0 &&
    temCet &&
    valorLiberado > 0 &&
    e.parcela != null &&
    e.parcela > 0 &&
    e.parcelas != null &&
    e.parcelas > 0
  );
}

function resolverTaxaContrato(
  e: ContratoExtraido,
  valorLiberado: number,
): { taxa: number; origem: OrigemTaxaContratoComparacao } | null {
  if (e.cetMensal != null && e.cetMensal > 0) {
    return { taxa: e.cetMensal, origem: "cet_mensal" };
  }
  if (e.cetAnual != null && e.cetAnual > 0) {
    return { taxa: cetAnualParaMensalPct(e.cetAnual), origem: "cet_anual_convertido" };
  }

  const n = Math.round(e.parcelas!);
  const chk = checarFinanciamentoVsCalculadoraCidadao({
    valorFinanciado: valorLiberado,
    prestacao: e.parcela!,
    numMeses: n,
    jurosMensalPct: e.jurosMensal,
    cetMensalPct: e.cetMensal,
  });
  if (chk && chk.taxaImplicitaMensalPct > 0) {
    return { taxa: chk.taxaImplicitaMensalPct, origem: "taxa_implicita_calculadora_bcb" };
  }

  if (e.jurosMensal != null && e.jurosMensal > 0) {
    return { taxa: e.jurosMensal, origem: "juros_mensal" };
  }
  return null;
}

function resolverTaxaReferencia(
  e: ContratoExtraido,
  referenciaUsuario?: ReferenciaTaxaInformadaUsuario | null,
): { taxa: number; origem: OrigemReferenciaTaxaContrato; rotulo: string } | null {
  if (referenciaUsuario?.mensalPct != null && referenciaUsuario.mensalPct > 0) {
    return {
      taxa: referenciaUsuario.mensalPct,
      origem: "usuario",
      rotulo: referenciaUsuario.rotulo ?? "Referência informada pelo usuário",
    };
  }
  if (referenciaUsuario?.anualPct != null && referenciaUsuario.anualPct > 0) {
    return {
      taxa: taxaAnualParaMensalPct(referenciaUsuario.anualPct),
      origem: "usuario",
      rotulo: referenciaUsuario.rotulo ?? "Referência anual informada pelo usuário (convertida)",
    };
  }

  const envMensal = process.env.NEXT_PUBLIC_TAXA_REFERENCIA_EMPRESTIMO_MENSAL;
  if (envMensal) {
    const v = Number(String(envMensal).replace(",", "."));
    if (Number.isFinite(v) && v > 0) {
      return {
        taxa: v,
        origem: "usuario",
        rotulo: "Referência configurada (env)",
      };
    }
  }

  /** Referência BCB: taxa nominal mensal declarada no quadro do contrato. */
  if (e.jurosMensal != null && e.jurosMensal > 0) {
    return {
      taxa: e.jurosMensal,
      origem: "bacen_juros_declarado",
      rotulo: "Taxa nominal mensal declarada no contrato (quadro BCB)",
    };
  }

  if (e.jurosAnual != null && e.jurosAnual > 0) {
    return {
      taxa: taxaAnualParaMensalPct(e.jurosAnual),
      origem: "bacen_juros_anual",
      rotulo: "Taxa anual declarada convertida (quadro BCB)",
    };
  }

  return null;
}

export function classificarDiferencaTaxaReferencia(diferencaPercentual: number): ClassificacaoComparacaoTaxaContrato {
  if (diferencaPercentual <= 15) return "normal";
  if (diferencaPercentual <= 35) return "atencao";
  return "alto_risco";
}

function severidadeDeClassificacao(
  c: ClassificacaoComparacaoTaxaContrato,
): "atencao" | "alto" | "critico" | null {
  if (c === "normal") return null;
  if (c === "atencao") return "atencao";
  if (c === "alto_risco") return "alto";
  return null;
}

function fmtPct(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Compara taxa efetiva do contrato com referência do usuário ou com taxa declarada (BCB).
 * Exige: juros mensal/anual, CET, valor liberado, parcela e quantidade de parcelas.
 */
export function compararCustoContratoReferenciaBacen(
  extraido: ContratoExtraido,
  referenciaUsuario?: ReferenciaTaxaInformadaUsuario | null,
): ResultadoComparacaoCustoContratoReferencia {
  if (!contratoTemDadosParaComparacaoTaxa(extraido)) {
    return { aplicavel: false, comparacao: null, alerta: null };
  }

  const valorLiberado = Math.max(extraido.valorFinanciado ?? 0, extraido.valorSolicitado ?? 0);
  const taxaContratoRes = resolverTaxaContrato(extraido, valorLiberado);
  const taxaRefRes = resolverTaxaReferencia(extraido, referenciaUsuario);

  if (!taxaContratoRes || !taxaRefRes) {
    return { aplicavel: false, comparacao: null, alerta: null };
  }

  const taxa_contrato = arredondar2(taxaContratoRes.taxa);
  const taxa_referencia = arredondar2(taxaRefRes.taxa);

  const diferenca_percentual =
    taxa_referencia > 0
      ? arredondar2(((taxa_contrato - taxa_referencia) / taxa_referencia) * 100)
      : 0;

  const classificacao = classificarDiferencaTaxaReferencia(diferenca_percentual);

  const comparacao: ComparacaoTaxaContratoReferencia = {
    taxa_contrato,
    taxa_referencia,
    diferenca_percentual,
    classificacao,
    origem_taxa_contrato: taxaContratoRes.origem,
    origem_referencia: taxaRefRes.origem,
    rotulo_referencia: taxaRefRes.rotulo,
  };

  const sev = severidadeDeClassificacao(classificacao);
  if (!sev) {
    return { aplicavel: true, comparacao, alerta: null };
  }

  const origemContrato =
    taxaContratoRes.origem === "cet_mensal"
      ? "CET mensal"
      : taxaContratoRes.origem === "cet_anual_convertido"
        ? "CET anual (convertido)"
        : taxaContratoRes.origem === "taxa_implicita_calculadora_bcb"
          ? "taxa implícita (Calculadora do Cidadão)"
          : "juros mensal";

  return {
    aplicavel: true,
    comparacao,
    alerta: {
      codigo: "juros_acima_referencia_bacen",
      titulo: ALERTA_JUROS_ACIMA_REFERENCIA_BACEN,
      mensagem: `${ALERTA_JUROS_ACIMA_REFERENCIA_BACEN} Custo efetivo (${origemContrato}): ${fmtPct(taxa_contrato)}% a.m. vs referência (${taxaRefRes.rotulo}): ${fmtPct(taxa_referencia)}% a.m. (+${fmtPct(diferenca_percentual)}%). Valide no simulador: ${URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS}`,
      severidade: sev === "alto" ? "alto" : sev,
    },
  };
}
