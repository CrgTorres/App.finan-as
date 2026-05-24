import { normalizarNomeBanco } from "@/lib/auditoria/normalizar-banco";
import { normSlugRubricaLoanMatch } from "@/lib/anexos/emprestimos-cruzamento-loans";
import type { Loan } from "@/types/contracheque";
import type { ContratoExtraido } from "@/types/contrato-extraido";

const EPS_PARCELA = 0.06;

export type DivergenciaExtraidoLoan = {
  campo: "parcela" | "parcelas" | "banco" | "total_amount";
  label: string;
  valorExtraido: string;
  valorCadastro: string;
  severidade: "ok" | "aviso" | "critico";
};

export type CruzamentoExtraidoLoan = {
  loan: Loan;
  score: number;
  motivos: string[];
  divergencias: DivergenciaExtraidoLoan[];
  parcelaOk: boolean;
  parcelasOk: boolean;
  bancoOk: boolean;
  podeConfirmar: boolean;
};

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function bancoLoan(loan: Loan): string {
  const raw = loan.institution_name?.trim() || loan.description;
  return normalizarNomeBanco(raw);
}

function bancosCompatíveis(a: string | undefined, b: string): boolean {
  if (!a?.trim()) return true;
  const na = normalizarNomeBanco(a);
  const nb = normalizarNomeBanco(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const sa = normSlugRubricaLoanMatch(na);
  const sb = normSlugRubricaLoanMatch(nb);
  return sa.length >= 6 && sb.length >= 6 && (sa.includes(sb) || sb.includes(sa));
}

function parcelaCoincide(extraido: number, cadastro: number): boolean {
  return Math.abs(extraido - cadastro) <= EPS_PARCELA || Math.abs(extraido - cadastro) <= 2;
}

export function cruzarExtraidoComLoan(extraido: ContratoExtraido, loan: Loan): CruzamentoExtraidoLoan {
  const motivos: string[] = [];
  const divergencias: DivergenciaExtraidoLoan[] = [];
  let score = 0;

  let parcelaOk = true;
  if (extraido.parcela != null && extraido.parcela > 0) {
    parcelaOk = parcelaCoincide(extraido.parcela, loan.installment_amount);
    if (parcelaOk) {
      score += 45;
      motivos.push("Parcela do contrato = parcela cadastrada");
    } else {
      divergencias.push({
        campo: "parcela",
        label: "Valor da parcela",
        valorExtraido: formatBRL(extraido.parcela),
        valorCadastro: formatBRL(loan.installment_amount),
        severidade: "critico",
      });
    }
  } else {
    parcelaOk = false;
    divergencias.push({
      campo: "parcela",
      label: "Valor da parcela",
      valorExtraido: "—",
      valorCadastro: formatBRL(loan.installment_amount),
      severidade: "aviso",
    });
  }

  let parcelasOk = true;
  if (extraido.parcelas != null && extraido.parcelas > 0 && loan.total_installments > 0) {
    const nExt = Math.round(extraido.parcelas);
    const nCad = loan.total_installments;
    parcelasOk = Math.abs(nExt - nCad) <= 1;
    if (parcelasOk) {
      score += 30;
      motivos.push("Prazo (n.º parcelas) alinhado ao cadastro");
    } else {
      divergencias.push({
        campo: "parcelas",
        label: "Quantidade de parcelas",
        valorExtraido: String(nExt),
        valorCadastro: String(nCad),
        severidade: "aviso",
      });
    }
  }

  const bOk = bancosCompatíveis(extraido.banco, bancoLoan(loan));
  const bancoOk = bOk;
  if (extraido.banco?.trim()) {
    if (bOk) {
      score += 25;
      motivos.push("Banco do documento compatível com o cadastro");
    } else {
      divergencias.push({
        campo: "banco",
        label: "Banco / instituição",
        valorExtraido: normalizarNomeBanco(extraido.banco),
        valorCadastro: bancoLoan(loan),
        severidade: "aviso",
      });
    }
  }

  const totalCad = loan.total_amount;
  const totalExt =
    extraido.valorFinanciado ??
    (extraido.parcela != null && extraido.parcelas != null
      ? Math.round(extraido.parcela * extraido.parcelas * 100) / 100
      : undefined);
  if (totalExt != null && totalExt > 0 && totalCad > 0) {
    const ratio = totalExt / totalCad;
    if (ratio >= 0.85 && ratio <= 1.15) {
      score += 10;
      motivos.push("Valor total financiado próximo do cadastro");
    } else if (Math.abs(totalExt - totalCad) > Math.max(500, totalCad * 0.2)) {
      divergencias.push({
        campo: "total_amount",
        label: "Valor total / financiado",
        valorExtraido: formatBRL(totalExt),
        valorCadastro: formatBRL(totalCad),
        severidade: "aviso",
      });
    }
  }

  const temCritico = divergencias.some((d) => d.severidade === "critico");
  const podeConfirmar = !temCritico && parcelaOk;

  return {
    loan,
    score: Math.min(100, score),
    motivos,
    divergencias,
    parcelaOk,
    parcelasOk,
    bancoOk,
    podeConfirmar,
  };
}

export type SugestaoLoanExtraido = {
  loanId: string;
  score: number;
  resumo: string;
  cruzamento: CruzamentoExtraidoLoan;
};

export function sugerirLoansPorExtraido(
  extraido: ContratoExtraido,
  loans: Loan[],
  limite = 5,
): SugestaoLoanExtraido[] {
  const lista: SugestaoLoanExtraido[] = [];
  for (const loan of loans) {
    const cruz = cruzarExtraidoComLoan(extraido, loan);
    if (cruz.score < 25 && !cruz.parcelaOk) continue;
    const inst = loan.institution_name || loan.description;
    lista.push({
      loanId: loan.id,
      score: cruz.score,
      resumo: `${inst} · ${formatBRL(loan.installment_amount)} · ${loan.total_installments} parcelas`,
      cruzamento: cruz,
    });
  }
  lista.sort((a, b) => b.score - a.score);
  return lista.slice(0, limite);
}

export function melhorLoanParaExtraido(
  extraido: ContratoExtraido,
  loans: Loan[],
): SugestaoLoanExtraido | null {
  const top = sugerirLoansPorExtraido(extraido, loans, 1)[0];
  if (!top) return null;
  if (top.score < 40 && !top.cruzamento.parcelaOk) return null;
  return top;
}

export type PatchSyncLoanFromExtraido = {
  installment_amount?: number;
  total_installments?: number;
  institution_name?: string;
  start_date?: string;
  total_amount?: number;
};

/** Campos do `loans` a alinhar com o contrato confirmado (só preenche o que o OCR trouxe). */
export function patchSyncLoanFromExtraido(
  extraido: ContratoExtraido,
  loan: Loan,
): PatchSyncLoanFromExtraido {
  const patch: PatchSyncLoanFromExtraido = {};

  if (extraido.parcela != null && extraido.parcela > 0) {
    patch.installment_amount = Math.round(extraido.parcela * 100) / 100;
  }
  if (extraido.parcelas != null && extraido.parcelas > 0) {
    patch.total_installments = Math.round(extraido.parcelas);
  }
  if (extraido.banco?.trim()) {
    patch.institution_name = normalizarNomeBanco(extraido.banco);
  }
  const inicio = extraido.primeiroVencimento ?? extraido.dataContratacao;
  if (inicio?.match(/^\d{4}-\d{2}-\d{2}/)) {
    patch.start_date = inicio.slice(0, 10);
  }
  if (extraido.valorFinanciado != null && extraido.valorFinanciado > 0) {
    patch.total_amount = Math.round(extraido.valorFinanciado * 100) / 100;
  } else if (patch.installment_amount != null && patch.total_installments != null) {
    patch.total_amount = Math.round(patch.installment_amount * patch.total_installments * 100) / 100;
  }

  return patch;
}
