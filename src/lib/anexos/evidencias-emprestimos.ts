/**
 * Evidências de empréstimo — ligação a `loans` ou a contratos inferidos (fingerprint).
 * Não altera parsers nem classificações.
 */

import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { normSlugRubricaLoanMatch } from "@/lib/anexos/emprestimos-cruzamento-loans";
import { loanCorrespondeEmprestimoDetectado } from "@/lib/anexos/loans-cadastro-automatico-contracheque";
import type { GrupoConsolidadoEmprestimo } from "@/lib/anexos/consolidacao-logica-emprestimos";
import type { Loan } from "@/types/contracheque";
import type { LoanEvidence, TipoEvidenciaEmprestimo } from "@/types/loan-evidence";

export const LOAN_EVIDENCES_STORAGE_BUCKET = "loan-evidences";

/** Mensagem amigável para erros RLS do Supabase (Storage ou tabelas). */
export function mensagemErroEvidenciaSupabase(mensagem: string, contexto: "storage" | "insert"): string {
  const tabelaAusente =
    /could not find the table|relation .* does not exist|schema cache/i.test(mensagem) &&
    /loan_evidences/i.test(mensagem);

  if (tabelaAusente) {
    return (
      "A tabela «loan_evidences» ainda não existe no Supabase. No SQL Editor, execute (por ordem): " +
      "supabase/patch_loan_evidences.sql, supabase/patch_loan_evidences_storage_rls.sql e " +
      "supabase/patch_loan_evidences_leitura_automatica.sql."
    );
  }

  const rls =
    /row-level security|row level security|violates.*policy/i.test(mensagem) ||
    mensagem.includes("42501");
  if (!rls) return mensagem;
  if (contexto === "storage") {
    return (
      "Permissão negada ao guardar o ficheiro (Storage). No Supabase, execute o SQL " +
      "supabase/patch_loan_evidences_storage_rls.sql (bucket «loan-evidences» + políticas RLS)."
    );
  }
  return (
    "Permissão negada ao registar a evidência. Confirme login, execute no Supabase: " +
    "patch_loan_evidences.sql, patch_loan_evidences_conferencia.sql e, se sincronizar cadastro, patch_loans_rls.sql."
  );
}

/** Satisfaz `loan_evidences_target_ck` quando não há `loan_id` (BD sem patch de conferência). */
export function fingerprintEvidenciaStandalone(userId: string): string {
  return `standalone|${userId}`;
}

export const TIPOS_EVIDENCIA_EMPRESTIMO: { value: TipoEvidenciaEmprestimo; label: string }[] = [
  { value: "contrato_formal", label: "Contrato formal" },
  { value: "extrato_bancario", label: "Extrato bancário" },
  { value: "autorizacao_desconto", label: "Autorização de desconto" },
  { value: "comprovante_quitacao", label: "Comprovante de quitação" },
  { value: "decisao_judicial", label: "Decisão judicial" },
  { value: "taxa_seguro", label: "Taxa / seguro" },
  { value: "outro", label: "Outro" },
];

export function labelTipoEvidencia(t: TipoEvidenciaEmprestimo): string {
  return TIPOS_EVIDENCIA_EMPRESTIMO.find((x) => x.value === t)?.label ?? t;
}

/** Identificador estável para o mesmo contrato inferido na análise (alinha com cadastro automático). */
export function fingerprintContratoInferido(c: EmprestimoContratoAnalise): string {
  const cod = (c.codigo ?? "").replace(/\D/g, "");
  const slug = normSlugRubricaLoanMatch(c.descricao);
  return `inf|${cod}|${slug}|${c.valorParcela.toFixed(2)}|${c.primeiraAparicao}`;
}

export function loanRelacionadoAoContratoInferido(c: EmprestimoContratoAnalise, loans: Loan[]): Loan | undefined {
  return loans.find((l) => loanCorrespondeEmprestimoDetectado(l, c));
}

export function evidenciasParaContratoInferido(
  c: EmprestimoContratoAnalise,
  loans: Loan[],
  evidencias: LoanEvidence[],
): LoanEvidence[] {
  const fp = fingerprintContratoInferido(c);
  const loan = loanRelacionadoAoContratoInferido(c, loans);
  return evidencias.filter(
    (e) =>
      (loan != null && e.loan_id != null && e.loan_id === loan.id) ||
      (e.contrato_inferido_fingerprint != null && e.contrato_inferido_fingerprint === fp),
  );
}

export function evidenciasDoGrupoConsolidado(
  g: GrupoConsolidadoEmprestimo,
  loans: Loan[],
  evidencias: LoanEvidence[],
): LoanEvidence[] {
  const map = new Map<string, LoanEvidence>();
  for (const c of g.contratosOriginais) {
    for (const e of evidenciasParaContratoInferido(c, loans, evidencias)) {
      map.set(e.id, e);
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function contratoTemEvidenciaTipo(
  c: EmprestimoContratoAnalise,
  loans: Loan[],
  evidencias: LoanEvidence[],
  tipo: TipoEvidenciaEmprestimo,
): boolean {
  return evidenciasParaContratoInferido(c, loans, evidencias).some((e) => e.tipo_evidencia === tipo);
}

export function contarContratosSemTipoEvidencia(
  contratos: EmprestimoContratoAnalise[],
  loans: Loan[],
  evidencias: LoanEvidence[],
  tipo: TipoEvidenciaEmprestimo,
): number {
  if (contratos.length === 0) return 0;
  return contratos.filter((c) => !contratoTemEvidenciaTipo(c, loans, evidencias, tipo)).length;
}
