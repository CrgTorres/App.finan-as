import type { ConsigfacilAjusteBase, ConsigfacilConfirmacao } from "@/types/consigfacil";
import type { ContextoInstituicaoConciliacao } from "@/lib/conciliacao/contexto-instituicao-folha-consigfacil";
import {
  continuidadeBloqueiaCorrelacaoExibida,
  metadadosChaveConsolidacaoPorContinuidade,
} from "@/lib/consigfacil/regras-correlacao-institucional";
import { MENSAGEM_ESTRUTURA_INCOMPATIVEL } from "@/lib/conciliacao/assinatura-estrutural-contrato";
import { MENSAGEM_DESCONTO_FRACIONADO_MARGEM } from "@/lib/contratos/detectar-desconto-fracionado-margem";
import type { MetadadosChaveConsolidacaoDivergencia } from "@/lib/conciliacao/consolidar-divergencias-contextuais";

type AlvoComCorrelacao = {
  confirmacao_consigfacil?: ConsigfacilConfirmacao;
  contexto_instituicao?: ContextoInstituicaoConciliacao | null;
  instituicao_original_folha?: string | null;
  banco_origem?: string | null;
  competencia?: string | null;
  descricao_original?: string | null;
  descricao_normalizada?: string | null;
};

export function metadadosCorrelacaoDeAlvo(
  alvo: AlvoComCorrelacao | undefined,
  contratoConsigfacil: string | null,
): MetadadosChaveConsolidacaoDivergencia | undefined {
  if (!alvo) return undefined;

  const ctx = alvo.contexto_instituicao;
  const cf = alvo.confirmacao_consigfacil;
  const continuidade = ctx?.continuidade_institucional;
  const bloqueioContinuidade = continuidade
    ? continuidadeBloqueiaCorrelacaoExibida(continuidade)
    : cf?.tipo_correlacao === "sem_relacao_confirmada";

  const estruturaIncompativel =
    cf?.mensagem_correlacao?.trim() === MENSAGEM_ESTRUTURA_INCOMPATIVEL;
  const descontoFracionadoMargem =
    cf?.mensagem_correlacao?.trim() === MENSAGEM_DESCONTO_FRACIONADO_MARGEM ||
    /desconto\s+fracionado|soma\s+fecha\s+com\s+a\s+parcela\s+oficial/i.test(
      cf?.mensagem_correlacao ?? "",
    );

  const base = {
    banco_original:
      ctx?.banco_original ??
      cf?.banco_original ??
      alvo.instituicao_original_folha ??
      alvo.banco_origem ??
      null,
    rubrica_original:
      alvo.descricao_original ?? alvo.descricao_normalizada ?? null,
    competencia: alvo.competencia ?? null,
    contrato_consigfacil: contratoConsigfacil,
    tipo_correlacao: ctx?.tipo_correlacao ?? cf?.tipo_correlacao ?? null,
    bloquear_correlacao_por_valor: Boolean(
      continuidade?.bloquear_correlacao_por_valor ??
        (cf?.tipo_correlacao === "sem_relacao_confirmada" && bloqueioContinuidade),
    ),
    continuidade_institucional_comprovada:
      continuidade != null
        ? continuidade.permitir_correlacao && !bloqueioContinuidade
        : cf?.tipo_correlacao != null
          ? cf.tipo_correlacao !== "sem_relacao_confirmada"
          : undefined,
    estrutura_incompativel: estruturaIncompativel && !descontoFracionadoMargem,
    desconto_fracionado_margem: descontoFracionadoMargem,
  };

  if (continuidade) {
    return metadadosChaveConsolidacaoPorContinuidade(continuidade, base);
  }

  return {
    ...base,
    correlacao_institucional_valida:
      cf?.tipo_correlacao != null && cf.tipo_correlacao !== "sem_relacao_confirmada",
  };
}

export function criarResolverMetaDivergenciaContextual(input: {
  loans?: Array<{ id: string } & AlvoComCorrelacao>;
  linhasBase?: Array<{ id: string } & AlvoComCorrelacao>;
}): (a: ConsigfacilAjusteBase) => MetadadosChaveConsolidacaoDivergencia | undefined {
  const loansById = new Map((input.loans ?? []).map((l) => [l.id, l]));
  const baseById = new Map((input.linhasBase ?? []).map((l) => [l.id, l]));

  return (a) => {
    if (a.alvo_tipo === "loan") {
      return metadadosCorrelacaoDeAlvo(loansById.get(a.alvo_id), a.id_consignacao);
    }
    if (a.alvo_tipo === "base_conciliada") {
      return metadadosCorrelacaoDeAlvo(baseById.get(a.alvo_id), a.id_consignacao);
    }
    return metadadosCorrelacaoDeAlvo(undefined, a.id_consignacao);
  };
}
