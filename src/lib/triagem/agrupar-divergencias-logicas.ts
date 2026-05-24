/**
 * Agrupamento lógico de divergências — um cluster, uma decisão, N linhas.
 */

import type { PendenciaConferenciaReal } from "@/lib/consignacoes-governo/aplicar-auditoria-consigfacil";
import { buildPendenciasReais } from "@/lib/conciliacao/pendencia-real-consignavel";
import { extrairPercentualDivergenciaDescricao } from "@/lib/consignacoes-governo/divergencia-valor-folha";
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import {
  aplicarRespostasTriagem,
  pendenciaOcultaPorTriagem,
} from "@/lib/triagem/aplicar-respostas-triagem";
import { contextoDePendencia } from "@/lib/triagem/triagem-service";
import { registrarAprendizadoDivergencia } from "@/lib/triagem/aprendizado-divergencias";
import type { ClassificacaoResolucaoDivergencia } from "@/lib/triagem/triagem-resolutiva-tipos";
import type { ItemTriagemResolutiva } from "@/lib/triagem/triagem-resolutiva-tipos";

export type CausaProvavelCluster =
  | "desconto_fracionado"
  | "quebra_operacional"
  | "consignacao_parcial"
  | "rubrica_dividida"
  | "atraso_atualizacao"
  | "bloqueio_temporario"
  | "nao_identificado";

export type DecisaoGrupoDivergencia =
  | "desconto_fracionado"
  | "quebra_operacional"
  | "folha_parcial"
  | "consigfacil_correto"
  | "manter_conferencia"
  | "ignorar_padrao_futuro";

export type GrupoDivergenciaLogica = {
  grupo_id: string;
  banco: string | null;
  contrato: string | null;
  rubrica: string | null;
  percentual_divergencia: number | null;
  valor_observado: number | null;
  valor_oficial: number | null;
  quantidade_ocorrencias: number;
  competencias: string[];
  linhas_ids: string[];
  causa_provavel: CausaProvavelCluster;
  pode_resolver_em_lote: boolean;
  score_confianca_cluster: number;
  justificativa_cluster: string;
  /** Ordenação: soma |oficial − observado| × ocorrências */
  impacto_financeiro: number;
  modalidade: string;
};

export type ContextoAgrupamentoTriagem = {
  itensPorId: Map<string, ItemTriagemResolutiva>;
  perfilLeitura?: ResultadoResolucaoPerfil;
};

export type MetricasAgrupamentoTriagem = {
  grupos_detectados: number;
  linhas_totais: number;
  linhas_consolidadas: number;
  linhas_em_grupos_multiplos: number;
  ganho_performance_triagem: number;
  grupos_auto_elegiveis: number;
};

export type ResultadoAgrupamentoTriagem = {
  grupos: GrupoDivergenciaLogica[];
  metricas: MetricasAgrupamentoTriagem;
  idsEmCluster: Set<string>;
  itensAvulsosIds: string[];
};

export type ResultadoResolverGrupo = {
  grupo_id: string;
  decisao: DecisaoGrupoDivergencia;
  linhas_resolvidas: number;
  removido_conferencia: boolean;
  classificacao: ClassificacaoResolucaoDivergencia;
  motivo: string;
};

export type RegistroClusterResolvido = {
  grupo_id: string;
  banco: string;
  rubrica: string;
  valor_observado: number | null;
  valor_oficial: number | null;
  percentual_divergencia: number | null;
  quantidade_ocorrencias: number;
  competencias: string;
  causa_provavel: CausaProvavelCluster;
  score_confianca_cluster: number;
  decisao_aplicada: DecisaoGrupoDivergencia;
  linhas_resolvidas: number;
  removido_conferencia: boolean;
  resolvido_em: string;
};

const STORAGE_CLUSTERS_RESOLVIDOS = "financaTriagemClustersResolvidosV1";
const TOLERANCIA_PCT = 0.5;
const MIN_LINHAS_CLUSTER = 2;
const SCORE_LOTE = 85;

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizarBancoCluster(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizarRubrica(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roundMoney(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}

function roundPct(p: number | null | undefined): number | null {
  if (p == null || !Number.isFinite(p)) return null;
  return Math.round(p * 2) / 2;
}

function pctProximo(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= TOLERANCIA_PCT;
}

export type DescricaoPendenciaParseada = {
  rubrica_linha: string | null;
  valor_observado: number | null;
  valor_oficial: number | null;
};

/** Ex.: "Linha BB-EMP: R$ 135.03 (observado) vs R$ 144.50 (ConsigFácil)." */
export function parseDescricaoPendencia(descricao: string | null): DescricaoPendenciaParseada {
  const d = descricao ?? "";
  const linhaMatch = d.match(
    /^Linha\s+([^:]+):\s*R\$\s*([\d.,]+)\s*\(observado\)\s*vs\s*R\$\s*([\d.,]+)\s*\(ConsigFácil\)/i,
  );
  if (linhaMatch) {
    const parseBr = (s: string) => Number.parseFloat(s.replace(/\./g, "").replace(",", "."));
    return {
      rubrica_linha: linhaMatch[1]!.trim(),
      valor_observado: parseBr(linhaMatch[2]!),
      valor_oficial: parseBr(linhaMatch[3]!),
    };
  }
  return { rubrica_linha: null, valor_observado: null, valor_oficial: null };
}

type ClusterFingerprint = {
  banco: string;
  rubrica: string;
  pct: number | null;
  valor_obs: number | null;
  valor_oficial: number | null;
  modalidade: string;
  motivo_quebra: string;
};

function fingerprintPendencia(
  p: PendenciaConferenciaReal,
  item?: ItemTriagemResolutiva,
): ClusterFingerprint {
  const parsed = parseDescricaoPendencia(p.descricao);
  const obs = roundMoney(
    p.valor_observado ??
      parsed.valor_observado ??
      item?.contexto.divergencia.valor_descontado,
  );
  const oficial = roundMoney(
    p.valor_esperado ?? parsed.valor_oficial ?? item?.contexto.divergencia.valor_previsto,
  );

  let pct =
    item?.contexto.divergencia.percentual_divergencia ??
    extrairPercentualDivergenciaDescricao(p.descricao);
  if (pct == null && obs != null && oficial != null && oficial > 0) {
    pct = Math.round((Math.abs(obs - oficial) / oficial) * 1000) / 10;
  }

  return {
    banco: normalizarBancoCluster(p.instituicao_oficial),
    rubrica: normalizarRubrica(parsed.rubrica_linha ?? p.descricao?.slice(0, 40) ?? ""),
    pct: roundPct(pct),
    valor_obs: obs,
    valor_oficial: oficial,
    modalidade: p.tipo,
    motivo_quebra: p.motivo_quebra_desconto ?? "",
  };
}

function clusterKey(fp: ClusterFingerprint): string {
  return [
    fp.banco,
    fp.rubrica || "sem_rubrica",
    fp.valor_obs ?? "na",
    fp.valor_oficial ?? "na",
    fp.pct ?? "na",
    fp.modalidade,
    fp.motivo_quebra,
  ].join("|");
}

function competenciasConsecutivasOuMesmas(comps: string[]): boolean {
  const uniq = [...new Set(comps.filter(Boolean))].sort();
  if (uniq.length <= 1) return true;
  const meses = uniq
    .map((c) => {
      const m = c.match(/^(\d{4})-(\d{2})/);
      return m ? Number(m[1]) * 12 + Number(m[2]) : null;
    })
    .filter((x): x is number => x != null);
  if (meses.length !== uniq.length) return true;
  meses.sort((a, b) => a - b);
  for (let i = 1; i < meses.length; i++) {
    if (meses[i]! - meses[i - 1]! > 2) return false;
  }
  return true;
}

function inferirCausaProvavel(input: {
  fp: ClusterFingerprint;
  linhas: PendenciaConferenciaReal[];
  itens: (ItemTriagemResolutiva | undefined)[];
}): CausaProvavelCluster {
  const motivo = input.fp.motivo_quebra;
  if (motivo === "suspensao_operacional" || motivo === "bloqueio_governo") {
    return "bloqueio_temporario";
  }
  if (motivo === "desconto_fracionado" || motivo === "margem_insuficiente") {
    return "desconto_fracionado";
  }
  if (motivo === "inadimplencia" || motivo === "nao_processado") {
    return "quebra_operacional";
  }

  const motorFraciona = input.itens.some((i) => i?.motor.classificacao === "desconto_fracionado");
  if (motorFraciona) return "desconto_fracionado";

  if (input.fp.rubrica && input.linhas.length >= 2) return "rubrica_dividida";

  if (input.fp.pct != null && input.fp.pct >= 5 && input.fp.pct <= 12) {
    return "desconto_fracionado";
  }

  if (input.fp.modalidade === "divergencia_consigfacil_campo") {
    return "consignacao_parcial";
  }

  return "nao_identificado";
}

function calcularScoreCluster(
  qtd: number,
  causa: CausaProvavelCluster,
  itens: (ItemTriagemResolutiva | undefined)[],
  valoresIguais: boolean,
): number {
  let score = 45 + Math.min(40, qtd * 5);
  if (valoresIguais) score += 12;
  if (causa === "desconto_fracionado") score += 18;
  if (causa === "rubrica_dividida") score += 14;
  if (causa === "quebra_operacional" || causa === "bloqueio_temporario") score += 12;
  const motorOk = itens.filter((i) => i?.motor.resolvido && i.motor.remover_conferencia).length;
  if (motorOk > 0) score += Math.min(12, motorOk * 4);
  return Math.min(98, Math.round(score));
}

function justificativaGrupo(
  causa: CausaProvavelCluster,
  qtd: number,
  rubrica: string | null,
  comps: string[],
): string {
  const compTxt =
    comps.length <= 2 ? comps.join(", ") : `${comps[0]} … ${comps[comps.length - 1]} (${comps.length})`;
  const rub = rubrica ? ` rubrica «${rubrica}»` : "";
  const map: Record<CausaProvavelCluster, string> = {
    desconto_fracionado: `${qtd} ocorrências${rub} com o mesmo desconto observado/oficial — provável fracionamento (${compTxt}).`,
    quebra_operacional: `${qtd} quebras operacionais${rub} no mesmo banco (${compTxt}).`,
    consignacao_parcial: `${qtd} divergências ConsigFácil vs cadastro${rub} (${compTxt}).`,
    rubrica_dividida: `${qtd} linhas da mesma rubrica${rub} com o mesmo desvio (${compTxt}).`,
    atraso_atualizacao: `${qtd} linhas${rub} — possível defasagem de atualização (${compTxt}).`,
    bloqueio_temporario: `${qtd} linhas${rub} com bloqueio/suspensão (${compTxt}).`,
    nao_identificado: `${qtd} linhas repetidas${rub} — uma decisão resolve o grupo (${compTxt}).`,
  };
  return map[causa];
}

function calcularImpactoFinanceiro(
  valorObs: number | null,
  valorOficial: number | null,
  qtd: number,
): number {
  if (valorObs == null || valorOficial == null) return qtd;
  return Math.round(Math.abs(valorOficial - valorObs) * qtd * 100) / 100;
}

function ordenarGrupos(a: GrupoDivergenciaLogica, b: GrupoDivergenciaLogica): number {
  if (b.quantidade_ocorrencias !== a.quantidade_ocorrencias) {
    return b.quantidade_ocorrencias - a.quantidade_ocorrencias;
  }
  if (b.score_confianca_cluster !== a.score_confianca_cluster) {
    return b.score_confianca_cluster - a.score_confianca_cluster;
  }
  return b.impacto_financeiro - a.impacto_financeiro;
}

export function criarContextoAgrupamento(
  itens: ItemTriagemResolutiva[],
  perfilLeitura?: ResultadoResolucaoPerfil,
): ContextoAgrupamentoTriagem {
  const itensPorId = new Map<string, ItemTriagemResolutiva>();
  for (const item of itens) {
    itensPorId.set(item.pendencia.id, item);
  }
  return { itensPorId, perfilLeitura };
}

/**
 * Agrupa pendências abertas em clusters lógicos.
 */
export function agruparDivergenciasLogicas(
  pendencias: PendenciaConferenciaReal[],
  contexto: ContextoAgrupamentoTriagem,
): ResultadoAgrupamentoTriagem {
  const abertas = buildPendenciasReais(
    pendencias.filter((p) => !pendenciaOcultaPorTriagem(p.id)),
  );

  const porChave = new Map<string, PendenciaConferenciaReal[]>();
  for (const p of abertas) {
    const item = contexto.itensPorId.get(p.id);
    const fp = fingerprintPendencia(p, item);
    const k = clusterKey(fp);
    const lista = porChave.get(k) ?? [];
    lista.push(p);
    porChave.set(k, lista);
  }

  const grupos: GrupoDivergenciaLogica[] = [];
  const idsEmCluster = new Set<string>();

  for (const [chave, linhasP] of porChave) {
    if (linhasP.length < MIN_LINHAS_CLUSTER) continue;

    const comps = linhasP.map((l) => l.competencia ?? "").filter(Boolean);
    if (!competenciasConsecutivasOuMesmas(comps) && new Set(comps).size > 4) {
      continue;
    }

    const fp0 = fingerprintPendencia(
      linhasP[0]!,
      contexto.itensPorId.get(linhasP[0]!.id),
    );

    const valoresConsistentes = linhasP.every((p) => {
      const fp = fingerprintPendencia(p, contexto.itensPorId.get(p.id));
      return (
        fp.valor_obs === fp0.valor_obs &&
        fp.valor_oficial === fp0.valor_oficial &&
        pctProximo(fp.pct, fp0.pct)
      );
    });
    if (!valoresConsistentes) continue;

    const itensGrupo = linhasP.map((p) => contexto.itensPorId.get(p.id));
    const causa = inferirCausaProvavel({ fp: fp0, linhas: linhasP, itens: itensGrupo });
    const score = calcularScoreCluster(linhasP.length, causa, itensGrupo, valoresConsistentes);
    const rubricaExib = parseDescricaoPendencia(linhasP[0]!.descricao).rubrica_linha;
    const bancoExib =
      linhasP[0]!.instituicao_oficial ??
      (fp0.banco ? fp0.banco.toUpperCase() : null);

    const grupo: GrupoDivergenciaLogica = {
      grupo_id: `grp_${chave.slice(0, 40)}_${linhasP.length}`,
      banco: bancoExib,
      contrato: linhasP[0]!.id_consignacao ?? null,
      rubrica: rubricaExib,
      percentual_divergencia: fp0.pct,
      valor_observado: fp0.valor_obs,
      valor_oficial: fp0.valor_oficial,
      quantidade_ocorrencias: linhasP.length,
      competencias: [...new Set(comps)].sort(),
      linhas_ids: linhasP.map((p) => p.id),
      causa_provavel: causa,
      pode_resolver_em_lote: score >= SCORE_LOTE,
      score_confianca_cluster: score,
      justificativa_cluster: justificativaGrupo(causa, linhasP.length, rubricaExib, [...new Set(comps)]),
      impacto_financeiro: calcularImpactoFinanceiro(fp0.valor_obs, fp0.valor_oficial, linhasP.length),
      modalidade: fp0.modalidade,
    };

    grupos.push(grupo);
    for (const p of linhasP) idsEmCluster.add(p.id);
  }

  grupos.sort(ordenarGrupos);

  const itensAvulsosIds = abertas.filter((p) => !idsEmCluster.has(p.id)).map((p) => p.id);
  const linhasEmGrupos = grupos.reduce((s, g) => s + g.quantidade_ocorrencias, 0);

  const metricas: MetricasAgrupamentoTriagem = {
    grupos_detectados: grupos.length,
    linhas_totais: abertas.length,
    linhas_consolidadas: linhasEmGrupos,
    linhas_em_grupos_multiplos: linhasEmGrupos,
    ganho_performance_triagem:
      linhasEmGrupos > 0 ? Math.round((1 - grupos.length / linhasEmGrupos) * 100) : 0,
    grupos_auto_elegiveis: grupos.filter((g) => g.pode_resolver_em_lote).length,
  };

  return { grupos, metricas, idsEmCluster, itensAvulsosIds };
}

export function sugerirDecisaoParaGrupo(grupo: GrupoDivergenciaLogica): DecisaoGrupoDivergencia {
  switch (grupo.causa_provavel) {
    case "desconto_fracionado":
    case "rubrica_dividida":
      return "desconto_fracionado";
    case "quebra_operacional":
    case "bloqueio_temporario":
      return "quebra_operacional";
    case "consignacao_parcial":
      return "consigfacil_correto";
    case "atraso_atualizacao":
      return "folha_parcial";
    default:
      return grupo.pode_resolver_em_lote ? "desconto_fracionado" : "manter_conferencia";
  }
}

function classificacaoDeDecisao(decisao: DecisaoGrupoDivergencia): ClassificacaoResolucaoDivergencia {
  switch (decisao) {
    case "desconto_fracionado":
      return "desconto_fracionado";
    case "quebra_operacional":
    case "folha_parcial":
      return "divergencia_operacional";
    case "consigfacil_correto":
      return "divergencia_operacional";
    case "ignorar_padrao_futuro":
      return "divergencia_operacional";
    case "manter_conferencia":
    default:
      return "revisar_manual";
  }
}

function removerDaConferencia(decisao: DecisaoGrupoDivergencia): boolean {
  return decisao !== "manter_conferencia";
}

export function carregarClustersResolvidos(): RegistroClusterResolvido[] {
  const storage = ls();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_CLUSTERS_RESOLVIDOS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version: 1; registros: RegistroClusterResolvido[] };
    return parsed.registros ?? [];
  } catch {
    return [];
  }
}

function salvarClusterResolvido(registro: RegistroClusterResolvido): void {
  const storage = ls();
  if (!storage) return;
  const lista = carregarClustersResolvidos();
  lista.push(registro);
  storage.setItem(
    STORAGE_CLUSTERS_RESOLVIDOS,
    JSON.stringify({ version: 1, registros: lista.slice(-500) }),
  );
}

/**
 * Aplica uma decisão única a todas as linhas_ids do grupo.
 */
export function resolverGrupoDivergenciaLogica(
  grupo: GrupoDivergenciaLogica,
  decisao: DecisaoGrupoDivergencia,
  contexto: ContextoAgrupamentoTriagem,
): ResultadoResolverGrupo {
  const classificacao = classificacaoDeDecisao(decisao);
  const remover = removerDaConferencia(decisao);
  const motivoBase = `[Cluster ${grupo.quantidade_ocorrencias}× · ${decisao}] ${grupo.justificativa_cluster}`;

  let resolvidas = 0;

  for (const id of grupo.linhas_ids) {
    if (pendenciaOcultaPorTriagem(id)) continue;
    const item = contexto.itensPorId.get(id);
    const pendencia = item?.pendencia;
    if (!pendencia) continue;

    const classificacaoLinha =
      item?.motor.resolvido && decisao !== "manter_conferencia"
        ? item.motor.classificacao
        : classificacao;

    aplicarRespostasTriagem({
      contexto: contextoDePendencia(pendencia),
      respostas: {
        grupo_id: grupo.grupo_id,
        decisao_grupo: decisao,
        rubrica: grupo.rubrica ?? "",
        banco: grupo.banco ?? "",
      },
      resultado: {
        resolvido: remover,
        nova_classificacao: classificacaoLinha,
        nivel_confianca: grupo.score_confianca_cluster / 100,
        remover_pendencia: remover,
        manter_pendencia: !remover,
        motivo: motivoBase,
        campos_corrigidos: {
          grupo_id: grupo.grupo_id,
          decisao_grupo: decisao,
          desconto_fracionado_conciliado: decisao === "desconto_fracionado",
        },
        proxima_acao: remover ? "nenhuma" : "revisar_manualmente",
        registrar_padrao: decisao !== "manter_conferencia",
      },
    });

    if (remover) resolvidas++;
  }

  if (grupo.banco && decisao !== "manter_conferencia") {
    const respostaAprendizado =
      decisao === "ignorar_padrao_futuro"
        ? "ignorar_padrao_futuro"
        : decisao === "desconto_fracionado"
          ? "sempre_fraciona"
          : decisao === "consigfacil_correto"
            ? "aceitar_consigfacil"
            : decisao === "folha_parcial"
              ? "aceitar_folha"
              : "revisar_manual";

    registrarAprendizadoDivergencia({
      banco: grupo.banco,
      tipo_divergencia: grupo.rubrica
        ? `rubrica:${normalizarRubrica(grupo.rubrica)}`
        : grupo.modalidade,
      resposta_usuario: respostaAprendizado,
      classificacao,
      percentual_tipico: grupo.percentual_divergencia,
      aplicar_automaticamente_futuro: grupo.score_confianca_cluster >= SCORE_LOTE,
    });
  }

  salvarClusterResolvido({
    grupo_id: grupo.grupo_id,
    banco: grupo.banco ?? "",
    rubrica: grupo.rubrica ?? "",
    valor_observado: grupo.valor_observado,
    valor_oficial: grupo.valor_oficial,
    percentual_divergencia: grupo.percentual_divergencia,
    quantidade_ocorrencias: grupo.quantidade_ocorrencias,
    competencias: grupo.competencias.join(", "),
    causa_provavel: grupo.causa_provavel,
    score_confianca_cluster: grupo.score_confianca_cluster,
    decisao_aplicada: decisao,
    linhas_resolvidas: resolvidas,
    removido_conferencia: remover,
    resolvido_em: new Date().toISOString(),
  });

  emitDashboardDataUpdated({ origin: "triagem_cluster", sincronizarFontes: false });

  return {
    grupo_id: grupo.grupo_id,
    decisao,
    linhas_resolvidas: resolvidas,
    removido_conferencia: remover,
    classificacao,
    motivo: motivoBase,
  };
}

/** Resolve grupos com score ≥85 usando decisão sugerida pela causa. */
export function autoResolverGruposElegiveis(
  grupos: GrupoDivergenciaLogica[],
  contexto: ContextoAgrupamentoTriagem,
): { grupos: number; linhas: number } {
  let g = 0;
  let linhas = 0;
  for (const grupo of grupos) {
    if (!grupo.pode_resolver_em_lote) continue;
    const decisao = sugerirDecisaoParaGrupo(grupo);
    const r = resolverGrupoDivergenciaLogica(grupo, decisao, contexto);
    if (r.linhas_resolvidas > 0) {
      g++;
      linhas += r.linhas_resolvidas;
    }
  }
  return { grupos: g, linhas };
}

export function linhasExportacaoClustersLogicos(
  grupos: GrupoDivergenciaLogica[],
  metricas?: MetricasAgrupamentoTriagem,
): Array<Record<string, string | number | boolean>> {
  const resolvidos = carregarClustersResolvidos();
  const porGrupoId = new Map(resolvidos.map((r) => [r.grupo_id, r]));

  const rows: Array<Record<string, string | number | boolean>> = [];

  if (metricas) {
    rows.push({
      grupo_id: "_metricas",
      banco: "",
      rubrica: "",
      valor_observado: "",
      valor_oficial: "",
      percentual_divergencia: "",
      quantidade_ocorrencias: metricas.grupos_detectados,
      competencias: "",
      causa_provavel: "",
      score_confianca_cluster: "",
      decisao_aplicada: "",
      linhas_resolvidas: metricas.linhas_consolidadas,
      removido_conferencia: "",
    });
  }

  for (const g of grupos) {
    const hist = porGrupoId.get(g.grupo_id);
    rows.push({
      grupo_id: g.grupo_id,
      banco: g.banco ?? "",
      rubrica: g.rubrica ?? "",
      valor_observado: g.valor_observado ?? "",
      valor_oficial: g.valor_oficial ?? "",
      percentual_divergencia: g.percentual_divergencia ?? "",
      quantidade_ocorrencias: g.quantidade_ocorrencias,
      competencias: g.competencias.join(", "),
      causa_provavel: g.causa_provavel,
      score_confianca_cluster: g.score_confianca_cluster,
      decisao_aplicada: hist?.decisao_aplicada ?? "",
      linhas_resolvidas: hist?.linhas_resolvidas ?? 0,
      removido_conferencia: hist?.removido_conferencia ?? false,
    });
  }

  for (const h of resolvidos) {
    if (grupos.some((g) => g.grupo_id === h.grupo_id)) continue;
    rows.push({
      grupo_id: h.grupo_id,
      banco: h.banco,
      rubrica: h.rubrica,
      valor_observado: h.valor_observado ?? "",
      valor_oficial: h.valor_oficial ?? "",
      percentual_divergencia: h.percentual_divergencia ?? "",
      quantidade_ocorrencias: h.quantidade_ocorrencias,
      competencias: h.competencias,
      causa_provavel: h.causa_provavel,
      score_confianca_cluster: h.score_confianca_cluster,
      decisao_aplicada: h.decisao_aplicada,
      linhas_resolvidas: h.linhas_resolvidas,
      removido_conferencia: h.removido_conferencia,
    });
  }

  return rows;
}
