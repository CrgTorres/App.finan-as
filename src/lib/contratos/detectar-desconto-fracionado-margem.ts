/**
 * Desconto fracionado por redução de margem (ex.: 40% → 30%).
 * Várias rubricas no mesmo mês podem somar a parcela oficial ConsigFácil.
 */

import type { ConfigAuditoriaConsigfacil } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import { CONFIG_AUDITORIA_CONSIGFACIL_PADRAO } from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import { assinaturaEstruturalContrato } from "@/lib/conciliacao/assinatura-estrutural-contrato";
import { ehRubricaConsignavel } from "@/lib/conciliacao/regras-natureza-consignavel";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import { obterParametrosLeituraAtivos } from "@/lib/leitura-analise/perfil-leitura-storage";

export const MOTIVO_DESCONTO_FRACIONADO_MARGEM = "desconto_fracionado_por_reducao_margem";

export const MENSAGEM_DESCONTO_FRACIONADO_MARGEM =
  "A parcela foi dividida em mais de um desconto no mês. A soma fecha com a parcela oficial.";

export const TITULO_BADGE_DESCONTO_FRACIONADO_MARGEM = "Desconto fracionado por margem";

export type LinhaFolhaMes = {
  id?: string | null;
  competencia: string;
  banco?: string | null;
  codigo_rubrica?: string | null;
  descricao?: string | null;
  rubrica_canonica?: string | null;
  categoria_canonica?: string | null;
  valor: number;
  natureza?: string | null;
  origem?: string | null;
  contrato_id?: string | null;
};

export type ToleranciaDescontoFracionado = {
  tolerancia_valor: number;
  tolerancia_percentual: number;
};

export type EntradaDetectarDescontoFracionado = {
  competencia: string;
  banco: string;
  codigo_rubrica?: string | null;
  rubrica_canonica?: string | null;
  contrato_id?: string | null;
  valor_oficial_parcela: number;
  linhas_folha_mes: LinhaFolhaMes[];
  config?: Partial<ConfigAuditoriaConsigfacil>;
  tolerancia?: Partial<ToleranciaDescontoFracionado>;
};

export type LinhaCompensatoriaFracionado = {
  id: string | null;
  valor: number;
  descricao: string | null;
  codigo_rubrica: string | null;
};

export type ResultadoDescontoFracionadoMargem =
  | {
      fracionado: true;
      motivo: typeof MOTIVO_DESCONTO_FRACIONADO_MARGEM;
      soma_descontos: number;
      valor_oficial: number;
      diferenca: number;
      linhas_compensatorias: LinhaCompensatoriaFracionado[];
      remover_da_conferencia: true;
      bloquear_divergencia_valor: true;
      manter_mesmo_contrato: true;
      margem_reduzida_detectada: boolean;
      percentual_diferenca: number;
    }
  | { fracionado: false };

function normalizarBanco(s: string): string {
  const oficial = resolverInstituicaoOficial(s);
  if (oficial?.nome_normalizado) return oficial.nome_normalizado;
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function codigoRubricaNorm(codigo?: string | null): string {
  return (codigo ?? "").replace(/\D/g, "").slice(0, 8);
}

function rubricaCanonicaLinha(linha: LinhaFolhaMes): string {
  if (linha.rubrica_canonica?.trim()) return linha.rubrica_canonica.trim();
  const sig = assinaturaEstruturalContrato({
    descricao: linha.descricao,
    codigo_rubrica: linha.codigo_rubrica,
    categoria_canonica: linha.categoria_canonica,
    instituicao: linha.banco,
    valor: linha.valor,
  });
  return sig.rubrica_canonica;
}

function linhaEhConsignavel(linha: LinhaFolhaMes): boolean {
  const desc = linha.descricao ?? linha.categoria_canonica ?? "";
  if (!desc.trim()) return false;
  if (linha.natureza === "receita" || linha.natureza === "vantagem") return false;
  return ehRubricaConsignavel(desc);
}

function rubricaCompativel(
  alvo: { codigo: string; rubrica: string },
  linha: LinhaFolhaMes,
): boolean {
  const codLinha = codigoRubricaNorm(linha.codigo_rubrica);
  const rubLinha = rubricaCanonicaLinha(linha);
  if (alvo.codigo && codLinha && alvo.codigo === codLinha) return true;
  if (alvo.rubrica && rubLinha) {
    if (alvo.rubrica === rubLinha) return true;
    if (alvo.rubrica.includes(rubLinha) || rubLinha.includes(alvo.rubrica)) return true;
  }
  if (alvo.codigo && codLinha && (linha.descricao ?? "").includes(alvo.codigo)) return true;
  return false;
}

export function resolverToleranciaDescontoFracionado(
  input?: Partial<ToleranciaDescontoFracionado> & { config?: Partial<ConfigAuditoriaConsigfacil> },
): ToleranciaDescontoFracionado {
  const config: ConfigAuditoriaConsigfacil = {
    ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
    ...input?.config,
    conciliacao: {
      ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO.conciliacao,
      ...input?.config?.conciliacao,
    },
  };

  let tolValor = config.conciliacao.tolerancia_valor;
  let tolPct = config.conciliacao.tolerancia_percentual;

  try {
    const perfil = obterParametrosLeituraAtivos();
    if (perfil.configAuditoria?.conciliacao) {
      tolValor = perfil.configAuditoria.conciliacao.tolerancia_valor ?? tolValor;
      tolPct = perfil.configAuditoria.conciliacao.tolerancia_percentual ?? tolPct;
    }
  } catch {
    /* SSR / storage indisponível */
  }

  if (input?.tolerancia_valor != null && input.tolerancia_valor >= 0) {
    tolValor = input.tolerancia_valor;
  }
  if (input?.tolerancia_percentual != null && input.tolerancia_percentual >= 0) {
    tolPct = input.tolerancia_percentual;
  }

  return {
    tolerancia_valor: Math.max(2, tolValor),
    tolerancia_percentual: Math.max(1, tolPct),
  };
}

export function diferencaDentroToleranciaFracionado(
  diferenca: number,
  valorOficial: number,
  tolerancia: ToleranciaDescontoFracionado,
): boolean {
  if (diferenca <= tolerancia.tolerancia_valor) return true;
  if (diferenca <= 2) return true;
  if (valorOficial > 0 && diferenca / valorOficial <= tolerancia.tolerancia_percentual / 100) {
    return true;
  }
  if (valorOficial > 0 && diferenca / valorOficial <= 0.01) return true;
  return false;
}

export function linhaFolhaMesDeBaseConciliada(l: BaseConciliadaLinha): LinhaFolhaMes {
  return {
    id: l.id,
    competencia: l.competencia ?? "",
    banco: l.banco_origem ?? l.instituicao_original_folha,
    codigo_rubrica: null,
    descricao: l.descricao_original || l.descricao_normalizada,
    rubrica_canonica: l.categoria_canonica,
    categoria_canonica: l.categoria_canonica,
    valor: Math.abs(l.valor),
    natureza: l.natureza,
    origem: l.origem,
    contrato_id: l.vinculo_contrato_id,
  };
}

/**
 * Verifica se descontos do mesmo mês (mesmo banco + rubrica/código) somam a parcela oficial.
 */
export function detectarDescontoFracionadoPorMargem(
  input: EntradaDetectarDescontoFracionado,
): ResultadoDescontoFracionadoMargem {
  const config: ConfigAuditoriaConsigfacil = {
    ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
    ...input.config,
    conciliacao: {
      ...CONFIG_AUDITORIA_CONSIGFACIL_PADRAO.conciliacao,
      ...input.config?.conciliacao,
    },
  };

  if (!config.conciliacao.aceitar_desconto_fracionado) {
    return { fracionado: false };
  }

  const valorOficial = Math.abs(input.valor_oficial_parcela);
  if (valorOficial <= 0) return { fracionado: false };

  const bancoAlvo = normalizarBanco(input.banco);
  const codigoAlvo = codigoRubricaNorm(input.codigo_rubrica);
  const rubricaAlvo =
    input.rubrica_canonica?.trim() ||
    (input.banco
      ? assinaturaEstruturalContrato({
          descricao: input.banco,
          codigo_rubrica: input.codigo_rubrica,
        }).rubrica_canonica
      : "");

  const comp = input.competencia.slice(0, 7);

  const candidatas = input.linhas_folha_mes.filter((l) => {
    if (l.competencia.slice(0, 7) !== comp) return false;
    if (!linhaEhConsignavel(l)) return false;
    const bancoLinha = normalizarBanco(l.banco ?? l.descricao ?? "");
    if (!bancoAlvo || !bancoLinha) return false;
    if (bancoLinha !== bancoAlvo && !bancoLinha.includes(bancoAlvo) && !bancoAlvo.includes(bancoLinha)) {
      return false;
    }
    if (input.contrato_id && l.contrato_id && l.contrato_id !== input.contrato_id) return false;
    return rubricaCompativel({ codigo: codigoAlvo, rubrica: rubricaAlvo }, l);
  });

  if (candidatas.length === 0) return { fracionado: false };

  const linhas_compensatorias: LinhaCompensatoriaFracionado[] = candidatas.map((l) => ({
    id: l.id ?? null,
    valor: Math.round(Math.abs(l.valor) * 100) / 100,
    descricao: l.descricao ?? null,
    codigo_rubrica: l.codigo_rubrica ?? null,
  }));

  const soma_descontos = Math.round(
    linhas_compensatorias.reduce((s, x) => s + x.valor, 0) * 100,
  ) / 100;
  const diferenca = Math.abs(soma_descontos - valorOficial);
  const tolerancia = resolverToleranciaDescontoFracionado({
    config: input.config,
    ...input.tolerancia,
  });

  if (!diferencaDentroToleranciaFracionado(diferenca, valorOficial, tolerancia)) {
    return { fracionado: false };
  }

  const margem_reduzida_detectada =
    linhas_compensatorias.length >= 2 ||
    linhas_compensatorias.some((l) => l.valor < valorOficial * 0.85);

  const percentual_diferenca =
    valorOficial > 0 ? Math.round((diferenca / valorOficial) * 1000) / 10 : 0;

  return {
    fracionado: true,
    motivo: MOTIVO_DESCONTO_FRACIONADO_MARGEM,
    soma_descontos,
    valor_oficial: valorOficial,
    diferenca,
    linhas_compensatorias,
    remover_da_conferencia: true,
    bloquear_divergencia_valor: true,
    manter_mesmo_contrato: true,
    margem_reduzida_detectada,
    percentual_diferenca,
  };
}
