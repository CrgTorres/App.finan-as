/**
 * Score ponderado para matching ConsigFácil ↔ Loan (cadastro interno).
 *
 * É a função "oficial" que decide se a integração ConsigFácil deve ou não
 * SOBRESCREVER automaticamente o cadastro interno. As 4 faixas seguem o
 * contrato do usuário:
 *
 *  - score ≥ 90  → match_confirmado   (corrige base automaticamente)
 *  - 70 ≤ s < 90 → match_provavel     (sugere — pede confirmação)
 *  - 50 ≤ s < 70 → match_manual       (humano decide)
 *  - score < 50  → sem_match          (NÃO altera nada)
 *
 * Os critérios são ponderados separadamente para que o relatório em
 * `Match_Contratos` mostre cada componente do score.
 */

import type { Loan } from "@/types/contracheque";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import { detectarInstituicaoNaDescricao } from "@/lib/reading/instituicoes-financeiras";
import {
  autoridadePermiteJuizoEstrutural,
  classificarAutoridadeTemporalConsigfacil,
  entradaTemporalDeContrato,
} from "@/lib/consigfacil/autoridade-temporal-consigfacil";
import {
  avaliarBloqueioCorrelacaoPorValor,
  logCorrelacaoBloqueadaPorValor,
  montarEntradaContinuidadeLinhaContrato,
} from "@/lib/consigfacil/regras-correlacao-institucional";
import type { ConfigAuditoriaConsigfacil } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import {
  avaliarCompatibilidadeRubrica,
  PESO_SCORE_MATCH_RUBRICA_FORTE,
} from "@/lib/contratos/rubrica-identificador-forte";
import { validarEstruturaParcela } from "@/lib/contratos/validar-estrutura-parcela";
import {
  avaliarVinculacaoContextualContrato,
  modoForenseContratosAtivo,
} from "@/lib/contratos/vinculacao-contextual-contratos";
import {
  bonusConfiancaEstrutural,
  type EntidadeComEstrutura,
} from "@/lib/contratos/classificar-estrutura-contrato";
import {
  entradaPassivoDeLoan,
  identificarPassivoConsignavelEstrutural,
  MIN_SCORE_ESTRUTURAL_CORRELACAO,
  type ResultadoIdentificacaoPassivo,
} from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";
import {
  timelinePriorizaSobreValorIsolado,
  type LoanComTimeline,
} from "@/lib/conciliacao/timeline-estrutural-contrato";
import {
  avaliarCompatibilidadeEstruturalContratoConsigfacil,
  logEstruturaIncompativel,
} from "@/lib/conciliacao/assinatura-estrutural-contrato";

export type FaixaMatch = "match_confirmado" | "match_provavel" | "match_manual" | "sem_match";

export type ComponenteScoreMatch = {
  criterio: string;
  peso: number;
  obtido: number;
  motivo: string;
};

export type ResultadoScoreMatch = {
  score: number;
  faixa: FaixaMatch;
  componentes: ComponenteScoreMatch[];
  rubrica_identificador_forte: boolean;
  bloqueio_fusao_automatica: boolean;
  motivo_match: string;
  motivo_bloqueio_match: string | null;
  passivo_estrutural?: ResultadoIdentificacaoPassivo;
};

// Soma dos pesos = 100 (+ rubrica forte até +40 aplicado com teto em scoreMatchContrato).
const PESOS = {
  rubrica_forte: PESO_SCORE_MATCH_RUBRICA_FORTE,
  banco_oficial: 18,
  valor_parcela: 8,
  parcelas_total: 10,
  parcela_atual: 6,
  data: 5,
  modalidade: 5,
  margem: 3,
  cartao: 0,
  refinanciamento: 5,
} as const;

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compararBancoOficial(
  c: ConsigfacilContrato,
  l: Loan,
  temporalJuizoOficial: boolean,
): ComponenteScoreMatch {
  const oficialC = resolverInstituicaoOficial(c.instituicao);
  const rubricaNaDescricao = detectarInstituicaoNaDescricao(l.description ?? "");
  if (rubricaNaDescricao && oficialC) {
    const normRubrica =
      resolverInstituicaoOficial(rubricaNaDescricao.nome)?.nome_normalizado ??
      normalizar(rubricaNaDescricao.nome);
    if (normRubrica && normRubrica !== oficialC.nome_normalizado) {
      const bloqueio = avaliarBloqueioCorrelacaoPorValor({
        bancoHistorico: rubricaNaDescricao.nome,
        bancoConsigfacil: oficialC.nome_oficial,
        possuiDocumentoMigracao: c.possui_documento_migracao,
        possuiHistoricoTransicao: c.possui_historico_transicao,
        competencia: c.competencia,
        rubricaOriginal: l.description ?? null,
        descricaoFolha: l.description ?? null,
        idConsignacao: c.id_consignacao,
        codigoInstituicao: c.codigo_instituicao,
        textoContrato: c.texto_bruto,
        valorObservado: l.installment_amount,
        valorConsigfacil: c.valor_parcela,
      });
      if (bloqueio.bloquear_correlacao_por_valor) {
        return {
          criterio: "banco_oficial",
          peso: PESOS.banco_oficial,
          obtido: 0,
          motivo: `Instituições distintas — valor não vincula: "${rubricaNaDescricao.nome}" vs "${oficialC.nome_oficial}".`,
        };
      }
      if (bloqueio.continuidade.bloquear_confirmacao_consigfacil) {
        const obtido = Math.round(PESOS.banco_oficial * 0.35);
        return {
          criterio: "banco_oficial",
          peso: PESOS.banco_oficial,
          obtido,
          motivo: `Banco histórico na rubrica ("${rubricaNaDescricao.nome}") vs ConsigFácil ("${oficialC.nome_oficial}") — correlato fraco, não confirmação forte.`,
        };
      }
      if (!temporalJuizoOficial) {
        return {
          criterio: "banco_oficial",
          peso: PESOS.banco_oficial,
          obtido: Math.round(PESOS.banco_oficial * 0.85),
          motivo: `Banco histórico na rubrica ("${rubricaNaDescricao.nome}") vs ConsigFácil atual ("${oficialC.nome_oficial}") — não penaliza; correlato temporal.`,
        };
      }
      return {
        criterio: "banco_oficial",
        peso: PESOS.banco_oficial,
        obtido: 0,
        motivo: `Conflito histórico na rubrica: "${rubricaNaDescricao.nome}" vs ConsigFácil "${oficialC.nome_oficial}" — correlato fraco, não confirmação forte.`,
      };
    }
  }
  const oficialL = resolverInstituicaoOficial(l.institution_name ?? l.description ?? "");
  if (oficialC && oficialL && oficialC.nome_normalizado === oficialL.nome_normalizado) {
    return {
      criterio: "banco_oficial",
      peso: PESOS.banco_oficial,
      obtido: PESOS.banco_oficial,
      motivo: `Mesma instituição oficial: ${oficialC.nome_oficial}.`,
    };
  }
  // Fallback fuzzy textual.
  const a = normalizar(c.instituicao);
  const b = normalizar(l.institution_name ?? l.description ?? "");
  if (a && b) {
    if (a === b)
      return {
        criterio: "banco_oficial",
        peso: PESOS.banco_oficial,
        obtido: PESOS.banco_oficial,
        motivo: "Nome de banco bate exatamente.",
      };
    if (a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a))
      return {
        criterio: "banco_oficial",
        peso: PESOS.banco_oficial,
        obtido: Math.round(PESOS.banco_oficial * 0.7),
        motivo: "Nome de banco bate parcialmente (sem catálogo oficial).",
      };
  }
  return {
    criterio: "banco_oficial",
    peso: PESOS.banco_oficial,
    obtido: 0,
    motivo: `Banco diverge: "${c.instituicao}" vs "${l.institution_name ?? l.description ?? "—"}".`,
  };
}

function compararValorParcela(
  c: ConsigfacilContrato,
  l: Loan,
  passivo: ResultadoIdentificacaoPassivo,
): ComponenteScoreMatch {
  if (passivo.score_estrutural < MIN_SCORE_ESTRUTURAL_CORRELACAO) {
    return {
      criterio: "valor_parcela",
      peso: PESOS.valor_parcela,
      obtido: 0,
      motivo: `Score estrutural ${passivo.score_estrutural}/100 — valor não vincula (mín. ${MIN_SCORE_ESTRUTURAL_CORRELACAO}).`,
    };
  }
  if (!passivo.tem_parcela_nm && !passivo.tem_instituicao_financeira) {
    return {
      criterio: "valor_parcela",
      peso: PESOS.valor_parcela,
      obtido: 0,
      motivo:
        "Valor semelhante sem parcela N/M nem instituição na folha — correlação bloqueada (ex.: previdência/tributo).",
    };
  }
  const a = c.valor_parcela;
  const b = l.installment_amount;
  if (!a || !b)
    return {
      criterio: "valor_parcela",
      peso: PESOS.valor_parcela,
      obtido: 0,
      motivo: "Sem valor de parcela em uma das pontas.",
    };
  const dif = Math.abs(a - b) / Math.max(a, b);
  if (dif <= 0.01)
    return {
      criterio: "valor_parcela",
      peso: PESOS.valor_parcela,
      obtido: PESOS.valor_parcela,
      motivo: `Parcela bate (Δ ${(dif * 100).toFixed(1)}%).`,
    };
  if (dif <= 0.05)
    return {
      criterio: "valor_parcela",
      peso: PESOS.valor_parcela,
      obtido: Math.round(PESOS.valor_parcela * 0.85),
      motivo: `Parcela bate dentro de 5% (Δ ${(dif * 100).toFixed(1)}%).`,
    };
  if (dif <= 0.15)
    return {
      criterio: "valor_parcela",
      peso: PESOS.valor_parcela,
      obtido: Math.round(PESOS.valor_parcela * 0.55),
      motivo: `Parcela próxima (Δ ${(dif * 100).toFixed(1)}%).`,
    };
  return {
    criterio: "valor_parcela",
    peso: PESOS.valor_parcela,
    obtido: 0,
    motivo: `Parcela diverge (Δ ${(dif * 100).toFixed(1)}%).`,
  };
}

function loanEhHistorico(l: Loan): boolean {
  return (l as Loan & Partial<EntidadeComEstrutura>).tipo_estrutura === "historico";
}

function compararParcelasTotal(c: ConsigfacilContrato, l: Loan): ComponenteScoreMatch {
  if (loanEhHistorico(l)) {
    return {
      criterio: "parcelas_total",
      peso: PESOS.parcelas_total,
      obtido: Math.round(PESOS.parcelas_total * 0.5),
      motivo: "Cadastro histórico — total de parcelas não comparado estruturalmente.",
    };
  }
  if (c.parcela_atual == null && c.parcelas_total > 0) {
    if (!l.total_installments) {
      return {
        criterio: "parcelas_total",
        peso: PESOS.parcelas_total,
        obtido: Math.round(PESOS.parcelas_total * 0.5),
        motivo: "Portal informa total sem parcela corrente — comparação parcial.",
      };
    }
    const d = Math.abs(c.parcelas_total - l.total_installments);
    if (d === 0) {
      return {
        criterio: "parcelas_total",
        peso: PESOS.parcelas_total,
        obtido: PESOS.parcelas_total,
        motivo: `Total de parcelas idêntico (${c.parcelas_total}).`,
      };
    }
    if (d <= 1) {
      return {
        criterio: "parcelas_total",
        peso: PESOS.parcelas_total,
        obtido: Math.round(PESOS.parcelas_total * 0.8),
        motivo: `Total de parcelas próximo (Δ ${d}).`,
      };
    }
    if (d <= 3) {
      return {
        criterio: "parcelas_total",
        peso: PESOS.parcelas_total,
        obtido: Math.round(PESOS.parcelas_total * 0.4),
        motivo: `Total de parcelas diverge (Δ ${d}).`,
      };
    }
    return {
      criterio: "parcelas_total",
      peso: PESOS.parcelas_total,
      obtido: 0,
      motivo: `Total de parcelas muito diferente (Δ ${d}).`,
    };
  }

  const v = validarEstruturaParcela(c.parcela_atual ?? 0, c.parcelas_total);
  if (v.ocr_invalido) {
    return {
      criterio: "parcelas_total",
      peso: PESOS.parcelas_total,
      obtido: 0,
      motivo: v.motivo,
    };
  }
  if (!c.parcelas_total || !l.total_installments)
    return {
      criterio: "parcelas_total",
      peso: PESOS.parcelas_total,
      obtido: 0,
      motivo: "Sem total de parcelas para comparar.",
    };
  const d = Math.abs(c.parcelas_total - l.total_installments);
  if (d === 0)
    return {
      criterio: "parcelas_total",
      peso: PESOS.parcelas_total,
      obtido: PESOS.parcelas_total,
      motivo: `Total de parcelas idêntico (${c.parcelas_total}).`,
    };
  if (d <= 1)
    return {
      criterio: "parcelas_total",
      peso: PESOS.parcelas_total,
      obtido: Math.round(PESOS.parcelas_total * 0.8),
      motivo: `Total de parcelas próximo (Δ ${d}).`,
    };
  if (d <= 3)
    return {
      criterio: "parcelas_total",
      peso: PESOS.parcelas_total,
      obtido: Math.round(PESOS.parcelas_total * 0.4),
      motivo: `Total de parcelas diverge (Δ ${d}).`,
    };
  return {
    criterio: "parcelas_total",
    peso: PESOS.parcelas_total,
    obtido: 0,
    motivo: `Total de parcelas muito diferente (Δ ${d}).`,
  };
}

function compararRubricaForte(c: ConsigfacilContrato, l: Loan): ComponenteScoreMatch {
  const rub = avaliarCompatibilidadeRubrica(
    c.texto_bruto,
    l.description ?? l.institution_name,
    c.codigo_instituicao,
    l.rubrica_code,
  );
  if (!rub.compativel) {
    return {
      criterio: "rubrica_forte",
      peso: PESOS.rubrica_forte,
      obtido: 0,
      motivo: rub.motivo_bloqueio ?? "Rubrica forte divergente — fusão bloqueada.",
    };
  }
  if (rub.rubrica_a && rub.rubrica_b && rub.rubrica_a === rub.rubrica_b) {
    return {
      criterio: "rubrica_forte",
      peso: PESOS.rubrica_forte,
      obtido: PESOS.rubrica_forte,
      motivo: `Rubrica forte compatível (${rub.rubrica_a}).`,
    };
  }
  if (rub.rubrica_identificador_forte) {
    return {
      criterio: "rubrica_forte",
      peso: PESOS.rubrica_forte,
      obtido: Math.round(PESOS.rubrica_forte * 0.35),
      motivo: "Rubrica forte parcialmente identificada em um dos lados.",
    };
  }
  return {
    criterio: "rubrica_forte",
    peso: PESOS.rubrica_forte,
    obtido: 0,
    motivo: "Sem rubrica de identificador forte (EMP/BB-EMP/BIB/BANCOOB).",
  };
}

function compararParcelaAtual(c: ConsigfacilContrato, l: Loan): ComponenteScoreMatch {
  if (loanEhHistorico(l)) {
    return {
      criterio: "parcela_atual",
      peso: PESOS.parcela_atual,
      obtido: Math.round(PESOS.parcela_atual * 0.5),
      motivo: "Cadastro histórico — parcela atual não comparada estruturalmente.",
    };
  }
  if (c.parcela_atual == null) {
    return {
      criterio: "parcela_atual",
      peso: PESOS.parcela_atual,
      obtido: Math.round(PESOS.parcela_atual * 0.5),
      motivo: "Parcela atual não informada no portal — pontuação neutra.",
    };
  }
  const vc = validarEstruturaParcela(c.parcela_atual, c.parcelas_total);
  const vl = validarEstruturaParcela(l.paid_installments ?? 0, l.total_installments ?? 0);
  if (vc.ocr_invalido || vl.ocr_invalido) {
    return {
      criterio: "parcela_atual",
      peso: PESOS.parcela_atual,
      obtido: 0,
      motivo: vc.ocr_invalido ? vc.motivo : vl.motivo,
    };
  }
  if (!c.parcela_atual || !l.paid_installments)
    return {
      criterio: "parcela_atual",
      peso: PESOS.parcela_atual,
      obtido: Math.round(PESOS.parcela_atual * 0.5),
      motivo: "Sem parcela atual em uma das pontas — pontuação neutra.",
    };
  const d = Math.abs(c.parcela_atual - l.paid_installments);
  if (d <= 1)
    return {
      criterio: "parcela_atual",
      peso: PESOS.parcela_atual,
      obtido: PESOS.parcela_atual,
      motivo: `Parcela atual bate (Δ ${d}).`,
    };
  if (d <= 3)
    return {
      criterio: "parcela_atual",
      peso: PESOS.parcela_atual,
      obtido: Math.round(PESOS.parcela_atual * 0.5),
      motivo: `Parcela atual próxima (Δ ${d}).`,
    };
  return {
    criterio: "parcela_atual",
    peso: PESOS.parcela_atual,
    obtido: 0,
    motivo: `Parcela atual diverge (Δ ${d}).`,
  };
}

function compararData(c: ConsigfacilContrato, l: Loan): ComponenteScoreMatch {
  const lStart = l.start_date ? String(l.start_date).slice(0, 7) : null;
  const cComp = c.competencia || (c.data_contrato ? c.data_contrato.slice(0, 7) : null);
  if (!lStart || !cComp)
    return {
      criterio: "data",
      peso: PESOS.data,
      obtido: Math.round(PESOS.data * 0.5),
      motivo: "Sem data de referência — pontuação neutra.",
    };
  // Distância em meses entre cComp e lStart.
  const [ya, ma] = cComp.split("-").map(Number);
  const [yb, mb] = lStart.split("-").map(Number);
  const meses = Math.abs((ya - yb) * 12 + (ma - mb));
  if (meses <= 2)
    return {
      criterio: "data",
      peso: PESOS.data,
      obtido: PESOS.data,
      motivo: `Datas próximas (Δ ${meses} mês(es)).`,
    };
  if (meses <= 6)
    return {
      criterio: "data",
      peso: PESOS.data,
      obtido: Math.round(PESOS.data * 0.6),
      motivo: `Datas razoáveis (Δ ${meses} mês(es)).`,
    };
  if (meses <= 12)
    return {
      criterio: "data",
      peso: PESOS.data,
      obtido: Math.round(PESOS.data * 0.25),
      motivo: `Datas distantes (Δ ${meses} mês(es)).`,
    };
  return {
    criterio: "data",
    peso: PESOS.data,
    obtido: 0,
    motivo: `Datas muito distantes (Δ ${meses} mês(es)).`,
  };
}

function compararModalidade(c: ConsigfacilContrato, l: Loan): ComponenteScoreMatch {
  // Cartão benefício no ConsigFácil e tipo_contrato "cartao" no loan → casa.
  const cIsCartao = c.eh_cartao || c.eh_cartao_beneficio;
  const lTipo = (l.tipo_contrato ?? "").toLowerCase();
  const lIsCartao = lTipo.includes("cart");
  if (cIsCartao && lIsCartao)
    return {
      criterio: "modalidade",
      peso: PESOS.modalidade,
      obtido: PESOS.modalidade,
      motivo: "Ambas marcadas como cartão.",
    };
  if (!cIsCartao && !lIsCartao)
    return {
      criterio: "modalidade",
      peso: PESOS.modalidade,
      obtido: PESOS.modalidade,
      motivo: "Ambas marcadas como empréstimo comum.",
    };
  return {
    criterio: "modalidade",
    peso: PESOS.modalidade,
    obtido: 0,
    motivo: `Modalidade diverge: ConsigFácil ${cIsCartao ? "cartão" : "empréstimo"} vs cadastro ${lIsCartao ? "cartão" : "empréstimo"}.`,
  };
}

function compararMargem(c: ConsigfacilContrato): ComponenteScoreMatch {
  if (c.tipo_margem != null && c.tipo_margem !== "outra" && c.tipo_margem !== "desconhecida") {
    return {
      criterio: "margem",
      peso: PESOS.margem,
      obtido: PESOS.margem,
      motivo: `Margem oficial: ${c.tipo_margem}.`,
    };
  }
  return {
    criterio: "margem",
    peso: PESOS.margem,
    obtido: 0,
    motivo: "ConsigFácil não informou tipo de margem.",
  };
}

function compararCartao(c: ConsigfacilContrato, l: Loan): ComponenteScoreMatch {
  if (c.eh_cartao_beneficio && (l.tipo_contrato ?? "").toLowerCase().includes("benef")) {
    return {
      criterio: "cartao",
      peso: PESOS.cartao,
      obtido: PESOS.cartao,
      motivo: "Cartão benefício identificado nos dois lados.",
    };
  }
  if (!c.eh_cartao_beneficio) {
    return {
      criterio: "cartao",
      peso: PESOS.cartao,
      obtido: PESOS.cartao,
      motivo: "Não é cartão benefício — critério neutro.",
    };
  }
  return {
    criterio: "cartao",
    peso: PESOS.cartao,
    obtido: 0,
    motivo: "Cartão benefício no oficial, mas cadastro não está marcado como cartão benefício.",
  };
}

function compararRefin(c: ConsigfacilContrato, l: Loan): ComponenteScoreMatch {
  // Esse critério dá ponto quando o status do ConsigFácil é coerente com o `status` do loan.
  // Refinanciamento marca AMBOS lados ou nenhum.
  const cRefin = c.eh_refinanciamento || !!c.contrato_substituido;
  const lRefin = (l.status_analise_contracheque ?? "").includes("refin");
  if (cRefin && lRefin)
    return {
      criterio: "refinanciamento",
      peso: PESOS.refinanciamento,
      obtido: PESOS.refinanciamento,
      motivo: "Refinanciamento confirmado nos dois lados.",
    };
  if (!cRefin && !lRefin)
    return {
      criterio: "refinanciamento",
      peso: PESOS.refinanciamento,
      obtido: PESOS.refinanciamento,
      motivo: "Sem refinanciamento — critério neutro.",
    };
  return {
    criterio: "refinanciamento",
    peso: PESOS.refinanciamento,
    obtido: 0,
    motivo: cRefin
      ? "ConsigFácil aponta refinanciamento mas cadastro interno não."
      : "Cadastro marca refinanciamento mas ConsigFácil não.",
  };
}

export function scoreMatchContrato(input: {
  contrato: ConsigfacilContrato;
  loan: Loan;
  config?: ConfigAuditoriaConsigfacil;
  /** Competência da folha/desconto observado (yyyy-mm). */
  competenciaFolha?: string | null;
}): ResultadoScoreMatch | null {
  const { contrato, loan, config } = input;

  const loanTimeline = loan as LoanComTimeline;
  const passivo = identificarPassivoConsignavelEstrutural(
    entradaPassivoDeLoan(loan, {
      competencia: input.competenciaFolha,
      id_consignacao_consigfacil: contrato.id_consignacao,
      consigfacil_confirmado: false,
    }),
  );
  if (!passivo.consignavel || passivo.score_estrutural < MIN_SCORE_ESTRUTURAL_CORRELACAO) {
    return null;
  }

  const compatEstrutural = avaliarCompatibilidadeEstruturalContratoConsigfacil({
    contrato,
    loan,
    possui_migracao_documentada:
      contrato.possui_documento_migracao ?? contrato.possui_historico_transicao,
    timeline: loanTimeline.timeline_analise ?? null,
  });
  if (compatEstrutural.bloquear_correlacao) {
    logEstruturaIncompativel({
      id_consignacao: contrato.id_consignacao,
      rubrica_observada: loan.description ?? loan.institution_name ?? null,
      motivos: compatEstrutural.motivos,
    });
    return {
      score: 0,
      faixa: "sem_match",
      componentes: [
        {
          criterio: "estrutura_folha",
          peso: 0,
          obtido: 0,
          motivo: compatEstrutural.motivos.join(" "),
        },
      ],
      rubrica_identificador_forte: false,
      bloqueio_fusao_automatica: true,
      motivo_match: "",
      motivo_bloqueio_match: compatEstrutural.mensagem_ui,
      passivo_estrutural: passivo,
    };
  }

  const timelineConfirma =
    loanTimeline.timeline_analise != null &&
    timelinePriorizaSobreValorIsolado(loanTimeline.timeline_analise);
  const temporal = classificarAutoridadeTemporalConsigfacil(
    entradaTemporalDeContrato(contrato, input.competenciaFolha, {
      bancoConsigfacil: contrato.instituicao,
      bancoHistorico: loan.institution_name ?? loan.description,
    }),
  );
  const juizoOficial = autoridadePermiteJuizoEstrutural(temporal.autoridade_temporal);

  const componentes: ComponenteScoreMatch[] = [
    {
      criterio: "estrutura_folha",
      peso: 0,
      obtido: 0,
      motivo: `Passivo estrutural ${passivo.score_estrutural}/100 (${passivo.tipo_passivo}): parcela ${passivo.detalhe_score.parcela_nm}, instit. ${passivo.detalhe_score.instituicao}, recorr. ${passivo.detalhe_score.recorrencia}, CF ${passivo.detalhe_score.consigfacil}.`,
    },
    compararRubricaForte(contrato, loan),
    compararBancoOficial(contrato, loan, juizoOficial),
    compararValorParcela(contrato, loan, passivo),
    compararParcelasTotal(contrato, loan),
    compararParcelaAtual(contrato, loan),
    compararData(contrato, loan),
    compararModalidade(contrato, loan),
    compararMargem(contrato),
    compararCartao(contrato, loan),
    compararRefin(contrato, loan),
  ];
  const scoreBruto = componentes.reduce((s, c) => s + c.obtido, 0);
  const cE = contrato as ConsigfacilContrato & Partial<EntidadeComEstrutura>;
  const lE = loan as Loan & Partial<EntidadeComEstrutura>;
  const bonusCf = bonusConfiancaEstrutural(cE.fonte_estrutura_contrato ?? "consigfacil");
  const bonusLoan =
    lE.tipo_estrutura === "estrutural"
      ? bonusConfiancaEstrutural(lE.fonte_estrutura_contrato ?? "inferencia_historica") * 0.5
      : 0;
  const score = Math.min(100, scoreBruto + bonusCf * 0.25 + bonusLoan);
  let faixa = faixaPorScore(score);

  const ctx = avaliarVinculacaoContextualContrato({
    contrato,
    loan,
    config,
    scoreBase: score,
  });

  const rubrica_identificador_forte = ctx.debug.rubrica_identificador_forte;
  let bloqueio_fusao_automatica = ctx.bloqueio_fusao_automatica;
  if (modoForenseContratosAtivo(config) && ctx.divergencia_estrutural) {
    bloqueio_fusao_automatica = true;
  }
  if (bloqueio_fusao_automatica && faixa === "match_confirmado") {
    faixa = "match_manual";
  }
  if (!juizoOficial && faixa === "match_confirmado") {
    faixa = "match_provavel";
  }
  if (
    !juizoOficial &&
    (temporal.autoridade_temporal === "migracao_carga_inicial" ||
      temporal.autoridade_temporal === "contextual_historica")
  ) {
    bloqueio_fusao_automatica = true;
    if (faixa === "match_confirmado" || faixa === "match_provavel") {
      faixa = "match_manual";
    }
  }

  const bloqueioValor = avaliarBloqueioCorrelacaoPorValor({
    ...montarEntradaContinuidadeLinhaContrato({
      linha: {
        instituicao_original_folha: loan.institution_name ?? loan.description ?? null,
        banco_origem: loan.institution_name ?? null,
        competencia: input.competenciaFolha ?? contrato.competencia,
      },
      contrato,
    }),
    rubricaOriginal: loan.description ?? null,
    descricaoFolha: loan.description ?? null,
    idConsignacao: contrato.id_consignacao,
    codigoInstituicao: contrato.codigo_instituicao,
    textoContrato: contrato.texto_bruto,
    valorObservado: loan.installment_amount,
    valorConsigfacil: contrato.valor_parcela,
  });

  let scoreFinal = score;
  let faixaFinal = faixa;
  let motivoBloqueio = ctx.motivo_bloqueio_match;

  if (bloqueioValor.bloquear_correlacao_por_valor && !timelineConfirma) {
    logCorrelacaoBloqueadaPorValor({
      rubrica_original: loan.description ?? null,
      banco_original: loan.institution_name ?? null,
      valor_observado: loan.installment_amount,
      contrato_consigfacil: contrato.id_consignacao,
      banco_consigfacil: contrato.instituicao,
      valor_consigfacil: contrato.valor_parcela,
      motivo: bloqueioValor.motivo_log,
    });
    scoreFinal = Math.min(scoreFinal, 35);
    faixaFinal = "sem_match";
    bloqueio_fusao_automatica = true;
    motivoBloqueio = bloqueioValor.mensagem_ui;
  }

  if (timelineConfirma && scoreFinal < 70) {
    scoreFinal = Math.max(scoreFinal, 72);
    if (faixaFinal === "sem_match") faixaFinal = "match_manual";
  }

  if (scoreFinal < MIN_SCORE_ESTRUTURAL_CORRELACAO) {
    scoreFinal = Math.min(scoreFinal, 49);
    faixaFinal = "sem_match";
    bloqueio_fusao_automatica = true;
    motivoBloqueio =
      motivoBloqueio ??
      `Correlação exige estrutura folha ≥ ${MIN_SCORE_ESTRUTURAL_CORRELACAO} (atual ${passivo.score_estrutural}).`;
  }

  return {
    score: scoreFinal,
    faixa: faixaFinal,
    componentes,
    rubrica_identificador_forte,
    bloqueio_fusao_automatica,
    motivo_match: ctx.motivo_match,
    motivo_bloqueio_match: motivoBloqueio,
    passivo_estrutural: passivo,
  };
}

export function faixaPorScore(score: number): FaixaMatch {
  if (score >= 90) return "match_confirmado";
  if (score >= 70) return "match_provavel";
  if (score >= 50) return "match_manual";
  return "sem_match";
}

/** Para a aba `Match_Contratos` da exportação. */
export type LinhaMatchContrato = {
  id_consignacao: string;
  loan_id: string | null;
  instituicao_oficial: string;
  score: number;
  faixa: FaixaMatch;
  componentes: string;
};
