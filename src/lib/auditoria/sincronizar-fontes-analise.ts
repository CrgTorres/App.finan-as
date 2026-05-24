/**
 * Orquestra reprocessamento lógico após novo documento — recalcula base e emite refresh.
 */

import {
  buildBaseFinanceiraNormalizada,
  type BaseFinanceiraNormalizada,
} from "@/lib/dashboard/base-financeira-normalizada";
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import type { EntradaStatusManualBaseConciliada } from "@/lib/conciliacao/conciliacao-financeira";
import type { BaseConsignacoesGoverno } from "@/lib/consignacoes-governo/normalizar-consigfacil";
import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import {
  auditarIntegracaoFontes,
  type ResultadoAuditoriaIntegracao,
  type SnapshotSistemaIntegracao,
} from "@/lib/auditoria/auditoria-integracao-fontes";
import { verificarAtualizacaoDiariaSistema } from "@/lib/auditoria/verificar-atualizacao-diaria-sistema";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";

export type PassoSincronizacao =
  | "ocr_reprocessado"
  | "normalizado"
  | "base_normalizada"
  | "base_conciliada"
  | "scores"
  | "graficos"
  | "exportacao"
  | "perfil_leitura"
  | "auditoria_integracao";

export type ResultadoSincronizacaoFontes = {
  sincronizado_em: string;
  passos: PassoSincronizacao[];
  base: BaseFinanceiraNormalizada;
  auditoria: ResultadoAuditoriaIntegracao;
  emitiu_evento_dashboard: boolean;
};

export type EntradaSincronizarFontes = {
  transactions?: Transaction[];
  loans?: Loan[];
  payslips?: Payslip[];
  evidencias?: LoanEvidence[];
  statusManualConciliacao?: EntradaStatusManualBaseConciliada[];
  consigfacil?: BaseConsignacoesGoverno;
  snapshotsConsigfacil?: ConsigfacilSnapshot[];
  perfilLeitura?: ResultadoResolucaoPerfil;
  /** Emite `DASHBOARD_DATA_UPDATED` ao final (padrão true no browser). */
  emitirEvento?: boolean;
  origin?: string;
};

/**
 * Recalcula a base financeira, auditoria de integração e opcionalmente notifica o dashboard.
 * OCR físico continua nos fluxos de upload; aqui consolidamos análise e conciliação.
 */
export function sincronizarFontesAnalise(input: EntradaSincronizarFontes): ResultadoSincronizacaoFontes {
  const passos: PassoSincronizacao[] = [];

  passos.push("ocr_reprocessado");
  passos.push("normalizado");

  const base = buildBaseFinanceiraNormalizada({
    transactions: input.transactions,
    loans: input.loans,
    payslips: input.payslips,
    evidencias: input.evidencias,
    statusManualConciliacao: input.statusManualConciliacao,
    consigfacil: input.consigfacil,
    perfilLeitura: input.perfilLeitura,
    snapshotsConsigfacilRaw: input.snapshotsConsigfacil,
  });

  passos.push("base_normalizada");
  if (base.baseConciliada.length > 0) passos.push("base_conciliada");
  if (base.scoreRiscoFinanceiro.indice_risco_financeiro > 0) passos.push("scores");
  if (Object.keys(base.series_temporais).length > 0) passos.push("graficos");
  passos.push("exportacao");
  if (input.perfilLeitura) passos.push("perfil_leitura");

  const snapshot: SnapshotSistemaIntegracao = {
    transactions: input.transactions ?? [],
    loans: input.loans ?? [],
    payslips: input.payslips ?? [],
    evidencias: input.evidencias ?? [],
    snapshotsConsigfacil: input.snapshotsConsigfacil ?? [],
    base,
    perfilLeitura: input.perfilLeitura ?? base.perfilLeitura,
  };

  const verificacaoDiaria = verificarAtualizacaoDiariaSistema({
    transactions: snapshot.transactions,
    payslips: snapshot.payslips,
    loans: snapshot.loans,
    evidencias: snapshot.evidencias,
    snapshotsConsigfacil: snapshot.snapshotsConsigfacil,
    ultimaVerificacao: new Date().toISOString(),
  });

  const auditoria = auditarIntegracaoFontes({ ...snapshot, verificacaoDiaria });
  passos.push("auditoria_integracao");

  const emitir = input.emitirEvento !== false;
  if (emitir) {
    emitDashboardDataUpdated({
      origin: input.origin ?? "sincronizar_fontes_analise",
      at: new Date().toISOString(),
    });
  }

  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(
        "financa:ultima-auditoria-integracao:v1",
        JSON.stringify({
          at: new Date().toISOString(),
          indice: auditoria.indice_confiabilidade.indice,
          classificacao: auditoria.indice_confiabilidade.classificacao,
          alertas: auditoria.alertas.slice(0, 12),
          nivel_prontidao: auditoria.prontidao.nivel_prontidao_analise,
          niveis_atingidos: auditoria.prontidao.niveis_atingidos,
          selo_publicos: auditoria.prontidao.publicos_disponiveis,
        }),
      );
    } catch {
      /* ignore quota */
    }
  }

  return {
    sincronizado_em: new Date().toISOString(),
    passos,
    base,
    auditoria,
    emitiu_evento_dashboard: emitir,
  };
}
