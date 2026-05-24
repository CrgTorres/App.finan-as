/**
 * Motor central de análise de contrato de empréstimo.
 *
 * Camadas (ordem de execução no app):
 * 1. OCR / leitura automática (`pipeline-leitura-automatica`)
 * 2. Extração de campos (`extrair-contrato-de-texto`, saneamento, auditoria)
 * 3. **Este motor** → `analisarContratoEmprestimo` (regras, alertas, cálculos, pendências)
 * 4. Persistência em anexos (`processar-contrato-anexo-para-persistencia`)
 * 5. UI Radar do Contrato
 *
 * Cruzamentos opcionais:
 * - Renda líquida (contracheque) + parcelas ativas
 * - Contratos / evidências anteriores (mesmo banco, refinanciamento, parcela reduzida)
 */

import type { Loan } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { AnaliseContratoEmprestimo } from "@/types/analise-contrato-emprestimo";
import type { AnaliseJuridicoFinanceiraContrato } from "@/types/analise-juridico-financeira-contrato";
import type { PerfilTitularApp } from "@/lib/contratos/perfil-titular-app";
import type { RendaReferenciaUsuario } from "@/lib/contratos/renda-referencia-usuario";
import {
  analisarContratoEmprestimo,
  type OpcoesAnaliseContratoEmprestimo,
} from "@/services/contratos/analise-contrato-emprestimo";
import type { ContratosAnterioresCandidatos } from "@/services/contratos/comparar-contrato-anterior-mesmo-banco";
import type { ReferenciaTaxaInformadaUsuario } from "@/services/contratos/comparar-custo-contrato-referencia-bacen";
import type { ContextoAnaliseJuridicaFinanceira } from "@/services/contratos/analise-juridico-financeira-contrato";
import type { ContextoCruzamentoRendaLiquida } from "@/services/contratos/cruzar-contrato-renda-liquida";

/** Entrada unificada para o motor (UI, pipeline, salvamento). */
export type ContextoMotorAnaliseContrato = {
  textoBruto?: string;
  titular?: PerfilTitularApp | null;
  renda?: RendaReferenciaUsuario | null;
  loans?: Loan[];
  loanIdVinculado?: string | null;
  contratosAnteriores?: ContratosAnterioresCandidatos;
  taxaReferencia?: ReferenciaTaxaInformadaUsuario;
  analiseJuridicaExistente?: AnaliseJuridicoFinanceiraContrato | null;
  /** Atalho: monta `contextoJuridico` a partir de renda + loans. */
  contextoJuridico?: ContextoAnaliseJuridicaFinanceira;
};

export function montarContratosAnterioresCandidatos(opts: {
  loans?: Loan[];
  evidencias?: LoanEvidence[];
  extraidos?: ContratoExtraido[];
  excluirEvidenciaId?: string;
}): ContratosAnterioresCandidatos {
  return {
    loans: opts.loans,
    evidencias: opts.evidencias,
    extraidos: opts.extraidos,
    excluirEvidenciaId: opts.excluirEvidenciaId,
  };
}

/** Converte contexto do motor em opções do consolidador interno. */
export function montarOpcoesMotorAnaliseContrato(
  ctx: ContextoMotorAnaliseContrato = {},
): OpcoesAnaliseContratoEmprestimo {
  const opcoes: OpcoesAnaliseContratoEmprestimo = {
    textoBruto: ctx.textoBruto,
    taxaReferencia: ctx.taxaReferencia,
    contratosAnteriores: ctx.contratosAnteriores,
    analiseJuridicaExistente: ctx.analiseJuridicaExistente,
    contextoJuridico: ctx.contextoJuridico,
  };

  if (ctx.renda && ctx.loans?.length) {
    opcoes.cruzamentoRenda = {
      renda: ctx.renda,
      loans: ctx.loans,
      loanIdVinculado: ctx.loanIdVinculado ?? null,
      usarParcelaDoContratoNaSoma: true,
    };
    if (!opcoes.contextoJuridico) {
      opcoes.contextoJuridico = {
        loans: ctx.loans,
        renda: ctx.renda,
        loanIdVinculado: ctx.loanIdVinculado,
        usarParcelaDoContratoNaSoma: true,
      };
    }
  }

  return opcoes;
}

/**
 * Ponto único de análise consolidada (Radar, JSON em evidência, alertas visuais).
 */
export function executarMotorAnaliseContrato(
  extraido: ContratoExtraido,
  ctx?: ContextoMotorAnaliseContrato,
): AnaliseContratoEmprestimo {
  return analisarContratoEmprestimo(extraido, montarOpcoesMotorAnaliseContrato(ctx));
}
