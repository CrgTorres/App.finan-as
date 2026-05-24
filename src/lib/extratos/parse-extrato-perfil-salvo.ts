/**
 * Interpreta texto de extrato linha-a-linha com mapa fixo salvo pelo usuário.
 */

import type { BankStatementParserProfileRow } from "./bank-statement-parser-profiles-types";
import {
  VALOR_TRANSACAO_MAXIMO_BR,
  normalizarTexto,
  parseMoneyBR,
  type TransacaoImportada,
} from "./extrato-parser-core";

/** Todas as palavras (normalizadas) precisam aparecer no texto. */
export function textoCombinaKeywordsDetector(perfilKeywords: readonly string[], textoCompleto: string): boolean {
  const ntex = normalizarTexto(textoCompleto);
  const kws = perfilKeywords.map((s) => s.trim()).filter(Boolean);
  if (!kws.length) return false;
  for (const k of kws) {
    const nk = normalizarTexto(k);
    if (!nk || !ntex.includes(nk)) return false;
  }
  return true;
}

type SplitterNome = "tabs" | "multi_space" | "semicolon" | "comma";

type MapaColunasInterno = {
  splitter: SplitterNome;
  colData: number;
  colDescricao: number;
  colValor: number;
  colDocumento?: number;
};

function colNum(raw: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "number" && Number.isInteger(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  }
  return null;
}

function lerMapaColunas(columns_map: Record<string, unknown>): MapaColunasInterno {
  const raw = columns_map && typeof columns_map === "object" ? columns_map : {};
  const spRaw = typeof raw.splitter === "string" ? raw.splitter.toLowerCase() : "multi_space";
  const splitter: SplitterNome =
    spRaw === "tabs" ||
    spRaw === "multi_space" ||
    spRaw === "semicolon" ||
    spRaw === "comma"
      ? spRaw
      : "multi_space";

  const colData = colNum(raw, "col_data", "colData", "data", "date_col", "col_date");
  const colDescricao = colNum(raw, "col_descricao", "colDescricao", "descricao", "description", "desc_col");
  const colValor = colNum(raw, "col_valor", "colValor", "valor", "amount_col", "value_col");
  const doc = colNum(raw, "col_documento", "colDocumento", "documento", "doc_col");

  if (
    colData !== null &&
    colDescricao !== null &&
    colValor !== null &&
    colData >= 0 &&
    colDescricao >= 0 &&
    colValor >= 0
  ) {
    const o: MapaColunasInterno = {
      splitter,
      colData,
      colDescricao,
      colValor,
    };
    if (doc !== null && doc >= 0) o.colDocumento = doc;
    return o;
  }

  return {
    splitter,
    colData: 0,
    colDescricao: 1,
    colValor: 2,
  };
}

function splitLinha(linha: string, splitter: SplitterNome): string[] {
  if (splitter === "tabs") return linha.split("\t").map((s) => s.trim());
  if (splitter === "semicolon") return linha.split(";").map((s) => s.trim());
  if (splitter === "comma") return linha.split(",").map((s) => s.trim());
  return linha
    .split(/\t|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse valores monetários: br_pt | en | plain_pt ; parênteses → negativo */
function parseValorPerfil(bruto: string, value_format: string | null): number {
  let s = String(bruto ?? "")
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/^R\$\s*/i, "");
  const trimmed = s.trim();
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    s = `-${trimmed.slice(1, -1)}`;
  }
  const fmt = value_format?.toLowerCase()?.trim();
  if (fmt === "en" || fmt === "us" || fmt === "en_us") {
    const normalized = s.replace(/,/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  if (!fmt || fmt === "br" || fmt === "br_pt" || fmt === "pt_br") return parseMoneyBR(s);
  return parseMoneyBR(s);
}

function parseDataPerfil(cell: string, pattern: string | null): string | null {
  const raw = cell.trim().replace(/^[\s:]+/, "");
  const p = (pattern ?? "DD/MM/YYYY").toUpperCase().replace(/\s+/g, "");
  if (p === "DD/MM/YYYY" || p === "DD-MM-YYYY") {
    const m = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/.exec(raw);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  if (p === "YYYY-MM-DD") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const mFallback = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})|(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (mFallback) {
    if (mFallback[1]) return `${mFallback[3]}-${mFallback[2]}-${mFallback[1]}`;
    if (mFallback[4]) return `${mFallback[4]}-${mFallback[5]}-${mFallback[6]}`;
  }
  return null;
}

function linhaTemKeywordIgnora(linhaNorm: string, ignorar: readonly string[]): boolean {
  for (const g of ignorar) {
    const ng = normalizarTexto(g);
    if (!ng) continue;
    if (linhaNorm.includes(ng)) return true;
  }
  return false;
}

export function parseExtratoTextoPorPerfil(
  texto: string,
  perfil: Pick<
    BankStatementParserProfileRow,
    "id" | "columns_map" | "date_pattern" | "value_format" | "ignore_keywords" | "bank_name"
  >
): TransacaoImportada[] {
  const mapa = lerMapaColunas(perfil.columns_map ?? {});
  /** Quando verdadeiro (padrão), valores positivos = saídas (despesa); negativos/explícitos = receita — comum em colunas únicas BR. */
  const debitosPositivosRaw = perfil.columns_map?.["debitos_positivos"] ?? perfil.columns_map?.["debitosPositivos"];
  const debitosPositivos =
    debitosPositivosRaw === undefined ||
    debitosPositivosRaw === null ||
    debitosPositivosRaw === true;

  const ignorar =
    perfil.ignore_keywords?.map((x) => x.trim()).filter(Boolean) ?? [];
  const out: TransacaoImportada[] = [];
  const maxIdx =
    Math.max(mapa.colData, mapa.colDescricao, mapa.colValor, mapa.colDocumento ?? 0);

  const lines = texto.split(/\r?\n/);
  for (const linhaBruta of lines) {
    const linhaNorm = normalizarTexto(linhaBruta);
    if (linhaNorm.length < 3) continue;
    if (linhaTemKeywordIgnora(linhaNorm, ignorar)) continue;

    const cells = splitLinha(linhaBruta.trim(), mapa.splitter);
    if (cells.length <= maxIdx) continue;

    const celData = cells[mapa.colData] ?? "";
    const iso = parseDataPerfil(celData, perfil.date_pattern);
    if (!iso) continue;

    const descricao = cells[mapa.colDescricao] ?? "";
    if (!descricao?.trim()) continue;

    let valorTxt = cells[mapa.colValor] ?? "";
    valorTxt = valorTxt.replace(/^\+/, "").trim();
    if (!valorTxt) continue;

    const signed = parseValorPerfil(valorTxt, perfil.value_format);
    const amountAbs = Math.abs(signed);
    if (!amountAbs || amountAbs > VALOR_TRANSACAO_MAXIMO_BR) continue;

    const amount = amountAbs;
    const tipo: "receita" | "despesa" = debitosPositivos
      ? signed < 0
        ? "receita"
        : "despesa"
      : signed < 0
        ? "despesa"
        : "receita";

    let documento = null as string | null;
    if (mapa.colDocumento !== undefined) {
      const d = cells[mapa.colDocumento];
      documento = d?.trim() ? d.trim().slice(0, 240) : null;
    }

    out.push({
      data: iso,
      descricao: descricao.normalize("NFC").replace(/\s+/g, " ").trim(),
      descricaoOriginal: linhaBruta.normalize("NFC").trim(),
      documento,
      tipo,
      valor: amount,
      saldo: null,
      origem: `bank_profile:${perfil.id}`,
      banco: perfil.bank_name?.trim() ?? `Perfil ${perfil.id.slice(0, 8)}`,
      confianca: "media",
      metadata: {
        parser: "bank_statement_parser_profiles",
        profile_id: perfil.id,
      },
    });
  }

  return out;
}
