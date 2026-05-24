import type { Payslip, PayslipItem } from "@/types/contracheque";
import { rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";
import { padronizarTokensRubricaOficiais } from "@/lib/anexos/rubrica-nomes-oficiais";

/** Entrada genérica (ex.: exportada de planilha ou derivada de `Payslip`). */
export type Desconto = {
  codigo: string;
  descricao: string;
  valor: number;
  /** Ex.: "01/48", "56/60", "01/01". */
  parcela?: string;
  mes: number;
  ano: number;
};

/** Resultado da análise por agrupamento (código + descrição + valor + tipo de parcela). */
export type AnaliseDesconto = {
  codigo: string;
  descricao: string;
  valorParcela: number;
  parcelaInicialDetectada?: number;
  parcelaFinalDetectada?: number;
  totalParcelas?: number;
  primeiraAparicao: string;
  ultimaAparicao: string;
  quantidadeAparicoes: number;
  totalPago: number;
  status: "finalizado" | "ativo/em andamento";
  tipo: "parcelado" | "recorrente_01_01" | "recorrente_sem_parcela";
  mesesDetectados: string[];
  observacao: string;
};

export type TipoAnaliseDescontoContracheque =
  | "parcelado"
  | "recorrente_01_01"
  | "recorrente_sem_parcela";

export type StatusAnaliseDescontoContracheque =
  | "finalizado"
  | "ativo/em andamento";

/** Saída enriquecida para o app (parcelas em texto + estimativa de contrato + duplicidades). */
export type AnaliseDescontoContracheque = {
  codigo: string;
  descricao: string;
  valorParcela: number;
  parcelaInicialDetectada: string | null;
  parcelaFinalDetectada: string | null;
  totalParcelas: number | null;
  primeiraAparicao: string;
  ultimaAparicao: string;
  quantidadeAparicoes: number;
  totalPago: number;
  status: StatusAnaliseDescontoContracheque;
  tipo: TipoAnaliseDescontoContracheque;
  mesesDetectados: string[];
  observacao: string;
  inicioEstimadoContrato: string | null;
  fimEstimadoContrato: string | null;
};

function normalizarCodigoItem(code?: string): string {
  return (code ?? "").replace(/\D/g, "").slice(0, 6);
}

function competenciaKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function competenciaOrd(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function competenciaFromOrd(ord: number): string {
  const year = Math.floor(ord / 12);
  const month = (ord % 12) + 1;
  return competenciaKey(year, month);
}

export function parseParcela(parcela?: string): { atual: number; total: number } | null {
  if (!parcela) return null;
  const match = parcela.match(/(\d{1,3})\/(\d{1,3})/);
  if (!match) return null;
  return {
    atual: Number(match[1]),
    total: Number(match[2]),
  };
}

export function mesKey(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function arredondarCentavos(v: number): number {
  return Math.round(v * 100) / 100;
}

function formatarParcelaLabel(atual?: number, total?: number): string | null {
  if (atual == null || total == null || atual < 1 || total < 1) return null;
  return `${String(atual).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
}

function normalizarDescricaoSlug(description: string): string {
  return padronizarTokensRubricaOficiais(rubricaSemParcelaParaChave(description))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/([a-z])\1{2,}/g, "$1$1")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .slice(0, 72);
}

function descricoesParecidas(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a))) return true;
  const grams = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return false;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / Math.min(ga.size, gb.size) >= 0.72;
}

function mesesSobrepostos(A: readonly string[], B: readonly string[]): boolean {
  const mb = new Set(B);
  return A.some((x) => mb.has(x));
}

function ocorrenciasPorMesParcela(descontos: Desconto[]): { ord: number; atual: number; total: number }[] {
  const out: { ord: number; atual: number; total: number }[] = [];
  for (const d of descontos) {
    const p = parseParcela(d.parcela);
    if (!p || p.total <= 1) continue;
    out.push({ ord: competenciaOrd(d.ano, d.mes), atual: p.atual, total: p.total });
  }
  return out.sort((a, b) => a.ord - b.ord);
}

function sequenciaCompativelGrupos(a: Desconto[], b: Desconto[]): boolean {
  const ta = ocorrenciasPorMesParcela(a);
  const tb = ocorrenciasPorMesParcela(b);
  if (ta.length < 2 && tb.length < 2) return false;
  const todos = [...ta, ...tb].sort((x, y) => x.ord - y.ord);
  if (todos.length < 2) return false;
  const total = todos[0]!.total;
  if (!todos.every((x) => x.total === total)) return false;
  for (let i = 1; i < todos.length; i++) {
    const prev = todos[i - 1]!;
    const cur = todos[i]!;
    const deltaMes = cur.ord - prev.ord;
    const deltaParcela = cur.atual - prev.atual;
    if (deltaMes > 0 && deltaMes === deltaParcela) return true;
  }
  return false;
}

function detectarDuplicidadeEntreGrupos(
  entradas: Desconto[][],
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (let i = 0; i < entradas.length; i++) {
    for (let j = i + 1; j < entradas.length; j++) {
      const ai = entradas[i]!;
      const aj = entradas[j]!;
      const oi = ai[0]!;
      const oj = aj[0]!;
      if (oi.codigo.trim() !== oj.codigo.trim()) continue;
      if (arredondarCentavos(oi.valor) !== arredondarCentavos(oj.valor)) continue;
      if (
        !descricoesParecidas(
          normalizarDescricaoSlug(oi.descricao),
          normalizarDescricaoSlug(oj.descricao),
        )
      ) {
        continue;
      }
      const mesesI = ai.map((d) => mesKey(d.ano, d.mes));
      const mesesJ = aj.map((d) => mesKey(d.ano, d.mes));
      const sobrepoe = mesesSobrepostos(mesesI, mesesJ);
      const seq = sequenciaCompativelGrupos(ai, aj);
      if (!sobrepoe && !seq) continue;
      const motivo = sobrepoe
        ? "possível duplicidade: mesmo código/descrição parecida/valor com meses sobrepostos"
        : "possível duplicidade: mesmo código/descrição parecida/valor com sequência de parcelas compatível";
      out.set(i, [...(out.get(i) ?? []), motivo]);
      out.set(j, [...(out.get(j) ?? []), motivo]);
    }
  }
  return out;
}

function estimarInicioFimContrato(a: AnaliseDesconto): {
  inicio: string | null;
  fim: string | null;
} {
  if (
    a.tipo !== "parcelado" ||
    a.totalParcelas == null ||
    a.totalParcelas <= 1 ||
    a.parcelaInicialDetectada == null ||
    a.parcelaFinalDetectada == null
  ) {
    return { inicio: null, fim: null };
  }
  const [py, pm] = a.primeiraAparicao.split("-").map(Number);
  const [uy, um] = a.ultimaAparicao.split("-").map(Number);
  const ordP = competenciaOrd(py, pm);
  const ordU = competenciaOrd(uy, um);
  const inicioOrd = ordP - (a.parcelaInicialDetectada - 1);
  const fimOrd = ordU + (a.totalParcelas - a.parcelaFinalDetectada);
  return { inicio: competenciaFromOrd(inicioOrd), fim: competenciaFromOrd(fimOrd) };
}

function paraContracheque(
  a: AnaliseDesconto,
  extrasObs: string[],
): AnaliseDescontoContracheque {
  const total = a.totalParcelas ?? null;
  let pIni: string | null = null;
  let pFim: string | null = null;
  if (a.tipo === "parcelado" && total != null && a.parcelaInicialDetectada != null && a.parcelaFinalDetectada != null) {
    pIni = formatarParcelaLabel(a.parcelaInicialDetectada, total);
    pFim = formatarParcelaLabel(a.parcelaFinalDetectada, total);
  } else if (a.tipo === "recorrente_01_01") {
    pIni = "01/01";
    pFim = "01/01";
  }
  const { inicio, fim } = estimarInicioFimContrato(a);
  const obs: string[] = [a.observacao, ...extrasObs];
  if (inicio && fim) obs.push(`Contrato estimado de ${inicio} a ${fim}.`);
  const textoObs = [...new Set(obs.filter(Boolean))].join(" ");
  return {
    codigo: a.codigo,
    descricao: a.descricao,
    valorParcela: a.valorParcela,
    parcelaInicialDetectada: pIni,
    parcelaFinalDetectada: pFim,
    totalParcelas: total,
    primeiraAparicao: a.primeiraAparicao,
    ultimaAparicao: a.ultimaAparicao,
    quantidadeAparicoes: a.quantidadeAparicoes,
    totalPago: a.totalPago,
    status: a.status,
    tipo: a.tipo,
    mesesDetectados: a.mesesDetectados,
    observacao: textoObs || "Sem observações.",
    inicioEstimadoContrato: inicio,
    fimEstimadoContrato: fim,
  };
}

function agruparDescontosEmLista(descontos: Desconto[]): Desconto[][] {
  const grupos = new Map<string, Desconto[]>();

  for (const item of descontos) {
    const parcelaInfo = parseParcela(item.parcela);

    let tipoChave: string;

    if (parcelaInfo && parcelaInfo.total > 1) {
      tipoChave = `parcelado-${parcelaInfo.total}`;
    } else if (parcelaInfo && parcelaInfo.total === 1) {
      tipoChave = "recorrente_01_01";
    } else {
      tipoChave = "recorrente_sem_parcela";
    }

    const chave = [
      item.codigo.trim(),
      item.descricao.trim().toUpperCase(),
      item.valor.toFixed(2),
      tipoChave,
    ].join("|");

    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(item);
  }

  return Array.from(grupos.values());
}

function grupoDescontosParaAnalise(
  itens: Desconto[],
  ultimoMesKey: string,
): AnaliseDesconto {
  const ordenados = [...itens].sort((a, b) => {
    if (a.ano !== b.ano) return a.ano - b.ano;
    return a.mes - b.mes;
  });

  const primeiro = ordenados[0]!;
  const ultimo = ordenados[ordenados.length - 1]!;

  const parcelas = ordenados
    .map((i) => parseParcela(i.parcela))
    .filter(Boolean) as { atual: number; total: number }[];

  const totalParcelas = parcelas[0]?.total;
  const parcelaInicialDetectada = parcelas.length
    ? Math.min(...parcelas.map((p) => p.atual))
    : undefined;

  const parcelaFinalDetectada = parcelas.length
    ? Math.max(...parcelas.map((p) => p.atual))
    : undefined;

  let tipo: AnaliseDesconto["tipo"];

  if (totalParcelas && totalParcelas > 1) {
    tipo = "parcelado";
  } else if (totalParcelas === 1) {
    tipo = "recorrente_01_01";
  } else {
    tipo = "recorrente_sem_parcela";
  }

  const mesesDetectados = ordenados.map((i) => mesKey(i.ano, i.mes));
  const ultimaAparicao = mesKey(ultimo.ano, ultimo.mes);

  return {
    codigo: primeiro.codigo,
    descricao: primeiro.descricao,
    valorParcela: primeiro.valor,
    parcelaInicialDetectada,
    parcelaFinalDetectada,
    totalParcelas,
    primeiraAparicao: mesKey(primeiro.ano, primeiro.mes),
    ultimaAparicao,
    quantidadeAparicoes: ordenados.length,
    totalPago: Number((primeiro.valor * ordenados.length).toFixed(2)),
    status:
      ultimaAparicao === ultimoMesKey ? "ativo/em andamento" : "finalizado",
    tipo,
    mesesDetectados,
    observacao:
      tipo === "recorrente_01_01"
        ? "Desconto 01/01 agrupado como recorrente, somando todas as aparições."
        : tipo === "parcelado"
          ? "Contrato parcelado agrupado por código, descrição, valor e total de parcelas."
          : "Desconto sem informação de parcela, agrupado como recorrente.",
  };
}

/**
 * Agrupa descontos por código, descrição, valor e tipo de parcela (incl. total em contratos parcelados),
 * conforme regras de negócio informadas.
 */
export function analisarDescontos(
  descontos: Desconto[],
  ultimoMesBase: { ano: number; mes: number },
): AnaliseDesconto[] {
  const ultimoMesKey = mesKey(ultimoMesBase.ano, ultimoMesBase.mes);
  return agruparDescontosEmLista(descontos).map((itens) =>
    grupoDescontosParaAnalise(itens, ultimoMesKey),
  );
}

function payslipItemParaDesconto(p: Payslip, it: PayslipItem): Desconto | null {
  if (it.type !== "desconto" || !(it.value > 0)) return null;
  const descricao = rubricaSemParcelaParaChave(it.description).replace(/\s+/g, " ").trim();
  const parcelaStr = formatarParcelaLabel(it.parcelaAtual, it.parcelaTotal) ?? undefined;
  return {
    codigo: normalizarCodigoItem(it.code),
    descricao,
    valor: arredondarCentavos(it.value),
    parcela: parcelaStr,
    mes: p.month,
    ano: p.year,
  };
}

function descontosDePayslips(payslips: Payslip[]): Desconto[] {
  const out: Desconto[] = [];
  for (const p of payslips) {
    for (const it of p.items ?? []) {
      const d = payslipItemParaDesconto(p, it);
      if (d) out.push(d);
    }
  }
  return out;
}

/**
 * Camada sobre `Payslip[]`: converte para `Desconto[]`, aplica `analisarDescontos` e enriquece
 * (estimativa de contrato + aviso de duplicidade), sem alterar parsers ou regras de gravação.
 */
export function analisarDescontosContrachequesPorContrato(payslips: Payslip[]): AnaliseDescontoContracheque[] {
  if (payslips.length === 0) return [];

  let maxOrd = -Infinity;
  let maxYear = payslips[0]!.year;
  let maxMonth = payslips[0]!.month;
  for (const p of payslips) {
    const ord = competenciaOrd(p.year, p.month);
    if (ord > maxOrd) {
      maxOrd = ord;
      maxYear = p.year;
      maxMonth = p.month;
    }
  }

  const descontos = descontosDePayslips(payslips);
  const listaGrupos = agruparDescontosEmLista(descontos);
  const dupIdx = detectarDuplicidadeEntreGrupos(listaGrupos);
  const ultimoMesKey = mesKey(maxYear, maxMonth);

  const resultado = listaGrupos.map((grupoItens, idx) => {
    const a = grupoDescontosParaAnalise(grupoItens, ultimoMesKey);
    const extras = [...new Set(dupIdx.get(idx) ?? [])];
    return paraContracheque(a, extras);
  });

  return resultado.sort((x, y) => {
    if (x.status !== y.status) return x.status === "ativo/em andamento" ? -1 : 1;
    if (y.totalPago !== x.totalPago) return y.totalPago - x.totalPago;
    return x.descricao.localeCompare(y.descricao, "pt-BR");
  });
}
