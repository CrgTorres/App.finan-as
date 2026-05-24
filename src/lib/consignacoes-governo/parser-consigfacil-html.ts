import {
  parseConsigfacilTexto,
  type EntradaParseConsigfacil,
} from "@/lib/consignacoes-governo/parser-consigfacil-print";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";

/**
 * Parser para HTML colado/baixado do portal ConsigFácil.
 *
 * Estratégia:
 *  1. Se houver `DOMParser` (browser), usamos `innerText` do `<body>` ou da página
 *     inteira para preservar quebras de linha visíveis (igual ao print).
 *  2. Sem DOM disponível (SSR), aplicamos um stripper de tags regex razoável.
 *  3. O texto resultante é entregue ao `parseConsigfacilTexto` — mesmo formato
 *     que o usuário cola do print, então a lógica de extração é compartilhada.
 */

function extrairTextoDoHtmlBrowser(html: string): string | null {
  try {
    if (typeof DOMParser === "undefined") return null;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.body ?? doc.documentElement;
    const txt = (body?.textContent ?? "").replace(/\r/g, "");
    return txt
      .split("\n")
      .map((l) => l.replace(/[\t ]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  } catch {
    return null;
  }
}

function extrairTextoDoHtmlRegex(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h\d|td|th)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export type EntradaParseConsigfacilHtml = {
  html: string;
  documentoOrigem: string;
  capturadoEm?: string;
};

/**
 * Converte HTML do ConsigFácil em `ConsigfacilSnapshot`.
 * Usar quando o usuário cola/upload do HTML completo da página.
 */
export function parseConsigfacilHtml(input: EntradaParseConsigfacilHtml): ConsigfacilSnapshot {
  const texto = extrairTextoDoHtmlBrowser(input.html) ?? extrairTextoDoHtmlRegex(input.html);
  return parseConsigfacilTexto({
    texto,
    documentoOrigem: input.documentoOrigem,
    capturadoEm: input.capturadoEm,
    origem: "consigfacil_html",
  });
}
