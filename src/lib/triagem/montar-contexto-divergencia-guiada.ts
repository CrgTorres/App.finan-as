/**
 * Monta contexto completo para o motor resolutivo a partir da base normalizada.
 */

import type { PendenciaConferenciaReal } from "@/lib/consignacoes-governo/aplicar-auditoria-consigfacil";
import {
  avaliarDivergenciaContratoCompetencia,
  bancoCompativelLinhaContrato,
  extrairPercentualDivergenciaDescricao,
  linhasDescontoContratoNaCompetencia,
  percentualDivergenciaFormatado,
} from "@/lib/consignacoes-governo/divergencia-valor-folha";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import type { EventoOperacionalConsignado } from "@/lib/consigfacil/detectar-eventos-operacionais";
import type { RiscoRefinForcado } from "@/lib/juridico/detectar-risco-refin-forcado";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import { resolverDivergenciaGuiada } from "@/lib/triagem/resolver-divergencia-guiada";
import { carregarTriagensResolvidas } from "@/lib/triagem/aplicar-respostas-triagem";
import { buscarAprendizadoParaDivergencia } from "@/lib/triagem/aprendizado-divergencias";
import type {
  ContextoDivergenciaGuiada,
  DivergenciaTriagemEntrada,
  EntradaMontarTriagemResolutiva,
  FiltroTriagemResolutiva,
  HistoricoContratoTriagem,
  ItemTriagemResolutiva,
} from "@/lib/triagem/triagem-resolutiva-tipos";

function normalizarBanco(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function pendenciaParaEntrada(p: PendenciaConferenciaReal): DivergenciaTriagemEntrada {
  const previsto = p.valor_esperado ?? 0;
  const descontado = p.valor_observado ?? 0;
  const pct =
    extrairPercentualDivergenciaDescricao(p.descricao) ??
    percentualDivergenciaFormatado(previsto, descontado);

  return {
    pendencia_id: p.id,
    banco: p.instituicao_oficial,
    contrato: p.id_consignacao,
    id_consignacao: p.id_consignacao,
    competencia: p.competencia,
    valor_previsto: previsto,
    valor_descontado: descontado,
    percentual_divergencia: pct,
    descricao: p.descricao,
    tipo_pendencia: p.tipo,
    motivo_quebra_desconto: p.motivo_quebra_desconto ?? null,
  };
}

function historicoContrato(
  idConsignacao: string | null,
  banco: string | null,
  base: BaseConciliadaLinha[],
  contratos: ConsigfacilContrato[],
): HistoricoContratoTriagem {
  const c = idConsignacao
    ? contratos.find((x) => x.id_consignacao === idConsignacao)
    : null;
  const contratoPick = c ?? (banco ? contratos.find((x) => normalizarBanco(x.instituicao) === normalizarBanco(banco)) : null);

  const linhas = base.filter((l) => {
    if (l.origem !== "contracheque") return false;
    if (contratoPick) return bancoCompativelLinhaContrato(l, contratoPick);
    if (banco) return normalizarBanco(l.banco_origem || "").includes(normalizarBanco(banco));
    return false;
  });

  const porComp = new Map<string, { desc: number; prev: number }>();
  for (const l of linhas) {
    const comp = l.competencia ?? "";
    if (!comp) continue;
    const prev = contratoPick?.valor_parcela ?? 0;
    const cur = porComp.get(comp) ?? { desc: 0, prev };
    cur.desc += Math.abs(l.valor);
    if (prev > 0) cur.prev = prev;
    porComp.set(comp, cur);
  }

  const competencias = [...porComp.keys()].sort();
  const valores_descontados = competencias.map((c) => porComp.get(c)!.desc);
  const valores_previstos = competencias.map((c) => porComp.get(c)!.prev);
  const quebras = competencias.map((c) => {
    const { desc, prev } = porComp.get(c)!;
    return prev > 0 ? Math.abs((desc - prev) / prev) * 100 : 0;
  });

  return { competencias, valores_descontados, valores_previstos, quebras_percentual: quebras };
}

export function montarContextoDivergenciaGuiada(
  p: PendenciaConferenciaReal,
  input: EntradaMontarTriagemResolutiva,
): ContextoDivergenciaGuiada {
  const divergencia = pendenciaParaEntrada(p);
  const consigfacil =
    input.contratosConsigfacil.find((c) => c.id_consignacao === p.id_consignacao) ?? null;

  const comp = p.competencia ?? "";
  const linhas_folha =
    consigfacil && comp
      ? linhasDescontoContratoNaCompetencia(consigfacil, input.baseConciliada, comp)
      : [];

  const fragmentos_desconto = linhas_folha.map((l) => ({
    valor: Math.abs(l.valor),
    descricao: l.descricao_normalizada || l.descricao_original || "",
    linha_id: l.id,
  }));

  const soma_fragmentos = fragmentos_desconto.reduce((s, f) => s + f.valor, 0);

  const bancoNorm = p.instituicao_oficial ? normalizarBanco(p.instituicao_oficial) : "";
  const eventos_competencia = input.eventosOperacionais.filter((e) => {
    const eb = e.banco ? normalizarBanco(e.banco) : "";
    const matchBanco = !bancoNorm || !eb || eb.includes(bancoNorm) || bancoNorm.includes(eb);
    const matchComp = !comp || !e.competencia || e.competencia === comp;
    const matchContrato =
      !p.id_consignacao || !e.contrato || e.contrato === p.id_consignacao;
    return matchBanco && matchComp && (matchContrato || !e.contrato);
  });

  const margemLinha = comp
    ? input.margemHistorica.find((m) => m.competencia === comp)
    : undefined;
  const margemPct = margemLinha?.percentual_comprometido ?? null;

  const historico = historicoContrato(
    p.id_consignacao,
    p.instituicao_oficial,
    input.baseConciliada,
    input.contratosConsigfacil,
  );

  const quebras = historico.quebras_percentual.filter((q) => q > 3);
  const comportamento_recorrente =
    quebras.length >= 2 &&
    quebras.every((q) => Math.abs(q - (quebras[0] ?? 0)) <= 3);

  const pctRecorrente = comportamento_recorrente
    ? Math.round((quebras.reduce((a, b) => a + b, 0) / quebras.length) * 10) / 10
    : null;

  const riscos_refin = input.riscoRefinForcado.filter((r) => {
    if (!bancoNorm) return true;
    return normalizarBanco(r.banco).includes(bancoNorm) || bancoNorm.includes(normalizarBanco(r.banco));
  });

  const idxComp = comp ? historico.competencias.indexOf(comp) : -1;
  const compensacao_mes_seguinte =
    idxComp >= 0 &&
    idxComp < historico.competencias.length - 1 &&
    historico.valores_descontados[idxComp + 1] != null &&
    divergencia.valor_previsto > 0 &&
    Math.abs(historico.valores_descontados[idxComp + 1] - divergencia.valor_previsto) /
      divergencia.valor_previsto <
      0.05;

  return {
    divergencia,
    historico_contrato: historico,
    eventos_operacionais: input.eventosOperacionais,
    eventos_competencia,
    margem_consignavel: margemPct,
    margem_ultrapassada: margemPct != null && margemPct > 30,
    perfil_leitura: input.perfilLeitura,
    consigfacil,
    linhas_folha_competencia: linhas_folha,
    fragmentos_desconto,
    soma_fragmentos,
    riscos_refin,
    refin_detectado: input.contratosConsigfacil.some(
      (c) =>
        c.status === "refinanciado" ||
        c.status === "substituido" ||
        (p.id_consignacao && c.id_consignacao === p.id_consignacao),
    ),
    parcela_mudou: false,
    prazo_aumentou: false,
    novo_contrato_mesmo_banco: false,
    compensacao_mes_seguinte,
    comportamento_recorrente,
    percentual_quebra_recorrente: pctRecorrente,
  };
}

function tagsFiltro(item: ItemTriagemResolutiva): FiltroTriagemResolutiva[] {
  const tags: FiltroTriagemResolutiva[] = ["todas"];
  const m = item.motor;

  if (!m.resolvido && !item.resolucao_usuario) tags.push("abertas");
  if (m.resolvido && m.origem === "automatica_motor") tags.push("resolvidas_auto");
  if (m.resolvido && m.origem === "pergunta_usuario") tags.push("resolvidas_pergunta");
  if (item.aprendizado_aplicado) tags.push("aprendidas");
  if (
    m.classificacao === "suspensao_operacional" ||
    m.classificacao === "bloqueio_governo" ||
    m.classificacao === "desconto_recuperado" ||
    m.classificacao === "divergencia_operacional"
  ) {
    tags.push("operacionais");
  }
  if (m.classificacao === "refinanciamento_real" || m.classificacao === "risco_refin_induzido") {
    tags.push("refin_reais");
  }
  if (m.nivel_risco === "alto" || m.nivel_risco === "critico") tags.push("risco_alto");

  return tags;
}

export function montarItensTriagemResolutiva(
  input: EntradaMontarTriagemResolutiva,
): ItemTriagemResolutiva[] {
  const resolvidasStore = carregarTriagensResolvidas();

  return input.pendencias.map((p) => {
    const contexto = montarContextoDivergenciaGuiada(p, input);
    const motor = resolverDivergenciaGuiada(contexto.divergencia, contexto);
    const aprendizado = buscarAprendizadoParaDivergencia({
      banco: p.instituicao_oficial,
      tipo_divergencia: p.tipo,
      percentual_divergencia: contexto.divergencia.percentual_divergencia,
    });

    const item: ItemTriagemResolutiva = {
      pendencia: p,
      contexto,
      motor,
      resolucao_usuario: resolvidasStore[p.id] ?? null,
      aprendizado_aplicado: !!aprendizado && motor.origem === "aprendizado",
      filtro_tags: [],
    };
    item.filtro_tags = tagsFiltro(item);
    return item;
  });
}

export function filtrarItensTriagem(
  itens: ItemTriagemResolutiva[],
  filtro: FiltroTriagemResolutiva,
): ItemTriagemResolutiva[] {
  if (filtro === "todas") return itens;
  return itens.filter((i) => i.filtro_tags.includes(filtro));
}

export function aplicarResolucaoMotorNaTriagem(
  item: ItemTriagemResolutiva,
): ItemTriagemResolutiva {
  if (!item.motor.resolvido || !item.motor.remover_conferencia) return item;
  return item;
}
