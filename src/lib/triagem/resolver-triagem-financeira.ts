/**
 * Motor de resolução: converte respostas do formulário em classificação e efeitos.
 */

import type {
  ContextoTriagem,
  NivelLeitura,
  RespostasTriagem,
  ResultadoResolucaoTriagem,
  TipoProblemaTriagem,
} from "@/lib/triagem/triagem-inteligente-tipos";
import { ehNoTerminal } from "@/lib/triagem/perguntas-triagem-financeira";

function r(respostas: RespostasTriagem, id: string): string {
  return (respostas[id] ?? "").toLowerCase();
}

function sim(respostas: RespostasTriagem, id: string): boolean {
  return r(respostas, id) === "sim";
}

function naoSei(respostas: RespostasTriagem, id: string): boolean {
  return r(respostas, id) === "nao_sei";
}

function temNaoSei(respostas: RespostasTriagem, ids: string[]): boolean {
  return ids.some((id) => naoSei(respostas, id));
}

function nivelMaximoRespostas(respostas: RespostasTriagem, ids: string[]): NivelLeitura {
  const niveis: NivelLeitura[] = ["basico", "intermediario", "avancado", "especialista"];
  let max = 0;
  for (const id of ids) {
    if (respostas[id]) max = Math.max(max, 1);
  }
  if (max >= 3) return "avancado";
  if (max >= 2) return "intermediario";
  return "basico";
}

function resultadoPendencia(motivo: string, extra?: Partial<ResultadoResolucaoTriagem>): ResultadoResolucaoTriagem {
  return {
    resolvido: false,
    nova_classificacao: "pendencia_mantida",
    nivel_confianca: 0.3,
    remover_pendencia: false,
    manter_pendencia: true,
    motivo,
    campos_corrigidos: {},
    proxima_acao: "revisar_manualmente",
    ...extra,
  };
}

function resultadoOk(
  classificacao: string,
  motivo: string,
  confianca: number,
  campos: Record<string, unknown> = {},
): ResultadoResolucaoTriagem {
  return {
    resolvido: true,
    nova_classificacao: classificacao,
    nivel_confianca: confianca,
    remover_pendencia: true,
    manter_pendencia: false,
    motivo,
    campos_corrigidos: campos,
    proxima_acao: "nenhuma",
    registrar_padrao: confianca >= 0.75,
  };
}

function resolverDescontoFracionado(
  respostas: RespostasTriagem,
  ctx: ContextoTriagem,
): ResultadoResolucaoTriagem {
  const ids = ["df_1", "df_2", "df_3", "df_4", "df_5", "df_6"];
  if (temNaoSei(respostas, ids)) {
    return resultadoPendencia("Resposta “não sei” — mantida pendência para conferência.");
  }
  if (sim(respostas, "df_1") && sim(respostas, "df_2") && (sim(respostas, "df_6") || sim(respostas, "df_3"))) {
    return resultadoOk(
      "desconto_fracionado_por_margem",
      "Descontos pequenos do mesmo contrato somam a parcela oficial. Tratado como ajuste de margem.",
      0.9,
      {
        soma_descontos_folha: ctx.valor_observado,
        valor_parcela_oficial: ctx.valor_esperado,
        desconto_fracionado_por_margem: true,
      },
    );
  }
  return resultadoPendencia("Critérios de desconto fracionado não confirmados.");
}

function resolverRefinanciamento(respostas: RespostasTriagem): ResultadoResolucaoTriagem {
  if (temNaoSei(respostas, ["ref_1", "ref_2", "ref_3", "ref_4", "ref_5", "ref_6"])) {
    return resultadoPendencia("Incerteza nas respostas — refin não confirmado nem descartado.");
  }
  if (sim(respostas, "ref_1")) {
    return resultadoOk(
      "refinanciamento_confirmado",
      "ConsigFácil indica refinanciamento/portabilidade/substituição oficial.",
      0.85,
      { eh_refinanciamento: true },
    );
  }
  const codigosDiferentes = sim(respostas, "ref_3");
  const parcelasDiferentes = sim(respostas, "ref_4");
  const parcelaValorDiferente = sim(respostas, "ref_5");
  const ambosAtivos = sim(respostas, "ref_6");
  if ((codigosDiferentes || parcelasDiferentes || parcelaValorDiferente) && ambosAtivos) {
    return resultadoOk(
      "nao_refinanciamento_confirmado",
      "Contratos com códigos/parcelas/status distintos — operações únicas (regra ConsigFácil).",
      0.88,
      {
        nao_refinanciamento_confirmado: true,
        motivo: "contrato_unico_confirmado_consigfacil",
        eh_refinanciamento: false,
      },
    );
  }
  if (!sim(respostas, "ref_6") && sim(respostas, "ref_2")) {
    return resultadoOk(
      "refinanciamento_confirmado",
      "Contrato anterior encerrado/substituído sem manutenção do antigo ativo.",
      0.75,
      { eh_refinanciamento: true },
    );
  }
  return resultadoPendencia("Indícios insuficientes — manter conferência de refinanciamento.");
}

function resolverDuplicado(respostas: RespostasTriagem): ResultadoResolucaoTriagem {
  if (temNaoSei(respostas, ["dup_1", "dup_2", "dup_3", "dup_4", "dup_5"])) {
    return resultadoPendencia("Não foi possível confirmar duplicidade ou fracionamento.");
  }
  if (sim(respostas, "dup_2") && sim(respostas, "dup_1")) {
    return resultadoOk(
      "possivel_duplicidade",
      "Mesmo código oficial e mesmo banco — duplicidade real.",
      0.8,
      { possivel_duplicidade: true },
    );
  }
  if (sim(respostas, "dup_4") && sim(respostas, "dup_5")) {
    return resultadoOk(
      "desconto_fracionado_por_margem",
      "Soma das frações igual à parcela — não é contrato duplicado.",
      0.88,
      { desconto_fracionado_por_margem: true },
    );
  }
  if (!sim(respostas, "dup_1")) {
    return resultadoOk("conciliado", "Registros não são duplicidade.", 0.7);
  }
  return resultadoPendencia("Análise de duplicidade inconclusa.");
}

function resolverCartao(respostas: RespostasTriagem): ResultadoResolucaoTriagem {
  if (temNaoSei(respostas, ["cart_1", "cart_2", "cart_3", "cart_4", "cart_5"])) {
    return resultadoPendencia("Cartão/saque — conferência manual necessária.");
  }
  if (sim(respostas, "cart_1") && !sim(respostas, "cart_2")) {
    return resultadoPendencia("Rubrica de cartão sem contrato anexado — pendência real.", {
      proxima_acao: "pedir_contrato",
    });
  }
  if (sim(respostas, "cart_1") && sim(respostas, "cart_3")) {
    return resultadoOk(
      "cartao_consignado_confirmado",
      "Cartão confirmado no ConsigFácil e documentado.",
      0.82,
      { eh_cartao: true },
    );
  }
  return resultadoPendencia("Classificação de cartão/saque pendente.");
}

function resolverSalario(respostas: RespostasTriagem): ResultadoResolucaoTriagem {
  if (temNaoSei(respostas, ["sal_1", "sal_2", "sal_3", "sal_4"])) {
    return resultadoPendencia("Salário × extrato — manter pendência.");
  }
  if (sim(respostas, "sal_1") && sim(respostas, "sal_2") && sim(respostas, "sal_3") && sim(respostas, "sal_4")) {
    return resultadoOk(
      "salario_liquido_conciliado",
      "Entrada no extrato é o salário líquido já contabilizado na folha — não somar em dobro.",
      0.92,
      { status_manual: "salario", nao_somar_com_rubricas: true },
    );
  }
  return resultadoPendencia("Não confirmado como salário líquido duplicado.");
}

function resolverTransferencia(respostas: RespostasTriagem): ResultadoResolucaoTriagem {
  if (temNaoSei(respostas, ["trf_1", "trf_2", "trf_3"])) {
    return resultadoPendencia("Transferência não confirmada.");
  }
  if (sim(respostas, "trf_1") && sim(respostas, "trf_2") && sim(respostas, "trf_3")) {
    return resultadoOk(
      "transferencia_propria",
      "Movimentação entre contas próprias — não é receita nem despesa nova.",
      0.9,
      { status_manual: "transferencia_propria" },
    );
  }
  return resultadoPendencia("Não caracterizada como transferência própria.");
}

function resolverEmprestimoCredito(respostas: RespostasTriagem): ResultadoResolucaoTriagem {
  if (temNaoSei(respostas, ["emp_1", "emp_2", "emp_3", "emp_4"])) {
    return resultadoPendencia("Crédito de empréstimo não confirmado.");
  }
  if (sim(respostas, "emp_1") && sim(respostas, "emp_2") && sim(respostas, "emp_4")) {
    return resultadoOk(
      "emprestimo_creditado_extrato",
      "Crédito de empréstimo no extrato — não contar como renda.",
      0.88,
      { nao_somar_como_receita: true, natureza: "emprestimo" },
    );
  }
  if (sim(respostas, "emp_1") && sim(respostas, "emp_2") && !sim(respostas, "emp_3")) {
    return resultadoPendencia("Empréstimo provável sem contrato anexado.", {
      proxima_acao: "pedir_contrato",
    });
  }
  return resultadoPendencia("Lançamento não classificado como empréstimo creditado.");
}

function resolverDivergenciaValor(
  respostas: RespostasTriagem,
  ctx: ContextoTriagem,
): ResultadoResolucaoTriagem {
  const ids = ["div_1", "div_2", "div_3", "div_4"];
  if (temNaoSei(respostas, ids)) {
    return resultadoPendencia("Resposta “não sei” — mantida pendência de valor.");
  }
  if (sim(respostas, "div_1") && sim(respostas, "div_2")) {
    return resultadoOk(
      "desconto_fracionado_por_margem",
      "Soma dos descontos na folha compatível com a parcela ConsigFácil — desconto fracionado.",
      0.9,
      {
        desconto_fracionado_por_margem: true,
        soma_descontos_folha: ctx.valor_observado,
        valor_parcela_oficial: ctx.valor_esperado,
      },
    );
  }
  if (!sim(respostas, "div_1") && sim(respostas, "div_3")) {
    return resultadoOk(
      "confirmado_consigfacil",
      "Parcela oficial ConsigFácil confirmada — divergência tratada como folha desatualizada ou parcial.",
      0.82,
      { valor_parcela_oficial: ctx.valor_esperado },
    );
  }
  if (!sim(respostas, "div_1") && !sim(respostas, "div_3") && sim(respostas, "div_4")) {
    return resultadoOk(
      "conciliado_folha",
      "Valor observado na folha aceito como referência do desconto efetivo.",
      0.78,
      { valor_observado_folha: ctx.valor_observado },
    );
  }
  return resultadoPendencia("Sequência inconclusiva — confira PDF da folha e ConsigFácil.");
}

function resolverGenerico(
  respostas: RespostasTriagem,
  prefix: string,
): ResultadoResolucaoTriagem {
  if (naoSei(respostas, `${prefix}_1`) || naoSei(respostas, `${prefix}_2`)) {
    return resultadoPendencia("Respostas insuficientes.");
  }
  if (sim(respostas, `${prefix}_1`)) {
    return resultadoOk("conciliado", "Lançamento reconhecido pelo usuário.", 0.65);
  }
  if (sim(respostas, `${prefix}_2`)) {
    return resultadoOk("conciliado_com_documento", "Confirmado com documento oficial.", 0.75);
  }
  return resultadoPendencia("Sem confirmação — manter pendência.");
}

function resolverPorNoTerminal(
  noId: string,
  tipo: TipoProblemaTriagem,
  respostas: RespostasTriagem,
  ctx: ContextoTriagem,
): ResultadoResolucaoTriagem {
  if (noId.endsWith("_fim_pendencia") || noId.endsWith("_pendencia")) {
    return resultadoPendencia("Fluxo encerrado com pendência mantida.");
  }
  if (noId.endsWith("_fim_especialista")) {
    return {
      ...resultadoPendencia("Caso sensível — recomendada revisão especialista.", {
        sugerir_especialista: true,
      }),
      proxima_acao: "revisao_especialista",
    };
  }
  if (noId.endsWith("_fim_upload")) {
    return {
      ...resultadoPendencia("Anexe o contrato para concluir.", { resolvido: false }),
      proxima_acao: "pedir_contrato",
    };
  }

  switch (tipo) {
    case "desconto_fracionado":
      if (noId === "df_fim_ok") return resolverDescontoFracionado(respostas, ctx);
      break;
    case "possivel_refinanciamento":
      if (noId === "ref_fim_unico") {
        return resultadoOk(
          "nao_refinanciamento_confirmado",
          "Contratos únicos confirmados pelo usuário.",
          0.85,
          { nao_refinanciamento_confirmado: true },
        );
      }
      if (noId === "ref_fim_refin") {
        return resultadoOk("refinanciamento_confirmado", "Refinanciamento confirmado.", 0.8, {
          eh_refinanciamento: true,
        });
      }
      return resolverRefinanciamento(respostas);
    case "contrato_duplicado":
      if (noId === "dup_fim_fracionado") {
        return resultadoOk("desconto_fracionado_por_margem", "Frações, não duplicidade.", 0.88, {
          desconto_fracionado_por_margem: true,
        });
      }
      if (noId === "dup_fim_dup") {
        return resultadoOk("possivel_duplicidade", "Duplicidade confirmada.", 0.8, {
          possivel_duplicidade: true,
        });
      }
      if (noId === "dup_fim_ok") {
        return resultadoOk("conciliado", "Não é duplicidade.", 0.7);
      }
      return resolverDuplicado(respostas);
    case "cartao_saque_embutido":
    case "rmc_rcc":
      return resolverCartao(respostas);
    case "salario_duplicado_extrato":
      if (noId.endsWith("_ok")) return resolverSalario(respostas);
      break;
    case "transferencia_propria":
      if (noId.endsWith("_ok")) return resolverTransferencia(respostas);
      break;
    case "emprestimo_creditado_extrato":
      if (noId.endsWith("_ok")) return resolverEmprestimoCredito(respostas);
      break;
    case "contrato_sem_anexo":
      if (noId === "anx_fim_ok") {
        return resultadoOk("confirmado_consigfacil", "ConsigFácil confirma sem PDF.", 0.8);
      }
      break;
    case "venda_casada":
    case "juros_abusivos":
      return {
        ...resultadoPendencia("Revisão especialista recomendada.", { sugerir_especialista: true }),
        proxima_acao: "revisao_especialista",
      };
    case "divergencia_valor":
      if (noId === "div_fim_fracionado") {
        return resultadoOk("desconto_fracionado_por_margem", "Desconto fracionado confirmado.", 0.9, {
          desconto_fracionado_por_margem: true,
          soma_descontos_folha: ctx.valor_observado,
          valor_parcela_oficial: ctx.valor_esperado,
        });
      }
      if (noId === "div_fim_consigfacil") {
        return resultadoOk("confirmado_consigfacil", "ConsigFácil como valor canônico.", 0.82, {
          valor_parcela_oficial: ctx.valor_esperado,
        });
      }
      if (noId === "div_fim_folha") {
        return resultadoOk("conciliado_folha", "Folha como valor canônico do desconto.", 0.78, {
          valor_observado_folha: ctx.valor_observado,
        });
      }
      return resolverDivergenciaValor(respostas, ctx);
    default:
      break;
  }

  const prefix = noId.split("_")[0];
  if (["marg", "rmc", "cu", "dsc", "csd", "pix", "seg", "out"].includes(prefix)) {
    return resolverGenerico(respostas, prefix);
  }

  return resolverPorTipo(tipo, respostas, ctx);
}

function resolverPorTipo(
  tipo: TipoProblemaTriagem,
  respostas: RespostasTriagem,
  ctx: ContextoTriagem,
): ResultadoResolucaoTriagem {
  switch (tipo) {
    case "desconto_fracionado":
      return resolverDescontoFracionado(respostas, ctx);
    case "possivel_refinanciamento":
      return resolverRefinanciamento(respostas);
    case "contrato_duplicado":
      return resolverDuplicado(respostas);
    case "cartao_saque_embutido":
    case "rmc_rcc":
      return resolverCartao(respostas);
    case "salario_duplicado_extrato":
      return resolverSalario(respostas);
    case "transferencia_propria":
      return resolverTransferencia(respostas);
    case "emprestimo_creditado_extrato":
      return resolverEmprestimoCredito(respostas);
    case "venda_casada":
    case "juros_abusivos":
      return {
        ...resultadoPendencia("Revisão especialista.", { sugerir_especialista: true }),
        proxima_acao: "revisao_especialista",
      };
    case "contrato_sem_anexo":
      if (sim(respostas, "anx_1")) {
        return { ...resultadoPendencia("Aguardando upload."), proxima_acao: "pedir_contrato" };
      }
      if (sim(respostas, "anx_2")) {
        return resultadoOk("confirmado_consigfacil", "Confirmado via ConsigFácil.", 0.8);
      }
      return resultadoPendencia("Sem anexo e sem confirmação oficial.");
    case "divergencia_valor":
      return resolverDivergenciaValor(respostas, ctx);
    case "margem_ultrapassada":
      return resolverGenerico(respostas, "marg");
    case "contrato_unico":
      return resolverGenerico(respostas, "cu");
    case "desconto_sem_contrato":
      return resolverGenerico(respostas, "dsc");
    case "contrato_sem_desconto":
      return resolverGenerico(respostas, "csd");
    case "pix_desconhecido":
      return resolverGenerico(respostas, "pix");
    case "seguro_embutido":
      return resolverGenerico(respostas, "seg");
    default:
      return resolverGenerico(respostas, "out");
  }
}

/** Resolve triagem a partir do tipo, respostas acumuladas e nó terminal (se houver). */
export function resolverTriagemFinanceira(
  problema: TipoProblemaTriagem,
  respostas: RespostasTriagem,
  contexto: ContextoTriagem,
  noTerminalId?: string,
): ResultadoResolucaoTriagem {
  const ultimoId =
    noTerminalId ??
    Object.keys(respostas)
      .filter((k) => ehNoTerminal(k) || k.includes("_fim_"))
      .pop();

  if (ultimoId && ehNoTerminal(ultimoId)) {
    return resolverPorNoTerminal(ultimoId, problema, respostas, contexto);
  }

  const idsRespondidos = Object.keys(respostas);
  if (idsRespondidos.some((id) => naoSei(respostas, id))) {
    return resultadoPendencia("Há resposta “não sei” — pendência mantida conforme regra.");
  }

  const resultado = resolverPorTipo(problema, respostas, contexto);

  if (resultado.resolvido && nivelMaximoRespostas(respostas, idsRespondidos) === "basico") {
    return { ...resultado, registrar_padrao: true };
  }

  return resultado;
}

/** Infere tipo de problema a partir de pendência da base. */
export function inferirTipoProblemaDePendencia(input: {
  tipo?: string;
  descricao?: string | null;
}): TipoProblemaTriagem {
  const t = (input.tipo ?? "").toLowerCase();
  const d = (input.descricao ?? "").toLowerCase();

  if (t.includes("cartao") || t.includes("rmc") || t.includes("rcc")) return "rmc_rcc";
  if (t === "sem_evidencia") return "contrato_sem_anexo";
  if (t === "desconto_sem_contrato") return "desconto_sem_contrato";
  if (t === "contrato_sem_desconto") return "contrato_sem_desconto";
  if (t === "divergencia_valor" || t.includes("divergencia")) return "divergencia_valor";
  if (t === "match_baixo") return "outro";
  if (t === "tolerancia_excedida") return "divergencia_valor";

  if (/fracionad|quebrad|soma.*parcela|margem/i.test(d)) return "desconto_fracionado";
  if (/refinanc|portabil|substitui/i.test(d)) return "possivel_refinanciamento";
  if (/duplic/i.test(d)) return "contrato_duplicado";
  if (/cart[aã]o|credcesta|rmc|rcc|saque/i.test(d)) return "cartao_saque_embutido";
  if (/sal[aá]rio|l[ií]quido|vencimento|governo/i.test(d)) return "salario_duplicado_extrato";
  if (/transfer[eê]ncia|conta pr[oó]pria/i.test(d)) return "transferencia_propria";
  if (/empr[eé]stimo.*credit|cdc|liberado/i.test(d)) return "emprestimo_creditado_extrato";
  if (/margem.*30|ultrapass/i.test(d)) return "margem_ultrapassada";
  if (/seguro|venda casada/i.test(d)) return "seguro_embutido";
  if (/abusiv|cet|juros/i.test(d)) return "juros_abusivos";
  if (/pix/i.test(d)) return "pix_desconhecido";
  if (/contrato [uú]nico/i.test(d)) return "contrato_unico";

  return "outro";
}
