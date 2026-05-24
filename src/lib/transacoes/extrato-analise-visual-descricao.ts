/**
 * Análise da linha de extrato para UI comercial: documento válido, nome coerente,
 * título em português legível, subtítulo ordenado sem redundâncias.
 */

import {
  extrairDocumento,
  rotuloDocumentoExibicao,
} from "./extrair-documento";

const BANDEIRAS: ReadonlyArray<readonly [string, string]> = [
  ["MERCADO PAGO", "Mercado Pago"],
  ["SANTANDER", "Santander"],
  ["BANCO DO BRASIL", "Banco do Brasil"],
  ["BRADESCO", "Bradesco"],
  ["ITAU UNIBANCO", "Itaú"],
  ["ITAÚ UNIBANCO", "Itaú"],
  ["NU PAGAMENTOS", "Nubank"],
  ["PICPAY", "PicPay"],
  ["BANCO INTER", "Inter"],
  ["CAIXA ECONOMICA", "Caixa"],
  ["SICOOB", "Sicoob"],
  ["CIELO", "Cielo"],
  ["STONE IP", "Stone"],
  ["REDE", "Rede"],
  ["PAGSEGURO", "PagSeguro"],
  ["SUMUP", "SumUp"],
  ["CLOUDWALK", "Cloudwalk"],
  ["DO BRASIL TECNOLOGIA", "do Brasil Tecnologia"],
];

const RE_OPERACIONAIS: readonly RegExp[] = [
  /\btransfer[eê]ncia\s+enviada\s+(?:pelo\s+)?pix\b/gi,
  /\btransfer[eê]ncia\s+recebida\s+(?:pelo\s+)?pix\b/gi,
  /\bpix\s+enviado\b/gi,
  /\bpix\s+recebido\b/gi,
  /\bpagamento\s+com\s+(?:qr\s*(?:code\s*)?|q\s*r\s*)?\s*pix\b/gi,
  /\btransfer[eê]ncia\s+(?:via\s+)?pix\b/gi,
  /\bpagamento\s+(?:de\s+)?fatura\b/gi,
  /\bpagamento\s+(?:de\s+)?cart[aã]o\b/gi,
];

const PALAVRAS_PREPOSICAO = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "a",
  "o",
  "as",
  "os",
  "por",
  "pra",
  "pro",
]);

function normalizarEspacos(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function inferirBandeiraFinanceira(texto: string): string | null {
  const u = texto.normalize("NFC").toUpperCase();
  /** Ordem: strings mais longas primeiro (subset do array). */
  const ordenado = [...BANDEIRAS].sort((a, b) => b[0].length - a[0].length);
  for (const [agulha, rotulo] of ordenado) {
    if (u.includes(agulha)) return rotulo;
  }
  return null;
}

/**
 * Título para listagem: capitalização legível em PT-BR sem gritar tudo em maiúsculas.
 */
export function formatarTituloComercialPt(texto: string): string {
  const raw = texto.normalize("NFC").trim();
  if (!raw) return raw;

  return raw
    .split(/\s+/)
    .map((w, i) => {
      if (!w) return w;
      if (/^\d+[\d.,/\-]*$/.test(w)) return w;
      if (/\/\d{4}-\d{2}$/.test(w)) return w;

      const soLetras = w.replace(/[^A-Za-zÀ-ÿ.]/gu, "");
      if (/^ltda\.?$/i.test(soLetras)) return "LTDA.";
      if (/^s\.?\s*a\.?$/i.test(w) || /^s\/a$/i.test(w)) return "S.A.";
      if (/^(me|epp|ei)$/i.test(soLetras)) return w.toUpperCase().replace(/\.+$/, "");

      if (i > 0 && PALAVRAS_PREPOSICAO.has(w.toLowerCase())) {
        return w.toLowerCase();
      }

      if (w.length >= 2 && w === w.toUpperCase() && /[A-ZÀ-Ÿ]/.test(w) && w.length <= 32) {
        return w.charAt(0) + w.slice(1).toLowerCase();
      }

      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function removerDocumentosDoTexto(texto: string, docFmt: string | null): string {
  let t = texto;
  if (docFmt) {
    t = t.split(docFmt).join(" ");
  }
  t = t.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, " ");
  t = t.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, " ");
  t = t.replace(/\b\d{14}\b/g, " ");
  t = t.replace(/\b\d{11}\b/g, " ");
  t = t.replace(/\b\d{2}\.\d{3}\.\d{3}\b(?!\s*\/)/g, " ");
  return normalizarEspacos(t);
}

function removerGatilhosOperacionais(texto: string): string {
  let t = texto;
  for (const re of RE_OPERACIONAIS) {
    t = t.replace(re, " ");
  }
  return normalizarEspacos(t);
}

export function extrairCorpusNomeExibicao(textoBruto: string, documentoFmt: string | null): string {
  let t = removerDocumentosDoTexto(textoBruto, documentoFmt);
  t = removerGatilhosOperacionais(t);
  t = t.replace(/^[\d.\s/]+\s+(?=[^0-9\s])/u, "");
  return normalizarEspacos(t);
}

const SEGMENTO_SO_GENERICO =
  /^(ltda\.?|s\.?\s*a\.?|s\/a|me\.?|epp|ei\.?|com[eé]rcio|comercio|representa[çc][aã]o|representacao)$/i;

function truncarTituloComercial(s: string, max = 78): string {
  const t = normalizarEspacos(s);
  if (t.length <= max) return t;
  const cortado = t.slice(0, max);
  const ultimoEsp = cortado.lastIndexOf(" ");
  if (ultimoEsp > max * 0.55) {
    return `${cortado.slice(0, ultimoEsp)}…`;
  }
  return `${cortado.slice(0, max - 1)}…`;
}

function textoELixoComoTitulo(s: string): boolean {
  const t = normalizarEspacos(s);
  if (t.length < 2) return true;
  if (/^[\d\s.,/|–\-:]+$/.test(t)) return true;
  if (/^(pix|ted|doc|tarifa|taxa)$/i.test(t)) return true;
  return false;
}

/**
 * Nome que aparece **depois** de CNPJ/CPF válido na linha (comum em comprovantes).
 */
export function extrairNomeAposDocumentoNaLinha(
  textoCompleto: string,
  doc: string | null
): string | null {
  if (!doc) return null;
  const t = textoCompleto.normalize("NFC");
  const idx = t.indexOf(doc);
  if (idx < 0) return null;
  let depois = t.slice(idx + doc.length).trim();
  const cortaOp = depois.search(
    /\s+(?:pagamento|pix|transfer|qr\b|boleto|fatura|d[eé]bito|cr[eé]dito)\b/i
  );
  if (cortaOp >= 0) depois = depois.slice(0, cortaOp);
  depois = depois.replace(/^[\s\-–|:]+/, "").trim();
  const cortaDoc2 = depois.search(/\s+(?:\d{2}\.\d{3}\.|\d{3}\.\d{3}\.)/);
  if (cortaDoc2 >= 0) depois = depois.slice(0, cortaDoc2);
  depois = normalizarEspacos(depois);
  if (depois.length < 3 || textoELixoComoTitulo(depois)) return null;
  return truncarTituloComercial(depois, 72);
}

export function escolherTituloComercialDoCorpus(corpus: string): {
  titulo: string;
  preferirLinhaBruta: boolean;
} {
  const c = normalizarEspacos(corpus);
  if (!c || c.length < 2) {
    return { titulo: "", preferirLinhaBruta: true };
  }

  const segmentos = c
    .split(/\s+-\s+/)
    .map((s) => normalizarEspacos(s))
    .filter((s) => s.length >= 2);

  if (segmentos.length >= 2) {
    const comNome = segmentos.filter(
      (s) =>
        /[A-Za-zÀ-ÿ]/.test(s) &&
        !SEGMENTO_SO_GENERICO.test(s) &&
        !/^[\d\s./-]+$/.test(s) &&
        !textoELixoComoTitulo(s)
    );
    const ordenados = [...comNome].sort((a, b) => b.length - a.length);
    const cand = ordenados[0];
    if (cand && cand.length >= 4) {
      return { titulo: truncarTituloComercial(cand), preferirLinhaBruta: false };
    }
  }

  const STOP = new Set([
    "PAGAMENTO",
    "PIX",
    "TRANSFERENCIA",
    "TRANSFERÊNCIA",
    "ENVIADA",
    "RECEBIDA",
    "TED",
    "DOC",
    "BOLETO",
    "CNPJ",
    "CPF",
    "AGENCIA",
    "AGÊNCIA",
    "CONTA",
  ]);

  const palavras = c.split(/\s+/);
  const saida: string[] = [];
  for (const w of palavras) {
    const u = w
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (STOP.has(u)) break;
    saida.push(w);
    if (saida.length >= 14) break;
  }

  const juntado = normalizarEspacos(saida.join(" "));
  if (
    juntado.length >= 4 &&
    /[A-Za-zÀ-ÿ]/.test(juntado) &&
    !SEGMENTO_SO_GENERICO.test(juntado) &&
    !textoELixoComoTitulo(juntado)
  ) {
    return { titulo: truncarTituloComercial(juntado), preferirLinhaBruta: false };
  }

  if (c.length >= 4 && /[A-Za-zÀ-ÿ]/.test(c) && !textoELixoComoTitulo(c)) {
    return { titulo: truncarTituloComercial(c), preferirLinhaBruta: c.length > 96 };
  }

  return { titulo: truncarTituloComercial(c), preferirLinhaBruta: true };
}

export type PartesSubtituloOrdenadas = {
  tipoOperacao: string | null;
  documentoRotulo: string | null;
  bandeira: string | null;
  contraparteOuDetalhe?: string | null;
};

function dedupeSubtituloPreservandoOrdem(partes: string[]): string[] {
  const chaves = new Set<string>();
  const out: string[] = [];
  for (const p of partes) {
    const k = p.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
    if (!k || chaves.has(k)) continue;
    chaves.add(k);
    out.push(p);
  }
  return out;
}

export function ordenarPartesSubtitulo(p: PartesSubtituloOrdenadas): string[] {
  const bruto: string[] = [];
  if (p.tipoOperacao?.trim()) bruto.push(p.tipoOperacao.trim());
  if (p.documentoRotulo?.trim()) bruto.push(p.documentoRotulo.trim());
  if (p.bandeira?.trim()) bruto.push(p.bandeira.trim());
  if (p.contraparteOuDetalhe?.trim()) {
    const x = p.contraparteOuDetalhe.trim();
    bruto.push(x.length > 96 ? `${x.slice(0, 95)}…` : x);
  }
  return dedupeSubtituloPreservandoOrdem(bruto);
}

function tituloReservaProfissional(
  tipoOperacao: string | null,
  temDoc: boolean,
  fragmentoLimpo: string
): string {
  if (tipoOperacao?.trim()) {
    return formatarTituloComercialPt(tipoOperacao.trim());
  }
  if (temDoc) {
    return "Estabelecimento identificado no extrato";
  }
  const f = normalizarEspacos(fragmentoLimpo);
  if (f.length >= 6 && /[A-Za-zÀ-ÿ]{3,}/.test(f)) {
    return formatarTituloComercialPt(truncarTituloComercial(f, 56));
  }
  return "Lançamento no extrato";
}

/**
 * Fallback quando não há padrão Pix/MP dedicado no resolvedor: decide título com hierarquia clara.
 */
export function montarExibicaoFallbackAnalisada(
  textoCompleto: string,
  tipoOperacao: string | null
): {
  tituloPrincipal: string;
  subtitulo: string | null;
  textoBrutoTituloFallback: boolean;
} {
  const doc = extrairDocumento(textoCompleto);
  const nomeAposDoc = extrairNomeAposDocumentoNaLinha(textoCompleto, doc);
  const corpus = extrairCorpusNomeExibicao(textoCompleto, doc);
  const doCorpus = escolherTituloComercialDoCorpus(corpus);

  let tituloPrincipal: string;
  let fallbackBruto: boolean;

  if (nomeAposDoc) {
    tituloPrincipal = formatarTituloComercialPt(nomeAposDoc);
    fallbackBruto = false;
  } else if (doCorpus.titulo.length >= 4 && !doCorpus.preferirLinhaBruta) {
    tituloPrincipal = formatarTituloComercialPt(doCorpus.titulo);
    fallbackBruto = false;
  } else {
    tituloPrincipal = tituloReservaProfissional(tipoOperacao, Boolean(doc), corpus);
    fallbackBruto = true;
  }

  if (textoELixoComoTitulo(tituloPrincipal) || tituloPrincipal.length < 2) {
    tituloPrincipal = tituloReservaProfissional(tipoOperacao, Boolean(doc), textoCompleto);
    fallbackBruto = true;
  }

  const bandeira = inferirBandeiraFinanceira(textoCompleto);
  const partes = ordenarPartesSubtitulo({
    tipoOperacao,
    documentoRotulo: rotuloDocumentoExibicao(doc),
    bandeira,
    contraparteOuDetalhe: null,
  });

  return {
    tituloPrincipal: normalizarEspacos(tituloPrincipal),
    subtitulo: partes.length ? partes.join(" · ") : null,
    textoBrutoTituloFallback: fallbackBruto,
  };
}
