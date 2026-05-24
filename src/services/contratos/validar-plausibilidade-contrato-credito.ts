import type { AlertaPlausibilidadeContrato, ContratoExtraido } from "@/types/contrato-extraido";
import { alertasSeguroEVendaCasada } from "@/services/contratos/alertas-seguro-venda-casada";
import { alertasCalculadoraCidadaoBcb } from "@/services/contratos/bcb-calculadora-cidadao-financiamento";

function pctImpliedAnnualFromMonthly(mensalPct: number): number {
  return (Math.pow(1 + mensalPct / 100, 12) - 1) * 100;
}

function taxasConsistentes(mensal?: number, anual?: number): { ok: boolean; implied?: number } {
  if (mensal == null || anual == null || mensal <= 0 || anual <= 0) return { ok: true };
  const implied = pctImpliedAnnualFromMonthly(mensal);
  const tol = Math.max(2, anual * 0.15);
  return { ok: Math.abs(implied - anual) <= tol, implied };
}

/**
 * Checagens pós-OCR: compostagem CET/juros, ordens de grandeza e comparação com a metodologia
 * «Financiamento com prestações fixas» da Calculadora do Cidadão (BCB) quando há principal, parcela e prazo.
 */
export function validarPlausibilidadeContratoCredito(
  e: ContratoExtraido,
  textoBruto?: string,
): AlertaPlausibilidadeContrato[] {
  const a: AlertaPlausibilidadeContrato[] = [];
  const principal = Math.max(e.valorFinanciado ?? 0, e.valorSolicitado ?? 0, 0);

  const cet = taxasConsistentes(e.cetMensal, e.cetAnual);
  if (!cet.ok && cet.implied != null && e.cetAnual != null && e.cetMensal != null) {
    a.push({
      severidade: "aviso",
      codigo: "cet_mensal_anual",
      mensagem: `CET mensal (${e.cetMensal}%) e anual (${e.cetAnual}%) não batem com a relação composta ~12 meses (esperado ~${cet.implied.toFixed(2)}% aa). Conferir documento ou OCR.`,
    });
  }

  const juros = taxasConsistentes(e.jurosMensal, e.jurosAnual);
  if (!juros.ok && juros.implied != null && e.jurosAnual != null && e.jurosMensal != null) {
    a.push({
      severidade: "aviso",
      codigo: "juros_mensal_anual",
      mensagem: `Juros mensal (${e.jurosMensal}%) e anual (${e.jurosAnual}%) parecem incoerentes (composto ~${juros.implied.toFixed(2)}% aa).`,
    });
  }

  if (e.parcela != null && e.parcelas != null && e.valorTotalPago != null && e.parcela > 0 && e.parcelas > 0) {
    const somaLinear = e.parcela * e.parcelas;
    const tot = e.valorTotalPago;
    const ratio = somaLinear / Math.max(tot, 1);
    const fechaSomatorio = Math.abs(somaLinear - tot) <= Math.max(1, tot * 0.003);
    /** Somatório = parcela × n é esperado no Daycoval; a UI mostra nota informativa — não gerar alerta. */
    if (!fechaSomatorio && (ratio > 1.18 || ratio < 0.82)) {
      a.push({
        severidade: "aviso",
        codigo: "parcela_vezes_n_vs_total",
        mensagem:
          "Parcela × quantidade de parcelas não fecha com «valor total pago» (ordem de grandeza). Pode ser taxa embutida ou OCR trocado — confira o PDF.",
      });
    }
  }

  if (e.seguro != null && principal > 0 && e.seguro > principal * 0.25) {
    a.push({
      severidade: "critico",
      codigo: "seguro_restante_alto",
      mensagem:
        "Seguro ainda parece alto vs valor do crédito — não confie sem conferir no original (CDC: acessório costuma ser muito menor que o principal).",
    });
  }

  if (e.tarifas != null && principal > 0 && e.tarifas > principal * 0.2) {
    a.push({
      severidade: "aviso",
      codigo: "tarifas_restante_alto",
      mensagem: "Tarifas altas vs principal — conferir se não é outro total do quadro (ex.: somatório).",
    });
  }

  if (principal > 0 && e.parcela != null && e.parcela > principal) {
    a.push({
      severidade: "critico",
      codigo: "parcela_maior_que_credito",
      mensagem:
        "Valor da parcela maior que o valor do crédito — leitura provavelmente errada (a não ser capitalização extrema mal extraída).",
    });
  }

  a.push(...alertasCalculadoraCidadaoBcb(e));
  a.push(...alertasSeguroEVendaCasada(e, textoBruto));

  return a;
}
