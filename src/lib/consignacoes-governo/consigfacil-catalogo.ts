/**
 * Catálogo OFICIAL de modalidades e instituições do ConsigFácil AM.
 *
 * Esta é a fonte de verdade do APP — espelha o conteúdo da migration
 * `update_consigfacil_modalidades_tipos.sql`. Quando o Supabase estiver
 * disponível, o service `consigfacil-catalogo-service` substitui esta cópia
 * pela versão do banco em tempo de execução.
 *
 * Manter os dois lados em sincronia é OBRIGATÓRIO: se você editar este arquivo,
 * edite também a migration (e vice-versa).
 *
 * Base de referência: HTML "ConsigFácil - Amazonas tipo de financiamento em
 * folha.html" exportado do portal.
 */

import type {
  ConsigfacilGrupoCanonico,
  ConsigfacilInstituicao,
  ConsigfacilModalidade,
  ConsigfacilModalidadeInstituicao,
  ConsigfacilModalidadeSlug,
  ConsigfacilTipoMargem,
} from "@/types/consigfacil";

/** Normaliza nome de instituição: minúsculas, sem acentos, espaços colapsados. */
export function normalizarNomeInstituicao(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Termos genéricos — não distinguem uma IF de outra (evita "banco" → Banco Genial). */
const TOKENS_INSTITUICAO_GENERICOS = new Set([
  "banco",
  "brasil",
  "credito",
  "consignado",
  "consignada",
  "cartao",
  "financeira",
  "cooperativa",
  "cooperativo",
  "emprestimo",
  "servicos",
  "sociedade",
  "direto",
  "ltda",
  "card",
  "digital",
  "valor",
  "minas",
  "gerais",
  "industrial",
  "integrador",
  "panamericano",
  "amazonas",
  "publico",
  "servidor",
  "tecnologicos",
  "financeiros",
]);

/** Tokens que de fato identificam a IF (ex.: daycoval, pan, genial). */
export function tokensDistintivosInstituicao(norm: string): string[] {
  return norm
    .split(" ")
    .filter((t) => t.length >= 3 && !TOKENS_INSTITUICAO_GENERICOS.has(t));
}

function tokenComoPalavraInteira(haystack: string, token: string): boolean {
  if (!token) return false;
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(haystack);
}

/**
 * Match parcial seguro entre nomes normalizados.
 * Evita falso positivo: "banco" sozinho, "genial" dentro de outra palavra,
 * token genérico "banco" compartilhado por dezenas de IFs.
 */
export function nomesInstituicaoCasamParcial(norm: string, candidatoNorm: string): boolean {
  if (!norm || !candidatoNorm) return false;
  if (norm === candidatoNorm) return true;

  const menor = norm.length <= candidatoNorm.length ? norm : candidatoNorm;
  const maior = menor === norm ? candidatoNorm : norm;

  if (menor.length >= 8 && maior.startsWith(menor)) return true;

  const tokensMenor = tokensDistintivosInstituicao(menor);
  if (tokensMenor.length >= 2 && menor.length >= 6 && maior.startsWith(menor)) {
    return true;
  }

  if (!candidatoNorm.includes(" ") && candidatoNorm.length <= 14) {
    if (tokenComoPalavraInteira(norm, candidatoNorm)) return true;
    if (norm.length <= 14 && !norm.includes(" ") && tokenComoPalavraInteira(candidatoNorm, norm)) {
      return true;
    }
    return false;
  }
  if (!norm.includes(" ") && norm.length <= 14) {
    return tokenComoPalavraInteira(candidatoNorm, norm);
  }

  const tokensCandidato = tokensDistintivosInstituicao(candidatoNorm);
  if (tokensCandidato.length === 0) return false;
  return tokensCandidato.some((t) => tokenComoPalavraInteira(norm, t));
}

export function instituicoesCompartilhamTokenDistintivo(norm: string, candidatoNorm: string): boolean {
  const input = new Set(tokensDistintivosInstituicao(norm));
  return tokensDistintivosInstituicao(candidatoNorm).some((t) => input.has(t));
}

// ---------------------------------------------------------------------------
// MODALIDADES (4 oficiais)
// ---------------------------------------------------------------------------
export const MODALIDADES_OFICIAIS: ConsigfacilModalidade[] = [
  {
    slug: "cartao_beneficio_compra",
    nome_oficial: "Cartão Benefício Compra",
    grupo_canonico: "cartao_beneficio",
    tipo_margem: "margem_cartao_beneficio",
    eh_emprestimo: false,
    eh_cartao: true,
    eh_cartao_beneficio: true,
    eh_contribuicao: false,
    ativo: true,
    fonte: "consigfacil",
  },
  {
    slug: "cartao_credito",
    nome_oficial: "Cartão de Crédito",
    grupo_canonico: "cartao_credito",
    tipo_margem: "margem_cartao",
    eh_emprestimo: false,
    eh_cartao: true,
    eh_cartao_beneficio: false,
    eh_contribuicao: false,
    ativo: true,
    fonte: "consigfacil",
  },
  {
    slug: "contribuicao",
    nome_oficial: "Contribuição",
    grupo_canonico: "contribuicao",
    tipo_margem: null,
    eh_emprestimo: false,
    eh_cartao: false,
    eh_cartao_beneficio: false,
    eh_contribuicao: true,
    ativo: true,
    fonte: "consigfacil",
  },
  {
    slug: "emprestimo_consignado",
    nome_oficial: "Empréstimo Consignado",
    grupo_canonico: "emprestimo_consignado",
    tipo_margem: "margem_consignavel",
    eh_emprestimo: true,
    eh_cartao: false,
    eh_cartao_beneficio: false,
    eh_contribuicao: false,
    ativo: true,
    fonte: "consigfacil",
  },
];

const MODALIDADE_POR_SLUG: Record<ConsigfacilModalidadeSlug, ConsigfacilModalidade> =
  Object.fromEntries(MODALIDADES_OFICIAIS.map((m) => [m.slug, m])) as Record<
    ConsigfacilModalidadeSlug,
    ConsigfacilModalidade
  >;

export function getModalidade(slug: ConsigfacilModalidadeSlug): ConsigfacilModalidade {
  return MODALIDADE_POR_SLUG[slug];
}

/** Match permissivo do título da modalidade (compara em forma normalizada). */
export function modalidadePorTitulo(titulo: string): ConsigfacilModalidadeSlug | null {
  const norm = normalizarNomeInstituicao(titulo);
  for (const m of MODALIDADES_OFICIAIS) {
    if (normalizarNomeInstituicao(m.nome_oficial) === norm) return m.slug;
  }
  // Aliases comuns (variações que o portal pode imprimir)
  if (norm.includes("cartao") && norm.includes("beneficio")) return "cartao_beneficio_compra";
  if (norm.includes("cartao") && (norm.includes("credito") || norm.includes("debito")))
    return "cartao_credito";
  if (norm.includes("contribuic")) return "contribuicao";
  if (norm.includes("emprestimo") || norm.includes("consignado")) return "emprestimo_consignado";
  return null;
}

// ---------------------------------------------------------------------------
// INSTITUIÇÕES (23 oficiais)
// ---------------------------------------------------------------------------
export const INSTITUICOES_OFICIAIS: ConsigfacilInstituicao[] = [
  // Cartão Benefício Compra
  ["AVANCARD", "cartao_beneficio_compra"],
  ["Banco Genial", "cartao_beneficio_compra"],
  ["Banco Pine", "cartao_beneficio_compra"],
  ["BCBR Card", "cartao_beneficio_compra"],
  ["Consigap Card", "cartao_beneficio_compra"],
  ["Credcesta", "cartao_beneficio_compra"],
  ["Eagle Sociedade de Credito Direto", "cartao_beneficio_compra"],
  ["Emprestei Card", "cartao_beneficio_compra"],
  ["FY Digital", "cartao_beneficio_compra"],
  ["Meucashcard Serviços Tecnológicos e Financeiros", "cartao_beneficio_compra"],
  ["PEGCARD LTDA", "cartao_beneficio_compra"],
  // Empréstimo Consignado
  ["Banco Bradesco", "emprestimo_consignado"],
  ["Banco Daycoval", "emprestimo_consignado"],
  ["Banco de Minas Gerais", "emprestimo_consignado"],
  ["Banco do Brasil", "emprestimo_consignado"],
  ["Banco Industrial do Brasil", "emprestimo_consignado"],
  ["Banco Pan", "emprestimo_consignado"],
  ["Banco Safra", "emprestimo_consignado"],
  ["Banco Santander", "emprestimo_consignado"],
  ["Cooperativo Sicoob", "emprestimo_consignado"],
  ["Olé Bonsucesso Consignado", "emprestimo_consignado"],
  ["Valor Sociedade de Crédito Direto", "emprestimo_consignado"],
  // Contribuição
  ["Sindicato dos Fisioterapeutas Serv Publ do Amazonas", "contribuicao"],
].map(([nome, slug]) => {
  const mod = MODALIDADE_POR_SLUG[slug as ConsigfacilModalidadeSlug];
  return {
    nome_oficial: nome as string,
    nome_normalizado: normalizarNomeInstituicao(nome as string),
    modalidade_slug: slug as ConsigfacilModalidadeSlug,
    grupo_canonico: mod.grupo_canonico,
    ativo: true,
    fonte: "consigfacil" as const,
  };
});

// ---------------------------------------------------------------------------
// RELAÇÃO N:N modalidade × instituição
// (hoje cada instituição tem 1 modalidade primária; estrutura preparada
// para múltiplas, caso o portal venha a expor o mesmo nome em 2 abas.)
// ---------------------------------------------------------------------------
export const MODALIDADE_INSTITUICAO_OFICIAIS: ConsigfacilModalidadeInstituicao[] =
  INSTITUICOES_OFICIAIS.filter((i) => i.modalidade_slug).map((i) => ({
    modalidade_slug: i.modalidade_slug as ConsigfacilModalidadeSlug,
    instituicao_normalizada: i.nome_normalizado,
    ativo: true,
    fonte: "consigfacil" as const,
  }));

// ---------------------------------------------------------------------------
// Resolução fuzzy de instituição
// ---------------------------------------------------------------------------

/**
 * Procura uma instituição oficial a partir de um nome livre (vindo do parser).
 *
 * Estratégia em camadas:
 *  1. Match exato pelo nome normalizado.
 *  2. `startsWith` (cobre "Banco Daycoval Integrador" → "banco daycoval").
 *  3. `includes` em ambas as direções (instituição oficial cabe no input ou
 *     vice-versa) — cobre encurtamentos comuns ("Sicoob" → "Cooperativo Sicoob").
 *  4. Token compartilhado raro (>= 5 chars) para casar "Bonsucesso" ↔ "Olé Bonsucesso".
 */
export function resolverInstituicaoOficial(
  nomeBruto: string,
): ConsigfacilInstituicao | null {
  if (!nomeBruto) return null;
  const norm = normalizarNomeInstituicao(nomeBruto);
  if (!norm) return null;

  for (const i of INSTITUICOES_OFICIAIS) {
    if (i.nome_normalizado === norm) return i;
  }
  for (const i of INSTITUICOES_OFICIAIS) {
    if (nomesInstituicaoCasamParcial(norm, i.nome_normalizado)) return i;
  }
  for (const i of INSTITUICOES_OFICIAIS) {
    if (instituicoesCompartilhamTokenDistintivo(norm, i.nome_normalizado)) return i;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers de margem
// ---------------------------------------------------------------------------

/** Retorna o `tipo_margem` canônico a partir do slug. */
export function tipoMargemDoSlug(
  slug: ConsigfacilModalidadeSlug,
): ConsigfacilTipoMargem {
  return getModalidade(slug).tipo_margem;
}

/** Retorna o `grupo_canonico` a partir do slug. */
export function grupoCanonicoDoSlug(
  slug: ConsigfacilModalidadeSlug,
): ConsigfacilGrupoCanonico {
  return getModalidade(slug).grupo_canonico;
}
