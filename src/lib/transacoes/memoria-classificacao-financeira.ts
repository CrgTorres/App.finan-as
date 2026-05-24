/**
 * Memória de classificação: após correção manual, reaproveitar categoria/subtipo
 * nas importações seguintes sem alterar valor, data ou tipo da transação.
 */

export type MemoriaClassificacaoFinanceira = {
  favorecido?: string | null;
  documento?: string | null;
  /** Código de categoria (ex.: valores de `Category`). */
  categoria: string;
  subtipo?: string | null;
  /** Confirmações manuais com a mesma categoria/subtipo para esta chave. */
  frequencia?: number;
  ultimaConfirmacao?: string;
  /** 0–100; após várias confirmações iguais deve ficar alto (ver constantes). */
  confianca: number;
};

const PREFIX_DOC = "doc:";
const PREFIX_FAV = "fav:";

/** Após N confirmações iguais, a confiança sobe ao patamar alto (regra 4). */
export const CONFIRMACOES_PARA_CONFIANCA_ALTA = 2;

/** Primeira vez que o utilizador define esta chave → categoria. */
export const CONFIANCA_MEMORIA_PRIMEIRA = 78;

/** Mínimo após confirmações repetidas iguais. */
export const CONFIANCA_MEMORIA_ALTA_MIN = 92;

export function somenteDigitosDocumento(s: string): string {
  return s.replace(/\D/g, "");
}

function normalizarFavorecidoChave(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function igualSubtipo(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

/**
 * Regra 1–2:
 * - Com CPF/CNPJ (11 ou 14 dígitos), chave = `doc:` + apenas dígitos.
 * - Caso contrário, chave = `fav:` + favorecido normalizado (mínimo 2 caracteres).
 */
export function gerarChaveMemoriaTransacao(params: {
  documento?: string | null;
  favorecido?: string | null;
}): string | null {
  const docBruto = params.documento?.trim();
  if (docBruto) {
    const dg = somenteDigitosDocumento(docBruto);
    if (dg.length === 11 || dg.length === 14) {
      return `${PREFIX_DOC}${dg}`;
    }
  }
  const fav = params.favorecido?.trim();
  if (fav) {
    const n = normalizarFavorecidoChave(fav);
    if (n.length >= 2) return `${PREFIX_FAV}${n}`;
  }
  return null;
}

export type ResultadoMemoriaClassificacao =
  | { aplicouMemoria: false }
  | {
      aplicouMemoria: true;
      chave: string;
      memoria: MemoriaClassificacaoFinanceira;
      categoria: string;
      subtipo: string | null;
    };

/**
 * Regra 5: só devolve categoria/subtipo da memória; não altera valor, data nem tipo —
 * quem integra apenas mescla estes campos na linha.
 *
 * Regra 3: no fluxo de importação, consultar antes de categorização só por palavra‑chave.
 */
export function aplicarMemoriaClassificacao(
  entrada: { documento?: string | null; favorecido?: string | null },
  memoriaPorChave:
    | ReadonlyMap<string, MemoriaClassificacaoFinanceira>
    | Readonly<Record<string, MemoriaClassificacaoFinanceira>>
): ResultadoMemoriaClassificacao {
  const chave = gerarChaveMemoriaTransacao(entrada);
  if (!chave) return { aplicouMemoria: false };

  const rec = memoriaPorChave instanceof Map
    ? memoriaPorChave.get(chave)
    : (memoriaPorChave as Readonly<Record<string, MemoriaClassificacaoFinanceira>>)[chave];
  if (!rec) return { aplicouMemoria: false };

  return {
    aplicouMemoria: true,
    chave,
    memoria: rec,
    categoria: rec.categoria,
    subtipo: rec.subtipo ?? null,
  };
}

function calcularFrequenciaEConfianca(
  anterior: MemoriaClassificacaoFinanceira | null | undefined,
  categoriaNova: string,
  subtipoNovo: string | null | undefined
): { frequencia: number; confianca: number } {
  const mesmoConteudo =
    anterior !== null &&
    anterior !== undefined &&
    anterior.categoria === categoriaNova &&
    igualSubtipo(anterior.subtipo, subtipoNovo);

  const baseFreq =
    mesmoConteudo ? Math.max(anterior!.frequencia ?? 1, 1) : 0;

  const frequencia = mesmoConteudo ? baseFreq + 1 : 1;

  const confianca =
    frequencia >= CONFIRMACOES_PARA_CONFIANCA_ALTA
      ? CONFIANCA_MEMORIA_ALTA_MIN
      : CONFIANCA_MEMORIA_PRIMEIRA;

  return { frequencia, confianca };
}

/**
 * Atualiza ou cria registo na memória a partir da correção manual.
 * Mesma chave + mesma `categoria` e `subtipo` → incrementa `frequencia`; com 2+ confirmações, confiança alta (regra 4).
 */
export function registrarCorrecaoManual(
  anteriorParaAMesmaChave: MemoriaClassificacaoFinanceira | null | undefined,
  dados: {
    documento?: string | null;
    favorecido?: string | null;
    categoria: string;
    subtipo?: string | null;
  },
  opcoes?: { instanteISO?: string }
): MemoriaClassificacaoFinanceira | null {
  if (!gerarChaveMemoriaTransacao({ documento: dados.documento, favorecido: dados.favorecido })) {
    return null;
  }

  const { frequencia, confianca } = calcularFrequenciaEConfianca(
    anteriorParaAMesmaChave,
    dados.categoria,
    dados.subtipo
  );

  const iso = opcoes?.instanteISO ?? new Date().toISOString();

  return {
    documento: dados.documento?.trim() || null,
    favorecido: dados.favorecido?.trim() || null,
    categoria: dados.categoria,
    subtipo: dados.subtipo?.trim() || null,
    frequencia,
    ultimaConfirmacao: iso,
    confianca,
  };
}
