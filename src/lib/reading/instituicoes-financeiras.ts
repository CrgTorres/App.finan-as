/**
 * Instituições para reconhecimento em contracheques, ficha financeira e textos de folha.
 * Alinhado a `docs/REFERENCIA-LEITURA-DOCUMENTOS.md` — atualizar ambos em conjunto.
 */

import { padronizarTokensRubricaOficiais } from "@/lib/anexos/rubrica-nomes-oficiais";
export type InstituicaoResumo = {
  compe: string;
  nome: string;
};

export type BancoDetectado = InstituicaoResumo & {
  matchedToken: string;
};

type InstituicaoDef = {
  compe: string;
  nome: string;
  /** Frases/siglas em forma “buscável” (minúsculas; acentos serão normalizados no texto). */
  tokens: string[];
};

type InstituicaoInterna = InstituicaoDef & { tokensSorted: string[] };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mesma ideia dos parsers: minúsculas + sem diacríticos. */
export function normalizarParaBusca(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenMatches(normLine: string, token: string): boolean {
  const t = normalizarParaBusca(token).replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (t.length <= 4) {
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(t)}(?:$|[^a-z0-9])`);
    return re.test(normLine);
  }
  return normLine.includes(t);
}

function sortTokensLongestFirst(tokens: readonly string[]): string[] {
  return [...tokens].sort((a, b) => b.length - a.length);
}

/**
 * Contracheques e OCR costumam colar siglas (ex.: EMPCEF, CONSIGCEF). Inserimos separadores
 * para que tokens como `cef` voltem a casar com a Caixa.
 */
export function preprocessDescricaoParaDetecaoBanco(rawDescription: string): string {
  let s = normalizarParaBusca(rawDescription).replace(/\s+/g, " ").trim();
  // Caixa colada ao tipo de rubrica (PDF une tokens: "CaixaEmpréstimo", "CaixaEmp02")
  s = s.replace(/\b(caixa)(emprestimo|emp02|emp\d+|empo\d+)(?![a-z0-9])/gi, "$1 $2");
  s = s.replace(/\b(caixa)(emp\b)(?![a-z])/gi, "$1 $2");
  // OCR separa: "CAIXA EMPO2" (EMP+algarismos lido como EMPO+número)
  s = s.replace(/\b(caixa)\s+(empo)(\d{1,4})\b/gi, "$1 emp$3");
  s = s.replace(/\b(caixa)\s+(emp)\s*(\d{2,6})\b/gi, "$1 emp $2");
  // CrediCesta / Credcesta na folha (às vezes colado)
  s = s.replace(/\b(credcesta)(?=compra)/gi, "$1 ");
  // OCR: "BB-EMP" lido como "as-emP", "as-emp", "8b-emp" (B duplo mal lido; hífen Unicode)
  const ocrHyph = String.raw`[\u2010\u2011\u2012\u2013\u2014\u2015\u2212-]`;
  s = s.replace(new RegExp(`\\b(as|8b|8s)${ocrHyph}+(emp)(?=\\s|\\d|$)`, "gi"), "bb-$2");
  // Bb-Emp BB-EMP (normalize para casar bb + emp consignado)
  s = s.replace(/\bbb(-)(emp\b)/gi, "bb $2");
  s = s.replace(/(emprestimo|emprest|emp|consig|margem|parcela|div|financ|financi)(cef)(?![a-z0-9])/gi, "$1 $2");
  s = s.replace(/(emprestimo|emprest|emp|consig)(cx\b)(?![a-z])/gi, "$1 $2");
  return padronizarTokensRubricaOficiais(s);
}

/**
 * Texto já normalizado com `preprocessDescricaoParaDetecaoBanco` + espaços colapsados.
 * Evita `\bemp\d+\b` e `\bemprest\b`, que falham em `emp02`/`emprestimo` (limite de «palavra» em JS).
 */
export function textoTemCaixaOuCefOuCompe104(n: string): boolean {
  const s = n.replace(/\s+/g, " ").trim();
  return /\b(caixa|c\.?\s*e\.?\s*f\.?|\bcef\b|\b104\b)\b/i.test(s);
}

export function textoContemIndicioEmprestimoConsignado(normalizedPreprocessedLine: string): boolean {
  const s = normalizedPreprocessedLine.replace(/\s+/g, " ").trim();
  if (/\bemprestim\w*\b/i.test(s)) return true;
  if (/\bemprestrim\w*\b/i.test(s)) return true;
  if (/\bemprestrimo\b/i.test(s)) return true;
  if (/(?:^|[^a-z0-9])emprest(?![a-z])/i.test(s)) return true;
  if (/\bempo\d+\b/i.test(s)) return true;
  if (/(?:^|[^a-z0-9])emp(?:0\d{1,5}|\d{2,6})(?![a-z0-9])/i.test(s)) return true;
  if (/\bemp\s+\d{1,6}\b/i.test(s)) return true;
  if (/\bfinanciam\w*\b/i.test(s)) return true;
  if (/\bfinanci\b/i.test(s)) return true;
  if (/\bconsignad\w*\b/i.test(s)) return true;
  if (/\bconsig\w*\b/i.test(s)) return true;
  if (/\bmargem\b/i.test(s)) return true;
  if (/\bsaque\b/i.test(s)) return true;
  if (/\bparcela\b/i.test(s)) return true;
  if (/\bdivida\b/i.test(s)) return true;
  if (/\bdiv\b/i.test(s)) return true;
  if (/\bquit\w*\b/i.test(s)) return true;
  if (/\bcredito\s+caixa\b/i.test(s)) return true;
  return false;
}

const INSTITUICOES_RAW: readonly InstituicaoDef[] = [
  {
    compe: "001",
    nome: "Banco do Brasil",
    tokens: [
      "banco do brasil",
      "bco do brasil",
      "bc do brasil",
      "bco brasil",
      "banco brasil",
      "bb-emp",
      "bb emp",
      "bb",
    ],
  },
  { compe: "003", nome: "Banco da Amazônia", tokens: ["banco da amazonia", "basa"] },
  { compe: "004", nome: "Banco do Nordeste", tokens: ["banco do nordeste", "bnb"] },
  { compe: "007", nome: "BNDES", tokens: ["bndes"] },
  { compe: "021", nome: "Banestes", tokens: ["banestes"] },
  { compe: "033", nome: "Santander", tokens: ["santander", "banco santander", "banco real"] },
  { compe: "037", nome: "Banpará", tokens: ["banpara"] },
  { compe: "041", nome: "Banrisul", tokens: ["banrisul"] },
  { compe: "047", nome: "Banese", tokens: ["banese"] },
  { compe: "062", nome: "Hipercard", tokens: ["hipercard"] },
  { compe: "070", nome: "BRB", tokens: ["brb", "banco de brasilia"] },
  { compe: "077", nome: "Inter", tokens: ["banco inter", "inter medium"] },
  { compe: "084", nome: "Uniprime", tokens: ["uniprime"] },
  { compe: "099", nome: "Uniprime Central", tokens: ["uniprime central"] },
  { compe: "102", nome: "XP Investimentos", tokens: ["xp investimentos"] },
  {
    compe: "104",
    nome: "Caixa Econômica Federal",
    tokens: [
      "caixa economica federal",
      "caixa emprestimo",
      "caixa emp02",
      "caixa economica",
      "banco caixa",
      "caixa e federal",
      "caixa federal",
      "caixa",
      "cef",
      "credito caixa",
      "consignado caixa",
      "caixa consignado",
      "caixa emp",
    ],
  },
  { compe: "133", nome: "Cresol", tokens: ["cresol"] },
  { compe: "136", nome: "Unicred", tokens: ["unicred"] },
  { compe: "197", nome: "Stone", tokens: ["stone pagamentos", "stone"] },
  { compe: "208", nome: "BTG Pactual", tokens: ["btg pactual", "btg", "pactual"] },
  { compe: "212", nome: "Banco Original", tokens: ["banco original", "original"] },
  { compe: "218", nome: "Banco BS2", tokens: ["banco bs2", "bs2"] },
  {
    compe: "243",
    nome: "Banco Master",
    tokens: ["banco master", "credcesta compra", "credcesta", "credicesta", "credce sta", "credi cesta", "cred cesta"],
  },
  { compe: "237", nome: "Bradesco", tokens: ["bradesco", "banco bradesco", "next"] },
  { compe: "260", nome: "Nubank", tokens: ["nubank", "nu pagamentos", "nu pag"] },
  { compe: "290", nome: "PagSeguro", tokens: ["pagseguro", "pag bank", "pagbank"] },
  { compe: "323", nome: "Mercado Pago", tokens: ["mercado pago", "mercadopago"] },
  { compe: "318", nome: "BMG", tokens: ["banco bmg", "bmg"] },
  { compe: "336", nome: "C6 Bank", tokens: ["c6 bank", "banco c6", "c6"] },
  { compe: "341", nome: "Itaú Unibanco", tokens: ["itau unibanco", "banco itau", "itau", "unibanco"] },
  { compe: "389", nome: "Mercantil", tokens: ["banco mercantil", "mercantil"] },
  { compe: "422", nome: "Safra", tokens: ["banco safra", "safra"] },
  { compe: "633", nome: "Rendimento", tokens: ["banco rendimento", "rendimento"] },
  { compe: "637", nome: "Sofisa", tokens: ["sofisa direto", "banco sofisa", "sofisa"] },
  { compe: "643", nome: "Pine", tokens: ["banco pine", "pine"] },
  { compe: "655", nome: "Votorantim", tokens: ["banco votorantim", "bv financeira", "votorantim"] },
  {
    compe: "604",
    nome: "Banco Industrial do Brasil",
    tokens: [
      "banco industrial do brasil",
      "banco industrial",
      "bib cartao",
      "bib cartao de credit",
      "bib cartao de credito",
      "bib",
      "industrial brasil",
    ],
  },
  { compe: "707", nome: "Daycoval", tokens: ["daycoval", "banco daycoval", "b daycoval"] },
  { compe: "712", nome: "Ourinvest", tokens: ["ourinvest", "banco ourinvest"] },
  { compe: "741", nome: "BRP", tokens: ["banco brp"] },
  { compe: "745", nome: "Citibank", tokens: ["citibank", "citi"] },
  { compe: "746", nome: "Modal", tokens: ["banco modal", "modal"] },
  { compe: "748", nome: "Sicredi", tokens: ["sicredi", "credisis"] },
  { compe: "751", nome: "Scotiabank", tokens: ["scotiabank", "scotia"] },
  {
    compe: "756",
    /** Bancoob é a marca de rede das cooperativas Sicoob no contracheque. */
    nome: "Sicoob (Bancoob)",
    tokens: ["bancoob emprestimo", "emprestimo bancoob", "sicoob", "bancoob"],
  },
  { compe: "MCR", nome: "Milicred", tokens: ["milicred", "multicred", "multi cred", "mili cred", "mili-cred"] },
];

const INSTITUICOES: readonly InstituicaoInterna[] = INSTITUICOES_RAW.map((row) => ({
  ...row,
  tokensSorted: sortTokensLongestFirst(row.tokens),
}));

/**
 * Indício de dívida/consignado na descrição.
 * "Empo", "Empo2", "Empo02"… = abreviação comum de empréstimo no contracheque (código + banco + empo).
 */
export const INDICIO_CONSIG_BANCO =
  /consig|emprestim|emprestrim|emprest|emp cont|empcont|financ|financi|cdc|parcela|margem|divida|credito pessoal|rotativo|refin|reneg|\bempo[0-9]*\b|(?<![a-z0-9])emp(?:0\d{1,5}|\d{2,6})(?![a-z0-9])|\bbb-?\s*emp\b|\bcredcesta\b/i;

/**
 * Detecta a instituição mais específica citada na descrição da rubrica.
 */
export function detectarInstituicaoNaDescricao(description: string): BancoDetectado | undefined {
  const nExpand = preprocessDescricaoParaDetecaoBanco(description);
  const nPlain = normalizarParaBusca(description).replace(/\s+/g, " ").trim();

  const runPass = (normLine: string): BancoDetectado | undefined => {
    let best: (BancoDetectado & { _len: number }) | undefined;
    for (const inst of INSTITUICOES) {
      for (const tok of inst.tokensSorted) {
        if (!tokenMatches(normLine, tok)) continue;
        const len = tok.length;
        if (!best || len > best._len) {
          best = {
            compe: inst.compe,
            nome: inst.nome,
            matchedToken: tok,
            _len: len,
          };
        }
      }
    }
    return best ? { compe: best.compe, nome: best.nome, matchedToken: best.matchedToken } : undefined;
  };

  return runPass(nExpand) ?? runPass(nPlain);
}

/** Arcabouço normativo do Bacen (IF / estabilidade financeira) — conferência de COMPE e denominação. */
export const URL_BACEN_ESTABILIDADE_FINANCEIRA = "https://www.bcb.gov.br/estabilidadefinanceira";

export type ConfirmacaoBancoCurado = {
  compe: string;
  nome: string;
  /** COMPE numérico (3 dígitos) + indício de crédito/consignado na rubrica. */
  confiancaRef: "alta" | "media";
  urlsReferencia: readonly string[];
};

/**
 * Cruza deteção de instituição (COMPE + nomes/siglas curados) com indício de operação de crédito/consignado.
 * Não substitui leitura do PDF; reduz ambiguidade e aponta fontes oficiais para validação manual.
 */
export function confirmacaoBancoCurado(description: string): ConfirmacaoBancoCurado | undefined {
  const inst = detectarInstituicaoNaDescricao(description);
  if (!inst || inst.compe === "MCR") return undefined;
  const n = preprocessDescricaoParaDetecaoBanco(description).replace(/\s+/g, " ");
  const temIndicio =
    textoContemIndicioEmprestimoConsignado(n) || INDICIO_CONSIG_BANCO.test(description);
  if (!temIndicio) return undefined;
  const compeNumerica = /^\d{1,3}$/.test(inst.compe);
  const urls: string[] = [URL_BACEN_ESTABILIDADE_FINANCEIRA];
  if (inst.compe === "104") urls.push("https://www.caixa.gov.br");
  if (inst.compe === "001") urls.push("https://www.bb.com.br");
  if (inst.compe === "604") urls.push("https://www.bib.com.br");
  if (inst.compe === "756") urls.push("https://www.sicoob.com.br");
  if (inst.compe === "237") urls.push("https://www.bradesco.com.br");
  if (inst.compe === "341") urls.push("https://www.itau.com.br");
  if (inst.compe === "033") urls.push("https://www.santander.com.br");
  return {
    compe: inst.compe,
    nome: inst.nome,
    confiancaRef: compeNumerica ? "alta" : "media",
    urlsReferencia: urls,
  };
}

/**
 * Lista instituições distintas citadas em qualquer parte do texto (cabeçalho + rubricas).
 * Banco a mostrar na UI da rubrica: Credcesta/CrediCesta é produto Banco Master mesmo quando o contracheque
 * carrega outro COMPE; depois usa `banco` salvo; por fim detecta pelo texto.
 */
export function resolveBancoParaExibicao(item: {
  description: string;
  banco?: { compe: string; nome: string };
}): InstituicaoResumo | undefined {
  const n = normalizarParaBusca(item.description);
  if (/\bcredcesta\b/i.test(n) || /\bcredi\s*cesta\b/i.test(n) || /\bcred\s*cesta\b/i.test(n)) {
    return { compe: "243", nome: "Banco Master" };
  }
  if (item.banco) return { compe: item.banco.compe, nome: item.banco.nome };
  const d = detectarInstituicaoNaDescricao(item.description);
  return d ? { compe: d.compe, nome: d.nome } : undefined;
}

export function listarInstituicoesNoTexto(rawText: string): InstituicaoResumo[] {
  const n = normalizarParaBusca(rawText);
  const nExp = preprocessDescricaoParaDetecaoBanco(rawText);
  const byCompe = new Map<string, InstituicaoResumo>();

  for (const inst of INSTITUICOES) {
    for (const tok of inst.tokensSorted) {
      if (tokenMatches(nExp, tok) || tokenMatches(n, tok)) {
        byCompe.set(inst.compe, { compe: inst.compe, nome: inst.nome });
        break;
      }
    }
  }

  return [...byCompe.values()].sort((a, b) => a.compe.localeCompare(b.compe));
}
