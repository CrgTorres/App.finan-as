import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";

export type ContratoInferidoComParcelaOpcional = EmprestimoContratoAnalise & {
  parcela?: unknown;
  parcelaMensal?: unknown;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Valor mensal da parcela para UI, vínculos e exportações.
 * Prioridade: número em `parcela` → `valorParcela` → `parcelaMensal` → média histórica (total / ocorrências).
 */
export function obterValorParcela(contrato: ContratoInferidoComParcelaOpcional): number | null {
  if (typeof contrato.parcela === "number" && Number.isFinite(contrato.parcela) && contrato.parcela > 0) {
    return round2(contrato.parcela);
  }
  if (
    typeof contrato.valorParcela === "number" &&
    Number.isFinite(contrato.valorParcela) &&
    contrato.valorParcela > 0
  ) {
    return round2(contrato.valorParcela);
  }
  if (
    typeof contrato.parcelaMensal === "number" &&
    Number.isFinite(contrato.parcelaMensal) &&
    contrato.parcelaMensal > 0
  ) {
    return round2(contrato.parcelaMensal);
  }
  if (contrato.quantidadeAparicoes > 0 && contrato.totalPago > 0) {
    const v = contrato.totalPago / contrato.quantidadeAparicoes;
    if (v > 0) return round2(v);
  }
  return null;
}

export type FaixaValorParcelaUi = "neutro" | "warning" | "danger";

/** Até 100 neutro; 101–500 aviso discreto; acima de 500 alerta discreto. */
export function faixaDestaqueValorParcela(valor: number | null): FaixaValorParcelaUi {
  if (valor == null || valor <= 0) return "neutro";
  if (valor <= 100) return "neutro";
  if (valor <= 500) return "warning";
  return "danger";
}

export function classNameCelulaValorParcela(valor: number | null): string {
  const f = faixaDestaqueValorParcela(valor);
  if (f === "warning") return "bg-amber-500/10 text-amber-950 dark:text-amber-100 ring-1 ring-amber-500/30";
  if (f === "danger") return "bg-red-500/10 text-red-950 dark:text-red-100 ring-1 ring-red-500/35";
  return "";
}
