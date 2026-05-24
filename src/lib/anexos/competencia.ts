/** Abreviações em nomes de arquivo: dez2025, jan_2024, … */
const PT_MONTH_FILE_ABBR: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

export type OrigemCompetenciaSugestao =
  | "texto_DATA"
  | "arquivo"
  | "arquivo_data_captura"
  | "texto_data_livre"
  | "periodo_padrao";

export interface CompetenciaSugestao {
  month: number;
  year: number;
  origem: OrigemCompetenciaSugestao;
  /** `true` quando veio de DATA no texto ou do nome do ficheiro (confiança habitual). */
  confiavel: boolean;
}

function mesAnterior(ref: Date): { month: number; year: number } {
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

/** `YYYY-MM-DD` / `YYYY.MM.DD` no nome de capturas Windows — usa o mês civil dessa data (baixa confiança). */
export function inferCompetenciaDataCapturaNoNome(fileName: string): { month: number; year: number } | null {
  const m = fileName.match(/(\d{4})[-.\s](\d{1,2})[-.\s](\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo >= 1 && mo <= 12 && y >= 1990 && y <= 2100) return { month: mo, year: y };
  return null;
}

/** Primeira `MM/AAAA` plausível no início do texto — ignora `00/00` e meses inválidos. */
function primeiraDataPlausivelNoTexto(raw: string): { month: number; year: number } | null {
  const t = raw.slice(0, 8000);
  const re = /\b(0?[1-9]|1[0-2])\s*[/\-.]\s*(20[12]\d|203[0-9]|19\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const mo = Number(m[1]);
    const yr = Number(m[2]);
    if (mo < 1 || mo > 12 || yr < 1990 || yr > 2100) continue;
    if (m[0].includes("00/00") || /^0+\s*\/\s*0+/.test(m[0])) continue;
    return { month: mo, year: yr };
  }
  return null;
}

/**
 * Ordem: `DATA` explícita no texto → competência no **nome** do ficheiro → heurística de `MM/AAAA`
 * no cabeçalho (pontos por CONTRACHEQUE/SEAD/DATA; penaliza `00/00` e «próx. data») → primeira data no texto
 * → data `YYYY-MM-DD` no nome de **captura** → mês anterior genérico.
 */
export function resolverCompetenciaParaUpload(rawText: string, fileName: string): CompetenciaSugestao {
  const texto = inferCompetenciaDoTexto(rawText);
  if (texto) return { ...texto, origem: "texto_DATA", confiavel: true };

  const nome = inferCompetenciaDoNomeArquivo(fileName);
  if (nome) return { ...nome, origem: "arquivo", confiavel: true };

  const ctx = melhorCompetenciaMMYYYYPontuada(rawText);
  if (ctx) {
    if (ctx.score >= 8) return { month: ctx.month, year: ctx.year, origem: "texto_DATA", confiavel: true };
    return { month: ctx.month, year: ctx.year, origem: "texto_data_livre", confiavel: false };
  }

  const livre = primeiraDataPlausivelNoTexto(rawText);
  if (livre) return { ...livre, origem: "texto_data_livre", confiavel: false };
  const cap = inferCompetenciaDataCapturaNoNome(fileName);
  if (cap) return { ...cap, origem: "arquivo_data_captura", confiavel: false };
  const pad = mesAnterior(new Date());
  return { ...pad, origem: "periodo_padrao", confiavel: false };
}

export function descricaoOrigemCompetencia(origem: OrigemCompetenciaSugestao): string {
  switch (origem) {
    case "texto_DATA":
      return "campo DATA no documento";
    case "arquivo":
      return "nome do ficheiro";
    case "arquivo_data_captura":
      return "data no nome do ficheiro (captura de ecrã — pode não ser a competência da folha)";
    case "texto_data_livre":
      return "data encontrada no texto (pré-visualização — confira)";
    case "periodo_padrao":
      return "sugestão genérica (mês anterior ao de hoje) — defina ou confirme";
    default:
      return origem;
  }
}

function melhorCompetenciaMMYYYYPontuada(
  raw: string
): { month: number; year: number; score: number } | null {
  const slice = raw.slice(0, 24_000);
  const re = /\b(0?[1-9]|1[0-2])\s*[/\-.]\s*((?:19|20)\d{2})\b/g;
  let best: { month: number; year: number; score: number; index: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null && m.index !== undefined) {
    const mo = Number(m[1]);
    const yr = Number(m[2]);
    if (mo < 1 || mo > 12 || yr < 1990 || yr > 2100) continue;
    const hit = m[0];
    if (hit.includes("00/00") || /^0+\s*[/\-.]\s*0+\b/.test(hit)) continue;
    const i = m.index;
    const win = slice.slice(Math.max(0, i - 160), Math.min(slice.length, i + hit.length + 80));
    const U = win.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let score = 0;
    if (/\bDATA\b|D\s*A\s*T\s*A/.test(U)) score += 14;
    if (/CONTRACHEQUE|FICHA|\bSEAD\b|MATRIC/.test(U)) score += 5;
    if (/PROX|QUANT|00\/00|IR\s*:|SF\s*:/.test(U)) score -= 10;
    if (/BANCO|AGENC|CONTA|SALAR/.test(U)) score += 2;
    const cur = { month: mo, year: yr, score, index: i };
    if (!best || cur.score > best.score || (cur.score === best.score && i < best.index)) best = cur;
  }
  if (!best || best.score < 5) return null;
  return { month: best.month, year: best.year, score: best.score };
}

/**
 * Extrai competência do texto SEAD/OCR.
 *
 * Suporta: `DATA` na linha da data; **DATA** noutra linha; OCR com espaços em **D A T A**;
 * e escolha pontuada de `MM/AAAA` no cabeçalho quando o rótulo falha.
 */
export function inferCompetenciaDoTexto(rawText: string): { month: number; year: number } | null {
  const t = rawText.slice(0, 25_000);

  const padroesMesmaLinha: RegExp[] = [
    /\bDATA\s*[:.]?\s*(0?[1-9]|1[0-2])\s*[/\-.]\s*(\d{4})\b/gi,
    /\bD\s*A\s*T\s*A\s*[:.]?\s*(0?[1-9]|1[0-2])\s*[/\-.]\s*(\d{4})\b/gi,
  ];
  for (const dataRe of padroesMesmaLinha) {
    let m: RegExpExecArray | null;
    while ((m = dataRe.exec(t)) !== null) {
      const mo = Number(m[1]);
      const yr = Number(m[2]);
      if (mo >= 1 && mo <= 12 && yr >= 1990 && yr <= 2100) return { month: mo, year: yr };
    }
  }

  const cabecalho = t.slice(0, 16_000);
  const labelRe = /\bD\s*A\s*T\s*A\b|\bDATA\b/gi;
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(cabecalho)) !== null && m.index !== undefined) {
    const janela = cabecalho.slice(m.index, m.index + 620);
    const dm = janela.match(/\b(0?[1-9]|1[0-2])\s*[/\-.]\s*(\d{4})\b/);
    if (dm) {
      const mo = Number(dm[1]);
      const yr = Number(dm[2]);
      if (mo >= 1 && mo <= 12 && yr >= 1990 && yr <= 2100 && !dm[0].includes("00/00")) {
        return { month: mo, year: yr };
      }
    }
  }

  return null;
}

/** Ex.: `dez2025.pdf`, `holerite_12_2025.png`, `contrachequedez2025` (mês colado ao nome). */
export function inferCompetenciaDoNomeArquivo(fileName: string): { month: number; year: number } | null {
  const n = fileName.toLowerCase().replace(/\s+/g, "");

  /** `12_2025folha.png` — mês_ano no início ou antes de texto colado (sem separador antes do 12). */
  const patterns = [
    /^([01]?\d)[_\-.](\d{4})(?![0-9])/,
    /[_\-.]([01]?\d)[_\-.](\d{4})(?:[^\d]|$)/,
    /([01]?\d)[_\-.](\d{4})\.[^.]+$/,
  ];
  for (const re of patterns) {
    const x = n.match(re);
    if (!x) continue;
    const mo = Number(x[1]);
    const yr = Number(x[2]);
    if (mo >= 1 && mo <= 12 && yr >= 1990 && yr <= 2100) return { month: mo, year: yr };
  }

  const pt = n.match(
    /(?:^|[^a-z])(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[_\-.]?(19\d{2}|20\d{2})(?:[^0-9]|$)/i
  );
  if (pt) {
    const mo = PT_MONTH_FILE_ABBR[pt[1].toLowerCase()];
    const yr = Number(pt[2]);
    if (mo && yr >= 1990 && yr <= 2100) return { month: mo, year: yr };
  }

  const glued = n.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(19\d{2}|20\d{2})/i);
  if (glued) {
    const mo = PT_MONTH_FILE_ABBR[glued[1].toLowerCase()];
    const yr = Number(glued[2]);
    if (mo && yr >= 1990 && yr <= 2100) return { month: mo, year: yr };
  }

  return null;
}
