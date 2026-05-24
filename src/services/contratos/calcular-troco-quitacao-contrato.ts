/**
 * Verifica valor_novo − saldo_quitado ≈ troco_liberado e alerta quando o troco é pequeno vs financiado.
 */

import type { ContratoExtraido } from "@/types/contrato-extraido";
import { primeiroValorRealNoTrecho } from "@/services/contratos/parse-valores-brasil";

export const ALERTA_MAIOR_PARTE_QUITACAO_DIVIDA =
  "Maior parte do novo contrato parece destinada à quitação de dívida anterior.";

/** Troco ≤ este % do valor novo → indício de quitação dominante. */
const PCT_TROCO_PEQUENO_PADRAO = 20;
/** Saldo quitado ≥ este % do valor novo reforça o alerta. */
const PCT_QUITACAO_ALTA_PADRAO = 55;

const RE_SALDO_QUITADO_LABEL =
  /saldo\s+devedor|saldo\s+a\s+quitar|valor\s+do\s+saldo\s+devedor|quita[cç][aã]o\s+(?:de\s+)?saldo|liquida[cç][aã]o\s+(?:de\s+)?(?:contrato|d[ií]vida|opera[cç][aã]o)\s+anterior/i;

const RE_TROCO_LABEL =
  /\btroco\b|valor\s+l[ií]quido\s+(?:liberado|creditado)|libera[cç][aã]o\s+ao\s+mutu[aá]rio|recursos\s+liberados\s+ao\s+cliente/i;

export type OrigemValorTrocoQuitacao = "ocr" | "quadro" | "inferido";

export type CalculoTrocoQuitacaoContrato = {
  valor_novo_contrato: number;
  saldo_quitado: number;
  troco_liberado: number;
  /** valor_novo − saldo_quitado − troco_liberado */
  diferenca_equacao: number;
  equacao_fecha: boolean;
  percentual_troco_sobre_novo: number;
  percentual_quitacao_sobre_novo: number;
  origem_saldo: OrigemValorTrocoQuitacao;
  origem_troco: OrigemValorTrocoQuitacao;
};

export type ResultadoCalculoTrocoQuitacaoContrato = {
  aplicavel: boolean;
  calculo: CalculoTrocoQuitacaoContrato | null;
  alerta: {
    codigo: "quitacao_dominante_troco_pequeno";
    titulo: string;
    mensagem: string;
    severidade: "atencao" | "alto";
  } | null;
};

function arredondar2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function valorAposRotulo(texto: string, re: RegExp, janela = 120): number | null {
  const m = re.exec(texto);
  if (!m || m.index == null) return null;
  const trecho = texto.slice(m.index, m.index + janela);
  const v = primeiroValorRealNoTrecho(trecho);
  return v != null && v > 0 ? v : null;
}

function encargosEmbutidosNoFinanciado(e: ContratoExtraido): number {
  return (e.iof ?? 0) + (e.seguro ?? 0) + (e.tarifas ?? 0);
}

function resolverValoresTrocoQuitacao(
  e: ContratoExtraido,
  texto: string,
): {
  valorNovo: number;
  saldo: number;
  troco: number;
  origemSaldo: OrigemValorTrocoQuitacao;
  origemTroco: OrigemValorTrocoQuitacao;
} | null {
  const valorNovo = e.valorFinanciado ?? 0;
  if (valorNovo <= 0) return null;

  let origemTroco: OrigemValorTrocoQuitacao = "inferido";
  let origemSaldo: OrigemValorTrocoQuitacao = "inferido";

  let troco = e.trocoLiberado ?? valorAposRotulo(texto, RE_TROCO_LABEL) ?? 0;
  if (e.trocoLiberado != null) origemTroco = "quadro";
  else if (troco > 0) origemTroco = "ocr";
  else if (e.valorSolicitado != null && e.valorSolicitado > 0) {
    troco = e.valorSolicitado;
    origemTroco = "quadro";
  }

  let saldo = e.saldoQuitado ?? valorAposRotulo(texto, RE_SALDO_QUITADO_LABEL) ?? 0;
  if (e.saldoQuitado != null) origemSaldo = "quadro";
  else if (saldo > 0) origemSaldo = "ocr";

  const encargos = encargosEmbutidosNoFinanciado(e);

  if (saldo <= 0 && troco > 0) {
    saldo = Math.max(0, valorNovo - troco - encargos);
    if (saldo <= 0) saldo = Math.max(0, valorNovo - troco);
    origemSaldo = "inferido";
  }

  if (troco <= 0 && saldo > 0) {
    troco = Math.max(0, valorNovo - saldo - encargos);
    if (troco <= 0) troco = Math.max(0, valorNovo - saldo);
    origemTroco = "inferido";
  }

  if (saldo <= 0 && troco <= 0 && e.valorSolicitado != null && e.valorSolicitado > 0) {
    troco = e.valorSolicitado;
    saldo = Math.max(0, valorNovo - troco - encargos);
    origemTroco = "quadro";
    origemSaldo = "inferido";
  }

  if (saldo <= 0 && troco <= 0) return null;

  return { valorNovo, saldo, troco, origemSaldo, origemTroco };
}

/**
 * Calcula valor_novo − saldo_quitado ≈ troco_liberado e avalia se o troco é pequeno.
 */
export function calcularTrocoQuitacaoContrato(
  extraido: ContratoExtraido,
  textoBruto?: string,
  opcoes?: { pctTrocoPequeno?: number; pctQuitacaoAlta?: number },
): ResultadoCalculoTrocoQuitacaoContrato {
  const texto = (textoBruto ?? extraido.textoExtraido ?? "").replace(/\s+/g, " ");
  const resolvido = resolverValoresTrocoQuitacao(extraido, texto);

  if (!resolvido) {
    return { aplicavel: false, calculo: null, alerta: null };
  }

  const { valorNovo, saldo, troco, origemSaldo, origemTroco } = resolvido;
  const diferenca = arredondar2(valorNovo - saldo - troco);
  const tol = Math.max(80, valorNovo * 0.025);
  const equacaoFecha = Math.abs(diferenca) <= tol;

  const pctTroco = valorNovo > 0 ? arredondar2((troco / valorNovo) * 100) : 0;
  const pctQuitacao = valorNovo > 0 ? arredondar2((saldo / valorNovo) * 100) : 0;

  const limiteTroco = opcoes?.pctTrocoPequeno ?? PCT_TROCO_PEQUENO_PADRAO;
  const limiteQuitacao = opcoes?.pctQuitacaoAlta ?? PCT_QUITACAO_ALTA_PADRAO;

  const calculo: CalculoTrocoQuitacaoContrato = {
    valor_novo_contrato: valorNovo,
    saldo_quitado: saldo,
    troco_liberado: troco,
    diferenca_equacao: diferenca,
    equacao_fecha: equacaoFecha,
    percentual_troco_sobre_novo: pctTroco,
    percentual_quitacao_sobre_novo: pctQuitacao,
    origem_saldo: origemSaldo,
    origem_troco: origemTroco,
  };

  const trocoPequeno = pctTroco <= limiteTroco && troco >= 0;
  const quitacaoDominante = pctQuitacao >= limiteQuitacao || pctTroco + pctQuitacao >= 92;

  if (!trocoPequeno || !quitacaoDominante) {
    return { aplicavel: true, calculo, alerta: null };
  }

  if (!equacaoFecha && Math.abs(diferenca) > tol * 2) {
    return { aplicavel: true, calculo, alerta: null };
  }

  const severidade: "atencao" | "alto" = pctTroco <= 10 || pctQuitacao >= 75 ? "alto" : "atencao";

  return {
    aplicavel: true,
    calculo,
    alerta: {
      codigo: "quitacao_dominante_troco_pequeno",
      titulo: ALERTA_MAIOR_PARTE_QUITACAO_DIVIDA,
      mensagem: `${ALERTA_MAIOR_PARTE_QUITACAO_DIVIDA} Financiado ${fmtBrl(valorNovo)}: quitação ~${fmtBrl(saldo)} (${pctQuitacao}%) e troco ~${fmtBrl(troco)} (${pctTroco}%). Equação residual ${fmtBrl(diferenca)}.`,
      severidade,
    },
  };
}
