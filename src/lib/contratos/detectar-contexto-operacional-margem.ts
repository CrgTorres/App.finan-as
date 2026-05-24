/**
 * Contexto operacional de margem — explica descontos fragmentados, parciais ou
 * ausentes por limite de margem (consignável, cartão ou benefício), sem gerar
 * divergência crítica nem pendência de conferência.
 */

import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type { BaseConsignacoesGoverno } from "@/lib/consignacoes-governo/normalizar-consigfacil";
import type { ConsigfacilContrato, ConsigfacilTipoMargem } from "@/types/consigfacil";
import {
  diferencaDentroToleranciaFracionado,
  resolverToleranciaDescontoFracionado,
} from "@/lib/contratos/detectar-desconto-fracionado-margem";
import {
  linhasDescontoContratoNaCompetencia,
  somaValoresDescontoLinhas,
} from "@/lib/consignacoes-governo/divergencia-valor-folha";

export const STATUS_ESTRUTURAL_FRAGMENTADO_OPERACIONAL =
  "contrato_operacionalmente_fragmentado";

export const MOTIVO_DESCONTO_OPERACIONAL_MARGEM = "desconto_operacional_por_margem";

export const MENSAGEM_DESCONTO_OPERACIONAL_MARGEM =
  "Desconto compatível com limite operacional de margem — parcela fragmentada ou parcial na folha.";

export type LinhaCompetenciaOperacionalMargem = {
  competencia: string;
  valor_descontado: number;
  valor_previsto?: number | null;
  parcela_atual?: number | null;
  parcela_total?: number | null;
  origem?: "folha" | "consigfacil" | "cadastro";
};

export type SnapshotMargemOperacional = {
  competencia?: string | null;
  margem_consignavel?: number | null;
  margem_cartao?: number | null;
  margem_cartao_beneficio?: number | null;
  percentual_margem_consignavel?: number | null;
  percentual_margem_cartao?: number | null;
  percentual_margem_cartao_beneficio?: number | null;
  possui_reserva_ativa?: boolean;
  valor_reserva_ativa?: number | null;
};

export type ContextoOperacionalMargem = {
  desconto_operacional_por_margem: boolean;
  motivo: string | null;
  severidade: "nenhuma" | "atencao" | "alta";
  parcela_oficial: number;
  competencia_referencia: string | null;
  soma_descontos_competencia: number;
  qtd_linhas_competencia: number;
  margem_disponivel: number | null;
  margem_tipo: ConsigfacilTipoMargem;
  percentual_margem_utilizada: number | null;
  reserva_ativa: boolean;
  valor_reserva: number | null;
  fragmentacao_timeline: boolean;
  margem_insuficiente_para_parcela: boolean;
  desconto_parcial_na_folha: boolean;
};

export type EntradaDetectarContextoOperacionalMargem = {
  contrato: Pick<
    ConsigfacilContrato,
    | "id_consignacao"
    | "instituicao"
    | "codigo_instituicao"
    | "competencia"
    | "valor_parcela"
    | "tipo_margem"
    | "status"
    | "eh_cartao_beneficio"
    | "eh_rmc"
    | "eh_rcc"
    | "timeline_parcelas"
    | "timeline_analise"
  >;
  linhasCompetencia: LinhaCompetenciaOperacionalMargem[];
  parcelaOficial: number;
  margemDisponivel?: number | null;
  margemCartao?: number | null;
  margemCartaoBeneficio?: number | null;
  reservaAtiva?: boolean;
  valorReserva?: number | null;
  /** Percentual oficial de utilização da margem (0..100), quando disponível. */
  percentualMargemUtilizada?: number | null;
  baseConciliada?: BaseConciliadaLinha[];
};

function competenciaRef(contrato: EntradaDetectarContextoOperacionalMargem["contrato"]): string {
  return (contrato.competencia ?? "").slice(0, 7);
}

function linhasNaCompetencia(
  linhas: LinhaCompetenciaOperacionalMargem[],
  comp: string,
): LinhaCompetenciaOperacionalMargem[] {
  const c = comp.slice(0, 7);
  return linhas.filter((l) => l.competencia.slice(0, 7) === c);
}

function somaLinhasCompetencia(linhas: LinhaCompetenciaOperacionalMargem[]): number {
  return Math.round(linhas.reduce((s, l) => s + Math.abs(l.valor_descontado), 0) * 100) / 100;
}

function resolverMargemContrato(
  contrato: Pick<ConsigfacilContrato, "tipo_margem" | "eh_cartao_beneficio" | "eh_rmc" | "eh_rcc">,
  snap: {
    margemDisponivel?: number | null;
    margemCartao?: number | null;
    margemCartaoBeneficio?: number | null;
    percentualMargemUtilizada?: number | null;
  },
): { disponivel: number | null; percentual: number | null; tipo: ConsigfacilTipoMargem } {
  const tipo = contrato.tipo_margem;
  if (tipo === "margem_cartao" || contrato.eh_rmc || contrato.eh_rcc) {
    return {
      disponivel: snap.margemCartao ?? null,
      percentual: snap.percentualMargemUtilizada ?? null,
      tipo: "margem_cartao",
    };
  }
  if (tipo === "margem_cartao_beneficio" || contrato.eh_cartao_beneficio) {
    return {
      disponivel: snap.margemCartaoBeneficio ?? null,
      percentual: snap.percentualMargemUtilizada ?? null,
      tipo: "margem_cartao_beneficio",
    };
  }
  return {
    disponivel: snap.margemDisponivel ?? null,
    percentual: snap.percentualMargemUtilizada ?? null,
    tipo: tipo ?? "margem_consignavel",
  };
}

export function linhasCompetenciaDeContrato(
  contrato: Pick<ConsigfacilContrato, "timeline_parcelas" | "competencia" | "valor_parcela">,
  baseConciliada?: BaseConciliadaLinha[],
): LinhaCompetenciaOperacionalMargem[] {
  const porComp = new Map<string, LinhaCompetenciaOperacionalMargem>();

  for (const p of contrato.timeline_parcelas ?? []) {
    const comp = p.competencia.slice(0, 7);
    const prev = porComp.get(comp);
    const valor = Math.abs(p.valor);
    if (prev) {
      porComp.set(comp, {
        ...prev,
        valor_descontado: Math.round((prev.valor_descontado + valor) * 100) / 100,
      });
    } else {
      porComp.set(comp, {
        competencia: comp,
        valor_descontado: valor,
        parcela_atual: p.parcela_atual,
        parcela_total: p.total,
        origem: p.origem,
      });
    }
  }

  if (baseConciliada?.length && contrato.competencia) {
    const comp = contrato.competencia.slice(0, 7);
    const folha = baseConciliada.filter(
      (l) =>
        l.origem === "contracheque" &&
        l.competencia.slice(0, 7) === comp &&
        (l.natureza === "desconto" || l.natureza === "emprestimo" || l.natureza === "cartao"),
    );
    if (folha.length > 0) {
      const soma = somaValoresDescontoLinhas(folha);
      const prev = porComp.get(comp);
      porComp.set(comp, {
        competencia: comp,
        valor_descontado: prev
          ? Math.max(prev.valor_descontado, soma)
          : soma,
        parcela_atual: prev?.parcela_atual ?? null,
        parcela_total: prev?.parcela_total ?? null,
        origem: prev?.origem ?? "folha",
      });
    }
  }

  return [...porComp.values()].sort((a, b) => b.competencia.localeCompare(a.competencia));
}

export function snapshotMargemDeBaseGovernanca(
  base: Pick<BaseConsignacoesGoverno, "resumoMargemMensal">,
): SnapshotMargemOperacional {
  const serie = [...(base.resumoMargemMensal ?? [])].sort((a, b) =>
    b.competencia.localeCompare(a.competencia),
  );
  const ult = serie[0];
  if (!ult) {
    return {
      competencia: null,
      margem_consignavel: null,
      margem_cartao: null,
      margem_cartao_beneficio: null,
      possui_reserva_ativa: false,
      valor_reserva_ativa: null,
    };
  }
  const reservaCartao =
    ult.margem_cartao_total > 0 &&
    ult.margem_cartao_disponivel <= 0 &&
    ult.margem_cartao_utilizada > 0;

  return {
    competencia: ult.competencia,
    margem_consignavel: ult.margem_consignavel_disponivel,
    margem_cartao: ult.margem_cartao_disponivel,
    margem_cartao_beneficio: ult.margem_cartao_beneficio_disponivel,
    percentual_margem_consignavel: ult.margem_consignavel_percentual,
    percentual_margem_cartao: ult.margem_cartao_percentual,
    percentual_margem_cartao_beneficio: ult.margem_cartao_beneficio_percentual,
    possui_reserva_ativa: reservaCartao,
    valor_reserva_ativa: reservaCartao ? ult.margem_cartao_utilizada : null,
  };
}

export function detectarContextoOperacionalMargem(
  input: EntradaDetectarContextoOperacionalMargem,
): ContextoOperacionalMargem {
  const parcela_oficial = Math.abs(input.parcelaOficial || input.contrato.valor_parcela || 0);
  const compRef = competenciaRef(input.contrato);
  const linhasRef = compRef
    ? linhasNaCompetencia(input.linhasCompetencia, compRef)
    : input.linhasCompetencia.slice(0, 3);
  const soma_descontos_competencia = somaLinhasCompetencia(linhasRef);
  const qtd_linhas_competencia = linhasRef.length;

  const snapPct =
    input.percentualMargemUtilizada ??
    snapshotMargemDeBaseGovernanca({ resumoMargemMensal: [] }).percentual_margem_consignavel;

  const margemCtx = resolverMargemContrato(input.contrato, {
    margemDisponivel: input.margemDisponivel,
    margemCartao: input.margemCartao,
    margemCartaoBeneficio: input.margemCartaoBeneficio,
    percentualMargemUtilizada: snapPct,
  });

  const reserva_ativa = Boolean(input.reservaAtiva);
  const valor_reserva =
    input.valorReserva != null && input.valorReserva > 0 ? input.valorReserva : null;

  const tolerancia = resolverToleranciaDescontoFracionado();
  const diferencaSoma = Math.abs(soma_descontos_competencia - parcela_oficial);
  const somaFechaOficial =
    parcela_oficial > 0 &&
    diferencaDentroToleranciaFracionado(diferencaSoma, parcela_oficial, tolerancia);

  const fragmentacao_timeline =
    qtd_linhas_competencia >= 2 && somaFechaOficial && parcela_oficial > 0;

  const margem_disponivel = margemCtx.disponivel;
  const percentual_margem_utilizada = margemCtx.percentual;

  const margem_insuficiente_para_parcela =
    parcela_oficial > 0 &&
    margem_disponivel != null &&
    margem_disponivel >= 0 &&
    margem_disponivel < parcela_oficial * 0.2;

  const margem_esgotada =
    percentual_margem_utilizada != null && percentual_margem_utilizada >= 85;

  const desconto_parcial_na_folha =
    parcela_oficial > 0 &&
    soma_descontos_competencia > 0 &&
    soma_descontos_competencia < parcela_oficial * 0.9 &&
    !somaFechaOficial;

  let desconto_operacional_por_margem = false;
  let motivo: string | null = null;
  let severidade: ContextoOperacionalMargem["severidade"] = "nenhuma";

  if (fragmentacao_timeline) {
    desconto_operacional_por_margem = true;
    motivo = "Parcela oficial fragmentada em mais de um desconto na competência (margem operacional).";
    severidade = "alta";
  } else if (reserva_ativa && (valor_reserva ?? 0) > 0) {
    desconto_operacional_por_margem = true;
    motivo = "Reserva de margem (cartão/RMC) ativa reduz saldo disponível para novos descontos.";
    severidade = "alta";
  } else if (margem_insuficiente_para_parcela && (desconto_parcial_na_folha || soma_descontos_competencia === 0)) {
    desconto_operacional_por_margem = true;
    motivo =
      "Margem disponível inferior à parcela oficial — desconto parcial ou ausente é compatível com o portal.";
    severidade = "alta";
  } else if (margem_esgotada && (desconto_parcial_na_folha || fragmentacao_timeline)) {
    desconto_operacional_por_margem = true;
    motivo = "Margem consignável/cartão com utilização elevada — desconto operacional por limite.";
    severidade = "atencao";
  } else if (
    input.contrato.status === "suspenso" &&
    parcela_oficial > 0 &&
    soma_descontos_competencia < parcela_oficial * 0.5
  ) {
    desconto_operacional_por_margem = true;
    motivo = "Contrato suspenso no portal com desconto reduzido ou ausente na folha.";
    severidade = "atencao";
  } else if (input.baseConciliada?.length && compRef && parcela_oficial > 0) {
    const linhasFolha = linhasDescontoContratoNaCompetencia(
      input.contrato,
      input.baseConciliada,
      compRef,
    );
    if (linhasFolha.length >= 2) {
      const somaFolha = somaValoresDescontoLinhas(linhasFolha);
      const diff = Math.abs(somaFolha - parcela_oficial);
      if (diferencaDentroToleranciaFracionado(diff, parcela_oficial, tolerancia)) {
        desconto_operacional_por_margem = true;
        motivo = MENSAGEM_DESCONTO_OPERACIONAL_MARGEM;
        severidade = "alta";
      }
    }
  }

  return {
    desconto_operacional_por_margem,
    motivo,
    severidade,
    parcela_oficial,
    competencia_referencia: compRef || null,
    soma_descontos_competencia,
    qtd_linhas_competencia,
    margem_disponivel,
    margem_tipo: margemCtx.tipo,
    percentual_margem_utilizada,
    reserva_ativa,
    valor_reserva,
    fragmentacao_timeline,
    margem_insuficiente_para_parcela,
    desconto_parcial_na_folha,
  };
}

/** Prioridade estrutural: fragmentação operacional por margem sobrepõe refin/quebra/divergência. */
export function aplicarPrioridadeContextoOperacionalMargem<
  T extends ConsigfacilContrato,
>(contrato: T, contextoMargem: ContextoOperacionalMargem): T {
  const comContexto = { ...contrato, contexto_margem: contextoMargem };
  if (!contextoMargem.desconto_operacional_por_margem) {
    return comContexto;
  }
  return {
    ...comContexto,
    status_estrutural: STATUS_ESTRUTURAL_FRAGMENTADO_OPERACIONAL,
    divergencia_valor: false,
    remover_da_conferencia: true,
  };
}

export function contratoIgnoraDivergenciaValorPorMargem(
  contrato: Pick<ConsigfacilContrato, "contexto_margem" | "remover_da_conferencia">,
): boolean {
  return Boolean(
    contrato.remover_da_conferencia ||
      contrato.contexto_margem?.desconto_operacional_por_margem,
  );
}

export function pipelineContextoOperacionalMargemContrato<
  T extends ConsigfacilContrato,
>(input: {
  contrato: T;
  baseConciliada?: BaseConciliadaLinha[];
  snapshot?: SnapshotMargemOperacional | null;
}): T {
  const snap = input.snapshot ?? {};
  const pct =
    input.contrato.tipo_margem === "margem_cartao"
      ? snap.percentual_margem_cartao
      : input.contrato.tipo_margem === "margem_cartao_beneficio"
        ? snap.percentual_margem_cartao_beneficio
        : snap.percentual_margem_consignavel;

  const contextoMargem = detectarContextoOperacionalMargem({
    contrato: input.contrato,
    linhasCompetencia: linhasCompetenciaDeContrato(input.contrato, input.baseConciliada),
    parcelaOficial: input.contrato.valor_parcela || 0,
    margemDisponivel: snap.margem_consignavel,
    margemCartao: snap.margem_cartao,
    margemCartaoBeneficio: snap.margem_cartao_beneficio,
    reservaAtiva: snap.possui_reserva_ativa,
    valorReserva: snap.valor_reserva_ativa,
    percentualMargemUtilizada: pct,
    baseConciliada: input.baseConciliada,
  });

  return aplicarPrioridadeContextoOperacionalMargem(input.contrato, contextoMargem);
}

export function aplicarContextoOperacionalMargemEmContratos<
  T extends ConsigfacilContrato,
>(input: {
  contratos: T[];
  baseConciliada?: BaseConciliadaLinha[];
  snapshot?: SnapshotMargemOperacional | null;
}): T[] {
  return input.contratos.map((c) =>
    pipelineContextoOperacionalMargemContrato({
      contrato: c,
      baseConciliada: input.baseConciliada,
      snapshot: input.snapshot,
    }),
  );
}
