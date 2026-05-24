/**
 * Cruza o contrato com a renda líquida do mês: soma de parcelas ativas, % comprometida e renda restante.
 */

import type { Loan } from "@/types/contracheque";
import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { RendaReferenciaUsuario } from "@/lib/contratos/renda-referencia-usuario";
import { somarParcelasAtivasLoans } from "@/lib/contratos/renda-referencia-usuario";

export type ContextoCruzamentoRendaLiquida = {
  renda: RendaReferenciaUsuario;
  loans: Loan[];
  loanIdVinculado?: string | null;
  usarParcelaDoContratoNaSoma?: boolean;
};

export type LimiarComprometimentoRenda = 30 | 35 | 40 | 50;

export type CalculoCruzamentoRendaLiquida = {
  renda_liquida_mensal: number | null;
  fonte_renda: string | null;
  soma_parcelas_ativas: number;
  parcela_este_contrato_incluida: number;
  percentual_renda_comprometida: number | null;
  percentual_somente_este_contrato: number | null;
  renda_restante_apos_descontos: number | null;
  limiar_atingido: LimiarComprometimentoRenda | null;
};

export type AlertaCruzamentoRendaLiquida = {
  codigo: string;
  severidade: "info" | "atencao" | "alto" | "critico";
  titulo: string;
  mensagem: string;
  baseLegal?: string;
};

export type ResultadoCruzamentoRendaLiquida = {
  aplicavel: boolean;
  calculo: CalculoCruzamentoRendaLiquida | null;
  alertas: AlertaCruzamentoRendaLiquida[];
};

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function arredondar2(n: number): number {
  return Math.round(n * 100) / 100;
}

function arredondarPct(n: number): number {
  return Math.round(n * 10) / 10;
}

export function limiarComprometimentoRenda(pct: number): LimiarComprometimentoRenda | null {
  if (pct >= 50) return 50;
  if (pct >= 40) return 40;
  if (pct >= 35) return 35;
  if (pct >= 30) return 30;
  return null;
}

function resolverParcelaIncluida(
  extraido: ContratoExtraido,
  ctx: ContextoCruzamentoRendaLiquida,
): number {
  const parcelaContrato = extraido.parcela ?? 0;
  if (parcelaContrato <= 0) return 0;

  if (ctx.loanIdVinculado && ctx.usarParcelaDoContratoNaSoma !== false) {
    const loan = ctx.loans.find((l) => l.id === ctx.loanIdVinculado);
    const cadastroParcela = loan ? Number(loan.installment_amount) : 0;
    return Math.max(parcelaContrato, cadastroParcela);
  }
  if (!ctx.loanIdVinculado) return parcelaContrato;
  return 0;
}

function montarAlertasComprometimento(
  calculo: CalculoCruzamentoRendaLiquida,
): AlertaCruzamentoRendaLiquida[] {
  const { renda_liquida_mensal: renda, soma_parcelas_ativas: soma, percentual_renda_comprometida: pct } =
    calculo;
  if (renda == null || renda <= 0 || pct == null) return [];

  const limiar = calculo.limiar_atingido;
  if (limiar == null) return [];

  const baseMsg = `Soma das parcelas ativas ${fmtBrl(soma)} (${fmtPct(pct)} da renda líquida ${fmtBrl(renda)}). Renda restante estimada: ${fmtBrl(calculo.renda_restante_apos_descontos ?? 0)}.`;

  if (limiar >= 50) {
    return [
      {
        codigo: "margem_50",
        severidade: "critico",
        titulo: "Possível superendividamento",
        mensagem: `${baseMsg} Comprometimento acima de 50% da renda — indício grave (Lei 14.181/2021; mínimo existencial).`,
        baseLegal: "Lei 14.181/2021; Decreto 11.150/2022",
      },
    ];
  }
  if (limiar >= 40) {
    return [
      {
        codigo: "margem_40",
        severidade: "alto",
        titulo: "Alto risco de comprometimento da renda",
        mensagem: `${baseMsg} Comprometimento acima de 40% da renda líquida.`,
      },
    ];
  }
  if (limiar >= 35) {
    return [
      {
        codigo: "margem_35",
        severidade: "atencao",
        titulo: "Risco de comprometimento da renda",
        mensagem: `${baseMsg} Comprometimento acima de 35% da renda líquida.`,
      },
    ];
  }
  return [
    {
      codigo: "margem_30",
      severidade: "atencao",
      titulo: "Atenção ao comprometimento da renda",
      mensagem: `${baseMsg} Comprometimento acima de 30% da renda líquida.`,
    },
  ];
}

/**
 * Calcula soma das parcelas ativas, % da renda comprometida e renda restante; gera alertas por limiar.
 */
export function cruzarContratoRendaLiquida(
  extraido: ContratoExtraido,
  ctx: ContextoCruzamentoRendaLiquida,
): ResultadoCruzamentoRendaLiquida {
  const renda = ctx.renda.rendaLiquidaMensal;
  const parcelaContrato = extraido.parcela ?? 0;

  const somaSemEste = somarParcelasAtivasLoans(ctx.loans, {
    excluirLoanId: ctx.loanIdVinculado ?? undefined,
  });
  const parcelaIncluida = resolverParcelaIncluida(extraido, ctx);
  const somaParcelasAtivas = arredondar2(somaSemEste + parcelaIncluida);

  const pctSomenteContrato =
    renda != null && renda > 0 && parcelaContrato > 0
      ? arredondarPct((parcelaContrato / renda) * 100)
      : null;

  const pctTotal =
    renda != null && renda > 0 && somaParcelasAtivas > 0
      ? arredondarPct((somaParcelasAtivas / renda) * 100)
      : null;

  const rendaRestante =
    renda != null && renda > 0 ? arredondar2(Math.max(0, renda - somaParcelasAtivas)) : null;

  const calculo: CalculoCruzamentoRendaLiquida = {
    renda_liquida_mensal: renda,
    fonte_renda: ctx.renda.fonte,
    soma_parcelas_ativas: somaParcelasAtivas,
    parcela_este_contrato_incluida: parcelaIncluida,
    percentual_renda_comprometida: pctTotal,
    percentual_somente_este_contrato: pctSomenteContrato,
    renda_restante_apos_descontos: rendaRestante,
    limiar_atingido: pctTotal != null ? limiarComprometimentoRenda(pctTotal) : null,
  };

  const alertas: AlertaCruzamentoRendaLiquida[] = [];

  if (renda == null || renda <= 0) {
    alertas.push({
      codigo: "sem_renda_cadastrada",
      severidade: "atencao",
      titulo: "Sem renda de referência",
      mensagem:
        "Não há contracheque com líquido gravado. Importe a folha do mês para calcular parcelas ativas, % comprometida e renda restante.",
    });
    return { aplicavel: true, calculo, alertas };
  }

  alertas.push(...montarAlertasComprometimento(calculo));

  if (
    pctSomenteContrato != null &&
    pctSomenteContrato >= 30 &&
    parcelaContrato > 0 &&
    (pctTotal == null || pctSomenteContrato < pctTotal - 0.05)
  ) {
    alertas.push({
      codigo: "parcela_contrato_vs_renda",
      severidade: pctSomenteContrato >= 40 ? "alto" : "atencao",
      titulo: "Parcela deste contrato vs renda",
      mensagem: `Só a parcela deste contrato (${fmtBrl(parcelaContrato)}) representa ${fmtPct(pctSomenteContrato)} da renda líquida.`,
    });
  }

  return { aplicavel: true, calculo, alertas };
}
