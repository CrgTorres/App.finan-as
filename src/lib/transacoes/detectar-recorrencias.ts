/**
 * Deteta padrões de gastos recorrentes (mensais/semanais) por favorecido, categoria e valor próximo.
 */

export type FrequenciaRecorrenciaDetectada = "mensal" | "semanal" | "eventual";

export type RecorrenciaDetectada = {
  chave: string;
  favorecido: string;
  categoria: string;
  valorMedio: number;
  frequencia: FrequenciaRecorrenciaDetectada;
  mesesDetectados: string[];
  confianca: "alta" | "media" | "baixa";
};

/** Categorias típicas de contas e assinaturas (pode cruzar resultados com esta lista). */
export const CATEGORIAS_TIPICAS_RECORRENCIA: readonly string[] = [
  "Conta de consumo",
  "Cartão/Fatura",
  "Saúde",
  "Assinatura",
  "Moradia",
];

const TOLERANCIA_VALOR = 0.15;

/** Até 15% de diferença sobre o maior valor (em módulo). */
export function valoresFinanceirosParecidos(a: number, b: number): boolean {
  const x = Math.abs(a);
  const y = Math.abs(b);
  const m = Math.max(x, y, 1e-9);
  return Math.abs(x - y) / m <= TOLERANCIA_VALOR + 1e-12;
}

function normalizarFavorecidoChave(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarCategoriaChave(s: string): string {
  return s.normalize("NFC").trim().toLowerCase();
}

function anoMesDaData(iso: string): string {
  const d = iso.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(0, 7);
  return "";
}

type LancInterno = {
  date: string;
  amount: number;
  category: string;
  favorecido: string;
  nf: string;
  nc: string;
};

/**
 * Particiona índices em clusters: cada valor fica num cluster com mediano ao qual todos são “parecidos”
 * (fechamento transitivo simples em torno do mediano atual).
 */
function clusterIndicesPorValorParecido(amounts: readonly number[]): number[][] {
  const n = amounts.length;
  if (n === 0) return [];
  const used = new Array<boolean>(n).fill(false);
  const clusters: number[][] = [];

  const sortedIdx = amounts.map((_, i) => i).sort((i, j) => amounts[i]! - amounts[j]!);

  for (const seed of sortedIdx) {
    if (used[seed]) continue;
    const cluster: number[] = [seed];
    used[seed] = true;

    let changed = true;
    while (changed) {
      changed = false;
      const vals = cluster.map((i) => amounts[i]!).sort((a, b) => a - b);
      const median = vals[Math.floor(vals.length / 2)]!;

      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        if (valoresFinanceirosParecidos(amounts[i]!, median)) {
          cluster.push(i);
          used[i] = true;
          changed = true;
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function diasEntre(a: string, b: string): number {
  const ta = Date.parse(a.slice(0, 10));
  const tb = Date.parse(b.slice(0, 10));
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(tb - ta) / 86_400_000;
}

function inferirFrequenciaELancamentos(lancs: LancInterno[]): {
  frequencia: FrequenciaRecorrenciaDetectada;
  meses: string[];
} {
  const datas = lancs
    .map((l) => l.date.slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  const mesesSet = new Set<string>();
  for (const l of lancs) {
    const ym = anoMesDaData(l.date);
    if (ym) mesesSet.add(ym);
  }
  const meses = [...mesesSet].sort();

  if (datas.length < 2) {
    return { frequencia: meses.length >= 2 ? "mensal" : "eventual", meses };
  }

  const gaps: number[] = [];
  for (let i = 1; i < datas.length; i++) {
    gaps.push(diasEntre(datas[i - 1]!, datas[i]!));
  }
  const medianaGap = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;

  const semanalProvavel = medianaGap > 0 && medianaGap <= 12;
  const mensalProvavel = meses.length >= 2 && medianaGap >= 20;

  if (semanalProvavel && !mensalProvavel) {
    return { frequencia: "semanal", meses };
  }
  if (mensalProvavel || meses.length >= 2) {
    return { frequencia: "mensal", meses };
  }
  return { frequencia: "eventual", meses };
}

function confiancaParaRecorrencia(
  mesesCount: number,
  ocorrencias: number,
  frequencia: FrequenciaRecorrenciaDetectada
): "alta" | "media" | "baixa" {
  if (mesesCount >= 3) return "alta";
  if (mesesCount >= 2) return "media";
  if (frequencia === "semanal" && ocorrencias >= 6) return "alta";
  if (frequencia === "semanal" && ocorrencias >= 4) return "media";
  return "baixa";
}

export type LancamentoParaRecorrencia = {
  date: string;
  amount: number;
  category: string;
  favorecido: string;
  tipo?: "receita" | "despesa";
};

function chaveGrupo(nf: string, nc: string, clusterIx: number): string {
  return `${nf}__${nc}__${clusterIx}`;
}

/**
 * Regras resumidas:
 * - Agrupa por favorecido + categoria; dentro do grupo separa clusters de valores com diferença ≤ 15%.
 * - Mantém apenas recorrências potenciais: ≥2 meses distintos OU padrão semanal com ≥4 ocorrências.
 * - Meses distintos ≥3 ⇒ `confianca` alta (resto conforme média/semanal).
 */
export function detectarRecorrencias(
  lancamentos: readonly LancamentoParaRecorrencia[],
  opcoes?: { incluirReceitas?: boolean }
): RecorrenciaDetectada[] {
  const incluirReceitas = opcoes?.incluirReceitas === true;

  const filtrados: LancInterno[] = [];
  for (const x of lancamentos) {
    if (!incluirReceitas && x.tipo === "receita") continue;
    const fav = normalizarFavorecidoChave(x.favorecido);
    if (fav.length < 2) continue;
    const cat = x.category.normalize("NFC").trim();
    if (!cat) continue;

    filtrados.push({
      date: x.date,
      amount: Math.abs(Number(x.amount)) || 0,
      category: cat,
      favorecido: x.favorecido.normalize("NFC").trim(),
      nf: fav,
      nc: normalizarCategoriaChave(cat),
    });
  }

  const porGrupo = new Map<string, number[]>();
  for (let i = 0; i < filtrados.length; i++) {
    const L = filtrados[i]!;
    const base = `${L.nf}|||${L.nc}`;
    const arr = porGrupo.get(base);
    if (arr) arr.push(i);
    else porGrupo.set(base, [i]);
  }

  const resultados: RecorrenciaDetectada[] = [];

  for (const [, idxs] of porGrupo) {
    if (idxs.length < 2) continue;

    const amounts = idxs.map((i) => filtrados[i]!.amount);
    const clusters = clusterIndicesPorValorParecido(amounts);

    clusters.forEach((cIdx, clusterIx) => {
      if (cIdx.length < 2) return;

      const lancs = cIdx.map((j) => filtrados[idxs[j]!]!);
      const primeiro = lancs[0]!;
      const soma = lancs.reduce((s, l) => s + l.amount, 0);
      const valorMedio = soma / lancs.length;

      const { frequencia, meses } = inferirFrequenciaELancamentos(lancs);

      const mesesDistintos = meses.length;
      const ocorrencias = lancs.length;

      const pareceRecorrencia =
        mesesDistintos >= 2 ||
        (frequencia === "semanal" && ocorrencias >= 4) ||
        (mesesDistintos === 1 && ocorrencias >= 4 && frequencia === "semanal");

      if (!pareceRecorrencia) return;

      const confianca = confiancaParaRecorrencia(mesesDistintos, ocorrencias, frequencia);

      resultados.push({
        chave: chaveGrupo(primeiro.nf, primeiro.nc, clusterIx),
        favorecido: primeiro.favorecido,
        categoria: primeiro.category,
        valorMedio: Math.round(valorMedio * 100) / 100,
        frequencia,
        mesesDetectados: meses,
        confianca,
      });
    });
  }

  resultados.sort((a, b) => {
    const ca = a.confianca === "alta" ? 0 : a.confianca === "media" ? 1 : 2;
    const cb = b.confianca === "alta" ? 0 : b.confianca === "media" ? 1 : 2;
    if (ca !== cb) return ca - cb;
    return b.mesesDetectados.length - a.mesesDetectados.length;
  });

  return resultados;
}
