/**
 * Cache singleton do catálogo ConsigFácil (modalidades, instituições, aliases).
 *
 * Fluxo:
 *  1. Boot do app: o cache começa populado com a versão EMBEDDED (espelho da
 *     migration), garantindo que classificação funcione mesmo offline / antes
 *     do banco responder.
 *  2. Após a primeira chamada autenticada, o app pode chamar
 *     `hydrateConsigfacilCatalogoCache(client)` para puxar overrides do
 *     Supabase. Falhas no banco NÃO derrubam o cache embedded.
 *
 * Estrutura: `Map<alias_normalizado, instituicao_normalizada>` para resolver
 * em O(1) qualquer escrita observada.
 *
 * Preparado para múltiplos estados / múltiplos órgãos: cada `fonte` (hoje
 * sempre "consigfacil") pode coexistir; quem importar de outra UF futuramente
 * só precisa pluggar um novo bloco de seeds com `fonte` distinta.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConsigfacilInstituicao,
  ConsigfacilInstituicaoAlias,
  ConsigfacilModalidade,
  ConsigfacilModalidadeSlug,
} from "@/types/consigfacil";
import {
  INSTITUICOES_OFICIAIS,
  MODALIDADES_OFICIAIS,
  normalizarNomeInstituicao,
} from "@/lib/consignacoes-governo/consigfacil-catalogo";

// ---------------------------------------------------------------------------
// ALIASES EMBEDDED — mesma lista da migration. Manter em sincronia.
// ---------------------------------------------------------------------------

const ALIASES_EMBEDDED: Array<{
  instituicao_normalizada: string;
  alias_original: string;
}> = [
  // Banco Pan
  { instituicao_normalizada: "banco pan", alias_original: "BCO PAN" },
  { instituicao_normalizada: "banco pan", alias_original: "PAN" },
  { instituicao_normalizada: "banco pan", alias_original: "BANCO PAN S.A." },
  // Banco Daycoval
  { instituicao_normalizada: "banco daycoval", alias_original: "DAYCOVAL" },
  { instituicao_normalizada: "banco daycoval", alias_original: "BCO DAYCOVAL" },
  { instituicao_normalizada: "banco daycoval", alias_original: "Daycoval Integrador" },
  // Banco Bradesco
  { instituicao_normalizada: "banco bradesco", alias_original: "BRADESCO" },
  { instituicao_normalizada: "banco bradesco", alias_original: "BCO BRADESCO" },
  // Banco do Brasil
  { instituicao_normalizada: "banco do brasil", alias_original: "BB" },
  { instituicao_normalizada: "banco do brasil", alias_original: "BANCO DO BRASIL S.A." },
  // Banco Santander
  { instituicao_normalizada: "banco santander", alias_original: "SANTANDER" },
  { instituicao_normalizada: "banco santander", alias_original: "BANCO SANTANDER BRASIL" },
  // Banco Safra
  { instituicao_normalizada: "banco safra", alias_original: "SAFRA" },
  // Banco Industrial do Brasil
  { instituicao_normalizada: "banco industrial do brasil", alias_original: "BIB" },
  // Banco de Minas Gerais
  { instituicao_normalizada: "banco de minas gerais", alias_original: "BMG" },
  { instituicao_normalizada: "banco de minas gerais", alias_original: "BCO BMG" },
  // Cooperativo Sicoob
  { instituicao_normalizada: "cooperativo sicoob", alias_original: "SICOOB" },
  { instituicao_normalizada: "cooperativo sicoob", alias_original: "COOP SICOOB" },
  // Olé Bonsucesso
  { instituicao_normalizada: "ole bonsucesso consignado", alias_original: "OLE CONSIGNADO" },
  { instituicao_normalizada: "ole bonsucesso consignado", alias_original: "BONSUCESSO" },
  { instituicao_normalizada: "ole bonsucesso consignado", alias_original: "OLE BONSUCESSO" },
  // Banco Pine
  { instituicao_normalizada: "banco pine", alias_original: "PINE" },
  // Banco Genial — alias completo (evita falso positivo do token "GENIAL" isolado)
  { instituicao_normalizada: "banco genial", alias_original: "BANCO GENIAL" },
  { instituicao_normalizada: "banco genial", alias_original: "GENIAL INVESTIMENTOS" },
  // Credcesta
  { instituicao_normalizada: "credcesta", alias_original: "CRED CESTA" },
  { instituicao_normalizada: "credcesta", alias_original: "CRED CESTA CARD" },
  { instituicao_normalizada: "credcesta", alias_original: "CREDCESTA CARD" },
  // AVANCARD
  { instituicao_normalizada: "avancard", alias_original: "AVAN CARD" },
  // BCBR Card
  { instituicao_normalizada: "bcbr card", alias_original: "BCBR" },
  // Consigap
  { instituicao_normalizada: "consigap card", alias_original: "CONSIGAP" },
  // Emprestei
  { instituicao_normalizada: "emprestei card", alias_original: "EMPRESTEI" },
  // FY Digital
  { instituicao_normalizada: "fy digital", alias_original: "FY" },
  { instituicao_normalizada: "fy digital", alias_original: "FYDIGITAL" },
  // Meucashcard
  {
    instituicao_normalizada: "meucashcard servicos tecnologicos e financeiros",
    alias_original: "MEUCASHCARD",
  },
  {
    instituicao_normalizada: "meucashcard servicos tecnologicos e financeiros",
    alias_original: "MEU CASH CARD",
  },
  // PEGCARD
  { instituicao_normalizada: "pegcard ltda", alias_original: "PEGCARD" },
  { instituicao_normalizada: "pegcard ltda", alias_original: "PEG CARD" },
  // Eagle SCD
  { instituicao_normalizada: "eagle sociedade de credito direto", alias_original: "EAGLE SCD" },
  { instituicao_normalizada: "eagle sociedade de credito direto", alias_original: "EAGLE" },
  // Valor SCD
  { instituicao_normalizada: "valor sociedade de credito direto", alias_original: "VALOR SCD" },
  { instituicao_normalizada: "valor sociedade de credito direto", alias_original: "VALOR S.A." },
];

// ---------------------------------------------------------------------------
// Estrutura interna do cache
// ---------------------------------------------------------------------------

type CacheConsigfacilCatalogo = {
  modalidades: ConsigfacilModalidade[];
  modalidadePorSlug: Map<ConsigfacilModalidadeSlug, ConsigfacilModalidade>;
  instituicoes: ConsigfacilInstituicao[];
  instituicaoPorNorm: Map<string, ConsigfacilInstituicao>;
  aliases: ConsigfacilInstituicaoAlias[];
  /** alias_normalizado → instituicao_normalizada. */
  aliasIndex: Map<string, string>;
  /** Carimbo do último hydrate (null = só embedded). */
  hidratadoEm: string | null;
  fonte: "embedded" | "supabase";
};

function montarCacheEmbedded(): CacheConsigfacilCatalogo {
  const modalidadePorSlug = new Map(MODALIDADES_OFICIAIS.map((m) => [m.slug, m] as const));
  const instituicaoPorNorm = new Map(
    INSTITUICOES_OFICIAIS.map((i) => [i.nome_normalizado, i] as const),
  );
  const aliases: ConsigfacilInstituicaoAlias[] = ALIASES_EMBEDDED.map((a) => ({
    alias_original: a.alias_original,
    alias_normalizado: normalizarNomeInstituicao(a.alias_original),
    instituicao_normalizada: a.instituicao_normalizada,
    fonte: "consigfacil" as const,
  }));
  // Inclui o próprio nome oficial normalizado como alias da própria instituição
  // — assim o alias-index funciona como atalho universal de lookup.
  for (const i of INSTITUICOES_OFICIAIS) {
    aliases.push({
      alias_original: i.nome_oficial,
      alias_normalizado: i.nome_normalizado,
      instituicao_normalizada: i.nome_normalizado,
      fonte: "consigfacil",
    });
  }
  const aliasIndex = new Map<string, string>();
  for (const a of aliases) aliasIndex.set(a.alias_normalizado, a.instituicao_normalizada);

  return {
    modalidades: [...MODALIDADES_OFICIAIS],
    modalidadePorSlug,
    instituicoes: [...INSTITUICOES_OFICIAIS],
    instituicaoPorNorm,
    aliases,
    aliasIndex,
    hidratadoEm: null,
    fonte: "embedded",
  };
}

let CACHE: CacheConsigfacilCatalogo = montarCacheEmbedded();

// ---------------------------------------------------------------------------
// API pública do cache
// ---------------------------------------------------------------------------

export function getCatalogoCache(): CacheConsigfacilCatalogo {
  return CACHE;
}

export function resetCatalogoCacheParaEmbedded(): void {
  CACHE = montarCacheEmbedded();
}

/**
 * Tenta hidratar o cache lendo as 4 tabelas do Supabase. Se qualquer uma
 * estiver ausente (migration não aplicada) ou falhar, mantém o embedded e
 * apenas registra um aviso no objeto retornado.
 */
export async function hydrateConsigfacilCatalogoCache(
  client: SupabaseClient,
): Promise<{ ok: boolean; aviso: string | null }> {
  try {
    const [modR, instR, aliR] = await Promise.all([
      client.from("consigfacil_modalidades").select("*"),
      client.from("consigfacil_instituicoes").select("*"),
      client.from("consigfacil_instituicao_aliases").select("*"),
    ]);

    const houveMissing =
      isMissingTable(modR.error) || isMissingTable(instR.error) || isMissingTable(aliR.error);
    if (houveMissing) {
      return { ok: false, aviso: "Catálogo ConsigFácil não encontrado no banco — usando embedded." };
    }
    if (modR.error || instR.error || aliR.error) {
      return {
        ok: false,
        aviso: `Falha ao carregar catálogo ConsigFácil: ${(modR.error ?? instR.error ?? aliR.error)?.message}`,
      };
    }

    const modalidades: ConsigfacilModalidade[] = (modR.data ?? []).map((r) => ({
      slug: String(r.slug) as ConsigfacilModalidadeSlug,
      nome_oficial: String(r.nome_oficial),
      grupo_canonico: String(r.grupo_canonico) as ConsigfacilModalidade["grupo_canonico"],
      tipo_margem: (r.tipo_margem as ConsigfacilModalidade["tipo_margem"]) ?? null,
      eh_emprestimo: Boolean(r.eh_emprestimo),
      eh_cartao: Boolean(r.eh_cartao),
      eh_cartao_beneficio: Boolean(r.eh_cartao_beneficio),
      eh_contribuicao: Boolean(r.eh_contribuicao),
      ativo: Boolean(r.ativo ?? true),
      fonte: "consigfacil",
    }));
    const instituicoes: ConsigfacilInstituicao[] = (instR.data ?? []).map((r) => ({
      nome_oficial: String(r.nome_oficial),
      nome_normalizado: String(r.nome_normalizado),
      modalidade_slug: (r.modalidade_slug as ConsigfacilModalidadeSlug | null) ?? null,
      grupo_canonico: (r.grupo_canonico as ConsigfacilInstituicao["grupo_canonico"]) ?? null,
      ativo: Boolean(r.ativo ?? true),
      fonte: "consigfacil",
    }));
    const aliasesDb: ConsigfacilInstituicaoAlias[] = (aliR.data ?? []).map((r) => ({
      alias_normalizado: String(r.alias_normalizado),
      alias_original: String(r.alias_original),
      instituicao_normalizada: String(r.instituicao_normalizada),
      fonte: (r.fonte as ConsigfacilInstituicaoAlias["fonte"]) ?? "consigfacil",
    }));

    const modalidadePorSlug = new Map(modalidades.map((m) => [m.slug, m] as const));
    const instituicaoPorNorm = new Map(instituicoes.map((i) => [i.nome_normalizado, i] as const));
    const aliases = [...aliasesDb];
    // Sempre inclui nome oficial como alias dele mesmo.
    for (const i of instituicoes) {
      aliases.push({
        alias_normalizado: i.nome_normalizado,
        alias_original: i.nome_oficial,
        instituicao_normalizada: i.nome_normalizado,
        fonte: "consigfacil",
      });
    }
    const aliasIndex = new Map<string, string>();
    for (const a of aliases) aliasIndex.set(a.alias_normalizado, a.instituicao_normalizada);

    CACHE = {
      modalidades,
      modalidadePorSlug,
      instituicoes,
      instituicaoPorNorm,
      aliases,
      aliasIndex,
      hidratadoEm: new Date().toISOString(),
      fonte: "supabase",
    };
    return { ok: true, aviso: null };
  } catch (e) {
    return {
      ok: false,
      aviso: e instanceof Error ? e.message : "Falha desconhecida ao hidratar cache.",
    };
  }
}

function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  return (
    e.code === "42P01" ||
    /relation .* does not exist/i.test(e.message ?? "") ||
    /not found/i.test(e.message ?? "")
  );
}

/** Snapshot serializável para o Web Worker (espelha cache hidratado na main thread). */
export type CatalogoCacheWorkerSnapshot = {
  modalidades: ConsigfacilModalidade[];
  instituicoes: ConsigfacilInstituicao[];
  aliases: ConsigfacilInstituicaoAlias[];
  fonte?: "embedded" | "supabase";
};

export function exportarCatalogoCacheParaWorker(): CatalogoCacheWorkerSnapshot {
  const c = getCatalogoCache();
  return {
    modalidades: c.modalidades,
    instituicoes: c.instituicoes,
    aliases: c.aliases,
    fonte: c.fonte,
  };
}

export function restaurarCatalogoCacheFromWorker(snapshot: CatalogoCacheWorkerSnapshot): void {
  const modalidadePorSlug = new Map(snapshot.modalidades.map((m) => [m.slug, m] as const));
  const instituicaoPorNorm = new Map(
    snapshot.instituicoes.map((i) => [i.nome_normalizado, i] as const),
  );
  const aliasIndex = new Map<string, string>();
  for (const a of snapshot.aliases) {
    aliasIndex.set(a.alias_normalizado, a.instituicao_normalizada);
  }
  CACHE = {
    modalidades: snapshot.modalidades,
    modalidadePorSlug,
    instituicoes: snapshot.instituicoes,
    instituicaoPorNorm,
    aliases: snapshot.aliases,
    aliasIndex,
    hidratadoEm: new Date().toISOString(),
    fonte: snapshot.fonte ?? "embedded",
  };
}
