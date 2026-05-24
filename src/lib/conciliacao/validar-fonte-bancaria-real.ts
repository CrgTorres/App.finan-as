/**
 * Validação de fonte bancária real vs. inferência a partir de folha/contracheque.
 * Ficha financeira e contracheque NÃO são extrato bancário.
 */

import type { Transaction } from "@/types";
import { transactionIsExtratoImport } from "@/lib/utils/transaction-source";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type { Payslip } from "@/types/contracheque";

export type TipoOrigemFolha = "contracheque" | "ficha_financeira";

const PREFIXOS_FOLHA_INFERIDA = ["contracheque:", "ficha_financeira:", "ficha:"] as const;

/** Transação criada automaticamente a partir do líquido da folha (sync salário). */
export function ehTransacaoInferidaDeFolha(
  t: Pick<Transaction, "source_ref" | "source_file_name" | "source_file_hash">,
): boolean {
  const ref = (t.source_ref ?? "").trim().toLowerCase();
  if (!ref) return false;
  return PREFIXOS_FOLHA_INFERIDA.some((p) => ref.startsWith(p));
}

/**
 * Extrato/OFX/CSV/PDF parseado ou transação com rastreio de arquivo de importação.
 * Exclui NF-e, contracheque embutido e lançamento manual sem arquivo.
 */
export function ehOrigemBancariaValida(
  t: Pick<Transaction, "source_ref" | "source_file_name" | "source_file_hash">,
): boolean {
  if (ehTransacaoInferidaDeFolha(t)) return false;
  return transactionIsExtratoImport(t);
}

export function filtrarTransacoesBancariasReais(transactions: Transaction[]): Transaction[] {
  return transactions.filter(ehOrigemBancariaValida);
}

export function possuiFonteBancariaReal(transactions: Transaction[]): boolean {
  return filtrarTransacoesBancariasReais(transactions).length > 0;
}

export function resolverTipoOrigemFolha(p: Payslip): TipoOrigemFolha {
  const dk = String(p.document_kind ?? "").toLowerCase();
  if (dk === "ficha_financeira" || dk.includes("ficha")) return "ficha_financeira";
  return "contracheque";
}

export type ResultadoBloqueioInferenciaBancaria = {
  bloqueado: boolean;
  motivo: string;
};

/**
 * Quando não há extrato importado, bloqueia duplicidade salário×folha,
 * salario_liquido_extrato e demais inferências bancárias.
 */
export function bloquearInferenciaBancariaHistorica(
  possuiFonteReal: boolean,
  motivo = "sem_fonte_bancaria_real",
): ResultadoBloqueioInferenciaBancaria {
  if (possuiFonteReal) {
    return { bloqueado: false, motivo: "" };
  }
  logConciliacaoBancariaBloqueada(motivo);
  return { bloqueado: true, motivo };
}

export function logConciliacaoBancariaBloqueada(
  motivo: string,
  contexto?: Record<string, unknown>,
): void {
  console.log("[CONCILIACAO_BANCARIA_BLOQUEADA]", { motivo, ...contexto });
}

/**
 * Remove linhas e flags de conciliação bancária quando não há fonte real.
 * Retrocompatível: limpa sintéticos já gerados em bases antigas.
 */
export function limparLinhasInferenciaBancariaSemFonte(
  linhas: BaseConciliadaLinha[],
  possuiFonteReal: boolean,
): BaseConciliadaLinha[] {
  if (possuiFonteReal) return linhas;

  return linhas
    .filter((l) => l.origem !== "extrato_bancario")
    .map((l) => {
      if (!l.possivel_duplicidade) return l;
      return {
        ...l,
        possivel_duplicidade: false,
        status_conciliacao:
          l.status_conciliacao === "possivel_duplicidade"
            ? "nao_conciliado"
            : l.status_conciliacao,
        observacao: l.observacao?.includes("Entrada bancária possivelmente")
          ? ""
          : l.observacao,
      };
    });
}
