/**
 * Motor estrutural de passivo consignável na folha.
 * Prioridade: estrutura (N/M, instituição, recorrência) > valor / proximidade / ConsigFácil isolado.
 */

import type { Loan } from "@/types/contracheque";
import type { PayslipItem } from "@/types/contracheque";
import { extrairParcelaConsignado, rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";
import {
  rubricaEhAmazonPrevFppm,
  rubricaEhImpostoRendaOuIrrf,
  rubricaEhPensaoAlimenticia,
  rubricaPareceConsignadoEmprestimo,
} from "@/lib/anexos/payslip-desconto-historico";
import { detectarInstituicaoNaDescricao } from "@/lib/reading/instituicoes-financeiras";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import {
  normalizarTextoRubricaConsignavel,
  rubricaEhContaConsumo,
} from "@/lib/conciliacao/regras-natureza-consignavel";

export const MIN_SCORE_ESTRUTURAL_CORRELACAO = 50;

export type TipoPassivo =
  | "consignado_real"
  | "cartao_consignado"
  | "folha_salarial"
  | "previdenciario"
  | "tributario"
  | "manutencao_judicial"
  | "receita"
  | "despesa_fixa"
  | "indefinido";

export type EntradaLinhaPassivo = {
  descricao?: string | null;
  codigo_rubrica?: string | null;
  /** Deve ser desconto na folha (não vantagem/receita). */
  natureza?: "desconto" | "receita" | "vantagem" | "emprestimo" | "cartao" | string | null;
  tipo_linha?: PayslipItem["type"] | null;
  categoria_canonica?: string | null;
  origem?: string | null;
  paid_installments?: number | null;
  total_installments?: number | null;
  parcela_atual?: number | null;
  parcela_total?: number | null;
  id_consignacao_consigfacil?: string | null;
  /** ConsigFácil já confirmou vínculo (match ≥ 90 ou flag explícita). */
  consigfacil_confirmado?: boolean;
};

export type ResultadoIdentificacaoPassivo = {
  consignavel: boolean;
  motivo: string;
  tipo_passivo: TipoPassivo;
  score_estrutural: number;
  em_descontos: boolean;
  tem_parcela_nm: boolean;
  tem_instituicao_financeira: boolean;
  tem_recorrencia_estrutural: boolean;
  tem_contrato_ou_id: boolean;
  parcela_atual: number | null;
  parcela_total: number | null;
  instituicao_detectada: string | null;
  chave_recorrencia: string | null;
  detalhe_score: {
    parcela_nm: number;
    instituicao: number;
    recorrencia: number;
    consigfacil: number;
  };
};

const RE_FOLHA_SALARIAL =
  /\b(SOLDO|ETAPAS|GRATIF|GRAT\.|REAJ|REAJUSTE|DIF\.?\s*REAJ|ADICIONAL|FERIAS|13\s*SAL|DECIMO|ABONO|VANTAG)\b/i;

const RE_CARTAO_CONSIGNADO = /\b(RMC|RCC|CART[AÃ]O\s*(BENEF|CRED|CONSIG)|MARGEM\s*CART)\b/i;

function textoDescricao(entrada: EntradaLinhaPassivo): string {
  return (entrada.descricao ?? "").trim();
}

function linhaEmDescontos(entrada: EntradaLinhaPassivo): boolean {
  if (entrada.tipo_linha === "desconto") return true;
  if (entrada.natureza === "desconto") return true;
  if (entrada.categoria_canonica?.includes("desconto")) return true;
  if (entrada.origem === "contracheque") {
    const n = normalizarTextoRubricaConsignavel(textoDescricao(entrada));
    if (n.includes("DESCONTO")) return true;
    return true;
  }
  if (entrada.natureza === "receita" || entrada.natureza === "vantagem") return false;
  if (entrada.tipo_linha === "vantagem") return false;
  return entrada.natureza !== "receita" && entrada.natureza !== "vantagem";
}

export function classificarTipoPassivo(
  descricao: string,
  opts?: { temParcelaNm?: boolean; codigo_rubrica?: string | null },
): TipoPassivo {
  const d = descricao.trim();
  if (!d) return "indefinido";
  if (rubricaEhContaConsumo(d)) return "despesa_fixa";
  if (rubricaEhImpostoRendaOuIrrf(d)) return "tributario";
  if (rubricaEhAmazonPrevFppm(d)) return "previdenciario";
  if (rubricaEhPensaoAlimenticia(d)) return "manutencao_judicial";
  if (RE_FOLHA_SALARIAL.test(d)) return "folha_salarial";
  const n = normalizarTextoRubricaConsignavel(d);
  if (/\b(PREV|PREVID|FGTS|INSS|AMAZONPREV)\b/.test(n)) return "previdenciario";
  if (/\b(IMPOSTO|IRRF|IR\s*PF|TRIBUTO)\b/.test(n)) return "tributario";
  if (RE_CARTAO_CONSIGNADO.test(d)) return "cartao_consignado";
  if (
    rubricaPareceConsignadoEmprestimo(d, {
      code: opts?.codigo_rubrica ?? undefined,
    }) ||
    opts?.temParcelaNm
  ) {
    return "consignado_real";
  }
  return "indefinido";
}

function extrairParcelasEntrada(entrada: EntradaLinhaPassivo): {
  atual: number | null;
  total: number | null;
} {
  if (
    entrada.parcela_atual != null &&
    entrada.parcela_total != null &&
    entrada.parcela_atual >= 1 &&
    entrada.parcela_total >= 1
  ) {
    return { atual: entrada.parcela_atual, total: entrada.parcela_total };
  }
  const par = extrairParcelaConsignado(textoDescricao(entrada));
  return {
    atual: par.parcelaAtual ?? null,
    total: par.parcelaTotal ?? null,
  };
}

function temInstituicaoFinanceiraValida(descricao: string): string | null {
  const det = detectarInstituicaoNaDescricao(descricao);
  if (det?.nome) {
    const oficial = resolverInstituicaoOficial(det.nome);
    if (oficial) return oficial.nome_oficial;
    return det.nome;
  }
  if (rubricaPareceConsignadoEmprestimo(descricao)) {
    const base = rubricaSemParcelaParaChave(descricao);
    const m = /\b(BB-EMP|BANCOOB|DAYCOVAL|BIB|BMG|PANAMERICANO|CREDICESTA|CAIXA)\b/i.exec(base);
    if (m) return m[1];
  }
  return null;
}

function temRecorrenciaEstrutural(
  entrada: EntradaLinhaPassivo,
  parcelas: { atual: number | null; total: number | null },
  descricao: string,
): boolean {
  if (entrada.paid_installments != null && entrada.paid_installments >= 2) return true;
  if (parcelas.atual != null && parcelas.atual >= 2 && parcelas.total != null && parcelas.total >= 2) {
    return true;
  }
  if (parcelas.total != null && parcelas.total >= 2 && parcelas.atual != null && parcelas.atual >= 1) {
    return true;
  }
  if (entrada.consigfacil_confirmado || entrada.id_consignacao_consigfacil) return true;
  const cod = (entrada.codigo_rubrica ?? "").replace(/\D/g, "").slice(0, 4);
  if (cod.length === 4 && parcelas.total != null && parcelas.total >= 2) return true;
  if (/\b(EMP\d{2}|BB-EMP|BANCOOB|DAYCOVAL)\b/i.test(descricao) && parcelas.total != null) {
    return true;
  }
  return false;
}

function ehEmprestimoCartaoOuConsignado(tipo: TipoPassivo): boolean {
  return tipo === "consignado_real" || tipo === "cartao_consignado";
}

export function calcularScoreEstruturalPassivo(input: {
  tem_parcela_nm: boolean;
  tem_instituicao_financeira: boolean;
  tem_recorrencia_estrutural: boolean;
  consigfacil_confirmado: boolean;
}): { score: number; detalhe: ResultadoIdentificacaoPassivo["detalhe_score"] } {
  const detalhe = {
    parcela_nm: input.tem_parcela_nm ? 40 : 0,
    instituicao: input.tem_instituicao_financeira ? 30 : 0,
    recorrencia: input.tem_recorrencia_estrutural ? 20 : 0,
    consigfacil: input.consigfacil_confirmado ? 10 : 0,
  };
  const score =
    detalhe.parcela_nm + detalhe.instituicao + detalhe.recorrencia + detalhe.consigfacil;
  return { score: Math.min(100, score), detalhe };
}

/**
 * Identifica se a linha é passivo consignável real na folha (DESCONTOS + estrutura).
 * Valor próximo sem N/M/instituição → `consignavel: false`.
 */
export function identificarPassivoConsignavelEstrutural(
  entrada: EntradaLinhaPassivo,
): ResultadoIdentificacaoPassivo {
  const descricao = textoDescricao(entrada);
  if (rubricaEhContaConsumo(descricao)) {
    return {
      consignavel: false,
      motivo: "conta_consumo_fora_consignavel",
      tipo_passivo: "despesa_fixa",
      score_estrutural: 0,
      em_descontos: linhaEmDescontos(entrada),
      tem_parcela_nm: false,
      tem_instituicao_financeira: false,
      tem_recorrencia_estrutural: false,
      tem_contrato_ou_id: false,
      parcela_atual: null,
      parcela_total: null,
      instituicao_detectada: null,
      chave_recorrencia: null,
      detalhe_score: { parcela_nm: 0, instituicao: 0, recorrencia: 0, consigfacil: 0 },
    };
  }
  const em_descontos = linhaEmDescontos(entrada);
  const parcelas = extrairParcelasEntrada(entrada);
  const tem_parcela_nm =
    parcelas.atual != null &&
    parcelas.total != null &&
    parcelas.atual >= 1 &&
    parcelas.total >= 1 &&
    parcelas.atual <= parcelas.total;
  const instituicao = temInstituicaoFinanceiraValida(descricao);
  const tem_instituicao_financeira = Boolean(instituicao);
  const tem_contrato_ou_id = Boolean(
    entrada.id_consignacao_consigfacil?.trim() ||
      /\bcontrato\b/i.test(descricao) ||
      /\d{6,}/.test(descricao),
  );
  const tipo_passivo = classificarTipoPassivo(descricao, {
    temParcelaNm: tem_parcela_nm,
    codigo_rubrica: entrada.codigo_rubrica,
  });
  const tem_recorrencia_estrutural = temRecorrenciaEstrutural(entrada, parcelas, descricao);
  const consigfacil_confirmado = Boolean(entrada.consigfacil_confirmado);

  const { score: score_estrutural, detalhe: detalhe_score } = calcularScoreEstruturalPassivo({
    tem_parcela_nm,
    tem_instituicao_financeira,
    tem_recorrencia_estrutural,
    consigfacil_confirmado,
  });

  const chave_recorrencia =
    descricao.length > 0
      ? `${(entrada.codigo_rubrica ?? "").slice(0, 4)}|${rubricaSemParcelaParaChave(descricao)}`
      : null;

  const estruturaMinima =
    tem_parcela_nm || tem_instituicao_financeira || tem_contrato_ou_id;

  if (!em_descontos) {
    return {
      consignavel: false,
      motivo: "rubrica_folha_nao_consignavel",
      tipo_passivo,
      score_estrutural,
      em_descontos: false,
      tem_parcela_nm,
      tem_instituicao_financeira,
      tem_recorrencia_estrutural,
      tem_contrato_ou_id,
      parcela_atual: parcelas.atual,
      parcela_total: parcelas.total,
      instituicao_detectada: instituicao,
      chave_recorrencia,
      detalhe_score,
    };
  }

  if (!estruturaMinima) {
    return {
      consignavel: false,
      motivo: "rubrica_folha_nao_consignavel",
      tipo_passivo,
      score_estrutural,
      em_descontos: true,
      tem_parcela_nm,
      tem_instituicao_financeira,
      tem_recorrencia_estrutural,
      tem_contrato_ou_id,
      parcela_atual: parcelas.atual,
      parcela_total: parcelas.total,
      instituicao_detectada: instituicao,
      chave_recorrencia,
      detalhe_score,
    };
  }

  if (!tem_recorrencia_estrutural) {
    return {
      consignavel: false,
      motivo: "rubrica_folha_nao_consignavel",
      tipo_passivo,
      score_estrutural,
      em_descontos: true,
      tem_parcela_nm,
      tem_instituicao_financeira,
      tem_recorrencia_estrutural: false,
      tem_contrato_ou_id,
      parcela_atual: parcelas.atual,
      parcela_total: parcelas.total,
      instituicao_detectada: instituicao,
      chave_recorrencia,
      detalhe_score,
    };
  }

  if (!ehEmprestimoCartaoOuConsignado(tipo_passivo)) {
    return {
      consignavel: false,
      motivo: "rubrica_folha_nao_consignavel",
      tipo_passivo,
      score_estrutural,
      em_descontos: true,
      tem_parcela_nm,
      tem_instituicao_financeira,
      tem_recorrencia_estrutural,
      tem_contrato_ou_id,
      parcela_atual: parcelas.atual,
      parcela_total: parcelas.total,
      instituicao_detectada: instituicao,
      chave_recorrencia,
      detalhe_score,
    };
  }

  return {
    consignavel: true,
    motivo: "passivo_consignavel_estrutural",
    tipo_passivo,
    score_estrutural,
    em_descontos: true,
    tem_parcela_nm,
    tem_instituicao_financeira,
    tem_recorrencia_estrutural,
    tem_contrato_ou_id,
    parcela_atual: parcelas.atual,
    parcela_total: parcelas.total,
    instituicao_detectada: instituicao,
    chave_recorrencia,
    detalhe_score,
  };
}

/** Gate de correlação ConsigFácil: exige score estrutural ≥ 50 (valor sozinho não basta). */
export function elegivelCorrelacaoPassivoConsignavel(entrada: EntradaLinhaPassivo): boolean {
  const r = identificarPassivoConsignavelEstrutural(entrada);
  return r.consignavel && r.score_estrutural >= MIN_SCORE_ESTRUTURAL_CORRELACAO;
}

export function entradaPassivoDeLoan(
  loan: Loan,
  opts?: {
    competencia?: string | null;
    id_consignacao_consigfacil?: string | null;
    consigfacil_confirmado?: boolean;
  },
): EntradaLinhaPassivo {
  return {
    descricao: loan.description ?? loan.institution_name,
    codigo_rubrica: loan.rubrica_code ?? null,
    natureza: "desconto",
    paid_installments: loan.paid_installments ?? null,
    total_installments: loan.total_installments ?? null,
    id_consignacao_consigfacil: opts?.id_consignacao_consigfacil ?? null,
    consigfacil_confirmado: opts?.consigfacil_confirmado ?? false,
  };
}

export function entradaPassivoDeLinhaBase(linha: BaseConciliadaLinha): EntradaLinhaPassivo {
  return {
    descricao: linha.descricao_original || linha.descricao_normalizada,
    natureza: linha.natureza === "desconto" ? "desconto" : linha.natureza,
    origem: linha.origem,
    categoria_canonica: linha.categoria_canonica,
  };
}

export function entradaPassivoDePayslipItem(it: PayslipItem): EntradaLinhaPassivo {
  return {
    descricao: it.description,
    codigo_rubrica: it.code ?? null,
    tipo_linha: it.type,
    natureza: it.type === "desconto" ? "desconto" : it.type,
    parcela_atual: it.parcelaAtual ?? null,
    parcela_total: it.parcelaTotal ?? null,
  };
}

export const ROTULO_TIPO_PASSIVO: Record<TipoPassivo, string> = {
  consignado_real: "Empréstimo consignado",
  cartao_consignado: "Cartão consignado",
  folha_salarial: "Folha salarial",
  previdenciario: "Previdenciário",
  tributario: "Tributário",
  manutencao_judicial: "Manutenção judicial",
  receita: "Receita",
  despesa_fixa: "Despesa fixa (conta de consumo)",
  indefinido: "Indefinido",
};
