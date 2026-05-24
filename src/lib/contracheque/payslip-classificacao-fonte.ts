import type { Payslip } from "@/types/contracheque";

/** Marcadores explícitos de ficha financeira (BD ou gravação completa). */
export function isPayslipFichaFinanceiraExplicita(p: Payslip): boolean {
  const dk = String(p.document_kind ?? "").toLowerCase();
  const fek = String(p.folha_emit_kind ?? "").toLowerCase();
  if (dk === "contracheque" || dk === "contracheque_mensal") return false;
  if (dk === "ficha_financeira" || fek === "ficha_financeira" || fek === "ficha_import") {
    return true;
  }
  const nome = String(p.file_name ?? "").toLowerCase();
  return nome.includes("ficha");
}

/**
 * Ficha corrida gravada em lote sem `document_kind` (fallback de esquema antigo)
 * costuma ficar só como `mensal_principal` — reclassifica para auditoria e prontidão.
 */
function pareceFichaCorridaHistorica(payslips: Payslip[]): boolean {
  const candidatos = payslips.filter(
    (p) =>
      !isPayslipFichaFinanceiraExplicita(p) &&
      !p.document_kind &&
      (!p.folha_emit_kind || p.folha_emit_kind === "mensal_principal"),
  );
  if (candidatos.length < 12) return false;
  const anos = [...new Set(candidatos.map((p) => p.year))].sort((a, b) => a - b);
  const spanAnos = anos.length >= 2 ? anos[anos.length - 1]! - anos[0]! : 0;
  if (spanAnos < 2) return false;
  const limiar = Math.min(24, Math.ceil(payslips.length * 0.55));
  return candidatos.length >= limiar;
}

export function isPayslipFichaFinanceira(p: Payslip, payslips?: Payslip[]): boolean {
  if (isPayslipFichaFinanceiraExplicita(p)) return true;
  if (!payslips?.length) return false;
  if (!pareceFichaCorridaHistorica(payslips)) return false;
  return (
    !p.document_kind && (!p.folha_emit_kind || p.folha_emit_kind === "mensal_principal")
  );
}

export function particionarPayslipsFichaContracheque(payslips: Payslip[]): {
  fichas: Payslip[];
  contracheques: Payslip[];
} {
  const fichas = payslips.filter((p) => isPayslipFichaFinanceira(p, payslips));
  const fichasSet = new Set(fichas);
  const contracheques = payslips.filter((p) => !fichasSet.has(p));
  return { fichas, contracheques };
}
