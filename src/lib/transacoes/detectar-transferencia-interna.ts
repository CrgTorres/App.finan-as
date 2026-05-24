/**
 * Identifica transferências entre contas do próprio utilizador para excluí-las dos totais
 * reais de receitas/despesas no dashboard consolidado.
 */

import type { Category } from "@/types";
import { normalizarTexto } from "@/lib/extratos/extrato-parser-core";

export const CATEGORIA_TRANSFERENCIA_PROPRIA_LITERAL = "Transferência própria" as const satisfies Category;

export type ImpactoFinanceiroConsolidado = "neutro" | "entrada" | "saida";

export type ResultadoDetectarTransferenciaInterna = {
  ehTransferenciaInterna: boolean;
  motivo: string;
  impactoFinanceiro: ImpactoFinanceiroConsolidado;
};

export type DetectarTransferenciaInternaParams = {
  descricao: string;
  tipoTransacao?: "receita" | "despesa";
  categoriaSugerida?: Category | string | null;
  bancoOuContaOrigem?: string | null;
  bancoOuContaDestino?: string | null;
  /**
   * Contas/bancos conhecidos do utilizador (ex.: «Nubank», apelidos da conta).
   * Comparação normalizada contra origem, destino e descrição.
   */
  contasOuBancosConhecidos?: readonly string[];
};

const TITULAR_NOME_TEXTO_NORMALIZADO = "carlos rodrigo gomes torres";

function textoContemNomeTitular(textoBruto: string): boolean {
  return normalizarTexto(textoBruto).includes(TITULAR_NOME_TEXTO_NORMALIZADO);
}

/** Indício de CPF do titular (mesma heurística dos parsers de extrato). */
function textoContemIndicioCpfTitular(textoOriginal: string): boolean {
  const semEspaco = textoOriginal.replace(/\s/g, "").toLowerCase();
  return /\.783\.242-/.test(semEspaco) || /\.783249/.test(semEspaco.replace(/\./g, ""));
}

function bancoOuContaConhecidaNasReferencias(
  descricaoNorm: string,
  refs: readonly (string | null | undefined)[],
  conhecidos: readonly string[] | undefined
): boolean {
  if (!conhecidos?.length) return false;

  const candidatos = refs
    .map((x) => (typeof x === "string" ? normalizarTexto(x) : ""))
    .filter((x) => x.length >= 2);

  for (const rotulo of conhecidos) {
    const nc = normalizarTexto(rotulo);
    if (nc.length < 2) continue;

    if (descricaoNorm.includes(nc)) return true;

    for (const c of candidatos) {
      if (c.includes(nc) || nc.includes(c)) return true;
    }
  }

  return false;
}

function impactoFinanceiroForaDaTransferenciaInterna(
  tipo: "receita" | "despesa" | undefined
): "entrada" | "saida" {
  if (tipo === "receita") return "entrada";
  return "saida";
}

export function ehCategoriaTransferenciaPropria(
  categoria: Category | string | null | undefined
): boolean {
  return Boolean(categoria && String(categoria).trim() === CATEGORIA_TRANSFERENCIA_PROPRIA_LITERAL);
}

/**
 * Algum critério verdadeiros ⇒ transferência interna:
 * - nome do titular na descrição;
 * - CPF do titular (máscaras usadas nos extratos);
 * - conta/banco conhecida em origem, destino ou texto;
 * - categoria já sugerida Transferência própria (`CATEGORIA_TRANSFERENCIA_PROPRIA_LITERAL`).
 *
 * Quando `ehTransferenciaInterna`, fixar categoria `Transferência própria` no consumidor;
 * `impactoFinanceiro` será `neutro` (não entrar em totais reais de entrada/saída no consolidado).
 */
export function detectarTransferenciaInterna(
  params: DetectarTransferenciaInternaParams
): ResultadoDetectarTransferenciaInterna {
  const descNorm = normalizarTexto(params.descricao);

  if (textoContemNomeTitular(params.descricao)) {
    return {
      ehTransferenciaInterna: true,
      motivo: "Descrição contém nome do titular (Carlos Rodrigo Gomes Torres).",
      impactoFinanceiro: "neutro",
    };
  }

  if (textoContemIndicioCpfTitular(params.descricao)) {
    return {
      ehTransferenciaInterna: true,
      motivo: "Descrição inclui máscaras associadas ao CPF do titular.",
      impactoFinanceiro: "neutro",
    };
  }

  if (
    bancoOuContaConhecidaNasReferencias(descNorm, [
      params.bancoOuContaOrigem,
      params.bancoOuContaDestino,
    ], params.contasOuBancosConhecidos)
  ) {
    return {
      ehTransferenciaInterna: true,
      motivo:
        "Conta/banco conhecido do utilizador em origem, destino ou descrição — possível movimento entre contas próprias.",
      impactoFinanceiro: "neutro",
    };
  }

  if (ehCategoriaTransferenciaPropria(params.categoriaSugerida)) {
    return {
      ehTransferenciaInterna: true,
      motivo: "Categoria sugerida é Transferência própria.",
      impactoFinanceiro: "neutro",
    };
  }

  return {
    ehTransferenciaInterna: false,
    motivo: "Nenhum critério de transferência interna foi satisfeito.",
    impactoFinanceiro: impactoFinanceiroForaDaTransferenciaInterna(params.tipoTransacao),
  };
}
