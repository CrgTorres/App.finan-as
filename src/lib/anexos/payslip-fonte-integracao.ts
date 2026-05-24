/**
 * Separa payslips entre ficha financeira histórica e contracheque mensal
 * (inclui gravação em lote sem document_kind no Supabase).
 */

import type { Payslip } from "@/types/contracheque";

function competenciaKey(p: Payslip): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

/** Linha marcada explicitamente como contracheque mensal. */
export function isPayslipContrachequeMensalExplicito(p: Payslip): boolean {
  const dk = String(p.document_kind ?? "").toLowerCase();
  const fek = String(p.folha_emit_kind ?? "").toLowerCase();
  return (
    dk === "contracheque" ||
    dk === "contracheque_mensal" ||
    (fek === "mensal_principal" && dk.length > 0 && dk !== "ficha_financeira")
  );
}

/** Uma linha pertence à ficha (rótulos explícitos ou nome do ficheiro). */
export function isPayslipFichaFinanceiraLinha(
  p: Payslip,
  ctx?: { contagemPorFileName?: Map<string, number> },
): boolean {
  if (isPayslipContrachequeMensalExplicito(p)) return false;

  const dk = String(p.document_kind ?? "").toLowerCase();
  const fek = String(p.folha_emit_kind ?? "").toLowerCase();
  if (dk === "ficha_financeira" || fek === "ficha_financeira" || fek === "ficha_import") {
    return true;
  }

  const nome = String(p.file_name ?? "").toLowerCase();
  if (nome.includes("ficha")) return true;

  const fn = p.file_name?.trim();
  if (fn && ctx?.contagemPorFileName) {
    const n = ctx.contagemPorFileName.get(fn) ?? 0;
    if (n >= 12) return true;
  }

  return false;
}

/**
 * Heurística: ficha corrida gravada competência a competência sem document_kind
 * (muitas linhas, mesmo PDF, ou série longa).
 */
export function pareceFichaFinanceiraHistoricaBulk(payslips: Payslip[]): boolean {
  if (payslips.length < 18) return false;

  const comps = new Set(payslips.map(competenciaKey));
  if (comps.size < 18) return false;

  const years = payslips.map((p) => p.year);
  const span = Math.max(...years) - Math.min(...years);
  if (span < 3) return false;

  const porArquivo = new Map<string, number>();
  for (const p of payslips) {
    const fn = p.file_name?.trim();
    if (!fn) continue;
    porArquivo.set(fn, (porArquivo.get(fn) ?? 0) + 1);
  }
  const maxMesmoArquivo = Math.max(0, ...porArquivo.values());
  if (maxMesmoArquivo >= 12) return true;

  return payslips.length >= 48 && comps.size >= 24;
}

export function partitionPayslipsFichaContracheque(payslips: Payslip[]): {
  fichas: Payslip[];
  contracheques: Payslip[];
} {
  const contagemPorFileName = new Map<string, number>();
  for (const p of payslips) {
    const fn = p.file_name?.trim();
    if (!fn) continue;
    contagemPorFileName.set(fn, (contagemPorFileName.get(fn) ?? 0) + 1);
  }

  const ctx = { contagemPorFileName };
  const fichasExplicitas = payslips.filter((p) => isPayslipFichaFinanceiraLinha(p, ctx));

  if (fichasExplicitas.length > 0) {
    const fichasSet = new Set(fichasExplicitas);
    return {
      fichas: fichasExplicitas,
      contracheques: payslips.filter((p) => !fichasSet.has(p)),
    };
  }

  if (pareceFichaFinanceiraHistoricaBulk(payslips)) {
    return { fichas: payslips, contracheques: [] };
  }

  return {
    fichas: [],
    contracheques: payslips.filter((p) => !isPayslipFichaFinanceiraLinha(p, ctx)),
  };
}
