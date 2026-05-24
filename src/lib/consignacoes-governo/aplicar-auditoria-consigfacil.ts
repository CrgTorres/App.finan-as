/**
 * Orquestra auditoria ConsigFácil: contratos únicos, descontos fracionados,
 * refinanciamentos descartados e fila de pendências REAIS.
 */

import type { ConsigfacilContrato, ConsigfacilRefinanciamento } from "@/types/consigfacil";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import {
  entradaPendenciaDeBaseConciliada,
  linhaElegivelPendenciaRealConsignavel,
} from "@/lib/conciliacao/pendencia-real-consignavel";
import type { BaseConciliadaComConfirmacao } from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";
import type { Loan } from "@/types/contracheque";
import type { ResultadoAtualizacaoBaseComConsigfacil } from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";
import {
  CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
  type ConfigAuditoriaConsigfacil,
} from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import {
  aplicarAuditoriaNosContratos,
  filtrarRefinanciamentosComContratosUnicos,
  type ContratoComAuditoria,
  type ContratoUnicoConfirmado,
  type RefinanciamentoDescartado,
} from "@/lib/consignacoes-governo/auditoria-contratos-unicos";
import {
  validarDescontoFracionadoPorMargem,
  type DescontoFolhaEntrada,
} from "@/lib/consignacoes-governo/validar-desconto-fracionado-margem";
import {
  detectarDescontoFracionadoPorMargem,
  linhaFolhaMesDeBaseConciliada,
  MENSAGEM_DESCONTO_FRACIONADO_MARGEM,
} from "@/lib/contratos/detectar-desconto-fracionado-margem";
import { contratoIgnoraDivergenciaValorPorMargem } from "@/lib/contratos/detectar-contexto-operacional-margem";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import {
  contratoTemJustificativaOperacional,
  resolverMotivoQuebraDesconto,
  type EventoOperacionalConsignado,
} from "@/lib/consigfacil/detectar-eventos-operacionais";
import { MENSAGEM_ESTRUTURA_INCOMPATIVEL } from "@/lib/conciliacao/assinatura-estrutural-contrato";
import {
  geraDivergenciaContratual,
  type EntidadeComEstrutura,
} from "@/lib/contratos/classificar-estrutura-contrato";
import {
  autoridadePermiteJuizoEstrutural,
  classificarAutoridadeTemporalConsigfacil,
  entradaTemporalDeContrato,
} from "@/lib/consigfacil/autoridade-temporal-consigfacil";

function permiteDivergenciaEstruturalCompetencia(
  competencia: string | null | undefined,
  contrato?: ConsigfacilContrato | null,
): boolean {
  const r = classificarAutoridadeTemporalConsigfacil(
    contrato
      ? entradaTemporalDeContrato(contrato, competencia ?? contrato.competencia)
      : {
          competencia: competencia ?? null,
          existeCorrelacaoConsigfacil: false,
        },
  );
  return autoridadePermiteJuizoEstrutural(r.autoridade_temporal);
}

export type DescontoFracionadoConciliado = {
  competencia: string;
  banco: string;
  id_consignacao: string;
  rubricas_encontradas: string;
  valores_quebrados: string;
  soma_total: number;
  parcela_oficial: number;
  diferenca: number;
  percentual_diferenca: number;
  status: "conciliado";
  motivo: string;
  linhas_conciliadas_ids: string;
  desconto_fracionado_por_margem: boolean;
  soma_descontos_mes: number;
  linhas_compensatorias: string;
  margem_reduzida_detectada: boolean;
  removido_da_conferencia: boolean;
};

export type PendenciaConferenciaReal = {
  id: string;
  tipo:
    | "divergencia_valor"
    | "desconto_sem_contrato"
    | "contrato_sem_desconto"
    | "margem_incompativel"
    | "sem_evidencia"
    | "cartao_rmc_rcc_sem_confirmacao"
    | "match_baixo"
    | "tolerancia_excedida"
    | "divergencia_consigfacil_campo";
  descricao: string;
  instituicao_oficial: string | null;
  competencia: string | null;
  valor_esperado: number | null;
  valor_observado: number | null;
  id_consignacao: string | null;
  motivo_quebra_desconto?: import("@/lib/consigfacil/detectar-eventos-operacionais").MotivoQuebraDesconto;
};

export type ResultadoAuditoriaConsigfacil = {
  contratos: ContratoComAuditoria[];
  refinanciamentosConfirmados: ConsigfacilRefinanciamento[];
  refinanciamentosDescartados: RefinanciamentoDescartado[];
  contratosUnicosConfirmados: ContratoUnicoConfirmado[];
  descontosFracionadosConciliados: DescontoFracionadoConciliado[];
  baseConciliadaEnriquecida: BaseConciliadaComConfirmacao[];
  pendenciasReais: PendenciaConferenciaReal[];
  config: ConfigAuditoriaConsigfacil;
};

function normalizarBanco(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bancoCompativel(linha: BaseConciliadaLinha, contrato: ConsigfacilContrato): boolean {
  const a = normalizarBanco(linha.banco_origem || linha.descricao_normalizada);
  const b = normalizarBanco(contrato.instituicao);
  const oficial = resolverInstituicaoOficial(contrato.instituicao)?.nome_normalizado ?? b;
  return a.includes(oficial) || oficial.includes(a) || a.includes(b) || b.includes(a);
}

export function aplicarAuditoriaConsigfacil(input: {
  contratos: ConsigfacilContrato[];
  refinanciamentosDetectados: ConsigfacilRefinanciamento[];
  baseConciliada: BaseConciliadaComConfirmacao[];
  consigfacilConciliacao: ResultadoAtualizacaoBaseComConsigfacil;
  loans: Loan[];
  eventosOperacionais?: EventoOperacionalConsignado[];
  config?: Partial<ConfigAuditoriaConsigfacil>;
}): ResultadoAuditoriaConsigfacil {
  const config: ConfigAuditoriaConsigfacil = {
    ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
    ...input.config,
    refinanciamento: {
      ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO.refinanciamento,
      ...input.config?.refinanciamento,
    },
    conciliacao: {
      ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO.conciliacao,
      ...input.config?.conciliacao,
    },
  };

  const filtroRef = filtrarRefinanciamentosComContratosUnicos({
    contratos: input.contratos,
    refinanciamentos: input.refinanciamentosDetectados,
  });

  const eventosOperacionais = input.eventosOperacionais ?? [];

  let contratos = aplicarAuditoriaNosContratos(
    input.contratos,
    filtroRef.idsContratosUnicos,
  ).map((c) => {
    const motivo = resolverMotivoQuebraDesconto(eventosOperacionais, c);
    const justificativa = contratoTemJustificativaOperacional(eventosOperacionais, c);
    return {
      ...c,
      motivo_quebra_desconto: motivo,
      justificativa_operacional_oficial: justificativa,
      pendencia_real: justificativa ? false : c.pendencia_real,
    };
  });

  const descontosFracionadosConciliados: DescontoFracionadoConciliado[] = [];
  const linhasConciliadasIds = new Set<string>();
  const baseMap = new Map(input.baseConciliada.map((l) => [l.id, { ...l }]));

  if (config.conciliacao.aceitar_desconto_fracionado) {
    for (const c of contratos) {
      if (c.eh_cartao_beneficio) continue;
      const competencias = new Set<string>();
      for (const l of input.baseConciliada) {
        if (l.origem !== "contracheque") continue;
        if (!bancoCompativel(l, c)) continue;
        if (l.competencia) competencias.add(l.competencia);
      }
      if (c.competencia) competencias.add(c.competencia);

      for (const comp of competencias) {
        const linhasComp = input.baseConciliada.filter(
          (l) =>
            l.origem === "contracheque" &&
            l.competencia === comp &&
            (l.natureza === "desconto" || l.natureza === "emprestimo" || l.natureza === "cartao") &&
            bancoCompativel(l, c),
        );
        if (linhasComp.length === 0) continue;

        const descontosFolha: DescontoFolhaEntrada[] = linhasComp.map((l) => ({
          valor: Math.abs(l.valor),
          rubrica: l.categoria_canonica,
          descricao: l.descricao_normalizada || l.descricao_original,
          linha_id: l.id,
        }));

        const linhasFolhaMes = input.baseConciliada.map(linhaFolhaMesDeBaseConciliada);

        const deteccao = detectarDescontoFracionadoPorMargem({
          competencia: comp,
          banco: c.instituicao,
          codigo_rubrica: c.codigo_instituicao,
          contrato_id: c.id_consignacao,
          valor_oficial_parcela: c.valor_parcela,
          linhas_folha_mes: linhasFolhaMes,
          config,
        });

        const validacao =
          deteccao.fracionado
            ? {
                conciliado: true,
                tipo: "desconto_fracionado_por_margem" as const,
                valor_parcela_oficial: deteccao.valor_oficial,
                soma_descontos_folha: deteccao.soma_descontos,
                diferenca: deteccao.diferenca,
                percentual_diferenca: deteccao.percentual_diferenca,
                motivo: MENSAGEM_DESCONTO_FRACIONADO_MARGEM,
              }
            : validarDescontoFracionadoPorMargem({
                descontosFolha,
                contratoConsigfacil: c,
                competencia: comp,
                config,
              });

        if (validacao.conciliado && validacao.tipo === "desconto_fracionado_por_margem") {
          const rubricas = linhasComp
            .map((l) => l.descricao_normalizada || l.categoria_canonica)
            .join("; ");
          const valores = linhasComp.map((l) => Math.abs(l.valor));
          const idsComp: string[] = deteccao.fracionado
            ? deteccao.linhas_compensatorias
                .map((l) => l.id)
                .filter((id): id is string => Boolean(id))
            : linhasComp.map((l) => l.id);
          const linhasParaMarcar =
            deteccao.fracionado
              ? input.baseConciliada.filter((l) => idsComp.includes(l.id))
              : linhasComp;

          descontosFracionadosConciliados.push({
            competencia: comp,
            banco: resolverInstituicaoOficial(c.instituicao)?.nome_oficial ?? c.instituicao,
            id_consignacao: c.id_consignacao,
            rubricas_encontradas: rubricas,
            valores_quebrados: valores.map((v) => v.toFixed(2)).join(" + "),
            soma_total: validacao.soma_descontos_folha,
            parcela_oficial: validacao.valor_parcela_oficial,
            diferenca: validacao.diferenca,
            percentual_diferenca: validacao.percentual_diferenca,
            status: "conciliado",
            motivo: validacao.motivo,
            linhas_conciliadas_ids: idsComp.join(", "),
            desconto_fracionado_por_margem: true,
            soma_descontos_mes: validacao.soma_descontos_folha,
            linhas_compensatorias: idsComp.join(", "),
            margem_reduzida_detectada: deteccao.fracionado
              ? deteccao.margem_reduzida_detectada
              : linhasComp.length >= 2,
            removido_da_conferencia: config.conferencia.remover_desconto_fracionado_conciliado,
          });

          for (const l of linhasParaMarcar) {
            linhasConciliadasIds.add(l.id);
            const atual = baseMap.get(l.id);
            if (atual) {
              baseMap.set(l.id, {
                ...atual,
                status_conciliacao: "conciliado",
                possivel_duplicidade: false,
                observacao: atual.observacao
                  ? `${atual.observacao} ${validacao.motivo}`
                  : validacao.motivo,
              });
            }
          }

          const idx = contratos.findIndex((x) => x.id_consignacao === c.id_consignacao);
          if (idx >= 0) {
            contratos[idx] = {
              ...contratos[idx],
              desconto_fracionado_por_margem: true,
              soma_descontos_fracionados: validacao.soma_descontos_folha,
              valor_parcela_oficial_consigfacil: validacao.valor_parcela_oficial,
              diferenca_conciliacao_fracionada: validacao.diferenca,
              pendencia_real: false,
              motivo_quebra_desconto: "desconto_fracionado",
            };
          }
        }
      }
    }
  }

  const pendenciasReais: PendenciaConferenciaReal[] = [];

  function contratoGeraDivergencia(c: ContratoComAuditoria | undefined): boolean {
    if (!c) return true;
    const cls = c as ContratoComAuditoria & EntidadeComEstrutura;
    if (cls.tipo_estrutura === "historico") return false;
    return geraDivergenciaContratual({
      tipo_estrutura: cls.tipo_estrutura ?? "estrutural",
      fonte_estrutura_contrato: cls.fonte_estrutura_contrato ?? "consigfacil",
      confianca_estrutural: cls.confianca_estrutural ?? 60,
      tem_parc_estrutural: cls.tem_parc_estrutural ?? true,
      mensagem_exibicao: cls.mensagem_estrutura ?? "",
    });
  }

  for (const d of input.consigfacilConciliacao.divergenciasFolhaExtrato) {
    const c = contratos.find((x) => x.id_consignacao === d.id_consignacao);
    if (!permiteDivergenciaEstruturalCompetencia(d.competencia, c)) continue;
    if (!contratoGeraDivergencia(c)) continue;
    if (c?.desconto_fracionado_por_margem || c?.nao_refinanciamento_confirmado) continue;
    if (contratoIgnoraDivergenciaValorPorMargem(c ?? {})) continue;
    if (c?.justificativa_operacional_oficial) continue;
    if (c && filtroRef.idsContratosUnicos.has(c.id_consignacao) && d.valor_observado === 0) {
      continue;
    }
    const motivoQuebra = c
      ? resolverMotivoQuebraDesconto(eventosOperacionais, c, d.competencia)
      : undefined;
    pendenciasReais.push({
      id: `p-div-folha-${d.id_consignacao}-${d.competencia}`,
      tipo: "divergencia_valor",
      descricao: d.motivo,
      instituicao_oficial: d.instituicao,
      competencia: d.competencia,
      valor_esperado: d.valor_consigfacil,
      valor_observado: d.valor_observado,
      id_consignacao: d.id_consignacao,
      motivo_quebra_desconto: motivoQuebra,
    });
  }

  for (const a of input.consigfacilConciliacao.ajustes) {
    if (a.tipo_ajuste !== "divergencia") continue;
    const c = contratos.find((x) => x.id_consignacao === a.id_consignacao);
    if (!permiteDivergenciaEstruturalCompetencia(c?.competencia ?? null, c)) continue;
    if (!contratoGeraDivergencia(c)) continue;
    if (c?.nao_refinanciamento_confirmado) continue;
    pendenciasReais.push({
      id: `p-ajuste-${a.alvo_id}-${a.campo}`,
      tipo: "divergencia_consigfacil_campo",
      descricao: a.motivo_ajuste,
      instituicao_oficial: c?.instituicao ?? null,
      competencia: c?.competencia ?? null,
      valor_esperado:
        typeof a.valor_oficial === "number" ? a.valor_oficial : null,
      valor_observado:
        typeof a.valor_original === "number" ? a.valor_original : null,
      id_consignacao: a.id_consignacao,
    });
  }

  for (const m of input.consigfacilConciliacao.matches) {
    if (m.autoridade_temporal_consigfacil !== "oficial_atual") continue;
    const bloqueioEstrutural =
      m.motivo_bloqueio_match?.trim() === MENSAGEM_ESTRUTURA_INCOMPATIVEL ||
      m.motivo_bloqueio_match?.toLowerCase().includes("continuidade estrutural");
    if (bloqueioEstrutural) continue;
    if (m.faixa === "sem_match" || m.faixa === "match_manual") {
      pendenciasReais.push({
        id: `p-match-${m.id_consignacao}`,
        tipo: "match_baixo",
        descricao: m.motivo_bloqueio_match
          ? `${m.motivo_bloqueio_match} (score ${m.score}).`
          : `Match ${m.faixa} (score ${m.score}) — requer conferência.`,
        instituicao_oficial: m.instituicao_oficial,
        competencia: m.competencia_referencia,
        valor_esperado: null,
        valor_observado: null,
        id_consignacao: m.id_consignacao,
      });
    }
  }

  for (const l of input.baseConciliada) {
    if (linhasConciliadasIds.has(l.id)) continue;
    if (l.status_conciliacao === "conciliado") continue;
    if (l.status_manual === "ignorar" || l.status_manual === "transferencia_propria") continue;

  if (l.possivel_duplicidade && linhasConciliadasIds.size > 0) {
      const temIrmaoConciliado = input.baseConciliada.some(
        (o) =>
          o.id !== l.id &&
          o.competencia === l.competencia &&
          linhasConciliadasIds.has(o.id) &&
          bancoCompativel(o, {
            instituicao: l.banco_origem,
          } as ConsigfacilContrato),
      );
      if (temIrmaoConciliado) continue;
    }

    if (l.status_conciliacao === "precisa_revisao") {
      const linhaCf = l as BaseConciliadaComConfirmacao;
      if (
        linhaCf.autoridade_temporal_consigfacil &&
        !autoridadePermiteJuizoEstrutural(linhaCf.autoridade_temporal_consigfacil)
      ) {
        continue;
      }
      if (!permiteDivergenciaEstruturalCompetencia(l.competencia)) continue;
      if (!linhaElegivelPendenciaRealConsignavel(entradaPendenciaDeBaseConciliada(l))) {
        continue;
      }
      pendenciasReais.push({
        id: `p-linha-${l.id}`,
        tipo: "tolerancia_excedida",
        descricao: l.observacao || l.descricao_normalizada,
        instituicao_oficial: l.banco_origem || null,
        competencia: l.competencia,
        valor_esperado: null,
        valor_observado: Math.abs(l.valor),
        id_consignacao: null,
      });
    }
  }

  for (const c of contratos) {
    if (c.nao_refinanciamento_confirmado) continue;
    if (c.eh_cartao_beneficio) continue;
    const temDesconto = input.baseConciliada.some(
      (l) =>
        l.origem === "contracheque" &&
        bancoCompativel(l, c) &&
        Math.abs(l.valor) > 0,
    );
    if (c.justificativa_operacional_oficial) continue;
    if (contratoIgnoraDivergenciaValorPorMargem(c)) continue;

    if (
      (c.status === "ativo" || c.status === "em_averbacao" || c.status === "suspenso") &&
      !temDesconto &&
      !c.desconto_fracionado_por_margem
    ) {
      if (c.status === "suspenso" || c.motivo_quebra_desconto !== "desconhecido") {
        continue;
      }
      pendenciasReais.push({
        id: `p-sem-desconto-${c.id_consignacao}`,
        tipo: "contrato_sem_desconto",
        descricao: `Contrato oficial ativo sem desconto observado em folha.`,
        instituicao_oficial: c.instituicao,
        competencia: c.competencia,
        valor_esperado: c.valor_parcela,
        valor_observado: 0,
        id_consignacao: c.id_consignacao,
        motivo_quebra_desconto: c.motivo_quebra_desconto,
      });
    }
    if (c.eh_rmc || c.eh_rcc) {
      const loanMatch = input.consigfacilConciliacao.resultadosConciliacao.find(
        (r) => r.id_consignacao === c.id_consignacao,
      );
      if (!loanMatch?.loan_id) {
        pendenciasReais.push({
          id: `p-rmc-${c.id_consignacao}`,
          tipo: "cartao_rmc_rcc_sem_confirmacao",
          descricao: `RMC/RCC detectado sem vínculo confirmado na base interna.`,
          instituicao_oficial: c.instituicao,
          competencia: c.competencia,
          valor_esperado: c.valor_parcela,
          valor_observado: null,
          id_consignacao: c.id_consignacao,
        });
      }
    }
  }

  return {
    contratos,
    refinanciamentosConfirmados: filtroRef.refinanciamentosConfirmados,
    refinanciamentosDescartados: filtroRef.refinanciamentosDescartados,
    contratosUnicosConfirmados: filtroRef.contratosUnicosConfirmados,
    descontosFracionadosConciliados,
    baseConciliadaEnriquecida: Array.from(baseMap.values()),
    pendenciasReais,
    config,
  };
}

/** Linhas que ainda exigem conferência manual (exclui conciliados e rubricas fora do consignável). */
export function filtrarLinhasParaConferencia(
  linhas: BaseConciliadaLinha[],
): BaseConciliadaLinha[] {
  return linhas.filter((l) => {
    if (l.status_manual === "ignorar" || l.status_manual === "transferencia_propria") {
      return false;
    }
    if (l.status_conciliacao === "conciliado") return false;
    if (!linhaElegivelPendenciaRealConsignavel(entradaPendenciaDeBaseConciliada(l))) {
      return false;
    }
    return (
      l.status_conciliacao === "precisa_revisao" ||
      l.status_conciliacao === "nao_conciliado" ||
      l.status_conciliacao === "possivel_duplicidade"
    );
  });
}
