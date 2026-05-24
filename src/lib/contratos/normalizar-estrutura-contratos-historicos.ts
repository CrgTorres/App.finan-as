/**
 * Saneamento estrutural de contratos históricos antes da triagem.
 * Corrige OCR invertido, aplica ConsigFácil oficial, desfaz fusões ilegais
 * e descarta refinanciamentos fracos — sem apagar valores originais.
 */

import type { Loan } from "@/types/contracheque";
import type { ConsigfacilContrato, ConsigfacilRefinanciamento } from "@/types/consigfacil";
import type { ConfigAuditoriaConsigfacil } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import { CONFIG_AUDITORIA_CONSIGFACIL_PADRAO } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import { scoreMatchContrato } from "@/lib/consignacoes-governo/score-match-contrato";
import {
  consolidarSnapshotsConsigfacil,
  reparseSnapshotsBrutos,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import {
  classificarContratosConsigfacil,
  classificarLoansEstrutura,
} from "@/lib/contratos/classificar-estrutura-contrato";
import { atualizarBaseComConsigfacil } from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";
import {
  contratosDistintosMesmoBanco,
  temVinculoEstruturalParaRefinanciamento,
} from "@/lib/contratos/vinculacao-contextual-contratos";
import { validarEstruturaParcela } from "@/lib/contratos/validar-estrutura-parcela";
import {
  avaliarCompatibilidadeRubrica,
  extrairRubricaIdentificadorForte,
} from "@/lib/contratos/rubrica-identificador-forte";
import type { PendenciaConferenciaReal } from "@/lib/consignacoes-governo/aplicar-auditoria-consigfacil";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import {
  STORAGE_TRIAGEM_RESOLVIDAS,
  STORAGE_TRIAGEM_PADROES,
} from "@/lib/triagem/aplicar-respostas-triagem";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type FonteCorrecaoParcela =
  | "ocr_invertido"
  | "consigfacil_oficial"
  | "sem_alteracao"
  | "ocr_invalido_mantido";

export type CamposSaneamentoEstrutural = {
  parcela_atual_original?: number;
  parcelas_total_original?: number;
  parcela_atual_corrigida?: number;
  parcelas_total_corrigida?: number;
  motivo_correcao_parcela?: string | null;
  fonte_correcao?: FonteCorrecaoParcela | null;
  ocr_parcela_invalida?: boolean;
  usar_para_refinanciamento_automatico?: boolean;
  refinanciamento_descartado_por_saneamento?: boolean;
  contrato_separado_por_saneamento?: boolean;
  saneamento_observacao?: string | null;
};

export type ContratoComSaneamentoEstrutural = ConsigfacilContrato & CamposSaneamentoEstrutural;

export type LoanComSaneamentoEstrutural = Loan & {
  paid_installments_original?: number;
  total_installments_original?: number;
  paid_installments_corrigida?: number;
  total_installments_corrigida?: number;
  motivo_correcao_parcela?: string | null;
  fonte_correcao?: FonteCorrecaoParcela | null;
  ocr_parcela_invalida?: boolean;
  usar_para_refinanciamento_automatico?: boolean;
};

export type LinhaSaneamentoEstrutural = {
  banco: string;
  contrato: string;
  rubrica: string | null;
  parcela_atual_original: number | null;
  parcelas_total_original: number | null;
  parcela_atual_corrigida: number | null;
  parcelas_total_corrigida: number | null;
  motivo_correcao: string | null;
  fonte_correcao: string | null;
  refinanciamento_descartado: string;
  contrato_separado: string;
  observacao: string | null;
  status: string;
  entidade: "consigfacil" | "loan";
};

export type PendenciaSaneamentoEstrutural = {
  id: string;
  tipo: "ocr_parcela_invalida" | "fusao_desfeita" | "estrutura_incoerente" | "refin_descartado";
  descricao: string;
  banco: string;
  rubrica: string | null;
  id_consignacao: string | null;
  loan_id: string | null;
  parcela_atual_original: number | null;
  parcelas_total_original: number | null;
};

export type ResumoSaneamentoEstrutural = {
  contratos_analisados: number;
  loans_analisados: number;
  parcelas_corrigidas: number;
  ocrs_invalidados: number;
  fusoes_desfeitas: number;
  refinanciamentos_descartados: number;
  caches_limpos: number;
  pendencias_tecnicas: number;
  pendencias_financeiras_removidas: number;
};

export type ResultadoNormalizacaoEstrutural = {
  contratos: ContratoComSaneamentoEstrutural[];
  loans: LoanComSaneamentoEstrutural[];
  refinanciamentos: ConsigfacilRefinanciamento[];
  linhas: LinhaSaneamentoEstrutural[];
  pendenciasTecnicas: PendenciaSaneamentoEstrutural[];
  resumo: ResumoSaneamentoEstrutural;
};

export type InputNormalizarEstruturaContratosHistoricos = {
  contratos: ConsigfacilContrato[];
  loans?: Loan[];
  refinanciamentos?: ConsigfacilRefinanciamento[];
  configAuditoria?: ConfigAuditoriaConsigfacil;
};

const STORAGE_SANEAMENTO_ULTIMO = "financaSaneamentoEstruturalUltimoV1";

const PADROES_OCR_INVERTIDO: Array<[number, number]> = [
  [120, 1],
  [72, 54],
  [48, 4],
];

const STORAGE_CACHES_TRIAGEM_LIMPAR = [
  "financaTriagemClustersResolvidosV1",
  "financaAuditoriaTriagemConsolidadaV1",
  "financaAprendizadoDivergenciasV1",
  "financaTriagemRespostasSupabaseFallbackV1",
] as const;

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizarBanco(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bbanco\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function diffValorPct(a: number, b: number): number {
  if (a <= 0 || b <= 0) return Infinity;
  return Math.abs(a - b) / Math.max(a, b);
}

function indicioOcrInvertidoClassico(atual: number, total: number): boolean {
  for (const [a, t] of PADROES_OCR_INVERTIDO) {
    if (atual === a && total === t) return true;
  }
  return atual > total && total > 0 && total <= 6 && atual >= 24;
}

function corrigirParcelasEntidade(
  parcelaAtual: number,
  parcelasTotal: number,
): {
  parcela_atual: number;
  parcelas_total: number;
  ocr_parcela_invalida: boolean;
  motivo: string;
  fonte: FonteCorrecaoParcela;
  corrigido: boolean;
} {
  const origA = parcelaAtual;
  const origT = parcelasTotal;
  const classico = indicioOcrInvertidoClassico(origA, origT);
  const v = validarEstruturaParcela(origA, origT);

  if (v.valido && !classico) {
    return {
      parcela_atual: v.parcela_atual,
      parcelas_total: v.total_parcelas,
      ocr_parcela_invalida: false,
      motivo: v.motivo,
      fonte: "sem_alteracao",
      corrigido: false,
    };
  }

  if (v.invertido_corrigido || classico) {
    return {
      parcela_atual: v.invertido_corrigido ? v.parcela_atual : origT,
      parcelas_total: v.invertido_corrigido ? v.total_parcelas : origA,
      ocr_parcela_invalida: false,
      motivo: classico
        ? `Padrão OCR clássico invertido (${origA}/${origT}).`
        : v.motivo,
      fonte: "ocr_invertido",
      corrigido: true,
    };
  }

  const tentativa = validarEstruturaParcela(origT, origA);
  if (tentativa.invertido_corrigido) {
    return {
      parcela_atual: tentativa.parcela_atual,
      parcelas_total: tentativa.total_parcelas,
      ocr_parcela_invalida: false,
      motivo: tentativa.motivo,
      fonte: "ocr_invertido",
      corrigido: true,
    };
  }

  return {
    parcela_atual: origA,
    parcelas_total: origT,
    ocr_parcela_invalida: true,
    motivo: v.motivo,
    fonte: "ocr_invalido_mantido",
    corrigido: false,
  };
}

function encontrarContratoOficialParaLoan(
  loan: Loan,
  contratos: ContratoComSaneamentoEstrutural[],
): ContratoComSaneamentoEstrutural | null {
  let melhor: { c: ContratoComSaneamentoEstrutural; score: number } | null = null;
  for (const c of contratos) {
    const sm = scoreMatchContrato({ contrato: c, loan });
    if (!sm || sm.faixa === "sem_match") continue;
    if (!melhor || sm.score > melhor.score) melhor = { c, score: sm.score };
  }
  if (!melhor || melhor.score < 70) return null;
  return melhor.c;
}

function aplicarConsigfacilOficialNoContrato(
  c: ContratoComSaneamentoEstrutural,
): ContratoComSaneamentoEstrutural {
  const corr = corrigirParcelasEntidade(c.parcela_atual ?? 0, c.parcelas_total);
  const out: ContratoComSaneamentoEstrutural = {
    ...c,
    parcela_atual_original: c.parcela_atual ?? undefined,
    parcelas_total_original: c.parcelas_total,
    parcela_atual_corrigida: corr.parcela_atual,
    parcelas_total_corrigida: corr.parcelas_total,
    motivo_correcao_parcela: corr.motivo,
    fonte_correcao: corr.fonte,
    ocr_parcela_invalida: corr.ocr_parcela_invalida,
    usar_para_refinanciamento_automatico: !corr.ocr_parcela_invalida,
    parcela_atual: corr.parcela_atual,
    parcelas_total: corr.parcelas_total,
  };
  return out;
}

function aplicarConsigfacilOficialNoLoan(
  loan: Loan,
  oficial: ContratoComSaneamentoEstrutural | null,
): LoanComSaneamentoEstrutural {
  const paid = loan.paid_installments ?? 0;
  const total = loan.total_installments ?? 0;
  const corr = corrigirParcelasEntidade(paid, total);

  let paidF = corr.parcela_atual;
  let totalF = corr.parcelas_total;
  let fonte: FonteCorrecaoParcela = corr.fonte;
  let motivo = corr.motivo;
  let ocrInvalido = corr.ocr_parcela_invalida;

  if (oficial && !oficial.ocr_parcela_invalida) {
    paidF = oficial.parcela_atual_corrigida ?? oficial.parcela_atual ?? paidF;
    totalF = oficial.parcelas_total_corrigida ?? oficial.parcelas_total;
    fonte = "consigfacil_oficial";
    motivo = `ConsigFácil oficial (${oficial.id_consignacao}) prevalece: ${paidF}/${totalF}.`;
    ocrInvalido = false;
  }

  return {
    ...loan,
    paid_installments_original: paid,
    total_installments_original: total,
    paid_installments_corrigida: paidF,
    total_installments_corrigida: totalF,
    motivo_correcao_parcela: motivo,
    fonte_correcao: fonte,
    ocr_parcela_invalida: ocrInvalido,
    usar_para_refinanciamento_automatico: !ocrInvalido,
    paid_installments: paidF,
    total_installments: totalF,
  };
}

function desfazerFusoesIlegais(
  contratos: ContratoComSaneamentoEstrutural[],
): { contratos: ContratoComSaneamentoEstrutural[]; fusoes: number } {
  const porBanco = new Map<string, ContratoComSaneamentoEstrutural[]>();
  for (const c of contratos) {
    const k = normalizarBanco(c.instituicao);
    const arr = porBanco.get(k) ?? [];
    arr.push(c);
    porBanco.set(k, arr);
  }

  let fusoes = 0;
  const idsSeparados = new Set<string>();

  for (const [, grupo] of porBanco) {
    if (grupo.length < 2) continue;
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const a = grupo[i];
        const b = grupo[j];
        if (a.id_consignacao === b.id_consignacao) continue;

        const rub = avaliarCompatibilidadeRubrica(
          a.texto_bruto,
          b.texto_bruto,
          a.codigo_instituicao,
          b.codigo_instituicao,
        );
        const codA = (a.codigo_instituicao ?? "").replace(/\D/g, "");
        const codB = (b.codigo_instituicao ?? "").replace(/\D/g, "");
        const codigoDiferente = codA && codB && codA !== codB;
        const totalDiferente =
          a.parcelas_total > 0 && b.parcelas_total > 0 && a.parcelas_total !== b.parcelas_total;
        const valorDiferente =
          a.valor_parcela > 0 &&
          b.valor_parcela > 0 &&
          diffValorPct(a.valor_parcela, b.valor_parcela) > 0.05;
        const coexistencia =
          a.competencia &&
          b.competencia &&
          a.status !== "quitado" &&
          b.status !== "quitado";

        const deveSeparar =
          (!rub.compativel && !!rub.motivo_bloqueio) ||
          codigoDiferente ||
          totalDiferente ||
          valorDiferente ||
          (coexistencia && contratosDistintosMesmoBanco(a, b));

        if (!deveSeparar) continue;

        idsSeparados.add(a.id_consignacao);
        idsSeparados.add(b.id_consignacao);
        fusoes++;
      }
    }
  }

  const atualizados = contratos.map((c) => {
    if (!idsSeparados.has(c.id_consignacao)) return c;
    return {
      ...c,
      contrato_separado_por_saneamento: true,
      eh_refinanciamento: false,
      contrato_substituido: null,
      saneamento_observacao:
        "Fusão automática desfeita: rubrica, código, parcelas ou valor indicam contratos distintos.",
    };
  });

  return { contratos: atualizados, fusoes };
}

function descartarRefinanciamentosFracos(
  contratos: ContratoComSaneamentoEstrutural[],
  refinanciamentos: ConsigfacilRefinanciamento[],
  config: ConfigAuditoriaConsigfacil,
): {
  refinanciamentos: ConsigfacilRefinanciamento[];
  descartados: number;
  contratos: ContratoComSaneamentoEstrutural[];
} {
  const porId = new Map(contratos.map((c) => [c.id_consignacao, c]));
  const manter: ConsigfacilRefinanciamento[] = [];
  const idsDescartados = new Set<string>();
  let descartados = 0;

  for (const r of refinanciamentos) {
    const antigo = porId.get(r.contrato_origem);
    const novo = porId.get(r.contrato_destino);
    if (!antigo || !novo) {
      manter.push(r);
      continue;
    }

    const vinculo = temVinculoEstruturalParaRefinanciamento(antigo, novo);
    const apenasFracos = r.evidencias_refinanciamento.every((e) =>
      /datas próximas|parcela reiniciada|vinculo_estrutural|mesmo banco|valor|parecido|fraco/i.test(
        e,
      ),
    );
    const semOficial = !r.evidencias_refinanciamento.some((e) =>
      /oficial|substitui|status|quitado|refinanciado/i.test(e),
    );

    if (
      config.refinanciamento.mesmo_banco_data_proxima_nao_basta &&
      (apenasFracos || !vinculo.ok) &&
      semOficial
    ) {
      descartados++;
      idsDescartados.add(antigo.id_consignacao);
      idsDescartados.add(novo.id_consignacao);
      continue;
    }
    manter.push(r);
  }

  const contratosAtualizados = contratos.map((c) => {
    if (!idsDescartados.has(c.id_consignacao)) return c;
    return {
      ...c,
      refinanciamento_descartado_por_saneamento: true,
      eh_refinanciamento: false,
      contrato_substituido: null,
      saneamento_observacao:
        (c.saneamento_observacao ?? "") +
        " Refinanciamento descartado: indícios fracos (mesmo banco/data/valor).",
    };
  });

  return { refinanciamentos: manter, descartados, contratos: contratosAtualizados };
}

function montarLinhaExportacao(
  entidade: "consigfacil" | "loan",
  banco: string,
  contratoId: string,
  rubrica: string | null,
  origA: number | null,
  origT: number | null,
  corrA: number | null,
  corrT: number | null,
  motivo: string | null,
  fonte: string | null,
  refinDesc: boolean,
  separado: boolean,
  observacao: string | null,
  status: string,
): LinhaSaneamentoEstrutural {
  return {
    banco,
    contrato: contratoId,
    rubrica,
    parcela_atual_original: origA,
    parcelas_total_original: origT,
    parcela_atual_corrigida: corrA,
    parcelas_total_corrigida: corrT,
    motivo_correcao: motivo,
    fonte_correcao: fonte,
    refinanciamento_descartado: refinDesc ? "sim" : "nao",
    contrato_separado: separado ? "sim" : "nao",
    observacao,
    status,
    entidade,
  };
}

/**
 * Normaliza estrutura de parcelas e vínculos antes da triagem.
 */
export function normalizarEstruturaContratosHistoricos(
  input: InputNormalizarEstruturaContratosHistoricos,
): ResultadoNormalizacaoEstrutural {
  const config = input.configAuditoria ?? CONFIG_AUDITORIA_CONSIGFACIL_PADRAO;
  const loansIn = input.loans ?? [];
  const refinIn = input.refinanciamentos ?? [];

  let contratos = input.contratos.map((c) =>
    aplicarConsigfacilOficialNoContrato(c as ContratoComSaneamentoEstrutural),
  );

  const { contratos: posFusao, fusoes } = desfazerFusoesIlegais(contratos);
  contratos = posFusao;

  const {
    refinanciamentos,
    descartados: refinDesc,
    contratos: posRefin,
  } = descartarRefinanciamentosFracos(contratos, refinIn, config);
  contratos = posRefin;

  const loans: LoanComSaneamentoEstrutural[] = loansIn.map((l) => {
    const oficial = encontrarContratoOficialParaLoan(l, contratos);
    return aplicarConsigfacilOficialNoLoan(l, oficial);
  });

  const linhas: LinhaSaneamentoEstrutural[] = [];
  const pendenciasTecnicas: PendenciaSaneamentoEstrutural[] = [];
  let parcelasCorrigidas = 0;
  let ocrsInvalidados = 0;

  for (const c of contratos) {
    const rubrica = extrairRubricaIdentificadorForte(c.texto_bruto, c.codigo_instituicao);
    const banco =
      resolverInstituicaoOficial(c.instituicao)?.nome_oficial ?? c.instituicao;
    const corrigido =
      c.parcela_atual_original !== c.parcela_atual_corrigida ||
      c.parcelas_total_original !== c.parcelas_total_corrigida;
    if (corrigido && c.fonte_correcao === "ocr_invertido") parcelasCorrigidas++;
    if (c.ocr_parcela_invalida) {
      ocrsInvalidados++;
      pendenciasTecnicas.push({
        id: `san-ocr-${c.id_consignacao}`,
        tipo: "ocr_parcela_invalida",
        descricao: c.motivo_correcao_parcela ?? "Estrutura de parcela inválida após saneamento.",
        banco,
        rubrica,
        id_consignacao: c.id_consignacao,
        loan_id: null,
        parcela_atual_original: c.parcela_atual_original ?? null,
        parcelas_total_original: c.parcelas_total_original ?? null,
      });
    }
    if (c.contrato_separado_por_saneamento) {
      pendenciasTecnicas.push({
        id: `san-fusao-${c.id_consignacao}`,
        tipo: "fusao_desfeita",
        descricao: c.saneamento_observacao ?? "Contrato separado por divergência estrutural.",
        banco,
        rubrica,
        id_consignacao: c.id_consignacao,
        loan_id: null,
        parcela_atual_original: c.parcela_atual_original ?? null,
        parcelas_total_original: c.parcelas_total_original ?? null,
      });
    }
    linhas.push(
      montarLinhaExportacao(
        "consigfacil",
        banco,
        c.id_consignacao,
        rubrica,
        c.parcela_atual_original ?? null,
        c.parcelas_total_original ?? null,
        c.parcela_atual_corrigida ?? null,
        c.parcelas_total_corrigida ?? null,
        c.motivo_correcao_parcela ?? null,
        c.fonte_correcao ?? null,
        !!c.refinanciamento_descartado_por_saneamento,
        !!c.contrato_separado_por_saneamento,
        c.saneamento_observacao ?? null,
        c.ocr_parcela_invalida ? "ocr_invalido" : corrigido ? "corrigido" : "ok",
      ),
    );
  }

  for (const l of loans) {
    const banco = l.institution_name ?? l.description ?? "—";
    const rubrica = l.rubrica_code ?? null;
    const corrigido =
      l.paid_installments_original !== l.paid_installments_corrigida ||
      l.total_installments_original !== l.total_installments_corrigida;
    if (corrigido) parcelasCorrigidas++;
    if (l.ocr_parcela_invalida) {
      ocrsInvalidados++;
      pendenciasTecnicas.push({
        id: `san-ocr-loan-${l.id}`,
        tipo: "ocr_parcela_invalida",
        descricao: l.motivo_correcao_parcela ?? "Parcela inválida no cadastro.",
        banco,
        rubrica,
        id_consignacao: null,
        loan_id: l.id,
        parcela_atual_original: l.paid_installments_original ?? null,
        parcelas_total_original: l.total_installments_original ?? null,
      });
    }
    linhas.push(
      montarLinhaExportacao(
        "loan",
        banco,
        l.id,
        rubrica,
        l.paid_installments_original ?? null,
        l.total_installments_original ?? null,
        l.paid_installments_corrigida ?? null,
        l.total_installments_corrigida ?? null,
        l.motivo_correcao_parcela ?? null,
        l.fonte_correcao ?? null,
        false,
        false,
        null,
        l.ocr_parcela_invalida ? "ocr_invalido" : corrigido ? "corrigido" : "ok",
      ),
    );
  }

  const resumo: ResumoSaneamentoEstrutural = {
    contratos_analisados: contratos.length,
    loans_analisados: loans.length,
    parcelas_corrigidas: parcelasCorrigidas,
    ocrs_invalidados: ocrsInvalidados,
    fusoes_desfeitas: fusoes,
    refinanciamentos_descartados: refinDesc,
    caches_limpos: 0,
    pendencias_tecnicas: pendenciasTecnicas.length,
    pendencias_financeiras_removidas: 0,
  };

  const resultado: ResultadoNormalizacaoEstrutural = {
    contratos,
    loans,
    refinanciamentos,
    linhas,
    pendenciasTecnicas,
    resumo,
  };

  const storage = ls();
  if (storage) {
    storage.setItem(
      STORAGE_SANEAMENTO_ULTIMO,
      JSON.stringify({ version: 1, gerado_em: new Date().toISOString(), ...resultado }),
    );
  }

  return resultado;
}

/** Remove caches de triagem contaminados; mantém respostas manuais confirmadas. */
export function limparCachesTriagemContratos(): { removidos: string[]; mantidos: string[] } {
  const storage = ls();
  if (!storage) {
    return { removidos: [], mantidos: [STORAGE_TRIAGEM_RESOLVIDAS, STORAGE_TRIAGEM_PADROES] };
  }

  const removidos: string[] = [];
  for (const key of STORAGE_CACHES_TRIAGEM_LIMPAR) {
    if (storage.getItem(key) != null) {
      storage.removeItem(key);
      removidos.push(key);
    }
  }

  return {
    removidos,
    mantidos: [STORAGE_TRIAGEM_RESOLVIDAS, STORAGE_TRIAGEM_PADROES],
  };
}

export function carregarUltimoSaneamentoEstrutural(): ResultadoNormalizacaoEstrutural | null {
  const storage = ls();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_SANEAMENTO_ULTIMO);
    if (!raw) return null;
    return JSON.parse(raw) as ResultadoNormalizacaoEstrutural;
  } catch {
    return null;
  }
}

function pendenciaCausadaPorOcrEstrutural(
  p: PendenciaConferenciaReal,
  idsOcrInvalido: Set<string>,
): boolean {
  if (!p.id_consignacao || !idsOcrInvalido.has(p.id_consignacao)) return false;
  const desc = p.descricao.toLowerCase();
  if (p.tipo === "divergencia_consigfacil_campo") {
    return /parcela|parcelas|120|ocr|estrutura|total de parcela/i.test(desc);
  }
  if (p.tipo === "match_baixo" || p.tipo === "divergencia_valor") {
    return /parcela|120\/1|1\/23|ocr|estrutura|cadastrado|consigf/i.test(desc);
  }
  return false;
}

/** Pendências financeiras causadas por OCR estrutural inválido → removidas da fila financeira. */
export function filtrarPendenciasFinanceirasPosSaneamento(
  pendencias: PendenciaConferenciaReal[],
  saneamento: ResultadoNormalizacaoEstrutural,
): { financeiras: PendenciaConferenciaReal[]; removidas: number } {
  const idsOcrInvalido = new Set(
    saneamento.contratos.filter((c) => c.ocr_parcela_invalida).map((c) => c.id_consignacao),
  );

  let removidas = 0;
  const financeiras = pendencias.filter((p) => {
    if (pendenciaCausadaPorOcrEstrutural(p, idsOcrInvalido)) {
      removidas++;
      return false;
    }
    return true;
  });

  return { financeiras, removidas };
}

export function linhasExportacaoSaneamentoEstrutural(
  linhas: LinhaSaneamentoEstrutural[],
): Array<Record<string, string | number | null>> {
  return linhas.map((l) => ({
    banco: l.banco,
    contrato: l.contrato,
    rubrica: l.rubrica,
    parcela_atual_original: l.parcela_atual_original,
    parcelas_total_original: l.parcelas_total_original,
    parcela_atual_corrigida: l.parcela_atual_corrigida,
    parcelas_total_corrigida: l.parcelas_total_corrigida,
    motivo_correcao: l.motivo_correcao,
    fonte_correcao: l.fonte_correcao,
    refinanciamento_descartado: l.refinanciamento_descartado,
    contrato_separado: l.contrato_separado,
    observacao: l.observacao,
    status: l.status,
    entidade: l.entidade,
  }));
}

export type ResultadoReprocessamentoSaneamentoCompleto = ResultadoNormalizacaoEstrutural & {
  matches: number;
  caches_limpos: string[];
};

/**
 * Cadeia completa: saneamento → vinculação → evento dashboard.
 * Triagem/clusters/priorização/fila são recalculados na UI ao recarregar a base.
 */
/** Reprocessa saneamento + classificação histórico/estrutural + vinculação. */
export function reprocessarClassificacaoEstruturaCompleta(
  input: Parameters<typeof reprocessarSaneamentoCompleto>[0] & { payslips?: import("@/types/contracheque").Payslip[] },
): ResultadoReprocessamentoSaneamentoCompleto {
  return reprocessarSaneamentoCompleto(input);
}

export function reprocessarSaneamentoCompleto(
  input: {
    snapshots: ConsigfacilSnapshot[];
    loans: Loan[];
    baseConciliada: BaseConciliadaLinha[];
    configAuditoria?: ConfigAuditoriaConsigfacil;
    payslips?: import("@/types/contracheque").Payslip[];
  },
  opts?: { emitirEventoDashboard?: boolean },
): ResultadoReprocessamentoSaneamentoCompleto {
  const config = input.configAuditoria ?? CONFIG_AUDITORIA_CONSIGFACIL_PADRAO;
  const cache = limparCachesTriagemContratos();

  const snaps = reparseSnapshotsBrutos(input.snapshots);
  const baseGov = consolidarSnapshotsConsigfacil(snaps, config);

  const saneamento = normalizarEstruturaContratosHistoricos({
    contratos: baseGov.contratos,
    loans: input.loans,
    refinanciamentos: baseGov.refinanciamentos,
    configAuditoria: config,
  });

  const contratosClass = classificarContratosConsigfacil(saneamento.contratos);
  const loansClass = classificarLoansEstrutura({
    loans: saneamento.loans,
    consigfacilPorId: new Map(contratosClass.map((c) => [c.id_consignacao, c])),
    vinculoLoanConsigfacil: new Map<string, string>(),
    payslips: input.payslips ?? [],
  });

  const baseGovSan = {
    ...baseGov,
    contratos: contratosClass,
    contratosConsignadosComuns: contratosClass.filter((c) => !c.eh_cartao_beneficio),
    cartoesBeneficio: contratosClass.filter((c) => c.eh_cartao_beneficio),
    refinanciamentos: saneamento.refinanciamentos,
  };

  const conciliacao = atualizarBaseComConsigfacil({
    baseConsignacoes: baseGovSan,
    loans: loansClass,
    baseConciliada: input.baseConciliada,
    configAuditoria: config,
  });

  if (opts?.emitirEventoDashboard !== false) {
    emitDashboardDataUpdated({
      origin: "saneamento_estrutural_completo",
      sincronizarFontes: true,
    });
  }

  return {
    ...saneamento,
    matches: conciliacao.matches.length,
    caches_limpos: cache.removidos,
    resumo: {
      ...saneamento.resumo,
      caches_limpos: cache.removidos.length,
    },
  };
}
