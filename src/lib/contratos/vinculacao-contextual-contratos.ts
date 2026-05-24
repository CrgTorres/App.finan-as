/**
 * Motor de vinculação contextual de contratos (folha × ConsigFácil × cadastro).
 * Protege contratos simultâneos do mesmo banco (Daycoval, BB, PAN).
 */

import type { Loan } from "@/types/contracheque";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import type { ConfigAuditoriaConsigfacil } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import {
  avaliarCompatibilidadeRubrica,
  extrairRubricaIdentificadorForte,
  PESO_SCORE_MATCH_RUBRICA_FORTE,
  rubricaIdentificadorForte,
} from "@/lib/contratos/rubrica-identificador-forte";
import { validarEstruturaParcela } from "@/lib/contratos/validar-estrutura-parcela";
import type { StatusConciliacao } from "@/lib/conciliacao/conciliacao-financeira";
import type { EventoOperacionalConsignado } from "@/lib/consigfacil/detectar-eventos-operacionais";
import { contratoTemJustificativaOperacional } from "@/lib/consigfacil/detectar-eventos-operacionais";

export type StatusConciliacaoOperacional =
  | StatusConciliacao
  | "congelada_operacionalmente"
  | "aguardando_recuperacao"
  | "suspensa_oficial";

export type DebugMatchContrato = {
  banco: string;
  rubrica: string | null;
  rubrica_identificador_forte: boolean;
  contrato: string;
  parcela: number;
  total: number;
  score: number;
  motivo_match: string;
  motivo_bloqueio_match: string | null;
  fusao_automatica_permitida: boolean;
  modo_forense_contratos: boolean;
};

export type ResultadoVinculacaoContextual = {
  score_bonus_rubrica: number;
  bloqueio_fusao_automatica: boolean;
  motivo_match: string;
  motivo_bloqueio_match: string | null;
  divergencia_estrutural: boolean;
  debug: DebugMatchContrato;
};

const STATUS_OPERACIONAL_CONGELA = new Set([
  "suspenso",
  "importado",
  "desconhecido",
]);

function normalizarCodigo(c: string | null | undefined): string {
  return (c ?? "").replace(/\D+/g, "").trim();
}

function divergenciaEstrutural(
  a: ConsigfacilContrato,
  b: ConsigfacilContrato,
): { diverge: boolean; motivos: string[] } {
  const motivos: string[] = [];

  const rub = avaliarCompatibilidadeRubrica(a.texto_bruto, b.texto_bruto, a.codigo_instituicao, b.codigo_instituicao);
  if (!rub.compativel && rub.motivo_bloqueio) motivos.push(rub.motivo_bloqueio);

  const codA = normalizarCodigo(a.codigo_instituicao);
  const codB = normalizarCodigo(b.codigo_instituicao);
  if (codA && codB && codA !== codB) {
    motivos.push(`Código instituição diverge (${codA} vs ${codB}).`);
  }

  if (
    a.parcelas_total > 0 &&
    b.parcelas_total > 0 &&
    a.parcelas_total !== b.parcelas_total &&
    Math.abs((a.parcela_atual ?? 0) - (b.parcela_atual ?? 0)) <= 2
  ) {
    motivos.push(
      `Parcelas totais diferentes (${a.parcelas_total} vs ${b.parcelas_total}) com sequência próxima.`,
    );
  }

  const va = validarEstruturaParcela(a.parcela_atual ?? 0, a.parcelas_total);
  const vb = validarEstruturaParcela(b.parcela_atual ?? 0, b.parcelas_total);
  if (va.ocr_invalido) motivos.push(`OCR inválido contrato A: ${va.motivo}`);
  if (vb.ocr_invalido) motivos.push(`OCR inválido contrato B: ${vb.motivo}`);

  return { diverge: motivos.length > 0, motivos };
}

export function modoForenseContratosAtivo(
  config?: Pick<ConfigAuditoriaConsigfacil, "modo_forense_contratos">,
): boolean {
  return config?.modo_forense_contratos ?? true;
}

/**
 * Mesmo banco + valor próximo NÃO autoriza refinanciamento.
 * Exige código, rubrica forte igual, vínculo oficial ou sequência temporal coerente.
 */
export function temVinculoEstruturalParaRefinanciamento(
  antigo: ConsigfacilContrato,
  novo: ConsigfacilContrato,
): { ok: boolean; motivo: string } {
  if (antigo.id_consignacao === novo.id_consignacao) {
    return { ok: false, motivo: "Mesmo id_consignacao." };
  }

  if (novo.contrato_substituido === antigo.id_consignacao || antigo.contrato_substituido === novo.id_consignacao) {
    return { ok: true, motivo: "Vínculo oficial de substituição entre contratos." };
  }

  const codA = normalizarCodigo(antigo.codigo_instituicao);
  const codB = normalizarCodigo(novo.codigo_instituicao);
  if (codA && codB && codA === codB) {
    return { ok: true, motivo: "Mesmo código de instituição." };
  }

  const rubA = extrairRubricaIdentificadorForte(antigo.texto_bruto, antigo.codigo_instituicao);
  const rubB = extrairRubricaIdentificadorForte(novo.texto_bruto, novo.codigo_instituicao);
  if (rubA && rubB && rubA === rubB) {
    return { ok: true, motivo: `Mesma rubrica forte (${rubA}).` };
  }

  const sequenciaCoerente =
    antigo.parcelas_total > 0 &&
    novo.parcelas_total > 0 &&
    (antigo.parcela_atual ?? 0) >= antigo.parcelas_total * 0.9 &&
    (novo.parcela_atual ?? 0) <= 3 &&
    antigo.data_contrato <= novo.data_contrato;
  if (sequenciaCoerente && (rubA == null || rubB == null || rubA === rubB)) {
    return { ok: true, motivo: "Sequência temporal coerente (encerramento → reinício de parcelas)." };
  }

  return {
    ok: false,
    motivo:
      "Sem vínculo estrutural (código, rubrica forte, contrato substituído ou sequência temporal). Mesmo banco/valor próximo não bastam.",
  };
}

export function permitirFusaoAutomaticaContratos(input: {
  contrato?: ConsigfacilContrato;
  loan?: Loan;
  config?: ConfigAuditoriaConsigfacil;
  outroContrato?: ConsigfacilContrato;
}): boolean {
  const { contrato, loan, config, outroContrato } = input;
  const forense = modoForenseContratosAtivo(config);

  if (contrato && outroContrato) {
    const div = divergenciaEstrutural(contrato, outroContrato);
    if (div.diverge) return false;
  }

  if (contrato && loan) {
    const rub = avaliarCompatibilidadeRubrica(
      contrato.texto_bruto,
      loan.description ?? loan.institution_name,
      contrato.codigo_instituicao,
      loan.rubrica_code,
    );
    if (!rub.compativel) return false;

    const vp = validarEstruturaParcela(contrato.parcela_atual ?? 0, contrato.parcelas_total);
    const vl = validarEstruturaParcela(loan.paid_installments ?? 0, loan.total_installments ?? 0);
    if (vp.ocr_invalido || vl.ocr_invalido) return false;

    if (forense && rub.rubrica_identificador_forte && !rub.compativel) return false;
  }

  return true;
}

export function avaliarVinculacaoContextualContrato(input: {
  contrato: ConsigfacilContrato;
  loan?: Loan | null;
  config?: ConfigAuditoriaConsigfacil;
  scoreBase?: number;
}): ResultadoVinculacaoContextual {
  const { contrato, loan, config, scoreBase = 0 } = input;
  const forense = modoForenseContratosAtivo(config);
  const banco = contrato.instituicao;
  const rubrica = extrairRubricaIdentificadorForte(contrato.texto_bruto, contrato.codigo_instituicao);
  const vp = validarEstruturaParcela(contrato.parcela_atual ?? 0, contrato.parcelas_total);

  let bloqueio = false;
  let motivo_bloqueio: string | null = null;
  let bonusRubrica = 0;
  let motivo_match = vp.motivo;

  if (loan) {
    const rub = avaliarCompatibilidadeRubrica(
      contrato.texto_bruto,
      loan.description ?? loan.institution_name,
      contrato.codigo_instituicao,
      loan.rubrica_code,
    );
    if (rub.rubrica_identificador_forte && rub.compativel) {
      bonusRubrica = PESO_SCORE_MATCH_RUBRICA_FORTE;
      motivo_match = `Rubrica forte compatível (${rub.rubrica_a ?? rub.rubrica_b}).`;
    }
    if (!rub.compativel) {
      bloqueio = true;
      motivo_bloqueio = rub.motivo_bloqueio;
      motivo_match = rub.motivo_bloqueio ?? motivo_match;
    }
  } else if (rubrica) {
    bonusRubrica = 0;
    motivo_match = `Rubrica forte identificada (${rubrica}); aguardando vínculo com cadastro.`;
  }

  if (vp.ocr_invalido) {
    bloqueio = true;
    motivo_bloqueio = vp.motivo;
    motivo_match = vp.motivo;
  }

  const divergencia_estrutural = bloqueio || (forense && rubrica != null && !loan);

  if (forense && divergencia_estrutural && !motivo_bloqueio) {
    motivo_bloqueio = "Modo forense: divergência estrutural — fusão automática bloqueada.";
    bloqueio = true;
  }

  const score = Math.min(100, scoreBase + bonusRubrica);

  return {
    score_bonus_rubrica: bonusRubrica,
    bloqueio_fusao_automatica: bloqueio,
    motivo_match,
    motivo_bloqueio_match: motivo_bloqueio,
    divergencia_estrutural,
    debug: {
      banco,
      rubrica,
      rubrica_identificador_forte: rubricaIdentificadorForte(contrato.texto_bruto, contrato.codigo_instituicao),
      contrato: contrato.id_consignacao,
      parcela: vp.parcela_atual,
      total: vp.total_parcelas,
      score,
      motivo_match,
      motivo_bloqueio_match: motivo_bloqueio,
      fusao_automatica_permitida: !bloqueio,
      modo_forense_contratos: forense,
    },
  };
}

/** Status de conciliação quando há suspensão/bloqueio operacional oficial. */
export function resolverStatusConciliacaoOperacional(
  contrato: ConsigfacilContrato,
  eventos: EventoOperacionalConsignado[] = [],
): StatusConciliacaoOperacional {
  const justificativa = contratoTemJustificativaOperacional(eventos, contrato);
  const st = (contrato.status ?? "").toLowerCase();
  const sit = (contrato.situacao_importacao ?? "").toLowerCase();

  if (st === "suspenso" || /\bsuspens/i.test(sit)) {
    return "suspensa_oficial";
  }
  if (/\bbloquead/i.test(sit) || st === "importado" && /\bbloque/i.test(contrato.observacao ?? "")) {
    return "congelada_operacionalmente";
  }
  if (justificativa || eventos.some((e) => e.tipo === "desconto_recuperado" && e.contrato === contrato.id_consignacao)) {
    return "aguardando_recuperacao";
  }
  if (STATUS_OPERACIONAL_CONGELA.has(st) && justificativa) {
    return "congelada_operacionalmente";
  }

  return "nao_conciliado";
}

export function competenciaCongeladaParaAnalise(
  status: StatusConciliacaoOperacional,
): boolean {
  return (
    status === "congelada_operacionalmente" ||
    status === "aguardando_recuperacao" ||
    status === "suspensa_oficial"
  );
}

/** Proteção Daycoval / PAN / BB: contratos distintos no mesmo banco. */
export function contratosDistintosMesmoBanco(
  a: ConsigfacilContrato,
  b: ConsigfacilContrato,
): boolean {
  if (a.id_consignacao === b.id_consignacao) return false;
  const div = divergenciaEstrutural(a, b);
  return div.diverge;
}
