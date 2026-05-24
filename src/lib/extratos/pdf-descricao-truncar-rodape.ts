/**
 * Corta descrições de movimento quando o PDF cola rodapé de fatura (energia, etc.).
 */

import { normalizarTexto } from "@/lib/extratos/extrato-parser-core";

/** Padrões onde começa texto legal / de concessionária — raramente faz parte do histórico do banco. */
const RE_CORTE_RODAPE: readonly RegExp[] = [
  /\bAs informa[cç][oõ]es sobre\b/i,
  /\bcondi[cç][oõ]es gerais de fornecimento\b/i,
  /\bAg[eê]ncia Nacional de Atendimento\b/i,
  /\bAtendimento ao Cliente do Poder\b/i,
  /\bLei n[ºo]?\s*8\.078\b/i,
  /\bC[oó]digo de Defesa do Consumidor\b/i,
  /\bwww\.amazonasenergia\b/i,
  /\bamazonasenergia\.com\b/i,
  /\bACESSO\s+[ÁA]\s+INFORMA[cç][AÃ]O\b/i,
  /\bFale Conosco\s*[—\-]\s*Ouvidoria\b/i,
  /\bPara reclama[cç][oõ]es,\s*d[uú]vidas\b/i,
  // Fatura de energia / concessionária (PDF cola tabelas de leitura no meio do “extrato”)
  /\bDados da Leitura\b/i,
  /\bDatas da Leitura\b/i,
  /\bDias de consumo\b/i,
  /\bDesc\.?\s*da\s+Grandeza\b/i,
  /\bLeit\.?\s*Atual\b/i,
  /\bLeit\.?\s*Anterior\b/i,
  /\bLeitura\s+(?:Anterior|Atual|Pr[oó]xima)\b/i,
  /\bConsumo\s+(?:Faturado|Total|M[eé]dio)\b/i,
  /\bConsumo\s+Total\s+a\s+Pagar\b/i,
  /\bM[eê]dia\s+Reservado\s+ao\s+Fisco\b/i,
  /\bTens[aã]o\s+Contratad/i,
  /\bGRUPO\s+[ABC]\s*[-–]\s*tensa/i,
  /\bSubclasse\b/i,
  /\bPosto\s+Tarif[aá]rio\b/i,
  /\bEnergia\s+Ativa\s+[ÚU]nica\b/i,
  /\bART\.\s*260\b/i,
  /\bREN\/\d+/i,
  /\bmulta\s+de\s+2%\s*,\s*juros\s+de\s+mora\b/i,
  /** Bloco típico “ICMS / PIS / Cofins” colado no texto */
  /\bBase\s+de\s+c[aá]lculo\s+ICMS\b/i,
  /\bICMS\s*\(?\s*R\$\s*[\d.,]+\s*\)?\s*(?:PIS|Cofins)/i,
  /\bN[ºo]?\s*(?:UC|Instala[cç][aã]o|Medidor)\b/i,
  /** Sequência longa de meses (histograma / gráfico da fatura) */
  /\b(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(?:\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)){5,}\b/i,
  /** Endereço “tokenizado” visto em faturas digitais */
  /\b[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\b/i,
];

const MAX_DESC_MOVIMENTO = 520;
const MAX_DESC_FATURA_UTILIDADE = 160;

/**
 * Linha isolada típica de rodapé de conta de luz / anexo no PDF.
 */
export function linhaPareceRodapeDocumentoBr(linha: string): boolean {
  const u = normalizarTexto(linha.slice(0, 180));
  if (u.includes("condicoes gerais de fornecimento")) return true;
  if (
    u.includes("as informacoes sobre") &&
    (u.includes("tarifas") || u.includes("servicos"))
  ) {
    return true;
  }
  if (u.includes("amazonas energia") && u.includes("ouvidoria")) return true;
  if (/\bbaixa tensao\b/.test(u) && u.includes("fornecimento")) return true;
  if (u.includes("agencia nacional de atendimento ao cliente")) return true;
  if (/\bkwh\b/.test(u) && (u.includes("leitura") || u.includes("consumo"))) return true;
  if (u.includes("dias de consumo")) return true;
  if (/leit\.?\s*(atual|anterior)/.test(u)) return true;
  if (u.includes("desc. da grandeza") || u.includes("desc da grandeza")) return true;
  if (u.includes("tensao contratada")) return true;
  if (u.includes("reservado ao fisco")) return true;
  if (/icms|pis\/|pis |cofins/.test(u) && u.includes("base")) return true;
  return false;
}

/** Fatura de energia / DANFEE — valor positivo ainda é despesa; também usado na semântica. */
export function textoIndicaFaturaContaDeEnergia(texto: string): boolean {
  const raw = texto.normalize("NFC");
  const n = normalizarTexto(raw);
  if (/\bDANFEE\b/i.test(raw)) return true;
  if (n.includes("documento auxiliar") && n.includes("energia eletrica")) return true;
  if (n.includes("nota fiscal de energia") || n.includes("nf energia")) return true;
  if (n.includes("amazonas energia")) return true;
  if (n.includes("cosip") && /\bkwh\b/.test(n)) return true;
  if (n.includes("contribuicao de iluminacao publica")) return true;
  if (/\bkwh\b/.test(n) && (n.includes("total a pagar") || n.includes("vencimento"))) return true;
  if (/\buc\b/.test(n) && n.includes("medidor") && n.includes("kwh")) return true;
  return textoPareceMetadadosFaturaEnergiaOuConcessionaria(texto);
}

function textoPareceMetadadosFaturaEnergiaOuConcessionaria(s: string): boolean {
  const n = normalizarTexto(s);
  let mesHits = 0;
  for (const m of n.matchAll(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/gi)) {
    mesHits++;
    if (mesHits >= 8) return true;
  }
  if (/\bkwh\b/.test(n)) return true;
  if (n.includes("dados da leitura") || n.includes("datas da leitura")) return true;
  if (n.includes("consumo total a pagar") || n.includes("consumo faturado")) return true;
  if (n.includes("tensao contratada") || n.includes("energia ativa")) return true;
  if (/icms/.test(n) && /pis|cofins/.test(n) && n.includes("base")) return true;
  if (/\buc\b/.test(n) && /\bmedidor\b/.test(n)) return true;
  return false;
}

function encurtarNoLimitePalavra(s: string, max: number): string {
  if (s.length <= max) return s;
  const pref = s.slice(0, max);
  const ultEsp = pref.lastIndexOf(" ");
  return (ultEsp > 40 ? pref.slice(0, ultEsp) : pref).trim();
}

export function truncarRodapeDocumentosBr(texto: string): string {
  let s = texto.normalize("NFC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return s;

  let cut = s.length;
  for (const re of RE_CORTE_RODAPE) {
    re.lastIndex = 0;
    const m = re.exec(s);
    if (m?.index !== undefined && m.index > 8 && m.index < cut) cut = m.index;
  }

  s = s.slice(0, cut).trim();
  s = s.replace(/\s{2,}/g, " ").replace(/\s+[–—-]\s*$/g, "").trim();

  const pareceFatura =
    textoPareceMetadadosFaturaEnergiaOuConcessionaria(s) ||
    textoPareceMetadadosFaturaEnergiaOuConcessionaria(texto);
  const limite = pareceFatura ? MAX_DESC_FATURA_UTILIDADE : MAX_DESC_MOVIMENTO;

  if (s.length > limite) {
    s = encurtarNoLimitePalavra(s, limite);
  }
  return s;
}

/** Texto bruto (ex.: bloco do PDF) com teto para não explodir enriquecimento / UI. */
export function truncarBlocoExtratoParaArmazenamento(texto: string, max = 900): string {
  const s = truncarRodapeDocumentosBr(texto);
  if (s.length <= max) return s;
  return `${encurtarNoLimitePalavra(s, max - 1)}…`.trim();
}
