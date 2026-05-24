/**
 * Classificação CANÔNICA de linhas financeiras a partir do catálogo
 * ConsigFácil (com fallback para OCR/heurística/inferência).
 *
 * Ordem de tentativa (do mais oficial ao menos):
 *   1. ConsigFácil oficial (quando a linha já tem `id_consignacao`).
 *   2. Alias exato do catálogo.
 *   3. Match `nome_normalizado` direto (catálogo).
 *   4. Match `startsWith` / `includes` em ambos os sentidos.
 *   5. Match por token raro (>= 5 chars).
 *   6. Heurística por palavras-chave da descrição.
 *   7. `sem_correspondencia` (fonte = inferencia).
 *
 * NUNCA descarta o valor original. Todos os campos `*_original` são
 * preservados no resultado e ficam disponíveis para auditoria/UI.
 */

import type {
  ConsigfacilGrupoCanonico,
  ConsigfacilModalidadeSlug,
  ConsigfacilTipoMargem,
  FonteClassificacao,
  GrupoFinanceiroCanonico,
  ResultadoClassificacaoFinanceira,
} from "@/types/consigfacil";
import { resultadoClassificacaoVazio } from "@/types/consigfacil";
import {
  getCatalogoCache,
} from "@/lib/consignacoes-governo/consigfacil-catalogo-cache";
import {
  aplicarCatalogoRubricasFinanceiras,
  ehDivergenciaClassificacaoReal,
  limparMotivoModalidadeNaoReconhecida,
  modalidadesEmprestimoEquivalentes,
  resolverInstituicaoPorRubrica,
} from "@/lib/conciliacao/catalogo-rubricas-financeiras";
import { identificarPassivoConsignavelEstrutural } from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";
import {
  modalidadePorTitulo,
  normalizarNomeInstituicao,
  nomesInstituicaoCasamParcial,
  instituicoesCompartilhamTokenDistintivo,
} from "@/lib/consignacoes-governo/consigfacil-catalogo";

// ---------------------------------------------------------------------------
// Confiança por fonte
// ---------------------------------------------------------------------------

const CONFIANCA_POR_FONTE: Record<FonteClassificacao, number> = {
  consigfacil_oficial: 100,
  alias_oficial: 95,
  match_exato_catalogo: 90,
  match_alias_catalogo: 85,
  match_fuzzy_catalogo: 65,
  ocr_contracheque: 55,
  heuristica_descricao: 40,
  inferencia: 20,
  sem_correspondencia: 0,
};

export function calcularConfiancaClassificacao(fonte: FonteClassificacao): number {
  return CONFIANCA_POR_FONTE[fonte];
}

// ---------------------------------------------------------------------------
// Heurística de grupo a partir de descrição livre
// ---------------------------------------------------------------------------

/**
 * Mapeia descrições livres (rubricas de OCR, lançamentos de extrato) em um
 * `GrupoFinanceiroCanonico`. Usado quando NÃO temos nem instituição nem
 * modalidade oficiais — é o último recurso.
 */
export function inferirGrupoPorDescricao(descricao: string): GrupoFinanceiroCanonico {
  const n = normalizarNomeInstituicao(descricao);
  if (/refinanciament|portabilidade|renegociac/i.test(descricao)) return "refinanciamentos";
  if (/saque\s+complementar|saque\s+autorizado/i.test(descricao)) return "saque_complementar";
  if (/\brmc\b|reserva\s+margem\s+consignav/i.test(descricao)) return "rmc";
  if (/\brcc\b|reserva\s+cart[aã]o/i.test(descricao)) return "rcc";
  if (/seguro|prestam|prote[cç][aã]o|prestamista/i.test(descricao)) return "seguros";
  if (n.includes("cartao beneficio") || n.includes("cart benef")) return "cartao_beneficio";
  if (n.includes("cartao credito") || n.includes("cartao de credito")) return "cartao_credito";
  if (n.includes("contribuic") || n.includes("sindicato") || n.includes("associat"))
    return "contribuicao";
  if (n.includes("emprestimo") || n.includes("consignado") || n.includes("financ"))
    return "emprestimo_consignado";
  return "outros";
}

/** Converte um `ConsigfacilGrupoCanonico` (catálogo) para o agrupamento geral. */
export function grupoCanonicoParaFinanceiro(
  grupo: ConsigfacilGrupoCanonico,
): GrupoFinanceiroCanonico {
  // Atualmente são equivalentes 1:1; manter função para evolução futura.
  return grupo as GrupoFinanceiroCanonico;
}

// ---------------------------------------------------------------------------
// normalizarInstituicaoConsigfacil
// ---------------------------------------------------------------------------

export type ResolucaoInstituicao = {
  nome_original: string | null;
  nome_normalizado: string | null;
  /** `nome_normalizado` da instituição OFICIAL (se houver). */
  instituicao_normalizada_oficial: string | null;
  /** Texto oficial canonizado (`Banco Pan`, `Credcesta`…). */
  instituicao_oficial: string | null;
  /** Lista de aliases que casaram. */
  aliases_utilizados: string[];
  /** Como chegamos no resultado. */
  fonte: FonteClassificacao;
  motivo: string;
};

const RESOLUCAO_INSTITUICAO_VAZIA: ResolucaoInstituicao = {
  nome_original: null,
  nome_normalizado: null,
  instituicao_normalizada_oficial: null,
  instituicao_oficial: null,
  aliases_utilizados: [],
  fonte: "sem_correspondencia",
  motivo: "Sem entrada para resolver.",
};

export function normalizarInstituicaoConsigfacil(
  nomeBruto: string | null | undefined,
): ResolucaoInstituicao {
  if (!nomeBruto) return RESOLUCAO_INSTITUICAO_VAZIA;
  const norm = normalizarNomeInstituicao(nomeBruto);
  if (!norm) return { ...RESOLUCAO_INSTITUICAO_VAZIA, nome_original: nomeBruto };

  const { aliasIndex, instituicaoPorNorm } = getCatalogoCache();

  // 1) Match exato pelo alias-index (cobre nome oficial + todos os aliases).
  const exato = aliasIndex.get(norm);
  if (exato) {
    const inst = instituicaoPorNorm.get(exato);
    return {
      nome_original: nomeBruto,
      nome_normalizado: norm,
      instituicao_normalizada_oficial: exato,
      instituicao_oficial: inst?.nome_oficial ?? exato,
      aliases_utilizados: [norm],
      fonte: norm === exato ? "match_exato_catalogo" : "match_alias_catalogo",
      motivo: norm === exato
        ? `Nome oficial reconhecido: "${inst?.nome_oficial ?? exato}".`
        : `Alias reconhecido: "${nomeBruto}" → "${inst?.nome_oficial ?? exato}".`,
    };
  }

  // 2–4) Fuzzy seguro (sem "banco" genérico → Banco Genial).
  for (const [aliasNorm, instNorm] of aliasIndex) {
    if (nomesInstituicaoCasamParcial(norm, aliasNorm)) {
      const inst = instituicaoPorNorm.get(instNorm);
      return {
        nome_original: nomeBruto,
        nome_normalizado: norm,
        instituicao_normalizada_oficial: instNorm,
        instituicao_oficial: inst?.nome_oficial ?? instNorm,
        aliases_utilizados: [aliasNorm],
        fonte: "match_fuzzy_catalogo",
        motivo: `Match parcial entre "${nomeBruto}" e "${inst?.nome_oficial ?? instNorm}".`,
      };
    }
  }

  for (const [aliasNorm, instNorm] of aliasIndex) {
    if (instituicoesCompartilhamTokenDistintivo(norm, aliasNorm)) {
      const inst = instituicaoPorNorm.get(instNorm);
      return {
        nome_original: nomeBruto,
        nome_normalizado: norm,
        instituicao_normalizada_oficial: instNorm,
        instituicao_oficial: inst?.nome_oficial ?? instNorm,
        aliases_utilizados: [aliasNorm],
        fonte: "match_fuzzy_catalogo",
        motivo: `Token distintivo compartilhado entre "${nomeBruto}" e "${inst?.nome_oficial ?? instNorm}".`,
      };
    }
  }

  return {
    nome_original: nomeBruto,
    nome_normalizado: norm,
    instituicao_normalizada_oficial: null,
    instituicao_oficial: null,
    aliases_utilizados: [],
    fonte: "sem_correspondencia",
    motivo: `Instituição "${nomeBruto}" não encontrada no catálogo.`,
  };
}

// ---------------------------------------------------------------------------
// normalizarModalidadeConsigfacil
// ---------------------------------------------------------------------------

export type ResolucaoModalidade = {
  modalidade_original: string | null;
  modalidade_normalizada: string | null;
  modalidade_oficial: ConsigfacilModalidadeSlug | null;
  tipo_margem: ConsigfacilTipoMargem;
  grupo_canonico: GrupoFinanceiroCanonico;
  eh_cartao: boolean;
  eh_cartao_beneficio: boolean;
  eh_emprestimo: boolean;
  eh_contribuicao: boolean;
  fonte: FonteClassificacao;
  motivo: string;
};

const RESOLUCAO_MODALIDADE_VAZIA: ResolucaoModalidade = {
  modalidade_original: null,
  modalidade_normalizada: null,
  modalidade_oficial: null,
  tipo_margem: null,
  grupo_canonico: "outros",
  eh_cartao: false,
  eh_cartao_beneficio: false,
  eh_emprestimo: false,
  eh_contribuicao: false,
  fonte: "sem_correspondencia",
  motivo: "Sem modalidade para resolver.",
};

export function normalizarModalidadeConsigfacil(
  textoLivre: string | null | undefined,
): ResolucaoModalidade {
  if (!textoLivre) return RESOLUCAO_MODALIDADE_VAZIA;
  const norm = normalizarNomeInstituicao(textoLivre);
  if (!norm) return { ...RESOLUCAO_MODALIDADE_VAZIA, modalidade_original: textoLivre };

  const catLocal = resolverInstituicaoPorRubrica(textoLivre, { registrarLog: false });
  if (catLocal?.modalidade_slug) {
    const modOficial = getCatalogoCache().modalidadePorSlug.get(catLocal.modalidade_slug);
    return {
      modalidade_original: textoLivre,
      modalidade_normalizada: catLocal.rubrica_normalizada,
      modalidade_oficial: catLocal.modalidade_slug,
      tipo_margem: catLocal.tipo_margem,
      grupo_canonico: catLocal.grupo_canonico,
      eh_cartao: catLocal.eh_cartao,
      eh_cartao_beneficio: catLocal.eh_cartao_beneficio,
      eh_emprestimo: catLocal.eh_emprestimo,
      eh_contribuicao: catLocal.eh_contribuicao,
      fonte: "match_alias_catalogo",
      motivo: `Modalidade reconhecida por catálogo local (${catLocal.alias_correspondente} → ${modOficial?.nome_oficial ?? catLocal.modalidade}).`,
    };
  }

  const slug = modalidadePorTitulo(textoLivre);
  if (slug) {
    const mod = getCatalogoCache().modalidadePorSlug.get(slug);
    if (mod) {
      return {
        modalidade_original: textoLivre,
        modalidade_normalizada: norm,
        modalidade_oficial: slug,
        tipo_margem: mod.tipo_margem,
        grupo_canonico: grupoCanonicoParaFinanceiro(mod.grupo_canonico),
        eh_cartao: mod.eh_cartao,
        eh_cartao_beneficio: mod.eh_cartao_beneficio,
        eh_emprestimo: mod.eh_emprestimo,
        eh_contribuicao: mod.eh_contribuicao,
        fonte: "match_exato_catalogo",
        motivo: `Modalidade reconhecida: "${mod.nome_oficial}".`,
      };
    }
  }

  // Heurística por palavras-chave do texto.
  const grupo = inferirGrupoPorDescricao(textoLivre);
  if (grupo === "outros") {
    return {
      ...RESOLUCAO_MODALIDADE_VAZIA,
      modalidade_original: textoLivre,
      modalidade_normalizada: norm,
      fonte: "sem_correspondencia",
      motivo: `Modalidade "${textoLivre}" não reconhecida.`,
    };
  }

  // Mapeia grupo → flags
  const ehCartao = grupo === "cartao_credito" || grupo === "cartao_beneficio";
  const ehCartaoBenef = grupo === "cartao_beneficio";
  const ehContribuicao = grupo === "contribuicao";
  const ehEmprestimo = grupo === "emprestimo_consignado" || grupo === "refinanciamentos";
  const tipoMargem: ConsigfacilTipoMargem =
    grupo === "cartao_beneficio"
      ? "margem_cartao_beneficio"
      : grupo === "cartao_credito"
        ? "margem_cartao"
        : grupo === "contribuicao"
          ? null
          : grupo === "emprestimo_consignado" || grupo === "refinanciamentos"
            ? "margem_consignavel"
            : null;

  return {
    modalidade_original: textoLivre,
    modalidade_normalizada: norm,
    modalidade_oficial: null,
    tipo_margem: tipoMargem,
    grupo_canonico: grupo,
    eh_cartao: ehCartao,
    eh_cartao_beneficio: ehCartaoBenef,
    eh_emprestimo: ehEmprestimo,
    eh_contribuicao: ehContribuicao,
    fonte: "heuristica_descricao",
    motivo: `Modalidade inferida do texto: ${grupo}.`,
  };
}

// ---------------------------------------------------------------------------
// classificarLinhaFinanceira — função principal
// ---------------------------------------------------------------------------

export type EntradaClassificacao = {
  instituicao?: string | null;
  descricao?: string | null;
  modalidade?: string | null;
  /** Quando já temos um id_consignacao do ConsigFácil, tratamos como oficial. */
  id_consignacao_consigfacil?: string | null;
};

/**
 * Classifica uma linha financeira (loan, transação, item de contracheque...)
 * combinando informações de instituição + modalidade + descrição.
 *
 * Sempre retorna um `ResultadoClassificacaoFinanceira` preenchido — incluindo
 * `*_original` para preservar histórico.
 */
export function classificarLinhaFinanceira(
  entrada: EntradaClassificacao,
): ResultadoClassificacaoFinanceira {
  const passivo = identificarPassivoConsignavelEstrutural({
    descricao: [entrada.descricao, entrada.instituicao, entrada.modalidade]
      .filter((x) => x?.trim())
      .join(" "),
    natureza: "desconto",
    id_consignacao_consigfacil: entrada.id_consignacao_consigfacil ?? null,
    consigfacil_confirmado: Boolean(entrada.id_consignacao_consigfacil),
  });
  if (!passivo.consignavel) {
    const grupoFora =
      passivo.tipo_passivo === "despesa_fixa" ? "conta_consumo" : "rubrica_folha_nao_consignavel";
    const rotuloFora =
      grupoFora === "conta_consumo"
        ? "Conta de consumo — fora da conciliação consignável"
        : `Rubrica de folha — ${passivo.motivo} (${passivo.tipo_passivo})`;
    return {
      ...resultadoClassificacaoVazio,
      instituicao_original: entrada.instituicao ?? null,
      modalidade_original: entrada.modalidade ?? null,
      grupo_canonico: grupoFora,
      fonte_classificacao: "inferencia",
      indice_confianca_classificacao: 0,
      divergencia_classificacao: false,
      motivo_classificacao: rotuloFora,
    };
  }

  const inst = normalizarInstituicaoConsigfacil(entrada.instituicao ?? null);
  // Tentamos resolver modalidade a partir do campo dedicado primeiro, e como
  // fallback usamos a descrição livre.
  const modCampo = normalizarModalidadeConsigfacil(entrada.modalidade ?? null);
  const modDescr = normalizarModalidadeConsigfacil(entrada.descricao ?? null);
  // Escolhe a melhor: preferir match exato > heurística > vazia.
  const mod =
    modCampo.fonte === "match_exato_catalogo"
      ? modCampo
      : modDescr.fonte === "match_exato_catalogo"
        ? modDescr
        : modCampo.modalidade_normalizada
          ? modCampo
          : modDescr;

  // Se a instituição oficial determina a modalidade, prefere ela quando o
  // texto livre não foi conclusivo (instituições do catálogo guardam a
  // `modalidade_slug` primária).
  let modalidadeOficial = mod.modalidade_oficial;
  let grupo = mod.grupo_canonico;
  let tipoMargem = mod.tipo_margem;
  let ehCartao = mod.eh_cartao;
  let ehCartaoBenef = mod.eh_cartao_beneficio;
  let ehEmpr = mod.eh_emprestimo;
  let ehContrib = mod.eh_contribuicao;

  if (
    (modalidadeOficial == null || mod.fonte !== "match_exato_catalogo") &&
    inst.instituicao_normalizada_oficial
  ) {
    const instCatalogo = getCatalogoCache().instituicaoPorNorm.get(
      inst.instituicao_normalizada_oficial,
    );
    if (instCatalogo?.modalidade_slug) {
      const modCat = getCatalogoCache().modalidadePorSlug.get(instCatalogo.modalidade_slug);
      if (modCat) {
        modalidadeOficial = modCat.slug;
        grupo = grupoCanonicoParaFinanceiro(modCat.grupo_canonico);
        tipoMargem = modCat.tipo_margem;
        ehCartao = modCat.eh_cartao;
        ehCartaoBenef = modCat.eh_cartao_beneficio;
        ehEmpr = modCat.eh_emprestimo;
        ehContrib = modCat.eh_contribuicao;
      }
    }
  }

  // ConsigFácil oficial overrride.
  const temIdOficial = !!entrada.id_consignacao_consigfacil;

  // Determina a fonte final (a mais "forte" dentre instituição e modalidade).
  const fonteFinal: FonteClassificacao = (() => {
    if (temIdOficial) return "consigfacil_oficial";
    const prios: FonteClassificacao[] = [
      "consigfacil_oficial",
      "alias_oficial",
      "match_exato_catalogo",
      "match_alias_catalogo",
      "match_fuzzy_catalogo",
      "ocr_contracheque",
      "heuristica_descricao",
      "inferencia",
      "sem_correspondencia",
    ];
    const a = prios.indexOf(inst.fonte);
    const b = prios.indexOf(mod.fonte);
    return prios[Math.min(a, b)];
  })();

  const aliases = inst.aliases_utilizados;

  const modSemMatchCritico =
    mod.fonte === "sem_correspondencia" &&
    modalidadeOficial == null &&
    !modalidadesEmprestimoEquivalentes(
      entrada.modalidade ?? mod.modalidade_original,
      modalidadeOficial,
      grupo,
    );

  const divergencia =
    (inst.nome_original != null &&
      inst.instituicao_oficial != null &&
      normalizarNomeInstituicao(inst.nome_original) !== inst.instituicao_normalizada_oficial) ||
    inst.fonte === "sem_correspondencia" ||
    modSemMatchCritico;

  const motivoPartes = [inst.motivo, mod.motivo].filter(Boolean);
  let motivoClassificacao = motivoPartes.join(" ");
  if (
    modalidadeOficial != null &&
    (mod.fonte === "sem_correspondencia" || /não reconhecida|nao reconhecida/i.test(mod.motivo))
  ) {
    motivoClassificacao = limparMotivoModalidadeNaoReconhecida(motivoClassificacao);
    if (mod.fonte === "match_alias_catalogo") {
      motivoClassificacao = [motivoClassificacao, mod.motivo].filter(Boolean).join(" ").trim();
    } else if (modalidadeOficial) {
      const complemento = `Modalidade oficial: ${modalidadeOficial}.`;
      motivoClassificacao = motivoClassificacao
        ? `${motivoClassificacao} ${complemento}`
        : complemento;
    }
  }

  const base: ResultadoClassificacaoFinanceira = {
    ...resultadoClassificacaoVazio,
    instituicao_original: inst.nome_original,
    instituicao_normalizada: inst.nome_normalizado,
    instituicao_oficial: inst.instituicao_oficial,
    modalidade_original: mod.modalidade_original ?? entrada.modalidade ?? null,
    modalidade_normalizada: mod.modalidade_normalizada,
    modalidade_oficial: modalidadeOficial,
    grupo_canonico: grupo,
    tipo_margem: tipoMargem,
    eh_cartao: ehCartao,
    eh_cartao_beneficio: ehCartaoBenef,
    eh_emprestimo: ehEmpr,
    eh_contribuicao: ehContrib,
    fonte_classificacao: fonteFinal,
    aliases_utilizados: aliases,
    indice_confianca_classificacao: calcularConfiancaClassificacao(fonteFinal),
    divergencia_classificacao: divergencia,
    motivo_classificacao: motivoClassificacao,
  };

  const entradaCatalogo: EntradaClassificacao = {
    ...entrada,
    modalidade:
      entrada.modalidade?.trim() ||
      (mod.modalidade_original && mod.modalidade_original !== inst.nome_original
        ? mod.modalidade_original
        : null),
  };

  const comCatalogo = aplicarCatalogoRubricasFinanceiras(entradaCatalogo, base);
  if (comCatalogo.catalogo_rubrica_local) return comCatalogo;

  const divergenciaReal = ehDivergenciaClassificacaoReal(comCatalogo);
  return { ...comCatalogo, divergencia_classificacao: divergenciaReal };
}
