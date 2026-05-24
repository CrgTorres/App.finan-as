import type { ContratoExtraido, NivelConfiancaLeitura, SugestaoVinculoContrato } from "@/types/contrato-extraido";
import type { AnaliseContratoEmprestimo } from "@/types/analise-contrato-emprestimo";
import type {
  AnaliseJuridicoFinanceiraContrato,
  StatusAnaliseJuridicaFinanceira,
  StatusConferenciaAnaliseJuridica,
} from "@/types/analise-juridico-financeira-contrato";

export type TipoEvidenciaEmprestimo =
  | "contrato_formal"
  | "extrato_bancario"
  | "autorizacao_desconto"
  | "comprovante_quitacao"
  | "decisao_judicial"
  | "taxa_seguro"
  | "outro";

/** Estado da conferência humana sobre leitura automática e vínculo. */
export type StatusConferenciaLeitura =
  | "pendente"
  /** Após upload com OCR/análise automática — aguarda conferência no Radar. */
  | "pendente_conferencia"
  | "confirmado"
  | "ajustado_manual"
  | "sem_vinculo"
  | "ignorado";

export interface LoanEvidence {
  id: string;
  user_id: string;
  loan_id: string | null;
  contrato_inferido_fingerprint: string | null;
  tipo_evidencia: TipoEvidenciaEmprestimo;
  nome_arquivo: string;
  storage_path: string;
  data_documento: string | null;
  observacao: string | null;
  created_at: string;
  /** Leitura automática (campos preenchidos após aplicar `patch_loan_evidences_leitura_automatica.sql`). */
  ocr_texto_bruto?: string | null;
  contrato_extraido?: ContratoExtraido | null;
  leitura_confianca_nivel?: NivelConfiancaLeitura | null;
  leitura_confianca_score?: number | null;
  vinculo_sugestoes?: SugestaoVinculoContrato[] | null;
  leitura_processada_em?: string | null;
  status_conferencia?: StatusConferenciaLeitura | null;
  conferencia_realizada_em?: string | null;
  conferencia_observacao?: string | null;
  /** Triagem jurídico-financeira (`patch_loan_evidences_analise_juridica.sql`). */
  analise_juridica_financeira?: AnaliseJuridicoFinanceiraContrato | null;
  analise_juridica_status?: StatusAnaliseJuridicaFinanceira | null;
  analise_juridica_conferencia?: StatusConferenciaAnaliseJuridica | null;
  analise_juridica_observacao?: string | null;
  /** Radar do Contrato — análise consolidada (`patch_loan_evidences_analise_contrato.sql`). */
  analise_contrato_emprestimo?: AnaliseContratoEmprestimo | null;
}
