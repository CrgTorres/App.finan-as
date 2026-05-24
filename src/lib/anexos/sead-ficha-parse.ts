import { anexarCartaoSaqueAoPayloadParsed } from "@/lib/contracheque/campos-cartao-saque-ao-gravar-payslip";
import { inferCompetenciaDoTexto } from "./competencia";
import { inferirParcelasPorVizinhancaMeses } from "./parcela-vizinhanca";
import {
  mergeParsedPayslipPayloads,
  parseSeadPayslipText,
  type ParsedPayslipPayload,
} from "./sead-payslip-parse";

/** Nomes e abrevs. PT (cabecalho PERIODO e linhas `- JANEIRO/2012`). */
const NOME_MES_PT: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

function normalizarTokenMes(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .toLowerCase();
}

function mesNumeroDeNome(token: string): number | null {
  const k = normalizarTokenMes(token);
  return NOME_MES_PT[k] ?? null;
}

type HitComp = { index: number; month: number; year: number };

/** `DATA MM/AAAA` estilo contracheque. */
function hitsDataTradicionais(texto: string): HitComp[] {
  const re = /\bDATA\s*[:.]?\s*([01]?\d)\s*[/\-.]\s*(\d{4})\b/gi;
  const out: HitComp[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const mo = Number(m[1]);
    const yr = Number(m[2]);
    if (mo >= 1 && mo <= 12 && yr >= 1990 && yr <= 2100 && m.index !== undefined)
      out.push({ index: m.index, month: mo, year: yr });
  }
  return out;
}

/**
 * Linhas típicas da ficha PM/SEAD: `- JANEIRO/2012`, `MARCO/2012(CONTINUACAO)`.
 * Não apanha `PERIODO JAN/2011 A DEZ/2025` (a linha não termina no primeiro MES/AAAA).
 */
function hitsMesPortuguesNomeAno(texto: string): HitComp[] {
  const re =
    /^\s*[-–—]?\s*([A-Za-zÀ-Üà-ú]+)\s*\/\s*(\d{4})(?:\s*\([^)]*\))?\s*$/gim;
  const out: HitComp[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const mo = mesNumeroDeNome(m[1]);
    const yr = Number(m[2]);
    if (!mo || yr < 1990 || yr > 2100 || m.index === undefined) continue;
    out.push({ index: m.index, month: mo, year: yr });
  }
  return out;
}

/** União ordenada por posição no texto (sem duplicar o mesmo índice). */
function reunirMarcadoresCompetenciaFicha(texto: string): HitComp[] {
  const porIndice = new Map<number, HitComp>();
  for (const h of [...hitsDataTradicionais(texto), ...hitsMesPortuguesNomeAno(texto)]) {
    if (!porIndice.has(h.index)) porIndice.set(h.index, h);
  }
  return [...porIndice.values()].sort((a, b) => a.index - b.index);
}

function primeiraCompetenciaNomeMesOuData(texto: string): { month: number; year: number } | null {
  const hits = reunirMarcadoresCompetenciaFicha(texto);
  if (hits.length > 0) return { month: hits[0].month, year: hits[0].year };
  return inferCompetenciaDoTexto(texto);
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Conta marcadores «- MES/ANO(CONTINUA…)» típicos da ficha PM quando o 4.º bloco de um mês
 * continua na página seguinte (vários contracheques por página).
 */
export function contarMarcadoresContinuacaoFichaPm(raw: string): number {
  const re =
    /\n-\s*[A-Za-zÀ-ÿ\u00C0-\u024F]+\s*\/\s*\d{4}\s*\(\s*CONTINUA[^)]*\)/gi;
  return (raw.match(re) ?? []).length;
}

/**
 * Remove o cabeçalho repetido após `(CONTINUA…)`, juntando as rubricas ao mesmo mês que o marcador
 * anterior `- MES/ANO` (evita duplicar competência e melhora o parse de LIQUIDO / totais).
 */
export function colapsarContinuacaoFichaPmTexto(s: string): { text: string; removidos: number } {
  const re =
    /\n-\s*[A-Za-zÀ-ÿ\u00C0-\u024F]+\s*\/\s*\d{4}\s*\(\s*CONTINUA[^)]*\)\s*\n(?:(?:\d+\s+)?FOLHA\s+(?:ESPECIAL|MENSAL)\s*\n)*(?:COD\.?\s+DESCRICAO[^\n]*\n)/gi;
  let removidos = 0;
  const text = s.replace(re, () => {
    removidos++;
    return "\n";
  });
  return { text, removidos };
}

/**
 * Normaliza quebras de página PDF/OCR e remove linhas cosméticas antes de segmentar por `DATA`.
 * Ajuda quando o mês “continua na outra folha” sem novo bloco lógico perdido.
 */
export function prepararTextoFichaParaSegmentacao(raw: string): string {
  let s = raw.replace(/\f/g, "\n").replace(/\r\n/g, "\n");
  s = s.replace(/^\s*(?:continua[cç][aã]o?\s*\.?|continua\s*[\.…]*|p[áa]g\.?\s*\d+\s*(?:de|\/)\s*\d+)\s*$/gim, "");
  s = s.replace(/^\s*(?:[Ff]rente|[Vv]erso|[Vv]erto?)\s*$/gm, "");
  s = s.replace(/\n{5,}/g, "\n\n\n");
  const { text } = colapsarContinuacaoFichaPmTexto(s);
  s = text;
  return s.trim();
}

/**
 * Cabeçalho SEAD quando o PDF coloca espaços entre letras: `F I C H A   F I N A N C E I R A`.
 * Colapsamos espaços só para esta deteção.
 */
function textoIndicaTituloFichaFinanceiraCorrida(slice: string): boolean {
  const collapsed = slice.replace(/\s+/g, "").toLowerCase();
  return collapsed.includes("fichafinanceira");
}

/**
 * Intervalo típico no topo: `PERIODO JAN/2011 A DEZ/2025` (colapsado ou com espaços).
 */
function textoIndicaPeriodoCorridoCabecalho(slice: string): boolean {
  const c = slice
    .replace(/\s+/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  /** Ex.: `PERIODOJAN/2011ADEZ/2025` após PDF colar letras/espaços. */
  return /PERIODO[A-Z]{3,12}\/\d{4}A[A-Z]{3,12}\/\d{4}/.test(c);
}

/** Número de competências encontradas (`DATA MM/AAAA` ou `MES/AAAA` em linhas de ficha PM). */
export function contagemMarcadoresCompetenciaNaFicha(text: string): number {
  const t = prepararTextoFichaParaSegmentacao(text);
  return reunirMarcadoresCompetenciaFicha(t).length;
}

/**
 * **Ficha corrida / multi-competência** — deve usar `parseFichaFinanceiraMeses` + revisão linha a linha,
 * nunca um único `parseSeadPayslipText` sobre o texto inteiro.
 */
export function deveUsarFluxoFichaFinanceira(text: string): boolean {
  const t = prepararTextoFichaParaSegmentacao(text);
  const amostra = t.slice(0, 280_000);
  if (textoIndicaTituloFichaFinanceiraCorrida(amostra)) return true;
  if (textoIndicaPeriodoCorridoCabecalho(amostra)) return true;

  /** Texto inteiro — ficha corrida 2012–2025 excede 50 kb na camada texto. */
  const nMarcadores = reunirMarcadoresCompetenciaFicha(t).length;

  const setData = new Set<string>();
  const reD = /\bDATA\s*[:.]?\s*([01]?\d)\s*[/\-.]\s*(\d{4})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reD.exec(amostra)) !== null) {
    const mo = Number(m[1]);
    const yr = Number(m[2]);
    if (mo >= 1 && mo <= 12 && yr >= 1990 && yr <= 2100) setData.add(`${mo}-${yr}`);
  }
  if (setData.size >= 2) return true;

  const setNome = new Set<string>();
  const reNome =
    /^\s*[-–—]?\s*([A-Za-zÀ-Üà-ú]+)\s*\/\s*(\d{4})(?:\s*\([^)]*\))?\s*$/gim;
  while ((m = reNome.exec(amostra)) !== null) {
    const mo = mesNumeroDeNome(m[1]);
    const yr = Number(m[2]);
    if (mo && yr >= 1990 && yr <= 2100) setNome.add(`${mo}-${yr}`);
  }
  /** Duas ou mais linhas `- MES/AAAA` distintas na amostra, ou dois ou mais marcadores globais */
  if (setNome.size >= 2 || nMarcadores >= 2) return true;

  /** Título corrido mesmo no fim do arquivo (primeira fatia poderia omitir cabeçalhos). */
  if (t.length > 280_000 && textoIndicaTituloFichaFinanceiraCorrida(t)) return true;

  return false;
}

/**
 * Na ficha PM/SEAD, o 13º integral costuma aparecer em «FOLHA ESPECIAL» logo após a mensal de **novembro**,
 * embora o pagamento/quitação seja em **dezembro**. Separa mensal (compet. 11) e especial → compet. 12.
 * Junho (adiantamento) e outros meses não são alterados.
 */
function textoIndicaFolhaEspecialDecimoTerceiro(s: string): boolean {
  const u = s
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/FERIAS|F[ÉE]RIAS/.test(u) && !/(13|DECIMO|DEC\.\s*13|13O)/.test(u)) return false;
  if (
    /\b13\s*[Oº]|13O\.|130\.?\s*SAL|13\.?\s*SAL\s*INTEGRAL|\b13\s*SAL|DECIMO\s*TERCEIRO|D[ÉE]CIMO|\b13O\b/.test(
      u,
    )
  )
    return true;
  if (/IMP\.?\s*DE\s*RENDA\s*13|I\.?R\.?\s*13|IRRF?\s*13|FPPM\s*13|PREV.*13|AMAZONPREV.*13/.test(u))
    return true;
  if (/DESC\.?\s*13|13\.?\s*SAL\.?\s*ADIANT|ADIANT.*13|5327|5390|5602/.test(u)) return true;
  return false;
}

function expandirChunkFichaNovembro13ParaDezembro(
  chunk: string,
  headerMonth: number,
  headerYear: number,
): { month: number; year: number; chunk: string }[] {
  if (headerMonth !== 11) {
    return [{ month: headerMonth, year: headerYear, chunk }];
  }
  const reEspec = /(?:^|\r?\n)\s*(?:\d+\s+)?FOLHA\s+ESPECIAL\b[^\n\r]*/i;
  const m = reEspec.exec(chunk);
  if (!m || m.index === undefined) {
    return [{ month: headerMonth, year: headerYear, chunk }];
  }
  const idx = m.index;
  const antes = chunk.slice(0, idx).trimEnd();
  const desdeEspecial = chunk.slice(idx).trimStart();
  if (!/\bFOLHA\s+MENSAL\b/i.test(antes)) {
    return [{ month: headerMonth, year: headerYear, chunk }];
  }
  if (!textoIndicaFolhaEspecialDecimoTerceiro(desdeEspecial)) {
    return [{ month: headerMonth, year: headerYear, chunk }];
  }
  const mesDezembro = MESES[11];
  const especialChunk = `-\n${mesDezembro}/${headerYear}\n${desdeEspecial}`;
  return [
    { month: 11, year: headerYear, chunk: antes },
    { month: 12, year: headerYear, chunk: especialChunk },
  ];
}

/** Junta faixas adjacentes com o mesmo mês/ano (vários pedaços por `DATA` ou 13º → dez.). */
function juntarSegmentosMesmoMesAdjacentes(
  partes: { month: number; year: number; chunk: string }[],
): { month: number; year: number; chunks: string[] }[] {
  const out: { month: number; year: number; chunks: string[] }[] = [];
  for (const p of partes) {
    const prev = out[out.length - 1];
    if (prev && prev.month === p.month && prev.year === p.year) {
      prev.chunks.push(p.chunk);
    } else {
      out.push({ month: p.month, year: p.year, chunks: [p.chunk] });
    }
  }
  return out;
}

/** Dois blocos: um «folha especial» e um «folha mensal» → fundir parses (soma de LIQUIDO/totais). */
function chunksSaoParEspecialMensal(chunks: string[]): boolean {
  if (chunks.length !== 2) return false;
  const [a, b] = chunks;
  const aE = /FOLHA\s+ESPECIAL/i.test(a);
  const bE = /FOLHA\s+ESPECIAL/i.test(b);
  const aM = /FOLHA\s+MENSAL/i.test(a);
  const bM = /FOLHA\s+MENSAL/i.test(b);
  return (aE && bM) || (bE && aM);
}

function parseChunksFichaFusionados(chunks: string[]): ParsedPayslipPayload {
  if (chunks.length === 1) return parseSeadPayslipText(chunks[0]!);
  if (chunksSaoParEspecialMensal(chunks)) {
    return mergeParsedPayslipPayloads(chunks.map((c) => parseSeadPayslipText(c)));
  }
  return parseSeadPayslipText(chunks.join("\n\n"));
}

/** Alias de `deveUsarFluxoFichaFinanceira` (rotas / imports antigos). */
export function isFichaFinanceiraTexto(text: string): boolean {
  return deveUsarFluxoFichaFinanceira(text);
}

export type FichaMesExtraido = {
  month: number;
  year: number;
  label: string;
} & ParsedPayslipPayload;

function ordenarEInferirParcelasFicha(rows: FichaMesExtraido[]): FichaMesExtraido[] {
  const sorted = [...rows].sort((a, b) => a.year - b.year || a.month - b.month);
  let out = sorted;
  if (sorted.length >= 2) {
    const meses = sorted.map((r) => ({ month: r.month, year: r.year, items: r.items }));
    const inferidos = inferirParcelasPorVizinhancaMeses(meses);
    out = sorted.map((row, i) => ({ ...row, items: inferidos[i]!.items }));
  }
  return aplicarCartaoSaqueEmFichaMeses(out);
}

/** Detecção cartão/saque por competência (rubricas de desconto), com recorrência entre meses da ficha. */
function aplicarCartaoSaqueEmFichaMeses(rows: FichaMesExtraido[]): FichaMesExtraido[] {
  const historicoMin = rows.map((r) => ({ mes: r.month, ano: r.year, items: r.items }));
  return rows.map((row) => {
    const historico = historicoMin.filter((h) => !(h.mes === row.month && h.ano === row.year));
    const parsed = anexarCartaoSaqueAoPayloadParsed(
      {
        grossSalary: row.grossSalary,
        netSalary: row.netSalary,
        totalDiscounts: row.totalDiscounts,
        items: row.items,
        rawText: row.rawText,
        instituicoesDetectadas: row.instituicoesDetectadas,
        leituraPossivelmenteIncompleta: row.leituraPossivelmenteIncompleta,
      },
      row.month,
      row.year,
      historico,
    );
    return { ...row, ...parsed };
  });
}

/**
 * Particiona texto da ficha por ocorrências de `DATA MM/AAAA` e parseia cada faixa como um contracheque lógico.
 */
export function parseFichaFinanceiraMeses(fullText: string): FichaMesExtraido[] {
  const t = prepararTextoFichaParaSegmentacao(fullText);
  const hits = reunirMarcadoresCompetenciaFicha(t);

  if (hits.length === 0) {
    const c = primeiraCompetenciaNomeMesOuData(t);
    if (!c) return [];
    const expandido = expandirChunkFichaNovembro13ParaDezembro(t, c.month, c.year);
    if (expandido.length === 1) {
      const p = parseSeadPayslipText(expandido[0]!.chunk);
      if (p.items.length === 0 && p.netSalary <= 0 && p.grossSalary <= 0) return [];
      return [
        {
          month: expandido[0]!.month,
          year: expandido[0]!.year,
          label: `${MESES[expandido[0]!.month - 1]}/${expandido[0]!.year}`,
          ...p,
        },
      ];
    }
    const fusionados = juntarSegmentosMesmoMesAdjacentes(expandido);
    const out0: FichaMesExtraido[] = [];
    for (const { month, year, chunks } of fusionados) {
      const p = parseChunksFichaFusionados(chunks);
      if (p.items.length === 0 && p.netSalary <= 0 && p.grossSalary <= 0) continue;
      out0.push({ month, year, label: `${MESES[month - 1]}/${year}`, ...p });
    }
    return ordenarEInferirParcelasFicha(out0);
  }

  hits.sort((a, b) => a.index - b.index);
  const cortes: { month: number; year: number; chunk: string }[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index;
    const end = i + 1 < hits.length ? hits[i + 1].index : t.length;
    const chunk = t.slice(start, end);
    cortes.push(
      ...expandirChunkFichaNovembro13ParaDezembro(chunk, hits[i].month, hits[i].year),
    );
  }

  const fusionados = juntarSegmentosMesmoMesAdjacentes(cortes);
  const out: FichaMesExtraido[] = [];
  for (const { month, year, chunks } of fusionados) {
    const p = parseChunksFichaFusionados(chunks);
    if (p.items.length === 0 && p.netSalary <= 0 && p.grossSalary <= 0) continue;
    out.push({
      month,
      year,
      label: `${MESES[month - 1]}/${year}`,
      ...p,
    });
  }
  return ordenarEInferirParcelasFicha(out);
}
