/**
 * Carrega empréstimos e evidências com extração para cruzamentos do motor de análise.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Loan } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import type { ContratosAnterioresCandidatos } from "@/services/contratos/comparar-contrato-anterior-mesmo-banco";
import {
  montarContratosAnterioresCandidatos,
  type ContextoMotorAnaliseContrato,
} from "@/services/contratos/motor-analise-contrato";
import { obterRendaReferenciaUsuario } from "@/lib/contratos/renda-referencia-usuario";
import type { RendaReferenciaUsuario } from "@/lib/contratos/renda-referencia-usuario";

export type FontesCruzamentoContratoCarregadas = {
  renda: RendaReferenciaUsuario;
  loans: Loan[];
  evidencias: LoanEvidence[];
  contratosAnteriores: ContratosAnterioresCandidatos;
};

export type CarregarFontesCruzamentoContratoOpts = {
  excluirEvidenciaId?: string;
  excluirLoanId?: string;
};

/** Loans ativos + evidências com `contrato_extraido` + renda do último contracheque. */
export async function carregarFontesCruzamentoContrato(
  supabase: SupabaseClient,
  opts?: CarregarFontesCruzamentoContratoOpts,
): Promise<FontesCruzamentoContratoCarregadas> {
  const [renda, loansRes, evRes] = await Promise.all([
    obterRendaReferenciaUsuario(supabase),
    supabase.from("loans").select("*").order("created_at", { ascending: false }),
    supabase
      .from("loan_evidences")
      .select("id, loan_id, nome_arquivo, contrato_extraido, created_at, tipo_evidencia")
      .not("contrato_extraido", "is", null)
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  const loans = ((loansRes.data ?? []) as Loan[]).filter(
    (l) => !opts?.excluirLoanId || l.id !== opts.excluirLoanId,
  );
  const evidencias = ((evRes.data ?? []) as LoanEvidence[]).filter(
    (e) => !opts?.excluirEvidenciaId || e.id !== opts.excluirEvidenciaId,
  );

  const contratosAnteriores = montarContratosAnterioresCandidatos({
    loans,
    evidencias,
    excluirEvidenciaId: opts?.excluirEvidenciaId,
  });

  return {
    renda,
    loans,
    evidencias,
    contratosAnteriores,
  };
}

export function contextoMotorDeFontesCarregadas(
  fontes: FontesCruzamentoContratoCarregadas,
  extra?: {
    titular?: import("@/lib/contratos/perfil-titular-app").PerfilTitularApp | null;
    loanIdVinculado?: string | null;
    textoBruto?: string;
  },
): ContextoMotorAnaliseContrato {
  return {
    textoBruto: extra?.textoBruto,
    titular: extra?.titular,
    renda: fontes.renda,
    loans: fontes.loans,
    loanIdVinculado: extra?.loanIdVinculado ?? null,
    contratosAnteriores: fontes.contratosAnteriores,
  };
}
