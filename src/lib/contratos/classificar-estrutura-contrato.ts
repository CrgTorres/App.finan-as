/**
 * Separação definitiva: histórico financeiro (TIPO A) vs estrutura contratual oficial (TIPO B).
 *
 * Prioridade do motor: ConsigFácil > Contracheque moderno (PARC) > Contrato PDF > Ficha financeira
 */

import type { Loan, Payslip, PayslipItem } from "@/types/contracheque";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import { extrairParcelaConsignado } from "@/lib/anexos/parcela-consignado";
import { validarEstruturaParcela } from "@/lib/contratos/validar-estrutura-parcela";
import {
  avaliarCompatibilidadeRubrica,
  extrairRubricaIdentificadorForte,
} from "@/lib/contratos/rubrica-identificador-forte";
import { temVinculoEstruturalParaRefinanciamento } from "@/lib/contratos/vinculacao-contextual-contratos";

export type TipoEstruturaContrato = "historico" | "estrutural";

export type FonteEstruturaContrato =
  | "consigfacil"
  | "contracheque_moderno"
  | "contrato_pdf"
  | "ficha_financeira"
  | "inferencia_historica"
  | "extrato_bancario"
  | "ocr_legado";

export type ClassificacaoEstruturaContrato = {
  tipo_estrutura: TipoEstruturaContrato;
  fonte_estrutura_contrato: FonteEstruturaContrato;
  /** 0..100 — bônus estrutural para score/match */
  confianca_estrutural: number;
  tem_parc_estrutural: boolean;
  mensagem_exibicao: string;
};

export const MENSAGEM_HISTORICO_SEM_ESTRUTURA =
  "Histórico identificado sem estrutura oficial de parcelas.";

const PRIORIDADE_FONTE: Record<FonteEstruturaContrato, number> = {
  consigfacil: 100,
  contracheque_moderno: 80,
  contrato_pdf: 70,
  ficha_financeira: 30,
  inferencia_historica: 20,
  extrato_bancario: 25,
  ocr_legado: 15,
};

const BONUS_ESTRUTURAL: Record<FonteEstruturaContrato, number> = {
  consigfacil: 60,
  contracheque_moderno: 40,
  contrato_pdf: 35,
  ficha_financeira: 20,
  inferencia_historica: 15,
  extrato_bancario: 15,
  ocr_legado: 10,
};

export function prioridadeFonteEstrutura(f: FonteEstruturaContrato): number {
  return PRIORIDADE_FONTE[f] ?? 0;
}

export function bonusConfiancaEstrutural(f: FonteEstruturaContrato): number {
  return BONUS_ESTRUTURAL[f] ?? 0;
}

function classificacaoEstrutural(
  fonte: FonteEstruturaContrato,
  temParc: boolean,
  mesesHistorico?: number,
): ClassificacaoEstruturaContrato {
  const tipo: TipoEstruturaContrato =
    fonte === "consigfacil" ||
    fonte === "contracheque_moderno" ||
    fonte === "contrato_pdf"
      ? "estrutural"
      : "historico";

  let confianca = bonusConfiancaEstrutural(fonte);
  if (fonte === "ficha_financeira") confianca = Math.min(confianca, 20);
  if (tipo === "estrutural" && temParc) confianca = Math.min(100, confianca + 5);

  const mensagem =
    tipo === "historico"
      ? mesesHistorico != null && mesesHistorico > 0
        ? `${MENSAGEM_HISTORICO_SEM_ESTRUTURA} (${mesesHistorico} meses detectados).`
        : MENSAGEM_HISTORICO_SEM_ESTRUTURA
      : temParc
        ? "Estrutura oficial de parcelas (PARC)."
        : "Estrutura contratual oficial sem PARC na folha.";

  return {
    tipo_estrutura: tipo,
    fonte_estrutura_contrato: fonte,
    confianca_estrutural: confianca,
    tem_parc_estrutural: temParc && tipo === "estrutural",
    mensagem_exibicao: mensagem,
  };
}

/** Mescla classificações pela prioridade do motor. */
export function mesclarClassificacaoEstrutura(
  candidatos: ClassificacaoEstruturaContrato[],
): ClassificacaoEstruturaContrato {
  if (candidatos.length === 0) {
    return classificacaoEstrutural("inferencia_historica", false);
  }
  const ord = [...candidatos].sort(
    (a, b) =>
      prioridadeFonteEstrutura(b.fonte_estrutura_contrato) -
      prioridadeFonteEstrutura(a.fonte_estrutura_contrato),
  );
  const top = ord[0];
  if (top.tipo_estrutura === "estrutural") return top;
  const estrutural = ord.find((c) => c.tipo_estrutura === "estrutural");
  return estrutural ?? top;
}

export function classificarConsigfacilContrato(
  c: ConsigfacilContrato,
): ClassificacaoEstruturaContrato {
  const v = validarEstruturaParcela(c.parcela_atual ?? 0, c.parcelas_total);
  const ocrInv = (c as { parcela_ocr_invalida?: boolean }).parcela_ocr_invalida;
  return classificacaoEstrutural("consigfacil", v.valido && !ocrInv);
}

function payslipEhModernoComParc(p: Payslip, rubrica?: string | null, codigo?: string | null): boolean {
  const dk = String(p.document_kind ?? "").toLowerCase();
  const emit = p.folha_emit_kind ?? "mensal_principal";
  if (dk === "ficha_financeira" || emit === "ficha_import") {
    return false;
  }

  for (const it of p.items ?? []) {
    if (it.type !== "desconto") continue;
    const rub = avaliarCompatibilidadeRubrica(
      it.description,
      rubrica ?? it.description,
      it.code,
      codigo,
    );
    if (rubrica && !rub.compativel && rub.motivo_bloqueio) continue;

    const parc = extrairParcelaConsignado(it.description);
    const pa = parc.parcelaAtual ?? 0;
    const pt = parc.parcelaTotal ?? 0;
    if (pa > 0 && pt > 0) {
      const val = validarEstruturaParcela(pa, pt);
      if (val.valido) return true;
    }
    if (it.parcelaAtual && it.parcelaTotal && it.parcelaAtual > 0 && it.parcelaTotal > 0) {
      const val = validarEstruturaParcela(it.parcelaAtual, it.parcelaTotal);
      if (val.valido) return true;
    }
  }
  return false;
}

export function classificarLoanEstrutura(input: {
  loan: Loan;
  consigfacil?: ConsigfacilContrato | null;
  payslips?: Payslip[];
  mesesHistorico?: number;
}): ClassificacaoEstruturaContrato {
  const candidatos: ClassificacaoEstruturaContrato[] = [];

  if (input.consigfacil) {
    candidatos.push(classificarConsigfacilContrato(input.consigfacil));
  }

  const origem = (input.loan.origem ?? "").toLowerCase();
  if (/contrato|pdf|evidencia|anexo/i.test(origem) || input.loan.status_analise_contracheque) {
    const temParc =
      (input.loan.paid_installments ?? 0) > 0 &&
      (input.loan.total_installments ?? 0) > 0 &&
      validarEstruturaParcela(
        input.loan.paid_installments ?? 0,
        input.loan.total_installments ?? 0,
      ).valido;
    candidatos.push(classificacaoEstrutural("contrato_pdf", temParc));
  }

  for (const ps of input.payslips ?? []) {
    if (payslipEhModernoComParc(ps, input.loan.description, input.loan.rubrica_code)) {
      candidatos.push(classificacaoEstrutural("contracheque_moderno", true));
      break;
    }
  }

  if (/ficha/i.test(origem)) {
    candidatos.push(
      classificacaoEstrutural("ficha_financeira", false, input.mesesHistorico),
    );
  }

  if (candidatos.length === 0) {
    const temParcLoan =
      (input.loan.total_installments ?? 0) > 0 &&
      validarEstruturaParcela(
        input.loan.paid_installments ?? 0,
        input.loan.total_installments ?? 0,
      ).valido;
    if (temParcLoan && !/ficha|infer/i.test(origem)) {
      candidatos.push(classificacaoEstrutural("ocr_legado", true));
    } else {
      candidatos.push(
        classificacaoEstrutural(
          "inferencia_historica",
          false,
          input.mesesHistorico,
        ),
      );
    }
  }

  return mesclarClassificacaoEstrutura(candidatos);
}

export function classificarDescontoAvulsoEstrutura(input: {
  descontos: BaseConciliadaLinha[];
  payslips?: Payslip[];
}): ClassificacaoEstruturaContrato {
  const meses = new Set(
    input.descontos
      .map((d) => d.competencia)
      .filter((c) => /^\d{4}-\d{2}$/.test(c ?? "")),
  ).size;

  const origemExtrato = input.descontos.some((d) => d.origem === "extrato_bancario");
  if (origemExtrato && !input.descontos.some((d) => d.origem === "contracheque")) {
    return classificacaoEstrutural("extrato_bancario", false, meses);
  }

  const desc = input.descontos[0]?.descricao_normalizada ?? "";
  for (const ps of input.payslips ?? []) {
    if (payslipEhModernoComParc(ps, desc, null)) {
      return classificacaoEstrutural("contracheque_moderno", true);
    }
  }

  const algumaFicha = (input.payslips ?? []).some((p) =>
    String(p.document_kind ?? "").toLowerCase().includes("ficha"),
  );
  if (algumaFicha) {
    return classificacaoEstrutural("ficha_financeira", false, meses);
  }

  return classificacaoEstrutural("inferencia_historica", false, meses);
}

export type EntidadeComEstrutura = {
  tipo_estrutura: TipoEstruturaContrato;
  fonte_estrutura_contrato: FonteEstruturaContrato;
  confianca_estrutural: number;
  tem_parc_estrutural: boolean;
  mensagem_estrutura: string;
};

export function anexarClassificacaoEstrutura<T extends object>(
  ent: T,
  cls: ClassificacaoEstruturaContrato,
): T & EntidadeComEstrutura {
  return {
    ...ent,
    tipo_estrutura: cls.tipo_estrutura,
    fonte_estrutura_contrato: cls.fonte_estrutura_contrato,
    confianca_estrutural: cls.confianca_estrutural,
    tem_parc_estrutural: cls.tem_parc_estrutural,
    mensagem_estrutura: cls.mensagem_exibicao,
  };
}

/** Refinanciamento só entre entidades estruturais com vínculo válido. */
export function permiteRefinanciamentoEstrutural(
  antigo: ConsigfacilContrato & Partial<EntidadeComEstrutura>,
  novo: ConsigfacilContrato & Partial<EntidadeComEstrutura>,
): { ok: boolean; motivo: string } {
  const ta = antigo.tipo_estrutura ?? "estrutural";
  const tn = novo.tipo_estrutura ?? "estrutural";
  if (ta !== "estrutural" || tn !== "estrutural") {
    return {
      ok: false,
      motivo: "Refinanciamento bloqueado: um dos contratos é histórico (sem estrutura oficial).",
    };
  }

  const ocrA = (antigo as { ocr_parcela_invalida?: boolean }).ocr_parcela_invalida;
  const ocrN = (novo as { ocr_parcela_invalida?: boolean }).ocr_parcela_invalida;
  if (ocrA || ocrN) {
    return { ok: false, motivo: "Refinanciamento bloqueado: OCR de parcela inválido." };
  }

  const rubA = extrairRubricaIdentificadorForte(antigo.texto_bruto, antigo.codigo_instituicao);
  const rubB = extrairRubricaIdentificadorForte(novo.texto_bruto, novo.codigo_instituicao);
  if (rubA && rubB && rubA !== rubB) {
    return {
      ok: false,
      motivo: `Rubricas fortes distintas (${rubA} vs ${rubB}) — contratos simultâneos.`,
    };
  }

  return temVinculoEstruturalParaRefinanciamento(antigo, novo);
}

/** Divergência contratual não se aplica a histórico. */
export function geraDivergenciaContratual(cls: ClassificacaoEstruturaContrato): boolean {
  return cls.tipo_estrutura === "estrutural";
}

export function parcelasParaExibicao(input: {
  tipo_estrutura: TipoEstruturaContrato;
  parcela_atual: number;
  parcelas_total: number;
  meses_detectados: number;
}): { texto: string; exibir_parc: boolean } {
  if (input.tipo_estrutura === "historico") {
    const n = input.meses_detectados;
    return {
      texto: n > 0 ? `${n} meses detectados` : MENSAGEM_HISTORICO_SEM_ESTRUTURA,
      exibir_parc: false,
    };
  }
  if (input.parcelas_total > 0) {
    return {
      texto: `${input.parcela_atual}/${input.parcelas_total} parcelas`,
      exibir_parc: true,
    };
  }
  return { texto: "—", exibir_parc: false };
}

export function rotuloBadgeEstrutura(cls: ClassificacaoEstruturaContrato): {
  rotulo: string;
  variant: "historico" | "estrutural" | "consigfacil";
} {
  if (cls.fonte_estrutura_contrato === "consigfacil") {
    return { rotulo: "ConsigFácil oficial", variant: "consigfacil" };
  }
  if (cls.tipo_estrutura === "estrutural") {
    return { rotulo: "Estrutural oficial", variant: "estrutural" };
  }
  return { rotulo: "Histórico", variant: "historico" };
}

/** Aplica classificação em lote a contratos ConsigFácil. */
export function classificarContratosConsigfacil(
  contratos: ConsigfacilContrato[],
): Array<ConsigfacilContrato & EntidadeComEstrutura> {
  return contratos.map((c) => anexarClassificacaoEstrutura(c, classificarConsigfacilContrato(c)));
}

/** Aplica classificação em lote a loans. */
export function classificarLoansEstrutura(input: {
  loans: Loan[];
  consigfacilPorId: Map<string, ConsigfacilContrato>;
  vinculoLoanConsigfacil: Map<string, string>;
  payslips?: Payslip[];
  mesesPorLoanId?: Map<string, number>;
}): Array<Loan & EntidadeComEstrutura> {
  return input.loans.map((loan) => {
    const idCf = input.vinculoLoanConsigfacil.get(loan.id);
    const cf = idCf ? input.consigfacilPorId.get(idCf) : undefined;
    const cls = classificarLoanEstrutura({
      loan,
      consigfacil: cf,
      payslips: input.payslips,
      mesesHistorico: input.mesesPorLoanId?.get(loan.id),
    });
    return anexarClassificacaoEstrutura(loan, cls);
  });
}

export function reprocessarClassificacaoEstruturaBase(input: {
  contratos: ConsigfacilContrato[];
  loans: Loan[];
  payslips?: Payslip[];
  vinculoLoanConsigfacil?: Map<string, string>;
  mesesPorLoanId?: Map<string, number>;
}): {
  contratos: Array<ConsigfacilContrato & EntidadeComEstrutura>;
  loans: Array<Loan & EntidadeComEstrutura>;
} {
  const vinc = input.vinculoLoanConsigfacil ?? new Map<string, string>();
  const contratos = classificarContratosConsigfacil(input.contratos);
  const porId = new Map(contratos.map((c) => [c.id_consignacao, c]));
  const loans = classificarLoansEstrutura({
    loans: input.loans,
    consigfacilPorId: porId,
    vinculoLoanConsigfacil: vinc,
    payslips: input.payslips,
    mesesPorLoanId: input.mesesPorLoanId,
  });
  return { contratos, loans };
}
