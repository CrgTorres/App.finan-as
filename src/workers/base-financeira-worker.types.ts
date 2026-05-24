import type { EntradaStatusManualBaseConciliada } from "@/lib/conciliacao/conciliacao-financeira";
import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import type { CatalogoCacheWorkerSnapshot } from "@/lib/consignacoes-governo/consigfacil-catalogo-cache";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";

export type BaseFinanceiraWorkerResumo = {
  folhas: number;
  transacoes: number;
  emprestimosCadastro: number;
  evidencias: number;
  snapshotsConsigfacil: number;
  linhasConciliada: number;
  pendenciasReais: number;
  contratosConsigfacil: number;
};

export type BaseFinanceiraWorkerPayload = {
  transactions: Transaction[];
  loans: Loan[];
  payslips: Payslip[];
  evidencias: LoanEvidence[];
  statusManualConciliacao: EntradaStatusManualBaseConciliada[];
  snapshotsConsigfacil: ConsigfacilSnapshot[];
  /** Se true, o caller pode persistir `snapshotsProcessados` no localStorage. */
  origemConsigfacilLocal: boolean;
  perfilLeitura: ResultadoResolucaoPerfil;
  /** Catálogo hidratado na main thread (opcional). */
  catalogoCache?: CatalogoCacheWorkerSnapshot;
};

export type BaseFinanceiraWorkerBuildRequest = {
  type: "build";
  jobId: number;
  payload: BaseFinanceiraWorkerPayload;
};

export type BaseFinanceiraWorkerSuccess = {
  type: "success";
  jobId: number;
  base: BaseFinanceiraNormalizada;
  logs: string[];
  resumo: BaseFinanceiraWorkerResumo;
  tempoProcessamentoMs: number;
  snapshotsProcessados: ConsigfacilSnapshot[];
};

export type BaseFinanceiraWorkerError = {
  type: "error";
  jobId: number;
  message: string;
  logs: string[];
  tempoProcessamentoMs: number;
};

export type BaseFinanceiraWorkerResponse =
  | BaseFinanceiraWorkerSuccess
  | BaseFinanceiraWorkerError;

export type BaseFinanceiraWorkerRequest = BaseFinanceiraWorkerBuildRequest;
