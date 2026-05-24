/**
 * Assinatura estrutural obrigatória para correlação ConsigFácil × folha.
 * Prioridade de bloqueio: timeline > assinatura > instituição > parcela > valor.
 */

import type { Loan } from "@/types/contracheque";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import { confirmacaoVazia, type ConsigfacilConfirmacao } from "@/types/consigfacil";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import { extrairParcelaConsignado, rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import { detectarInstituicaoNaDescricao } from "@/lib/reading/instituicoes-financeiras";
import { normalizarNomeBanco } from "@/lib/auditoria/normalizar-banco";
import {
  classificarTipoPassivo,
  type EntradaLinhaPassivo,
  type TipoPassivo,
} from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";
import { normalizarTextoRubricaConsignavel } from "@/lib/conciliacao/regras-natureza-consignavel";
import type {
  ClassificacaoContinuidadeTimeline,
  ResultadoAnaliseTimelineEstrutural,
} from "@/lib/conciliacao/timeline-estrutural-contrato";
import {
  resolverChaveTimelineParaContrato,
  resolverChaveTimelineParaLoan,
} from "@/lib/conciliacao/timeline-estrutural-contrato";
import {
  detectarDescontoFracionadoPorMargem,
  type LinhaFolhaMes,
  type ResultadoDescontoFracionadoMargem,
} from "@/lib/contratos/detectar-desconto-fracionado-margem";

export const LIMIAR_VALOR_ESTRUTURA_INCOMPATIVEL = 0.35;
export const TITULO_BADGE_ESTRUTURA_INCOMPATIVEL = "Estrutura incompatível";
export const MENSAGEM_ESTRUTURA_INCOMPATIVEL =
  "Contrato ConsigFácil não possui continuidade estrutural com a rubrica observada.";

export type AssinaturaEstruturalContrato = {
  instituicao_normalizada: string;
  rubrica_canonica: string;
  tipo_passivo: TipoPassivo;
  total_parcelas: number | null;
  faixa_valor_percentual: string;
  modalidade: string;
  sequencia_temporal: string;
};

export type EntradaAssinaturaEstrutural = EntradaLinhaPassivo & {
  instituicao?: string | null;
  valor?: number | null;
  modalidade?: string | null;
  classificacao_continuidade?: ClassificacaoContinuidadeTimeline | null;
};

export type DetalheRegraCompatibilidadeEstrutural = {
  regra: "timeline" | "assinatura" | "instituicao" | "parcela" | "valor" | "tipo_passivo" | "sequencia";
  violada: boolean;
  motivo: string;
};

export type ResultadoCompatibilidadeEstruturalContrato = {
  compativel: boolean;
  bloquear_correlacao: boolean;
  bloquear_contexto_conciliado: boolean;
  bloquear_monitoramento: boolean;
  bloquear_continuidade_parcial: boolean;
  tipo_divergencia_contextual: "estrutura_incompativel";
  motivos: string[];
  mensagem_ui: string;
  detalhes: DetalheRegraCompatibilidadeEstrutural[];
  assinatura_consigfacil: AssinaturaEstruturalContrato;
  assinatura_observada: AssinaturaEstruturalContrato;
};

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function instituicaoNormalizada(entrada: EntradaAssinaturaEstrutural): string {
  const candidatos = [entrada.instituicao, entrada.descricao].filter(Boolean) as string[];
  for (const c of candidatos) {
    const oficial = resolverInstituicaoOficial(c);
    if (oficial?.nome_normalizado) return oficial.nome_normalizado;
    const detectada = detectarInstituicaoNaDescricao(c);
    if (detectada) {
      const of = resolverInstituicaoOficial(detectada.nome);
      if (of?.nome_normalizado) return of.nome_normalizado;
      return normalizarNomeBanco(detectada.nome);
    }
  }
  const base = candidatos[0] ?? "";
  return base ? normalizarNomeBanco(base) : "";
}

function rubricaCanonica(entrada: EntradaAssinaturaEstrutural): string {
  if (entrada.categoria_canonica?.trim()) {
    return normalizarTextoRubricaConsignavel(entrada.categoria_canonica).slice(0, 80);
  }
  const desc = (entrada.descricao ?? "").trim();
  if (!desc) return "";
  const base = rubricaSemParcelaParaChave(desc);
  return normalizarTextoRubricaConsignavel(base).slice(0, 80);
}

function totalParcelas(entrada: EntradaAssinaturaEstrutural): number | null {
  const direto =
    entrada.parcela_total ??
    entrada.total_installments ??
    null;
  if (direto != null && direto >= 1) return direto;
  const par = extrairParcelaConsignado(entrada.descricao ?? "");
  return par.parcelaTotal ?? null;
}

function parcelaAtual(entrada: EntradaAssinaturaEstrutural): number | null {
  const direto =
    entrada.parcela_atual ??
    entrada.paid_installments ??
    null;
  if (direto != null && direto >= 1) return direto;
  const par = extrairParcelaConsignado(entrada.descricao ?? "");
  return par.parcelaAtual ?? null;
}

/** Faixa logarítmica do valor da parcela (identidade estrutural, não precisão exata). */
export function faixaValorPercentual(valor: number | null | undefined): string {
  const v = valor != null && Number.isFinite(valor) ? Math.abs(valor) : 0;
  if (v <= 0) return "v0";
  if (v <= 50) return "v0_50";
  if (v <= 100) return "v50_100";
  if (v <= 300) return "v100_300";
  if (v <= 700) return "v300_700";
  if (v <= 1500) return "v700_1500";
  return "v1500_plus";
}

function modalidadeDeEntrada(entrada: EntradaAssinaturaEstrutural): string {
  if (entrada.modalidade?.trim()) return normalizarTexto(entrada.modalidade);
  const tp = classificarTipoPassivo(entrada.descricao ?? "", {
    temParcelaNm: parcelaAtual(entrada) != null && totalParcelas(entrada) != null,
    codigo_rubrica: entrada.codigo_rubrica,
  });
  if (tp === "cartao_consignado") return "cartao";
  if (tp === "consignado_real") return "emprestimo";
  return tp;
}

function sequenciaTemporal(entrada: EntradaAssinaturaEstrutural): string {
  if (entrada.classificacao_continuidade) return entrada.classificacao_continuidade;
  const a = parcelaAtual(entrada);
  const t = totalParcelas(entrada);
  if (a != null && t != null) return `${String(a).padStart(3, "0")}/${String(t).padStart(3, "0")}`;
  if (t != null) return `???/${String(t).padStart(3, "0")}`;
  return "indefinido";
}

/** Composição da assinatura estrutural a partir de uma linha/rubrica observada. */
export function assinaturaEstruturalContrato(
  linha: EntradaAssinaturaEstrutural,
): AssinaturaEstruturalContrato {
  const par = extrairParcelaConsignado(linha.descricao ?? "");
  const temNm = par.parcelaAtual != null && par.parcelaTotal != null;
  return {
    instituicao_normalizada: instituicaoNormalizada(linha),
    rubrica_canonica: rubricaCanonica(linha),
    tipo_passivo: classificarTipoPassivo(linha.descricao ?? "", {
      temParcelaNm: temNm,
      codigo_rubrica: linha.codigo_rubrica,
    }),
    total_parcelas: totalParcelas(linha),
    faixa_valor_percentual: faixaValorPercentual(linha.valor),
    modalidade: modalidadeDeEntrada(linha),
    sequencia_temporal: sequenciaTemporal(linha),
  };
}

export function entradaAssinaturaDeContratoConsigfacil(
  contrato: ConsigfacilContrato,
  opts?: { classificacao_continuidade?: ClassificacaoContinuidadeTimeline | null },
): EntradaAssinaturaEstrutural {
  const texto = `${contrato.instituicao} ${contrato.texto_bruto}`.trim();
  const par = extrairParcelaConsignado(texto);
  return {
    descricao: texto,
    codigo_rubrica: contrato.codigo_instituicao,
    instituicao: contrato.instituicao,
    valor: contrato.valor_parcela,
    parcela_atual:
      contrato.parcela_atual != null && contrato.parcela_atual > 0
        ? contrato.parcela_atual
        : par.parcelaAtual,
    parcela_total: contrato.parcelas_total > 0 ? contrato.parcelas_total : par.parcelaTotal,
    modalidade: contrato.eh_cartao_beneficio
      ? "cartao"
      : contrato.tipo_margem && contrato.tipo_margem !== "desconhecida"
        ? String(contrato.tipo_margem)
        : "emprestimo",
    classificacao_continuidade: opts?.classificacao_continuidade ?? null,
  };
}

export function entradaAssinaturaDeLoan(
  loan: Loan,
  opts?: {
    competencia?: string | null;
    classificacao_continuidade?: ClassificacaoContinuidadeTimeline | null;
  },
): EntradaAssinaturaEstrutural {
  return {
    descricao: loan.description ?? loan.institution_name,
    codigo_rubrica: loan.rubrica_code ?? null,
    instituicao: loan.institution_name ?? null,
    natureza: "desconto",
    valor: loan.installment_amount,
    paid_installments: loan.paid_installments ?? null,
    total_installments: loan.total_installments ?? null,
    classificacao_continuidade: opts?.classificacao_continuidade ?? null,
  };
}

export function entradaAssinaturaDeLinhaBase(
  linha: BaseConciliadaLinha,
  opts?: { classificacao_continuidade?: ClassificacaoContinuidadeTimeline | null },
): EntradaAssinaturaEstrutural {
  return {
    descricao: linha.descricao_original || linha.descricao_normalizada,
    instituicao: linha.instituicao_original_folha ?? linha.banco_origem,
    natureza: linha.natureza === "desconto" ? "desconto" : linha.natureza,
    origem: linha.origem,
    categoria_canonica: linha.categoria_canonica,
    valor: Math.abs(linha.valor),
    classificacao_continuidade: opts?.classificacao_continuidade ?? null,
  };
}

function tokensRubrica(rubrica: string): Set<string> {
  return new Set(
    normalizarTexto(rubrica)
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !/^\d+$/.test(t)),
  );
}

function rubricasCompletamenteDistintas(a: string, b: string): boolean {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return false;
  if (na === nb) return false;
  if (na.includes(nb) || nb.includes(na)) return false;
  const ta = tokensRubrica(na);
  const tb = tokensRubrica(nb);
  if (ta.size === 0 || tb.size === 0) return na !== nb;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap === 0;
}

function parcelasIncompativeis(a: number | null, b: number | null): boolean {
  if (a == null || b == null || a < 1 || b < 1) return false;
  if (a === b) return false;
  const diff = Math.abs(a - b);
  const rel = diff / Math.max(a, b);
  return diff > 3 && rel > 0.08;
}

function diferencaValorPercentual(a: number | null, b: number | null): number {
  if (a == null || b == null || a <= 0 || b <= 0) return 0;
  return Math.abs(a - b) / Math.max(a, b);
}

function sequenciaTemporalIncompativel(
  seqA: string,
  seqB: string,
  classificacao?: ClassificacaoContinuidadeTimeline | null,
): boolean {
  if (
    classificacao === "sequencia_quebrada" ||
    classificacao === "contrato_reiniciado"
  ) {
    return true;
  }
  if (seqA === "indefinido" || seqB === "indefinido") return false;
  if (seqA === seqB) return false;
  const totalA = seqA.split("/")[1];
  const totalB = seqB.split("/")[1];
  if (totalA && totalB && totalA !== totalB && totalA !== "???" && totalB !== "???") {
    return true;
  }
  return false;
}

function chavesTimelineIncompativeis(chaveContrato: string | null, chaveObservado: string | null): boolean {
  if (!chaveContrato || !chaveObservado) return false;
  if (chaveContrato === chaveObservado) return false;
  const baseC = chaveContrato.split("|").slice(2).join("|");
  const baseO = chaveObservado.split("|").slice(2).join("|");
  if (baseC && baseO && baseC !== baseO) return true;
  const instC = chaveContrato.split("|")[0];
  const instO = chaveObservado.split("|")[0];
  return Boolean(instC && instO && instC !== instO && instC !== "----" && instO !== "----");
}

export function validarCompatibilidadeEstruturalContrato(input: {
  consigfacil: EntradaAssinaturaEstrutural;
  observado: EntradaAssinaturaEstrutural;
  possui_migracao_documentada?: boolean;
  eh_refinanciamento?: boolean;
  timeline?: ResultadoAnaliseTimelineEstrutural | null;
  chave_timeline_contrato?: string | null;
  chave_timeline_observado?: string | null;
  /** Prioridade: após assinatura compatível, testar fracionamento antes de valor isolado. */
  competencia?: string | null;
  banco_contrato?: string | null;
  codigo_rubrica?: string | null;
  contrato_id?: string | null;
  linhas_folha_mes?: LinhaFolhaMes[];
  desconto_fracionado?: ResultadoDescontoFracionadoMargem | null;
}): ResultadoCompatibilidadeEstruturalContrato {
  const assinatura_consigfacil = assinaturaEstruturalContrato(input.consigfacil);
  const assinatura_observada = assinaturaEstruturalContrato(input.observado);

  const detalhes: DetalheRegraCompatibilidadeEstrutural[] = [];
  const motivos: string[] = [];

  const timelineClass = input.timeline?.classificacao_continuidade ?? null;
  const chaveIncompativel = chavesTimelineIncompativeis(
    input.chave_timeline_contrato ?? null,
    input.chave_timeline_observado ?? null,
  );
  const timelineQuebrada =
    timelineClass === "sequencia_quebrada" ||
    timelineClass === "contrato_reiniciado" ||
    input.timeline?.regressao_impossivel === true ||
    input.timeline?.salto_parcela_detectado === true;

  if (chaveIncompativel || timelineQuebrada) {
    const motivo = chaveIncompativel
      ? "Chaves de timeline estrutural distintas entre contrato e rubrica observada."
      : `Timeline estrutural incompatível (${timelineClass ?? "sequência inválida"}).`;
    detalhes.push({ regra: "timeline", violada: true, motivo });
    motivos.push(motivo);
  } else {
    detalhes.push({
      regra: "timeline",
      violada: false,
      motivo: "Timeline estrutural coerente ou insuficiente para bloqueio.",
    });
  }

  const rubricaDistinta = rubricasCompletamenteDistintas(
    assinatura_consigfacil.rubrica_canonica,
    assinatura_observada.rubrica_canonica,
  );
  const assinaturaDistinta =
    rubricaDistinta ||
    (assinatura_consigfacil.modalidade !== assinatura_observada.modalidade &&
      assinatura_consigfacil.modalidade !== "indefinido" &&
      assinatura_observada.modalidade !== "indefinido" &&
      !["emprestimo", "cartao"].includes(assinatura_consigfacil.modalidade) &&
      !["emprestimo", "cartao"].includes(assinatura_observada.modalidade));

  if (assinaturaDistinta || rubricaDistinta) {
    const motivo = rubricaDistinta
      ? `Rubrica canônica distinta: "${assinatura_consigfacil.rubrica_canonica}" vs "${assinatura_observada.rubrica_canonica}".`
      : `Modalidade estrutural distinta: ${assinatura_consigfacil.modalidade} vs ${assinatura_observada.modalidade}.`;
    detalhes.push({ regra: "assinatura", violada: true, motivo });
    motivos.push(motivo);
  } else {
    detalhes.push({
      regra: "assinatura",
      violada: false,
      motivo: "Assinatura estrutural compatível.",
    });
  }

  const instCf = assinatura_consigfacil.instituicao_normalizada;
  const instObs = assinatura_observada.instituicao_normalizada;
  const instituicaoDiferente =
    Boolean(instCf && instObs && instCf !== instObs) && !input.possui_migracao_documentada;

  if (instituicaoDiferente) {
    const motivo = `Instituição distinta sem migração documentada: ${instCf} vs ${instObs}.`;
    detalhes.push({ regra: "instituicao", violada: true, motivo });
    motivos.push(motivo);
  } else {
    detalhes.push({
      regra: "instituicao",
      violada: false,
      motivo: instCf && instObs ? "Mesma instituição ou migração documentada." : "Instituição não conclusiva.",
    });
  }

  const parcelasIncomp = parcelasIncompativeis(
    assinatura_consigfacil.total_parcelas,
    assinatura_observada.total_parcelas,
  );
  if (parcelasIncomp) {
    const motivo = `Total de parcelas incompatível: ${assinatura_consigfacil.total_parcelas} vs ${assinatura_observada.total_parcelas}.`;
    detalhes.push({ regra: "parcela", violada: true, motivo });
    motivos.push(motivo);
  } else {
    detalhes.push({ regra: "parcela", violada: false, motivo: "Parcelas compatíveis ou não informadas." });
  }

  let fracionado =
    input.desconto_fracionado ??
    (input.linhas_folha_mes &&
    input.competencia &&
    input.banco_contrato &&
    !chaveIncompativel &&
    !timelineQuebrada &&
    !instituicaoDiferente &&
    !rubricaDistinta
      ? detectarDescontoFracionadoPorMargem({
          competencia: input.competencia,
          banco: input.banco_contrato,
          codigo_rubrica: input.codigo_rubrica ?? input.consigfacil.codigo_rubrica,
          rubrica_canonica: assinatura_consigfacil.rubrica_canonica,
          contrato_id: input.contrato_id ?? undefined,
          valor_oficial_parcela: input.consigfacil.valor ?? 0,
          linhas_folha_mes: input.linhas_folha_mes,
        })
      : null);

  const diffValor = diferencaValorPercentual(input.consigfacil.valor ?? null, input.observado.valor ?? null);
  const valorIncompativel =
    diffValor > LIMIAR_VALOR_ESTRUTURA_INCOMPATIVEL &&
    !input.eh_refinanciamento &&
    !(fracionado?.fracionado && fracionado.bloquear_divergencia_valor);

  if (fracionado?.fracionado) {
    detalhes.push({
      regra: "valor",
      violada: false,
      motivo: `Desconto fracionado por margem: soma R$ ${fracionado.soma_descontos.toFixed(2)} fecha com oficial R$ ${fracionado.valor_oficial.toFixed(2)}.`,
    });
  } else if (valorIncompativel) {
    const motivo = `Diferença de valor ${Math.round(diffValor * 100)}% (>35%) sem refinanciamento documentado.`;
    detalhes.push({ regra: "valor", violada: true, motivo });
    motivos.push(motivo);
  } else {
    detalhes.push({ regra: "valor", violada: false, motivo: "Valor dentro da faixa ou refinanciamento." });
  }

  const tpCf = assinatura_consigfacil.tipo_passivo;
  const tpObs = assinatura_observada.tipo_passivo;
  const tipoPassivoDiferente =
    tpCf !== "indefinido" && tpObs !== "indefinido" && tpCf !== tpObs;

  if (tipoPassivoDiferente) {
    const motivo = `Tipo de passivo distinto: ${tpCf} vs ${tpObs}.`;
    detalhes.push({ regra: "tipo_passivo", violada: true, motivo });
    motivos.push(motivo);
  } else {
    detalhes.push({ regra: "tipo_passivo", violada: false, motivo: "Tipo de passivo compatível." });
  }

  const seqIncompat = sequenciaTemporalIncompativel(
    assinatura_consigfacil.sequencia_temporal,
    assinatura_observada.sequencia_temporal,
    timelineClass,
  );
  if (seqIncompat) {
    const motivo = `Sequência temporal incompatível: ${assinatura_consigfacil.sequencia_temporal} vs ${assinatura_observada.sequencia_temporal}.`;
    detalhes.push({ regra: "sequencia", violada: true, motivo });
    motivos.push(motivo);
  } else {
    detalhes.push({ regra: "sequencia", violada: false, motivo: "Sequência temporal compatível." });
  }

  const bloqueioHard = detalhes.some((d) => d.violada);

  return {
    compativel: !bloqueioHard,
    bloquear_correlacao: bloqueioHard,
    bloquear_contexto_conciliado: bloqueioHard,
    bloquear_monitoramento: bloqueioHard,
    bloquear_continuidade_parcial: bloqueioHard,
    tipo_divergencia_contextual: "estrutura_incompativel",
    motivos,
    mensagem_ui: bloqueioHard ? MENSAGEM_ESTRUTURA_INCOMPATIVEL : "",
    detalhes,
    assinatura_consigfacil,
    assinatura_observada,
  };
}

export function avaliarCompatibilidadeEstruturalContratoConsigfacil(input: {
  contrato: ConsigfacilContrato;
  loan?: Loan | null;
  linha?: BaseConciliadaLinha | null;
  possui_migracao_documentada?: boolean;
  timeline?: ResultadoAnaliseTimelineEstrutural | null;
  competencia?: string | null;
  linhas_folha_mes?: LinhaFolhaMes[];
}): ResultadoCompatibilidadeEstruturalContrato {
  const { contrato, loan, linha } = input;
  const classificacao = input.timeline?.classificacao_continuidade ?? null;

  const consigfacil = entradaAssinaturaDeContratoConsigfacil(contrato, {
    classificacao_continuidade: classificacao,
  });

  const observado = loan
    ? entradaAssinaturaDeLoan(loan, { classificacao_continuidade: classificacao })
    : linha
      ? entradaAssinaturaDeLinhaBase(linha, { classificacao_continuidade: classificacao })
      : consigfacil;

  const flags = extrairFlagsMigracaoContrato(contrato, input.possui_migracao_documentada);

  return validarCompatibilidadeEstruturalContrato({
    consigfacil,
    observado,
    possui_migracao_documentada: flags.possui_migracao_documentada,
    eh_refinanciamento: contrato.eh_refinanciamento || Boolean(contrato.contrato_substituido),
    timeline: input.timeline ?? null,
    chave_timeline_contrato: resolverChaveTimelineParaContrato(contrato, loan ?? null),
    chave_timeline_observado: loan
      ? resolverChaveTimelineParaLoan(loan)
      : linha
        ? null
        : null,
    competencia: input.competencia ?? contrato.competencia ?? linha?.competencia ?? null,
    banco_contrato: contrato.instituicao,
    codigo_rubrica: contrato.codigo_instituicao,
    contrato_id: contrato.id_consignacao,
    linhas_folha_mes: input.linhas_folha_mes,
  });
}

function extrairFlagsMigracaoContrato(
  contrato: ConsigfacilContrato,
  override?: boolean,
): { possui_migracao_documentada: boolean } {
  return {
    possui_migracao_documentada:
      override ??
      Boolean(
        contrato.possui_documento_migracao ||
          contrato.possui_historico_transicao,
      ),
  };
}

export function logEstruturaIncompativel(payload: {
  id_consignacao: string | null;
  rubrica_observada: string | null;
  motivos: string[];
}): void {
  console.log("[ESTRUTURA_INCOMPATIVEL]", payload);
}

export function criarConfirmacaoEstruturaIncompativel(
  instituicaoFolha?: string | null,
): ConsigfacilConfirmacao {
  const instFolha = instituicaoFolha?.trim() || null;
  return {
    ...confirmacaoVazia,
    instituicao_original_folha: instFolha,
    banco_original: instFolha,
    tipo_correlacao: "sem_relacao_confirmada",
    contrato_correlato: null,
    mensagem_correlacao: MENSAGEM_ESTRUTURA_INCOMPATIVEL,
    confirmado_consigfacil: false,
    divergencia_consigfacil: false,
    match_historico_correlato: false,
    possivel_migracao_carteira: false,
  };
}

export function removerContextoConsigfacilPorEstruturaIncompativel<
  T extends BaseConciliadaLinha & {
    confirmacao_consigfacil?: ConsigfacilConfirmacao;
    contexto_instituicao?: unknown;
  },
>(linha: T, resultado: ResultadoCompatibilidadeEstruturalContrato): T & {
  confirmacao_consigfacil: ConsigfacilConfirmacao;
} {
  const instFolha =
    linha.instituicao_original_folha ??
    linha.confirmacao_consigfacil?.instituicao_original_folha ??
    null;
  const msg = resultado.mensagem_ui || MENSAGEM_ESTRUTURA_INCOMPATIVEL;
  return {
    ...linha,
    contexto_instituicao: null,
    vinculo_contrato_id: null,
    confirmacao_consigfacil: criarConfirmacaoEstruturaIncompativel(instFolha),
    observacao: linha.observacao ? `${linha.observacao} ${msg}` : msg,
  };
}
