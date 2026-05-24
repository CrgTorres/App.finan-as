/**
 * Consolidação contextual de divergências repetidas (ConsigFácil × OCR/folha).
 */

import type { ConsigfacilAjusteBase } from "@/types/consigfacil";
import { ajusteEhRubricaConsignavel } from "@/lib/conciliacao/regras-natureza-consignavel";
import type { TipoCorrelacaoInstituicao } from "@/lib/conciliacao/contexto-instituicao-folha-consigfacil";
import {
  classificarTipoDivergenciaContextual,
  ehDivergenciaEstruturalReal,
  resolverDescricaoContextual,
  resolverTituloBadgeContextual,
  type TipoDivergenciaContextual,
} from "@/lib/conciliacao/tipo-divergencia-contextual";

export type { TipoDivergenciaContextual } from "@/lib/conciliacao/tipo-divergencia-contextual";

export type OcorrenciaDivergenciaContextual = ConsigfacilAjusteBase & {
  competencia: string | null;
  score_match: number | null;
  status_exibicao: string;
  observacao: string;
};

export type ContextoConciliacaoConsolidado = {
  chave: string;
  id_consignacao: string;
  campo: ConsigfacilAjusteBase["campo"];
  rotulo_campo: string;
  valor_origem_exibicao: string;
  valor_oficial_exibicao: string;
  valor_origem_num: number | null;
  valor_oficial_num: number | null;
  diferenca_pct: number | null;
  motivo_resumo: string;
  fonte_original: ConsigfacilAjusteBase["fonte_original"];
  ocorrencias: OcorrenciaDivergenciaContextual[];
  quantidade: number;
  competencias_afetadas: string[];
  impacto_financeiro: number;
  criticidade_estrutural: number;
  consolidavel: boolean;
  /** Título do badge principal do bloco */
  titulo_badge: string;
  /** Texto explicativo (independente de erro financeiro quando aplicável). */
  descricao_contextual: string;
  tipo_divergencia_contextual: TipoDivergenciaContextual;
  eh_contexto_monitorado: boolean;
  /** Apenas divergência estrutural com juízo retroativo válido — não contexto independente. */
  eh_critico_estrutural: boolean;
  /** Não entra em KPIs de divergência crítica. */
  contabiliza_como_critico: boolean;
};

export type MetricasConsolidacaoDivergencias = {
  linhas_originais: number;
  contextos_reais: number;
  contextos_consolidados: number;
  linhas_em_contextos_consolidados: number;
  total_divergencias_criticas: number;
  divergencia_estrutural_prioritaria: number;
  contextos_independentes_monitorados: number;
};

export type ResultadoConsolidacaoDivergencias = {
  contextos: ContextoConciliacaoConsolidado[];
  confirmados: ConsigfacilAjusteBase[];
  metricas: MetricasConsolidacaoDivergencias;
};

const ROTULO_CAMPO: Record<ConsigfacilAjusteBase["campo"], string> = {
  valor_parcela: "Valor da parcela",
  parcelas_total: "Total de parcelas",
  parcela_atual: "Parcela atual",
  instituicao: "Instituição",
  status: "Status",
  tipo_margem: "Tipo de margem",
  data_contrato: "Data do contrato",
  averbado_por: "Averbado por",
  rubrica_code: "Código/Rubrica",
  natureza_cartao_beneficio: "Cartão benefício",
  refinanciamento: "Refinanciamento",
};

const ROTULO_FONTE: Record<ConsigfacilAjusteBase["fonte_original"], string> = {
  consigfacil_oficial: "ConsigFácil (oficial)",
  contrato_anexado: "Contrato anexado",
  contracheque: "Contracheque OCR",
  extrato_bancario: "Extrato bancário",
  ocr: "OCR",
  manual: "Manual",
  inferencia: "Inferência histórica",
};

function parseNumero(v: string | number | null): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function normalizarValorChave(v: string | number | null): string {
  const n = parseNumero(v);
  if (n != null) return n.toFixed(2);
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function normalizarMotivoChave(motivo: string): string {
  return motivo
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/r\$\s*[\d.,]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export type MetadadosChaveConsolidacaoDivergencia = {
  banco_original?: string | null;
  rubrica_original?: string | null;
  modalidade_original?: string | null;
  competencia?: string | null;
  /** Só incluir id do contrato quando há vínculo institucional válido. */
  correlacao_institucional_valida?: boolean;
  contrato_consigfacil?: string | null;
  tipo_correlacao?: TipoCorrelacaoInstituicao | null;
  bloquear_correlacao_por_valor?: boolean;
  continuidade_institucional_comprovada?: boolean;
  /** Assinatura estrutural incompatível — bloqueia contexto conciliado/monitorado. */
  estrutura_incompativel?: boolean;
  /** Soma das rubricas do mês fecha com parcela oficial (margem reduzida). */
  desconto_fracionado_margem?: boolean;
};

function normalizarTextoChave(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .trim();
}

/**
 * Chave: banco|rubrica|modalidade|campo|valor_observado|competencia|contrato(opcional).
 * Sem vínculo institucional válido, NÃO agrupa sob o mesmo contrato ConsigFácil.
 */
export function gerarChaveConsolidacaoDivergencia(
  a: ConsigfacilAjusteBase,
  meta?: MetadadosChaveConsolidacaoDivergencia,
): string {
  const correlacaoOk = meta?.correlacao_institucional_valida === true;
  const contratoChave = correlacaoOk
    ? meta?.contrato_consigfacil ?? a.id_consignacao
    : "sem_vinculo_institucional";

  return [
    normalizarTextoChave(meta?.banco_original ?? ""),
    normalizarTextoChave(meta?.rubrica_original ?? a.alvo_id),
    normalizarTextoChave(meta?.modalidade_original ?? ""),
    a.campo,
    normalizarValorChave(a.valor_original),
    normalizarValorChave(a.valor_oficial),
    normalizarTextoChave(meta?.competencia ?? extrairCompetencia(a) ?? ""),
    contratoChave,
    a.tipo_ajuste,
  ].join("|");
}

export function deveNaoConsolidarDivergencia(a: ConsigfacilAjusteBase): boolean {
  if (a.tipo_ajuste !== "divergencia") return true;
  if (a.campo === "refinanciamento") return true;

  const m = (a.motivo_ajuste + " " + a.campo).toLowerCase();
  if (/fraude|jur[ií]dico|refin\s*real|refinanciamento\s+for[cç]ado|risco\s+refin/.test(m)) {
    return true;
  }
  if (a.diferenca_pct != null && Math.abs(a.diferenca_pct) > 35 && a.campo === "parcelas_total") {
    return true;
  }
  return false;
}

function extrairCompetencia(a: ConsigfacilAjusteBase): string | null {
  const texto = `${a.alvo_id} ${a.motivo_ajuste}`;
  const m = /(\d{4}-\d{2})/.exec(texto);
  if (m) return m[1];
  if (a.registrado_em) return a.registrado_em.slice(0, 7);
  return null;
}

function rotuloFonteOcr(fonte: ConsigfacilAjusteBase["fonte_original"]): string {
  if (fonte === "contracheque" || fonte === "ocr") return "OCR/Contracheque";
  if (fonte === "extrato_bancario") return "Extrato";
  return ROTULO_FONTE[fonte] ?? String(fonte);
}

function calcularCriticidade(a: ConsigfacilAjusteBase): number {
  if (deveNaoConsolidarDivergencia(a)) return 100;
  if (a.campo === "refinanciamento" || a.campo === "parcelas_total") return 70;
  if (a.campo === "valor_parcela") return 50;
  if (a.fonte_original === "inferencia" || a.fonte_original === "ocr") return 15;
  return 30;
}

function calcularImpacto(ocorrencias: OcorrenciaDivergenciaContextual[]): number {
  const nums = ocorrencias.map((o) => parseNumero(o.valor_original)).filter((n): n is number => n != null);
  const ofic = parseNumero(ocorrencias[0]?.valor_oficial);
  if (nums.length === 0 || ofic == null) return ocorrencias.length;
  const mediaOrigem = nums.reduce((s, v) => s + v, 0) / nums.length;
  return Math.abs(ofic - mediaOrigem) * ocorrencias.length;
}

function montarContexto(
  chave: string,
  ocorrencias: OcorrenciaDivergenciaContextual[],
  meta?: MetadadosChaveConsolidacaoDivergencia,
): ContextoConciliacaoConsolidado {
  const ref = ocorrencias[0]!;
  const consolidavel = !deveNaoConsolidarDivergencia(ref) && ocorrencias.length >= 1;
  const competencias = [
    ...new Set(
      ocorrencias.map((o) => o.competencia).filter((c): c is string => Boolean(c)),
    ),
  ].sort();

  const valorOrigemNum = parseNumero(ref.valor_original);
  const valorOficialNum = parseNumero(ref.valor_oficial);
  const diferencaPct =
    ref.diferenca_pct ??
    (valorOrigemNum != null && valorOficialNum != null && valorOrigemNum !== 0
      ? Math.round(((valorOficialNum - valorOrigemNum) / valorOrigemNum) * 1000) / 10
      : null);

  const ehHistoricoBaixoRisco =
    (ref.fonte_original === "inferencia" ||
      ref.fonte_original === "ocr" ||
      ref.fonte_original === "contracheque") &&
    (diferencaPct == null || Math.abs(diferencaPct) < 15);

  const ehDescontoFracionado = meta?.desconto_fracionado_margem === true;
  const ehCriticoBruto =
    deveNaoConsolidarDivergencia(ref) ||
    (meta?.estrutura_incompativel === true && !ehDescontoFracionado);
  const ehContextoMonitorado =
    consolidavel &&
    ocorrencias.length > 1 &&
    ehHistoricoBaixoRisco &&
    !ehCriticoBruto &&
    meta?.estrutura_incompativel !== true &&
    !ehDescontoFracionado;

  const tipo_divergencia_contextual = classificarTipoDivergenciaContextual({
    meta,
    chave,
    ajuste: ref,
    ehCriticoBruto,
    ehContextoMonitorado,
  });

  const eh_critico_estrutural = ehDivergenciaEstruturalReal(tipo_divergencia_contextual);
  const contabiliza_como_critico = eh_critico_estrutural;

  const titulo_badge =
    ocorrencias.length > 1 &&
    !eh_critico_estrutural &&
    tipo_divergencia_contextual === "monitoramento_contextual"
      ? `${ocorrencias.length} ocorrências similares consolidadas`
      : resolverTituloBadgeContextual(tipo_divergencia_contextual);

  const descricao_contextual = resolverDescricaoContextual(
    tipo_divergencia_contextual,
    ref.motivo_ajuste,
  );

  return {
    chave,
    id_consignacao: chave.includes("sem_vinculo_institucional")
      ? "—"
      : ref.id_consignacao,
    campo: ref.campo,
    rotulo_campo: ROTULO_CAMPO[ref.campo] ?? ref.campo,
    valor_origem_exibicao:
      valorOrigemNum != null
        ? valorOrigemNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : String(ref.valor_original ?? "—"),
    valor_oficial_exibicao:
      valorOficialNum != null
        ? valorOficialNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : String(ref.valor_oficial ?? "—"),
    valor_origem_num: valorOrigemNum,
    valor_oficial_num: valorOficialNum,
    diferenca_pct: diferencaPct,
    motivo_resumo: ref.motivo_ajuste,
    fonte_original: ref.fonte_original,
    ocorrencias,
    quantidade: ocorrencias.length,
    competencias_afetadas: competencias,
    impacto_financeiro: calcularImpacto(ocorrencias),
    criticidade_estrutural: Math.max(...ocorrencias.map((o) => calcularCriticidade(o))),
    consolidavel,
    titulo_badge,
    descricao_contextual,
    tipo_divergencia_contextual,
    eh_contexto_monitorado: ehContextoMonitorado,
    eh_critico_estrutural,
    contabiliza_como_critico,
  };
}

/** Expande ocorrências para tabela interna (competência, origem, score, observação, status). */
export function expandirOcorrenciasContextuais(
  ctx: ContextoConciliacaoConsolidado,
): Array<{
  competencia: string;
  origem: string;
  score: string;
  observacao: string;
  status: string;
  alvo_id: string;
}> {
  return ctx.ocorrencias.map((o) => ({
    competencia: o.competencia ?? "—",
    origem: rotuloFonteOcr(o.fonte_original),
    score: o.score_match != null ? String(o.score_match) : "—",
    observacao: o.observacao || o.motivo_ajuste,
    status: o.status_exibicao,
    alvo_id: o.alvo_id,
  }));
}

export function ordenarContextosConciliacao(
  contextos: ContextoConciliacaoConsolidado[],
): ContextoConciliacaoConsolidado[] {
  return [...contextos].sort((a, b) => {
    if (a.contabiliza_como_critico !== b.contabiliza_como_critico) {
      return a.contabiliza_como_critico ? -1 : 1;
    }
    if (b.impacto_financeiro !== a.impacto_financeiro) {
      return b.impacto_financeiro - a.impacto_financeiro;
    }
    if (b.competencias_afetadas.length !== a.competencias_afetadas.length) {
      return b.competencias_afetadas.length - a.competencias_afetadas.length;
    }
    return b.quantidade - a.quantidade;
  });
}

export function consolidarDivergenciasContextuais(
  ajustes: ConsigfacilAjusteBase[],
  resolverMeta?: (a: ConsigfacilAjusteBase) => MetadadosChaveConsolidacaoDivergencia | undefined,
  resolverTextoRubrica?: (a: ConsigfacilAjusteBase) => string | null | undefined,
): ResultadoConsolidacaoDivergencias {
  const ajustesConsignaveis = ajustes.filter((a) =>
    ajusteEhRubricaConsignavel(a, resolverTextoRubrica),
  );
  const confirmados = ajustesConsignaveis.filter((a) => a.tipo_ajuste === "confirmado");
  const divergencias = ajustesConsignaveis.filter((a) => a.tipo_ajuste === "divergencia");

  const grupos = new Map<string, OcorrenciaDivergenciaContextual[]>();

  for (const a of divergencias) {
    const base = gerarChaveConsolidacaoDivergencia(a, resolverMeta?.(a));
    const chave = deveNaoConsolidarDivergencia(a) ? `${base}|${a.alvo_id}` : base;
    const occ: OcorrenciaDivergenciaContextual = {
      ...a,
      competencia: extrairCompetencia(a),
      score_match: null,
      status_exibicao: a.tipo_ajuste === "divergencia" ? "divergência" : "confirmado",
      observacao: a.motivo_ajuste,
    };
    const arr = grupos.get(chave) ?? [];
    arr.push(occ);
    grupos.set(chave, arr);
  }

  const metaPorChave = new Map<string, MetadadosChaveConsolidacaoDivergencia>();
  for (const a of divergencias) {
    const base = gerarChaveConsolidacaoDivergencia(a, resolverMeta?.(a));
    const chave = deveNaoConsolidarDivergencia(a) ? `${base}|${a.alvo_id}` : base;
    if (!metaPorChave.has(chave) && resolverMeta?.(a)) {
      metaPorChave.set(chave, resolverMeta(a)!);
    }
  }

  const contextos = ordenarContextosConciliacao(
    [...grupos.entries()].map(([chave, occs]) =>
      montarContexto(chave, occs, metaPorChave.get(chave)),
    ),
  );

  const contextos_consolidados = contextos.filter((c) => c.quantidade > 1 && c.consolidavel).length;
  const linhas_em_contextos_consolidados = contextos
    .filter((c) => c.quantidade > 1 && c.consolidavel)
    .reduce((s, c) => s + c.quantidade, 0);

  const total_divergencias_criticas = contextos.filter((c) => c.contabiliza_como_critico).length;
  const divergencia_estrutural_prioritaria = contextos.filter(
    (c) => c.tipo_divergencia_contextual === "divergencia_estrutural_real",
  ).length;
  const contextos_independentes_monitorados = contextos.filter(
    (c) =>
      c.tipo_divergencia_contextual === "contexto_independente" ||
      c.tipo_divergencia_contextual === "sem_relacao_confirmada" ||
      c.tipo_divergencia_contextual === "correlacao_bloqueada",
  ).length;

  console.log("[CONCILIACAO_CONSOLIDADA]", {
    linhas_originais: divergencias.length,
    contextos_reais: contextos.length,
    contextos_consolidados,
    total_divergencias_criticas,
    contextos_independentes_monitorados,
  });

  return {
    contextos,
    confirmados,
    metricas: {
      linhas_originais: divergencias.length,
      contextos_reais: contextos.length,
      contextos_consolidados,
      linhas_em_contextos_consolidados,
      total_divergencias_criticas,
      divergencia_estrutural_prioritaria,
      contextos_independentes_monitorados,
    },
  };
}

export function formatarDiferencaPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct.toFixed(1)}%`;
}
