/**
 * Catálogo local de rubricas de contracheque/ficha — aliases óbvios que o
 * catálogo ConsigFácil ainda não cobre. Reduz falsas divergências na inspeção por linha.
 */

import type {
  ConsigfacilModalidadeSlug,
  ConsigfacilTipoMargem,
  GrupoFinanceiroCanonico,
  ResultadoClassificacaoFinanceira,
} from "@/types/consigfacil";
import { resultadoClassificacaoVazio } from "@/types/consigfacil";
import { normalizarNomeInstituicao } from "@/lib/consignacoes-governo/consigfacil-catalogo";

/** Espelha `EntradaClassificacao` sem import circular com classificacao-canonica. */
export type EntradaCatalogoRubricaClassificacao = {
  instituicao?: string | null;
  descricao?: string | null;
  modalidade?: string | null;
  id_consignacao_consigfacil?: string | null;
};

export type EntradaCatalogoRubricaFinanceira = {
  id: string;
  aliases: string[];
  instituicao: string;
  /** Slug lógico; mapeado para `ConsigfacilModalidadeSlug` quando existir. */
  modalidade: string;
  grupo_canonico: GrupoFinanceiroCanonico;
};

export type ResultadoResolucaoCatalogoRubrica = {
  entrada_id: string;
  rubrica_original: string;
  rubrica_normalizada: string;
  alias_correspondente: string;
  instituicao: string;
  instituicao_normalizada: string;
  modalidade: string;
  modalidade_slug: ConsigfacilModalidadeSlug | null;
  grupo_canonico: GrupoFinanceiroCanonico;
  tipo_margem: ConsigfacilTipoMargem;
  eh_cartao: boolean;
  eh_cartao_beneficio: boolean;
  eh_emprestimo: boolean;
  eh_contribuicao: boolean;
};

const ENTRADAS_CATALOGO: EntradaCatalogoRubricaFinanceira[] = [
  {
    id: "caixa_emprestimo",
    aliases: [
      "CAIXA",
      "CAIXA ECONOMICA",
      "CAIXA ECONOMICA FEDERAL",
      "CAIXA ECONÔMICA FEDERAL",
      "CAIXA EMPRESTIMO",
      "CAIXA EMP02",
    ],
    instituicao: "Caixa Econômica Federal",
    modalidade: "emprestimo_consignado",
    grupo_canonico: "emprestimo_consignado",
  },
  {
    id: "bancoob_emprestimo",
    aliases: [
      "BANCOOB",
      "BANCOOB EMPRESTIMO",
      "BANCOOB / SICOOB",
      "SICOOB",
      "SICOOB (BANCOOB)",
      "SICOOB BANCOOB",
      "COOPERATIVO SICOOB",
    ],
    instituicao: "Bancoob / Sicoob",
    modalidade: "emprestimo_consignado",
    grupo_canonico: "emprestimo_consignado",
  },
  {
    id: "daycoval_emp",
    aliases: [
      "DAYCOVAL",
      "DAYCOVAL EMP02",
      "DAYCOVAL EMP03",
      "DAYCOVAL EMPRESTIMO",
    ],
    instituicao: "Daycoval",
    modalidade: "emprestimo_consignado",
    grupo_canonico: "emprestimo_consignado",
  },
  {
    id: "banco_panamericano",
    aliases: ["BANCO PANAMERICANO", "PANAMERICANO", "BANCO PAN", "PAN"],
    instituicao: "Banco Pan",
    modalidade: "emprestimo_consignado",
    grupo_canonico: "emprestimo_consignado",
  },
  {
    id: "bb_emp",
    aliases: ["BB-EMP", "BB EMP", "BANCO DO BRASIL", "BB EMPRESTIMO"],
    instituicao: "Banco do Brasil",
    modalidade: "emprestimo_consignado",
    grupo_canonico: "emprestimo_consignado",
  },
  {
    id: "bib_cartao",
    aliases: [
      "BIB CARTAO DE CREDIT",
      "BIB CARTAO",
      "BIB CARTÃO",
      "BANCO INDUSTRIAL DO BRASIL",
      "BIB",
    ],
    instituicao: "Banco Industrial do Brasil",
    modalidade: "cartao_credito_consignado",
    grupo_canonico: "cartao_credito",
  },
  {
    id: "bib_emprestimo",
    aliases: ["BIB EMPRESTIMOS", "BIB EMPRESTIMO", "BANCO INDUSTRIAL DO BRASIL", "BIB"],
    instituicao: "Banco Industrial do Brasil",
    modalidade: "emprestimo_consignado",
    grupo_canonico: "emprestimo_consignado",
  },
  {
    id: "credicesta_compra",
    aliases: ["CREDICESTA COMPRA", "CREDCESTA COMPRA", "CRED CESTA COMPRA"],
    instituicao: "CrediCesta",
    modalidade: "cartao_beneficio_compra",
    grupo_canonico: "cartao_credito",
  },
  {
    id: "credicesta_saque",
    aliases: ["CREDICESTA SAQUE", "CREDCESTA SAQUE", "CRED CESTA SAQUE"],
    instituicao: "CrediCesta",
    modalidade: "saque_cartao_beneficio",
    grupo_canonico: "cartao_credito",
  },
  {
    id: "bmg_emprestimo",
    aliases: ["BANCO BMG EMPRESTIMO", "BMG EMPRESTIMO", "BMG EMP02", "BMG"],
    instituicao: "Banco BMG",
    modalidade: "emprestimo_consignado",
    grupo_canonico: "emprestimo_consignado",
  },
  {
    id: "milicred",
    aliases: ["MILICRED INTEGRALIZA", "MILICRED"],
    instituicao: "MiliCred",
    modalidade: "outros_descontos",
    grupo_canonico: "outros",
  },
];

/** Índice: alias normalizado → entrada (entrada mais longa vence em empate). */
const ALIAS_PARA_ENTRADA = (() => {
  const map = new Map<string, EntradaCatalogoRubricaFinanceira>();
  for (const e of ENTRADAS_CATALOGO) {
    for (const a of e.aliases) {
      const k = normalizarTextoCatalogo(a);
      const prev = map.get(k);
      if (!prev || k.length > normalizarTextoCatalogo(prev.aliases[0] ?? "").length) {
        map.set(k, e);
      }
    }
  }
  return map;
})();

export function normalizarTextoCatalogo(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function modalidadeParaSlug(mod: string): ConsigfacilModalidadeSlug | null {
  switch (mod) {
    case "emprestimo_consignado":
      return "emprestimo_consignado";
    case "cartao_credito":
    case "cartao_credito_consignado":
      return "cartao_credito";
    case "cartao_beneficio_compra":
    case "saque_cartao_beneficio":
      return "cartao_beneficio_compra";
    case "contribuicao":
      return "contribuicao";
    default:
      return null;
  }
}

function flagsPorGrupo(grupo: GrupoFinanceiroCanonico): {
  tipo_margem: ConsigfacilTipoMargem;
  eh_cartao: boolean;
  eh_cartao_beneficio: boolean;
  eh_emprestimo: boolean;
  eh_contribuicao: boolean;
} {
  switch (grupo) {
    case "cartao_beneficio":
      return {
        tipo_margem: "margem_cartao_beneficio",
        eh_cartao: true,
        eh_cartao_beneficio: true,
        eh_emprestimo: false,
        eh_contribuicao: false,
      };
    case "cartao_credito":
      return {
        tipo_margem: "margem_cartao",
        eh_cartao: true,
        eh_cartao_beneficio: false,
        eh_emprestimo: false,
        eh_contribuicao: false,
      };
    case "contribuicao":
      return {
        tipo_margem: null,
        eh_cartao: false,
        eh_cartao_beneficio: false,
        eh_emprestimo: false,
        eh_contribuicao: true,
      };
    case "emprestimo_consignado":
    case "refinanciamentos":
      return {
        tipo_margem: "margem_consignavel",
        eh_cartao: false,
        eh_cartao_beneficio: false,
        eh_emprestimo: true,
        eh_contribuicao: false,
      };
    default:
      return {
        tipo_margem: null,
        eh_cartao: false,
        eh_cartao_beneficio: false,
        eh_emprestimo: false,
        eh_contribuicao: false,
      };
  }
}

function casaAliasNoTexto(textoNorm: string, aliasNorm: string): boolean {
  if (!textoNorm || !aliasNorm) return false;
  if (textoNorm === aliasNorm) return true;
  if (textoNorm.includes(aliasNorm)) return true;
  const re = new RegExp(`\\b${aliasNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return re.test(textoNorm);
}

function buscarEntradaPorTexto(texto: string): {
  entrada: EntradaCatalogoRubricaFinanceira;
  alias: string;
} | null {
  const norm = normalizarTextoCatalogo(texto);
  if (!norm) return null;

  let melhor: { entrada: EntradaCatalogoRubricaFinanceira; alias: string; len: number } | null =
    null;

  for (const e of ENTRADAS_CATALOGO) {
    for (const a of e.aliases) {
      const aNorm = normalizarTextoCatalogo(a);
      if (!casaAliasNoTexto(norm, aNorm)) continue;
      if (!melhor || aNorm.length > melhor.len) {
        melhor = { entrada: e, alias: a, len: aNorm.length };
      }
    }
  }

  if (melhor) return { entrada: melhor.entrada, alias: melhor.alias };

  const exato = ALIAS_PARA_ENTRADA.get(norm);
  if (exato) return { entrada: exato, alias: norm };

  return null;
}

export function logCatalogoRubricaResolvido(r: ResultadoResolucaoCatalogoRubrica): void {
  console.log("[CATALOGO_RUBRICA_RESOLVIDO]", {
    rubrica_original: r.rubrica_original,
    instituicao_resolvida: r.instituicao,
    modalidade_resolvida: r.modalidade,
    grupo_canonico: r.grupo_canonico,
    alias: r.alias_correspondente,
    entrada: r.entrada_id,
  });
}

export function resolverInstituicaoPorRubrica(
  rubrica: string | null | undefined,
  opts?: { registrarLog?: boolean },
): ResultadoResolucaoCatalogoRubrica | null {
  const hit = buscarEntradaPorTexto(rubrica ?? "");
  if (!hit) return null;
  return montarResultadoResolucao(rubrica ?? "", hit.entrada, hit.alias, opts?.registrarLog !== false);
}

export function resolverModalidadePorRubrica(
  rubrica: string | null | undefined,
): Pick<
  ResultadoResolucaoCatalogoRubrica,
  "modalidade" | "modalidade_slug" | "grupo_canonico" | "tipo_margem" | "eh_cartao" | "eh_cartao_beneficio" | "eh_emprestimo" | "eh_contribuicao"
> | null {
  const r = resolverInstituicaoPorRubrica(rubrica);
  if (!r) return null;
  return {
    modalidade: r.modalidade,
    modalidade_slug: r.modalidade_slug,
    grupo_canonico: r.grupo_canonico,
    tipo_margem: r.tipo_margem,
    eh_cartao: r.eh_cartao,
    eh_cartao_beneficio: r.eh_cartao_beneficio,
    eh_emprestimo: r.eh_emprestimo,
    eh_contribuicao: r.eh_contribuicao,
  };
}

/** Remove trechos obsoletos de “modalidade não reconhecida” quando já há slug oficial. */
export function limparMotivoModalidadeNaoReconhecida(motivo: string): string {
  return motivo
    .replace(/Modalidade "[^"]+" não reconhecida\.?/gi, "")
    .replace(/Modalidade nao reconhecida[^.]*\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function resolverGrupoCanonicoPorRubrica(
  rubrica: string | null | undefined,
): GrupoFinanceiroCanonico | null {
  return resolverInstituicaoPorRubrica(rubrica)?.grupo_canonico ?? null;
}

function montarResultadoResolucao(
  rubrica: string,
  entrada: EntradaCatalogoRubricaFinanceira,
  alias: string,
  registrarLog = true,
): ResultadoResolucaoCatalogoRubrica {
  const flags = flagsPorGrupo(entrada.grupo_canonico);
  const modSlug = modalidadeParaSlug(entrada.modalidade);
  const r: ResultadoResolucaoCatalogoRubrica = {
    entrada_id: entrada.id,
    rubrica_original: rubrica,
    rubrica_normalizada: normalizarTextoCatalogo(rubrica),
    alias_correspondente: alias,
    instituicao: entrada.instituicao,
    instituicao_normalizada: normalizarNomeInstituicao(entrada.instituicao),
    modalidade: entrada.modalidade,
    modalidade_slug: modSlug,
    grupo_canonico: entrada.grupo_canonico,
    ...flags,
  };
  if (registrarLog) logCatalogoRubricaResolvido(r);
  return r;
}

const TOKENS_BANCOOB_SICOOB = new Set([
  "BANCOOB",
  "SICOOB",
  "COOPERATIVO",
  "COOP",
]);

/** Rubricas/modalidades de empréstimo consignado tratadas como equivalentes ao slug oficial. */
const ALIASES_MODALIDADE_EMPRESTIMO = new Set(
  [
    "BB EMP",
    "BB-EMP",
    "BB EMPRESTIMO",
    "BANCOOB EMPRESTIMO",
    "DAYCOVAL EMP02",
    "DAYCOVAL EMP03",
    "DAYCOVAL EMPRESTIMO",
    "CAIXA EMPRESTIMO",
    "CAIXA EMP02",
    "BIB EMPRESTIMOS",
    "BIB EMPRESTIMO",
  ].map(normalizarTextoCatalogo),
);

export const INSTITUICAO_OFICIAL_BANCOOB_SICOOB = "Bancoob / Sicoob";

export function ehInstituicaoBancoobSicoob(texto: string | null | undefined): boolean {
  const n = normalizarTextoCatalogo(texto);
  if (!n) return false;
  if (n.includes("BANCOOB") || n.includes("SICOOB")) return true;
  const tokens = n.split(" ").filter((t) => t.length >= 2);
  return tokens.some((t) => TOKENS_BANCOOB_SICOOB.has(t));
}

/** Bancoob, Sicoob, Cooperativo Sicoob, Sicoob (Bancoob), Bancoob / Sicoob → mesma instituição. */
export function instituicoesFinanceirasEquivalentes(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = normalizarNomeInstituicao(a);
  const nb = normalizarNomeInstituicao(b);
  if (na === nb) return true;
  if (ehInstituicaoBancoobSicoob(a) && ehInstituicaoBancoobSicoob(b)) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

export function modalidadesEmprestimoEquivalentes(
  original: string | null | undefined,
  slugOficial: ConsigfacilModalidadeSlug | null,
  grupo: GrupoFinanceiroCanonico,
): boolean {
  if (grupo !== "emprestimo_consignado" && grupo !== "refinanciamentos") return false;
  if (slugOficial === "emprestimo_consignado") return true;
  const norm = normalizarTextoCatalogo(original);
  if (!norm) return false;
  if (ALIASES_MODALIDADE_EMPRESTIMO.has(norm)) return true;
  if (/EMP(RESTIMO)?\b|EMP\d{2}\b/.test(norm) && !/CARTAO|CARTÃO/.test(norm)) return true;
  return false;
}

function temConflitoInstituicaoReal(
  base: ResultadoClassificacaoFinanceira,
  cat: ResultadoResolucaoCatalogoRubrica,
): boolean {
  if (!base.instituicao_oficial || base.fonte_classificacao === "sem_correspondencia") {
    return false;
  }
  if (instituicoesFinanceirasEquivalentes(base.instituicao_oficial, cat.instituicao)) {
    return false;
  }
  if (instituicoesFinanceirasEquivalentes(base.instituicao_original, cat.instituicao)) {
    return false;
  }
  return (
    normalizarNomeInstituicao(base.instituicao_oficial) !== cat.instituicao_normalizada
  );
}

function temConflitoModalidadeReal(
  base: ResultadoClassificacaoFinanceira,
  cat: ResultadoResolucaoCatalogoRubrica,
): boolean {
  if (base.grupo_canonico === cat.grupo_canonico) return false;
  if (!cat.modalidade_slug) return false;
  if (!base.modalidade_oficial) {
    return !modalidadesEmprestimoEquivalentes(
      base.modalidade_original ?? base.instituicao_original,
      cat.modalidade_slug,
      cat.grupo_canonico,
    );
  }
  if (base.modalidade_oficial === cat.modalidade_slug) return false;
  if (
    modalidadesEmprestimoEquivalentes(
      base.modalidade_original,
      cat.modalidade_slug,
      base.grupo_canonico,
    )
  ) {
    return false;
  }
  return true;
}

export type ResultadoClassificacaoComCatalogoRubrica = ResultadoClassificacaoFinanceira & {
  resolvido_por_catalogo_rubrica: boolean;
  catalogo_rubrica_local: boolean;
  catalogo_rubrica_entrada_id: string | null;
};

/**
 * Divergência de classificação que deve contar em KPIs, painéis e badge vermelho.
 * Exclui rubrica de folha, resolução por catálogo local e conflitos apenas cosméticos.
 */
export function ehDivergenciaClassificacaoReal(
  classificacao: ResultadoClassificacaoFinanceira &
    Partial<Pick<ResultadoClassificacaoComCatalogoRubrica, "resolvido_por_catalogo_rubrica" | "catalogo_rubrica_local">>,
  rubrica?: string | null,
): boolean {
  if (
    classificacao.grupo_canonico === "rubrica_folha_nao_consignavel" ||
    classificacao.grupo_canonico === "conta_consumo"
  ) {
    return false;
  }
  if (classificacao.resolvido_por_catalogo_rubrica) return false;
  if (
    classificacao.fonte_classificacao === "match_alias_catalogo" &&
    classificacao.catalogo_rubrica_local
  ) {
    return false;
  }
  if (isDivergenciaApenasCatalogo(classificacao, rubrica)) return false;
  if (
    instituicoesFinanceirasEquivalentes(
      classificacao.instituicao_original,
      classificacao.instituicao_oficial,
    )
  ) {
    return false;
  }
  if (
    modalidadesEmprestimoEquivalentes(
      classificacao.modalidade_original ?? classificacao.instituicao_original,
      classificacao.modalidade_oficial,
      classificacao.grupo_canonico,
    )
  ) {
    return false;
  }
  return Boolean(classificacao.divergencia_classificacao);
}

/** Divergência era só falta de match no catálogo oficial (sem conflito real). */
export function isDivergenciaApenasCatalogo(
  classificacao: ResultadoClassificacaoFinanceira,
  rubrica?: string | null,
): boolean {
  if (!classificacao.divergencia_classificacao) return false;
  if (classificacao.fonte_classificacao === "consigfacil_oficial") return false;

  const cat = resolverInstituicaoPorRubrica(
    rubrica ?? classificacao.instituicao_original ?? classificacao.modalidade_original ?? "",
    { registrarLog: false },
  );
  if (!cat) return false;
  if (!cat.modalidade_slug && cat.grupo_canonico !== "outros") return false;
  if (temConflitoInstituicaoReal(classificacao, cat)) return false;
  if (temConflitoModalidadeReal(classificacao, cat)) return false;
  return true;
}

export function aplicarCatalogoRubricasFinanceiras(
  entrada: EntradaCatalogoRubricaClassificacao,
  classificacaoBase?: ResultadoClassificacaoFinanceira,
): ResultadoClassificacaoComCatalogoRubrica {
  const base = classificacaoBase ?? { ...resultadoClassificacaoVazio };
  const textoRubrica =
    entrada.descricao?.trim() ||
    entrada.instituicao?.trim() ||
    entrada.modalidade?.trim() ||
    "";

  const cat = resolverInstituicaoPorRubrica(textoRubrica);
  if (!cat) {
    return {
      ...base,
      resolvido_por_catalogo_rubrica: false,
      catalogo_rubrica_local: false,
      catalogo_rubrica_entrada_id: null,
    };
  }

  const flags = flagsPorGrupo(cat.grupo_canonico);

  if (entrada.id_consignacao_consigfacil) {
    const textoModalidade =
      entrada.modalidade?.trim() ||
      (base.modalidade_original &&
      base.modalidade_original !== base.instituicao_original
        ? base.modalidade_original.trim()
        : "");
    const catMod = textoModalidade
      ? resolverInstituicaoPorRubrica(textoModalidade, { registrarLog: false })
      : null;
    if (!catMod) {
      const motivoLimpo =
        base.modalidade_oficial != null
          ? limparMotivoModalidadeNaoReconhecida(base.motivo_classificacao)
          : base.motivo_classificacao;
      const baseLimpo = { ...base, motivo_classificacao: motivoLimpo };
      return {
        ...baseLimpo,
        resolvido_por_catalogo_rubrica: false,
        catalogo_rubrica_local: false,
        catalogo_rubrica_entrada_id: null,
      };
    }

    const flagsMod = flagsPorGrupo(catMod.grupo_canonico);
    const conflitoModOficial = temConflitoModalidadeReal(base, catMod);
    const resolvidoMod = !conflitoModOficial;
    const motivoMod = `Modalidade reconhecida por catálogo local (${catMod.alias_correspondente} → ${catMod.modalidade}).`;
    const motivo = limparMotivoModalidadeNaoReconhecida(
      resolvidoMod ? motivoMod : `${motivoMod} ${base.motivo_classificacao}`.trim(),
    );

    const resultadoOficial: ResultadoClassificacaoComCatalogoRubrica = {
      ...base,
      modalidade_original: base.modalidade_original ?? textoModalidade,
      modalidade_normalizada: catMod.rubrica_normalizada,
      modalidade_oficial: catMod.modalidade_slug ?? base.modalidade_oficial,
      grupo_canonico: resolvidoMod ? catMod.grupo_canonico : base.grupo_canonico,
      tipo_margem: resolvidoMod ? flagsMod.tipo_margem : base.tipo_margem,
      eh_cartao: resolvidoMod ? flagsMod.eh_cartao : base.eh_cartao,
      eh_cartao_beneficio: resolvidoMod ? flagsMod.eh_cartao_beneficio : base.eh_cartao_beneficio,
      eh_emprestimo: resolvidoMod ? flagsMod.eh_emprestimo : base.eh_emprestimo,
      eh_contribuicao: resolvidoMod ? flagsMod.eh_contribuicao : base.eh_contribuicao,
      motivo_classificacao: motivo,
      catalogo_rubrica_local: true,
      catalogo_rubrica_entrada_id: catMod.entrada_id,
      resolvido_por_catalogo_rubrica: resolvidoMod,
      divergencia_classificacao: resolvidoMod
        ? false
        : base.divergencia_classificacao || conflitoModOficial,
    };

    const divergenciaReal = ehDivergenciaClassificacaoReal(resultadoOficial, textoModalidade);
    const resolvido =
      resultadoOficial.resolvido_por_catalogo_rubrica ||
      (resultadoOficial.catalogo_rubrica_local && !divergenciaReal);

    return {
      ...resultadoOficial,
      divergencia_classificacao: divergenciaReal,
      resolvido_por_catalogo_rubrica: resolvido,
    };
  }

  const conflitoInst = temConflitoInstituicaoReal(base, cat);
  const conflitoMod = temConflitoModalidadeReal(base, cat);
  const resolvidoCompleto = !conflitoInst && !conflitoMod;

  const motivoCatalogo = `Instituição reconhecida por catálogo local (${cat.alias_correspondente} → ${cat.instituicao}). Modalidade: ${cat.modalidade}.`;
  const motivo = resolvidoCompleto
    ? motivoCatalogo
    : `${motivoCatalogo} ${base.motivo_classificacao}`.trim();

  const instituicaoOficial =
    cat.entrada_id === "bancoob_emprestimo"
      ? INSTITUICAO_OFICIAL_BANCOOB_SICOOB
      : cat.instituicao;

  const resultado: ResultadoClassificacaoComCatalogoRubrica = {
    ...base,
    instituicao_original: base.instituicao_original ?? textoRubrica,
    instituicao_normalizada: normalizarNomeInstituicao(instituicaoOficial),
    instituicao_oficial: instituicaoOficial,
    modalidade_original: base.modalidade_original ?? textoRubrica,
    modalidade_normalizada: cat.rubrica_normalizada,
    modalidade_oficial: cat.modalidade_slug,
    grupo_canonico: cat.grupo_canonico,
    tipo_margem: flags.tipo_margem,
    eh_cartao: flags.eh_cartao,
    eh_cartao_beneficio: flags.eh_cartao_beneficio,
    eh_emprestimo: flags.eh_emprestimo,
    eh_contribuicao: flags.eh_contribuicao,
    fonte_classificacao: resolvidoCompleto ? "match_alias_catalogo" : base.fonte_classificacao,
    aliases_utilizados: [cat.alias_correspondente, ...base.aliases_utilizados].filter(
      (v, i, a) => a.indexOf(v) === i,
    ),
    indice_confianca_classificacao: resolvidoCompleto
      ? Math.max(base.indice_confianca_classificacao, 78)
      : base.indice_confianca_classificacao,
    divergencia_classificacao: resolvidoCompleto
      ? false
      : base.divergencia_classificacao || conflitoInst || conflitoMod,
    motivo_classificacao: motivo,
    resolvido_por_catalogo_rubrica: resolvidoCompleto,
    catalogo_rubrica_local: true,
    catalogo_rubrica_entrada_id: cat.entrada_id,
  };

  const divergenciaReal = ehDivergenciaClassificacaoReal(resultado, textoRubrica);
  const resolvido =
    resultado.resolvido_por_catalogo_rubrica ||
    (resultado.catalogo_rubrica_local && !divergenciaReal);

  return {
    ...resultado,
    divergencia_classificacao: divergenciaReal,
    resolvido_por_catalogo_rubrica: resolvido,
    fonte_classificacao: resolvido ? "match_alias_catalogo" : resultado.fonte_classificacao,
    indice_confianca_classificacao: resolvido
      ? Math.max(resultado.indice_confianca_classificacao, 78)
      : resultado.indice_confianca_classificacao,
  };
}
