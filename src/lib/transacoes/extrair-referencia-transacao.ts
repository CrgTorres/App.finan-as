import { extrairEstabelecimentoPosPix, resolverDescricaoVisualExtrato } from "./descricao-visual-extrato";
import { extrairDocumento, RE_CNPJ_FMT, RE_CPF_FMT } from "./extrair-documento";

export type ReferenciaTransacao = {
  documento: string | null;
  favorecido: string | null;
  subtituloVisual: string | null;
};

export { extrairDocumento } from "./extrair-documento";

function escapeReLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Texto antes do traço quando há CNPJ/CPF, ou texto após gatilhos Pix / transferência.
 */
export function extrairFavorecido(texto: string): string | null {
  const estabPosPix = extrairEstabelecimentoPosPix(texto);
  if (estabPosPix && estabPosPix.trim().length >= 2) return estabPosPix.trim();

  let t = texto.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!t) return null;

  const docFmt = texto.match(RE_CNPJ_FMT)?.[0] ?? texto.match(RE_CPF_FMT)?.[0];

  /** "NOME ... - XX.XXX.XXX/YYYY-ZZ" */
  const tracoAntesDoc = t.match(/^(.+?)\s*-\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\s*$/);
  if (tracoAntesDoc) {
    return tracoAntesDoc[1].trim() || null;
  }

  if (docFmt) {
    let s = t
      .replace(new RegExp(`\\s*-\\s*${escapeReLiteral(docFmt)}\\s*`), " ")
      .replace(new RegExp(`${escapeReLiteral(docFmt)}\\s*$`), " ")
      .trim();
    t = s;
  }

  const pix = t.match(
    /(?:transfer[eê]ncia\s+)?(?:enviada\s+|recebida\s+)?(?:pelo\s+)?pix\s+(.+)/i
  );
  if (pix?.[1]) {
    let nome = pix[1].trim();
    nome = nome.replace(/\s*-\s*(?:\d{2}\.){1,}.*$/, "").trim();
    return nome.length >= 2 ? nome : null;
  }

  const ted = t.match(
    /(?:ted|doc|T\.?\s*E\.?\s*D\.?)\s*[:\s-]+\s*(.+)/i
  );
  if (ted?.[1]) {
    const nome = ted[1].trim().replace(/\s*-\s*\d.*$/, "").trim();
    return nome.length >= 2 ? nome : null;
  }

  /** Só sobrou texto sem gatilho (ex.: descrição curta já é o favorecido). */
  if (!docFmt && t.length >= 3 && !/^\d[\d\s.,/-]+$/.test(t)) return t;

  /** Após tirar só o documento ficou nome? */
  if (docFmt) {
    const resto = t
      .replace(docFmt, " ")
      .replace(/^[\s-|–]+|[\s-|–]+$/g, "")
      .trim();
    return resto.length >= 3 ? resto : null;
  }

  return t.length >= 3 ? t : null;
}

function montarSubtitulo(
  favorecido: string | null,
  documento: string | null
): string | null {
  if (favorecido && documento)
    return `${favorecido} · ${documento}`;
  return favorecido ?? documento ?? null;
}

/**
 * Extrai referência estruturada da descrição de transação (Pix, TED, boleto, etc.).
 */
export function extrairReferenciaTransacao(texto: string): ReferenciaTransacao {
  const documento = extrairDocumento(texto);
  const favorecido = extrairFavorecido(texto);
  const vis = resolverDescricaoVisualExtrato(texto);
  return {
    documento,
    favorecido,
    subtituloVisual: vis.subtitulo ?? montarSubtitulo(favorecido, documento),
  };
}
