import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";

export type CamadaFluxoFinanceiro = {
  competencia: string;
  folha: {
    recebido_folha: number;
    bruto_folha: number;
    liquido_folha: number;
  };
  banco: {
    liquido_banco: number;
    entradas_bancarias: number;
    saidas_bancarias: number;
  };
  consignado: {
    parcelas_consignadas: number;
    pagamentos_emprestimos: number;
    cartao_saque: number;
    desconto_fracionado: number;
  };
  operacional: {
    refinanciamentos: number;
    portabilidades: number;
    suspensoes: number;
    quitacoes: number;
  };
};

export type LinhaEntradaFluxoFinanceiro = {
  competencia?: string | null;
  mes_competencia?: string | null;
  periodo?: string | null;
  date?: string | null;
  valor?: number | null;
  amount?: number | null;
  valor_pago?: number | null;
  valor_desconto?: number | null;
  tipo_passivo?: string | null;
  tipo?: string | null;
  origem?: string | null;
  grupo_canonico?: string | null;
  categoria?: string | null;
  descricao?: string | null;
  rubrica?: string | null;
  desconto_fracionado_por_margem?: boolean | null;
  refinanciamento?: boolean | null;
  portabilidade?: boolean | null;
  suspensao?: boolean | null;
  quitado?: boolean | null;
  status?: string | null;
  natureza?: string | null;
  categoria_canonica?: string | null;
  possivel_duplicidade?: boolean | null;
};

function competenciaLinha(linha: LinhaEntradaFluxoFinanceiro  ): string | null {
  return (
    linha.competencia ??
    linha.mes_competencia ??
    linha.periodo ??
    (linha.date ? String(linha.date).slice(0, 7) : null)
  );
}

function valorLinha(linha: LinhaEntradaFluxoFinanceiro): number {
  return Number(
    linha.valor ?? linha.amount ?? linha.valor_pago ?? linha.valor_desconto ?? 0,
  );
}

function descricaoLinha(linha: LinhaEntradaFluxoFinanceiro): string {
  return String(linha.descricao ?? linha.rubrica ?? "").toUpperCase();
}

function grupoLinha(linha: LinhaEntradaFluxoFinanceiro): string {
  return String(linha.grupo_canonico ?? linha.categoria ?? "").toLowerCase();
}

function tipoLinha(linha: LinhaEntradaFluxoFinanceiro): string {
  return String(linha.tipo_passivo ?? linha.tipo ?? linha.origem ?? "").toLowerCase();
}

function criarCamada(competencia: string): CamadaFluxoFinanceiro {
  return {
    competencia,
    folha: { recebido_folha: 0, bruto_folha: 0, liquido_folha: 0 },
    banco: { liquido_banco: 0, entradas_bancarias: 0, saidas_bancarias: 0 },
    consignado: {
      parcelas_consignadas: 0,
      pagamentos_emprestimos: 0,
      cartao_saque: 0,
      desconto_fracionado: 0,
    },
    operacional: {
      refinanciamentos: 0,
      portabilidades: 0,
      suspensoes: 0,
      quitacoes: 0,
    },
  };
}

export function agruparFluxoPorCamadaFinanceira(
  linhas: LinhaEntradaFluxoFinanceiro[],
): CamadaFluxoFinanceiro[] {
  const mapa = new Map<string, CamadaFluxoFinanceiro>();

  function get(competencia: string): CamadaFluxoFinanceiro {
    let item = mapa.get(competencia);
    if (!item) {
      item = criarCamada(competencia);
      mapa.set(competencia, item);
    }
    return item;
  }

  for (const linha of linhas) {
    const competencia = competenciaLinha(linha);
    if (!competencia) continue;

    const item = get(String(competencia));
    const valor = valorLinha(linha);
    const tipo = tipoLinha(linha);
    const grupo = grupoLinha(linha);
    const descricao = descricaoLinha(linha);
    const absValor = Math.abs(valor);

    if (
      grupo.includes("rubrica_vantagem") ||
      grupo.includes("remuneracao") ||
      tipo === "receita" ||
      linha.natureza === "receita" ||
      descricao.includes("SOLDO") ||
      descricao.includes("GRATIF") ||
      descricao.includes("ETAPAS")
    ) {
      item.folha.recebido_folha += absValor;
      item.folha.bruto_folha += absValor;
      continue;
    }

    if (
      tipo.includes("extrato") ||
      linha.origem === "extrato_bancario" ||
      grupo.includes("banco") ||
      grupo.includes("entradas_bancarias") ||
      grupo.includes("saidas_bancarias")
    ) {
      if (valor >= 0) item.banco.entradas_bancarias += valor;
      else item.banco.saidas_bancarias += absValor;

      if (
        grupo.includes("salario_liquido") ||
        linha.categoria_canonica === "salario_liquido_extrato" ||
        descricao.includes("SALARIO") ||
        linha.possivel_duplicidade
      ) {
        item.banco.liquido_banco += absValor;
      }
      continue;
    }

    if (
      tipo.includes("consignado") ||
      tipo.includes("cartao") ||
      tipo.includes("emprestimo") ||
      linha.natureza === "emprestimo" ||
      linha.natureza === "cartao" ||
      linha.natureza === "saque" ||
      grupo.includes("emprestimo") ||
      grupo.includes("cartao") ||
      descricao.includes("EMP") ||
      descricao.includes("CONSIGNADO")
    ) {
      item.consignado.parcelas_consignadas += absValor;

      if (
        descricao.includes("RMC") ||
        descricao.includes("RCC") ||
        descricao.includes("CARTAO") ||
        descricao.includes("CARTÃO") ||
        descricao.includes("SAQUE") ||
        grupo.includes("cartao")
      ) {
        item.consignado.cartao_saque += absValor;
      } else {
        item.consignado.pagamentos_emprestimos += absValor;
      }

      if (linha.desconto_fracionado_por_margem) {
        item.consignado.desconto_fracionado += absValor;
      }

      continue;
    }

    if (linha.refinanciamento || grupo.includes("refin") || descricao.includes("REFIN")) {
      item.operacional.refinanciamentos += absValor;
      continue;
    }

    if (linha.portabilidade || descricao.includes("PORTAB")) {
      item.operacional.portabilidades += absValor;
    }
    if (linha.suspensao || linha.status === "suspenso") item.operacional.suspensoes += 1;
    if (linha.quitado || linha.status === "quitado") item.operacional.quitacoes += 1;
  }

  for (const item of mapa.values()) {
    item.folha.liquido_folha = Math.max(0, item.folha.bruto_folha);
  }

  return Array.from(mapa.values()).sort((a, b) => a.competencia.localeCompare(b.competencia));
}

export function baseConciliadaParaLinhaFluxo(l: BaseConciliadaLinha): LinhaEntradaFluxoFinanceiro {
  return {
    competencia: l.competencia,
    valor: l.valor,
    tipo: l.origem,
    origem: l.origem,
    grupo_canonico: l.grupo_canonico,
    categoria: l.categoria_canonica,
    categoria_canonica: l.categoria_canonica,
    descricao: l.descricao_normalizada || l.descricao_original,
    rubrica: l.descricao_original,
    natureza: l.natureza,
    possivel_duplicidade: l.possivel_duplicidade,
    desconto_fracionado_por_margem: /desconto fracionado/i.test(l.observacao ?? ""),
    refinanciamento: /refin|portab|renegocia/i.test(l.descricao_normalizada),
    portabilidade: /portab/i.test(l.descricao_normalizada),
  };
}

export function agruparFluxoBaseConciliadaPorCamada(
  linhas: BaseConciliadaLinha[],
): CamadaFluxoFinanceiro[] {
  return agruparFluxoPorCamadaFinanceira(linhas.map(baseConciliadaParaLinhaFluxo));
}

/** Passivo consignável total no mês (soma das parcelas consignadas). */
export function passivoConsignavelMes(camada: CamadaFluxoFinanceiro): number {
  return camada.consignado.parcelas_consignadas;
}
