import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type { ResultadoScoreRiscoFinanceiro } from "@/lib/conciliacao/score-risco-financeiro";
import type { Loan } from "@/types/contracheque";
import type {
  BaseConsignacoesGoverno,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import type {
  ResultadoAtualizacaoBaseComConsigfacil,
} from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";

/**
 * Cada linha da aba `Auditoria_Financeira` é uma "achado" — uma observação sobre
 * a base que merece atenção do usuário. Mistura agregados (score) e linhas
 * individuais (uma duplicidade, um contrato sem vínculo, etc.).
 */
export type LinhaAuditoriaFinanceira = {
  tipo:
    | "score"
    | "duplicidade"
    | "contrato_sem_vinculo"
    | "credito_sem_contrato"
    | "desconto_suspeito"
    | "cartao_rmc_rcc"
    | "consigfacil_refinanciamento"
    | "consigfacil_margem"
    | "consigfacil_divergencia"
    | "consigfacil_contrato_sem_desconto"
    | "consigfacil_desconto_sem_contrato"
    | "consigfacil_ajuste_confirmado"
    | "consigfacil_ajuste_divergencia";
  identificador: string;
  competencia: string | null;
  descricao: string;
  valor: number | null;
  status_conciliacao: string | null;
  recomendacao: string;
};

export function buildAbaAuditoriaFinanceira(input: {
  score: ResultadoScoreRiscoFinanceiro;
  baseConciliada: BaseConciliadaLinha[];
  loans: Loan[];
  consigfacil?: BaseConsignacoesGoverno;
  consigfacilConciliacao?: ResultadoAtualizacaoBaseComConsigfacil;
}): LinhaAuditoriaFinanceira[] {
  const linhas: LinhaAuditoriaFinanceira[] = [];

  linhas.push({
    tipo: "score",
    identificador: "indice_risco_financeiro",
    competencia: null,
    descricao: `Índice de risco financeiro: ${input.score.indice_risco_financeiro}/100 (${input.score.classificacao}).`,
    valor: input.score.indice_risco_financeiro,
    status_conciliacao: null,
    recomendacao:
      input.score.classificacao === "baixo"
        ? "Manter monitoramento. Conferir contratos novos."
        : "Revisar contratos, cartões consignados e descontos sem origem.",
  });

  for (const c of input.score.componentes) {
    linhas.push({
      tipo: "score",
      identificador: c.sinal,
      competencia: null,
      descricao: `[${c.sinal}] peso=${c.peso} · intensidade=${c.intensidade.toFixed(2)} → contribui ${c.contribuicao.toFixed(2)} pts.`,
      valor: c.contribuicao,
      status_conciliacao: null,
      recomendacao: c.detalhe,
    });
  }

  for (const l of input.baseConciliada) {
    if (l.possivel_duplicidade) {
      linhas.push({
        tipo: "duplicidade",
        identificador: l.id,
        competencia: l.competencia,
        descricao: `Possível duplicidade salário-extrato vs. contracheque (${l.descricao_normalizada}).`,
        valor: l.valor,
        status_conciliacao: l.status_conciliacao,
        recomendacao:
          "Confirmar manualmente: o valor já está no líquido da folha, não somar nos gráficos de bruto.",
      });
    }
    if (
      l.origem === "extrato_bancario" &&
      l.categoria_canonica === "emprestimo_pessoal_creditado" &&
      !l.vinculo_contrato_id
    ) {
      linhas.push({
        tipo: "credito_sem_contrato",
        identificador: l.id,
        competencia: l.competencia,
        descricao: `Crédito bancário classificado como empréstimo pessoal sem contrato anexado: ${l.descricao_normalizada}.`,
        valor: l.valor,
        status_conciliacao: l.status_conciliacao,
        recomendacao: "Anexar contrato correspondente ou marcar como transferência própria/Pix.",
      });
    }
    if (
      l.status_conciliacao === "precisa_revisao" &&
      (l.natureza === "desconto" || l.natureza === "cartao") &&
      l.origem === "extrato_bancario"
    ) {
      linhas.push({
        tipo: "desconto_suspeito",
        identificador: l.id,
        competencia: l.competencia,
        descricao: `Desconto bancário com origem incerta: ${l.descricao_normalizada}.`,
        valor: l.valor,
        status_conciliacao: l.status_conciliacao,
        recomendacao: "Verificar se corresponde a parcela já presente na folha ou contrato.",
      });
    }
    if (
      l.categoria_canonica === "rmc" ||
      l.categoria_canonica === "rcc" ||
      l.categoria_canonica === "cartao_consignado_folha" ||
      l.categoria_canonica === "cartao_consignado_extrato"
    ) {
      linhas.push({
        tipo: "cartao_rmc_rcc",
        identificador: l.id,
        competencia: l.competencia,
        descricao: `Cartão consignado / RMC / RCC: ${l.descricao_normalizada}.`,
        valor: l.valor,
        status_conciliacao: l.status_conciliacao,
        recomendacao:
          "Reforço de auditoria: cartão consignado é vetor comum de juros embutidos.",
      });
    }
  }

  for (const c of input.loans) {
    const tem = input.baseConciliada.some(
      (l) => l.vinculo_contrato_id === c.id && l.origem === "extrato_bancario",
    );
    if (!tem) {
      linhas.push({
        tipo: "contrato_sem_vinculo",
        identificador: c.id,
        competencia: String(c.start_date).slice(0, 7),
        descricao: `Contrato sem crédito bancário compatível: ${c.description}.`,
        valor: c.total_amount,
        status_conciliacao: null,
        recomendacao:
          "Importar extrato do mês da assinatura ou marcar contrato como crédito recebido em outra conta.",
      });
    }
  }

  // -------------------------------------------------------------------------
  // Achados ConsigFácil
  // -------------------------------------------------------------------------
  if (input.consigfacil) {
    for (const r of input.consigfacil.refinanciamentos) {
      linhas.push({
        tipo: "consigfacil_refinanciamento",
        identificador: `${r.contrato_origem}→${r.contrato_destino}`,
        competencia: null,
        descricao: `Refinanciamento ${r.tipo_refinanciamento} no banco ${r.banco}.`,
        valor: null,
        status_conciliacao: null,
        recomendacao: `Grau de confiança ${(r.grau_confianca * 100).toFixed(0)}% — revisar contratos.`,
      });
    }
    for (const m of input.consigfacil.margens) {
      if (m.percentual_comprometido >= 70) {
        linhas.push({
          tipo: "consigfacil_margem",
          identificador: `${m.tipo_margem}__${m.competencia}`,
          competencia: m.competencia,
          descricao: `Margem ${m.tipo_margem} comprometida em ${m.percentual_comprometido.toFixed(0)}%.`,
          valor: m.margem_utilizada,
          status_conciliacao: null,
          recomendacao:
            "Comprometimento alto — evitar novos contratos e considerar portabilidade com redução de parcela.",
        });
      }
    }
  }

  if (input.consigfacilConciliacao) {
    for (const d of input.consigfacilConciliacao.divergenciasFolhaExtrato) {
      linhas.push({
        tipo: "consigfacil_divergencia",
        identificador: d.id_consignacao,
        competencia: d.competencia,
        descricao: `${d.instituicao}: ${d.motivo}`,
        valor: d.diferenca,
        status_conciliacao: null,
        recomendacao:
          "Conferir extrato do mês: o valor do ConsigFácil (oficial) é a referência.",
      });
    }
    for (const r of input.consigfacilConciliacao.resultadosConciliacao) {
      if (r.linhas_base_conciliada_ids.length === 0) {
        linhas.push({
          tipo: "consigfacil_contrato_sem_desconto",
          identificador: r.id_consignacao,
          competencia: null,
          descricao: `Contrato ativo no ConsigFácil sem desconto correspondente na folha/extrato.`,
          valor: null,
          status_conciliacao: null,
          recomendacao:
            "Importar contracheques/extratos do período ou marcar contrato como suspenso/em averbação.",
        });
      }
    }
    // Cada ajuste vira uma linha de auditoria — assim a `Auditoria_Financeira`
    // já documenta confirmações/divergências sem precisar abrir aba separada.
    for (const ajuste of input.consigfacilConciliacao.ajustes) {
      linhas.push({
        tipo:
          ajuste.tipo_ajuste === "confirmado"
            ? "consigfacil_ajuste_confirmado"
            : "consigfacil_ajuste_divergencia",
        identificador: `${ajuste.id_consignacao}::${ajuste.campo}::${ajuste.alvo_id}`,
        competencia: null,
        descricao: ajuste.motivo_ajuste,
        valor: typeof ajuste.valor_oficial === "number" ? ajuste.valor_oficial : null,
        status_conciliacao: null,
        recomendacao:
          ajuste.tipo_ajuste === "divergencia"
            ? `Original (${ajuste.fonte_original}): ${ajuste.valor_original} · Oficial ConsigFácil: ${ajuste.valor_oficial}. Conferir manualmente.`
            : `Campo ${ajuste.campo} confere com ConsigFácil — sem ação.`,
      });
    }
  }

  return linhas;
}
