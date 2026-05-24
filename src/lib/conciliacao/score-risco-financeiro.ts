import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type { Loan } from "@/types/contracheque";
import type {
  BaseConsignacoesGoverno,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import type {
  ResultadoAtualizacaoBaseComConsigfacil,
} from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";

/**
 * Sinais que entram no `indice_risco_financeiro`. Os pesos somam, no pior caso, 100.
 * Cada sinal é binário/contínuo (0..1) e multiplica pelo `peso`.
 *
 * - juros_abusivos / cet_elevado: aproximados via diff `installment * total − total_amount`.
 * - venda_casada / seguro_embutido: rubricas de seguro/tarifa no contracheque.
 * - rmc_rcc / saque_complementar: categorias canônicas da Base_Conciliada.
 * - refinanciamento_recorrente: contratos com observações de refin/portabilidade.
 * - emprestimo_sem_contrato: crédito de empréstimo no extrato sem `vinculo_contrato_id`.
 * - desconto_sem_origem: linhas `precisa_revisao` em descontos.
 * - credito_sem_vinculo: contratos sem transação bancária correspondente.
 */
export type SinalRiscoFinanceiro =
  | "juros_abusivos"
  | "cet_elevado"
  | "venda_casada"
  | "seguro_embutido"
  | "rmc_rcc"
  | "saque_complementar"
  | "refinanciamento_recorrente"
  | "emprestimo_sem_contrato"
  | "desconto_sem_origem"
  | "credito_sem_vinculo"
  // --- novos sinais (oficial ConsigFácil)
  | "refinanciamentos_sucessivos"
  | "margem_excessivamente_comprometida"
  | "cartao_beneficio_oculto"
  | "saque_sem_contrato_claro"
  | "divergencia_consigfacil_folha"
  | "contrato_ativo_sem_desconto"
  | "desconto_sem_contrato_ativo";

export type ClassificacaoRiscoFinanceiro = "baixo" | "medio" | "alto" | "critico";

export type ComponenteScoreRisco = {
  sinal: SinalRiscoFinanceiro;
  peso: number;
  intensidade: number;
  contribuicao: number;
  detalhe: string;
};

export type ResultadoScoreRiscoFinanceiro = {
  /** 0..100 — quanto maior, pior. */
  indice_risco_financeiro: number;
  classificacao: ClassificacaoRiscoFinanceiro;
  componentes: ComponenteScoreRisco[];
  /** Alertas humanos (mesmos textos exibidos no painel). */
  alertas: string[];
  /**
   * 0..100 — confiança da base. ConsigFácil aumenta este valor; conflitos
   * resolvidos manualmente também aumentam. Nunca subtraído pelo risco.
   *
   * UI mostra ambos lado a lado: "Risco 32 / Confiança 78" — mais transparente
   * que tentar misturar os dois num único número.
   */
  indice_confianca_base: number;
};

const PESOS: Record<SinalRiscoFinanceiro, number> = {
  juros_abusivos: 15,
  cet_elevado: 12,
  venda_casada: 10,
  seguro_embutido: 8,
  rmc_rcc: 12,
  saque_complementar: 8,
  refinanciamento_recorrente: 10,
  emprestimo_sem_contrato: 10,
  desconto_sem_origem: 8,
  credito_sem_vinculo: 7,
  // Novos sinais ConsigFácil — pesos ajustáveis após calibragem real.
  refinanciamentos_sucessivos: 12,
  margem_excessivamente_comprometida: 14,
  cartao_beneficio_oculto: 10,
  saque_sem_contrato_claro: 12,
  divergencia_consigfacil_folha: 10,
  contrato_ativo_sem_desconto: 8,
  desconto_sem_contrato_ativo: 8,
};

const ROTULOS_PT: Record<SinalRiscoFinanceiro, string> = {
  juros_abusivos: "Juros / encargos potencialmente abusivos",
  cet_elevado: "CET elevado em contratos anexados",
  venda_casada: "Indícios de venda casada (seguro/proteção)",
  seguro_embutido: "Seguro embutido no contracheque",
  rmc_rcc: "Cartões RMC/RCC detectados",
  saque_complementar: "Saque complementar / cartão consignado",
  refinanciamento_recorrente: "Refinanciamento / portabilidade recorrente",
  emprestimo_sem_contrato: "Crédito bancário sem contrato anexado",
  desconto_sem_origem: "Descontos sem origem clara (precisa_revisao)",
  credito_sem_vinculo: "Contratos sem vínculo no extrato",
  refinanciamentos_sucessivos: "Refinanciamentos sucessivos no ConsigFácil",
  margem_excessivamente_comprometida: "Margem consignável muito comprometida",
  cartao_beneficio_oculto: "Cartão benefício / RMC oculto na folha",
  saque_sem_contrato_claro: "Saque consignado sem contrato anexado",
  divergencia_consigfacil_folha: "Divergência entre ConsigFácil e folha/extrato",
  contrato_ativo_sem_desconto: "Contrato ativo sem desconto correspondente",
  desconto_sem_contrato_ativo: "Desconto na folha sem contrato ativo no portal",
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function classificar(indice: number): ClassificacaoRiscoFinanceiro {
  if (indice >= 70) return "critico";
  if (indice >= 45) return "alto";
  if (indice >= 20) return "medio";
  return "baixo";
}

export type EntradaScoreRiscoFinanceiro = {
  baseConciliada: BaseConciliadaLinha[];
  loans: Loan[];
  /** Contratos com observações de refinanciamento/portabilidade — usar `refinanciamentos` da base. */
  refinanciamentos: ReadonlyArray<{ observacoes?: string | null; codigo_folha?: string | null }>;
  /** Linhas `seguro_venda_casada` extraídas da base normalizada (para venda casada / seguro embutido). */
  seguroVendaCasada: ReadonlyArray<unknown>;
  /** Linhas `cartao_saque` (folha) — usado em saque complementar. */
  cartaoSaque: ReadonlyArray<{ tipo?: string | null; risco?: string | null }>;
  /** Base ConsigFácil consolidada (sinais oficiais sobrepõem inferência). */
  consigfacil?: BaseConsignacoesGoverno;
  /** Cruzamento ConsigFácil × Loan/BaseConciliada (para divergências e descontos sem contrato). */
  consigfacilConciliacao?: ResultadoAtualizacaoBaseComConsigfacil;
};

/**
 * Calcula o índice 0..100. Cada sinal é avaliado em uma intensidade [0..1] e
 * multiplicado pelo seu peso. O total é clampeado em 100.
 */
export function calcularScoreRiscoFinanceiro(
  input: EntradaScoreRiscoFinanceiro,
): ResultadoScoreRiscoFinanceiro {
  const {
    baseConciliada,
    loans,
    refinanciamentos,
    seguroVendaCasada,
    cartaoSaque,
    consigfacil,
    consigfacilConciliacao,
  } = input;
  const componentes: ComponenteScoreRisco[] = [];
  const alertas: string[] = [];

  function adicionar(
    sinal: SinalRiscoFinanceiro,
    intensidade: number,
    detalhe: string,
  ): void {
    const i = clamp01(intensidade);
    if (i <= 0) return;
    const peso = PESOS[sinal];
    componentes.push({
      sinal,
      peso,
      intensidade: i,
      contribuicao: Math.round(peso * i * 100) / 100,
      detalhe,
    });
    alertas.push(`${ROTULOS_PT[sinal]}: ${detalhe}`);
  }

  // --- juros_abusivos / cet_elevado (aproximação via contratos)
  for (const c of loans) {
    const totalEstimado = c.installment_amount * c.total_installments;
    if (c.total_amount > 0 && totalEstimado > 0) {
      const ratio = totalEstimado / c.total_amount;
      if (ratio >= 1.8) {
        adicionar(
          "juros_abusivos",
          Math.min((ratio - 1.8) / 1.5, 1),
          `${c.description} — total pago estimado (${totalEstimado.toFixed(2)}) é ${ratio.toFixed(2)}× o principal.`,
        );
      }
      if (ratio >= 1.5 && ratio < 1.8) {
        adicionar(
          "cet_elevado",
          (ratio - 1.5) / 0.3,
          `${c.description} — total/principal=${ratio.toFixed(2)} sugere CET elevado.`,
        );
      }
    }
  }

  // --- venda_casada / seguro_embutido
  const totalSeguro = seguroVendaCasada.length;
  if (totalSeguro > 0) {
    adicionar(
      "venda_casada",
      Math.min(totalSeguro / 4, 1),
      `${totalSeguro} rubrica(s) compatível(is) com seguro/proteção identificada(s).`,
    );
    adicionar(
      "seguro_embutido",
      Math.min(totalSeguro / 6, 1),
      `${totalSeguro} ocorrência(s) de seguro embutido em folhas/contracheques.`,
    );
  }

  // --- rmc_rcc
  const rmcRcc = baseConciliada.filter(
    (l) =>
      l.categoria_canonica === "rmc" ||
      l.categoria_canonica === "rcc" ||
      l.categoria_canonica === "cartao_consignado_folha" ||
      l.categoria_canonica === "cartao_consignado_extrato",
  );
  if (rmcRcc.length > 0) {
    adicionar(
      "rmc_rcc",
      Math.min(rmcRcc.length / 3, 1),
      `${rmcRcc.length} linha(s) de cartão consignado / RMC / RCC.`,
    );
  }

  // --- saque_complementar
  const saqueComplementar = [
    ...baseConciliada.filter(
      (l) =>
        l.categoria_canonica === "saque_cartao_folha" ||
        l.categoria_canonica === "saque_cartao_extrato" ||
        l.categoria_canonica === "credcesta_saque",
    ),
    ...cartaoSaque,
  ];
  if (saqueComplementar.length > 0) {
    adicionar(
      "saque_complementar",
      Math.min(saqueComplementar.length / 3, 1),
      `${saqueComplementar.length} indício(s) de saque complementar / cartão consignado embutido.`,
    );
  }

  // --- refinanciamento_recorrente
  if (refinanciamentos.length >= 2) {
    adicionar(
      "refinanciamento_recorrente",
      Math.min((refinanciamentos.length - 1) / 3, 1),
      `${refinanciamentos.length} contrato(s) com sinais de refinanciamento/portabilidade.`,
    );
  } else if (refinanciamentos.length === 1) {
    adicionar(
      "refinanciamento_recorrente",
      0.4,
      `1 contrato com sinal de refinanciamento/portabilidade.`,
    );
  }

  // --- emprestimo_sem_contrato
  const emprestimosSemVinculo = baseConciliada.filter(
    (l) =>
      l.categoria_canonica === "emprestimo_pessoal_creditado" &&
      !l.vinculo_contrato_id,
  );
  if (emprestimosSemVinculo.length > 0) {
    adicionar(
      "emprestimo_sem_contrato",
      Math.min(emprestimosSemVinculo.length / 3, 1),
      `${emprestimosSemVinculo.length} crédito(s) bancário(s) classificado(s) como empréstimo sem contrato anexado.`,
    );
  }

  // --- desconto_sem_origem
  const descontosSuspeitos = baseConciliada.filter(
    (l) =>
      l.status_conciliacao === "precisa_revisao" &&
      (l.natureza === "desconto" || l.natureza === "cartao"),
  );
  if (descontosSuspeitos.length > 0) {
    adicionar(
      "desconto_sem_origem",
      Math.min(descontosSuspeitos.length / 5, 1),
      `${descontosSuspeitos.length} desconto(s) marcado(s) como precisa_revisao.`,
    );
  }

  // --- credito_sem_vinculo (contratos sem transação)
  const contratosSemVinculo = loans.filter(
    (c) =>
      !baseConciliada.some(
        (l) => l.vinculo_contrato_id === c.id && l.origem === "extrato_bancario",
      ),
  );
  if (contratosSemVinculo.length > 0) {
    adicionar(
      "credito_sem_vinculo",
      Math.min(contratosSemVinculo.length / 4, 1),
      `${contratosSemVinculo.length} contrato(s) sem crédito bancário correspondente.`,
    );
  }

  // ============================================================================
  // Sinais ConsigFácil (oficial — peso maior)
  // ============================================================================
  if (consigfacil) {
    if (consigfacil.refinanciamentos.length >= 2) {
      adicionar(
        "refinanciamentos_sucessivos",
        Math.min((consigfacil.refinanciamentos.length - 1) / 3, 1),
        `${consigfacil.refinanciamentos.length} refinanciamento(s) detectado(s) no ConsigFácil.`,
      );
    } else if (consigfacil.refinanciamentos.length === 1) {
      adicionar(
        "refinanciamentos_sucessivos",
        0.4,
        "1 refinanciamento detectado no ConsigFácil.",
      );
    }

    // Margem comprometida: usa o pior cenário entre as margens lidas.
    const piorMargem = consigfacil.margens.reduce(
      (acc, m) => (m.percentual_comprometido > acc ? m.percentual_comprometido : acc),
      0,
    );
    if (piorMargem >= 80) {
      adicionar(
        "margem_excessivamente_comprometida",
        Math.min((piorMargem - 70) / 30, 1),
        `Margem comprometida em ${piorMargem.toFixed(0)}% (snapshot ConsigFácil).`,
      );
    } else if (piorMargem >= 60) {
      adicionar(
        "margem_excessivamente_comprometida",
        (piorMargem - 60) / 40,
        `Margem comprometida em ${piorMargem.toFixed(0)}%.`,
      );
    }

    // Cartão benefício sem contrato anexado é separado de empréstimo comum.
    const cartoesBeneficioSemContrato = consigfacil.contratos.filter(
      (c) =>
        c.eh_cartao_beneficio &&
        !loans.some(
          (l) =>
            (l.institution_name ?? "").toLowerCase().includes(
              c.instituicao.toLowerCase().split(" ")[0] ?? "",
            ),
        ),
    );
    if (cartoesBeneficioSemContrato.length > 0) {
      adicionar(
        "cartao_beneficio_oculto",
        Math.min(cartoesBeneficioSemContrato.length / 3, 1),
        `${cartoesBeneficioSemContrato.length} cartão(ões) benefício/RMC/RCC sem contrato anexado.`,
      );
    }

    const saquesSemContrato = consigfacil.contratos.filter(
      (c) => c.eh_cartao && !c.codigo_instituicao,
    );
    if (saquesSemContrato.length > 0) {
      adicionar(
        "saque_sem_contrato_claro",
        Math.min(saquesSemContrato.length / 2, 1),
        `${saquesSemContrato.length} saque(s) consignado(s) sem código de instituição rastreável.`,
      );
    }
  }

  if (consigfacilConciliacao) {
    const divergencias = consigfacilConciliacao.divergenciasFolhaExtrato.filter(
      (d) => d.valor_observado > 0,
    );
    if (divergencias.length > 0) {
      adicionar(
        "divergencia_consigfacil_folha",
        Math.min(divergencias.length / 3, 1),
        `${divergencias.length} contrato(s) com divergência ConsigFácil × folha/extrato.`,
      );
    }

    const contratosOficiaisSemDesconto = consigfacilConciliacao.resultadosConciliacao.filter(
      (r) => r.linhas_base_conciliada_ids.length === 0,
    );
    if (contratosOficiaisSemDesconto.length > 0) {
      adicionar(
        "contrato_ativo_sem_desconto",
        Math.min(contratosOficiaisSemDesconto.length / 3, 1),
        `${contratosOficiaisSemDesconto.length} contrato(s) ativo(s) no ConsigFácil sem desconto correspondente.`,
      );
    }

    const consigfacilLoanIds = new Set(
      consigfacilConciliacao.resultadosConciliacao
        .map((r) => r.loan_id)
        .filter((x): x is string => x !== null),
    );
    const loansComDescontoMasSemConsigfacil = loans.filter(
      (l) => l.status === "ativo" && !consigfacilLoanIds.has(l.id),
    );
    if (loansComDescontoMasSemConsigfacil.length > 0) {
      adicionar(
        "desconto_sem_contrato_ativo",
        Math.min(loansComDescontoMasSemConsigfacil.length / 4, 1),
        `${loansComDescontoMasSemConsigfacil.length} cadastro(s) interno(s) sem contrato ativo no ConsigFácil.`,
      );
    }
  }

  const indice = Math.min(
    100,
    Math.round(componentes.reduce((s, c) => s + c.contribuicao, 0) * 100) / 100,
  );

  // ============================================================================
  // Confiança da base — ConsigFácil aumenta, divergências reduzem.
  // ============================================================================
  let confianca = 30;
  if (consigfacil && consigfacil.contratos.length > 0) {
    confianca += Math.min(40, consigfacil.contratos.length * 5);
    const mediaConfiancaContratos =
      consigfacil.contratos.reduce((s, c) => s + c.confianca, 0) /
      consigfacil.contratos.length;
    confianca += Math.round(mediaConfiancaContratos * 20);
  }
  if (consigfacilConciliacao) {
    const ajustes = consigfacilConciliacao.ajustes ?? [];
    const confirmados = ajustes.filter((a) => a.tipo_ajuste === "confirmado").length;
    const divergentes = ajustes.filter((a) => a.tipo_ajuste === "divergencia").length;
    confianca += Math.min(20, confirmados * 1.5);
    confianca -= Math.min(15, divergentes * 1.5);
  }
  confianca = Math.max(0, Math.min(100, Math.round(confianca)));

  return {
    indice_risco_financeiro: indice,
    classificacao: classificar(indice),
    componentes,
    alertas,
    indice_confianca_base: confianca,
  };
}

export const ROTULOS_SINAIS_RISCO = ROTULOS_PT;
