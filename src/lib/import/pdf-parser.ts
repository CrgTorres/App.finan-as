import { extractPdfTextLayerGrouped } from "@/lib/reading/contracheque-ficha-document-text";
import type { TransacaoImportada as TransacaoCore } from "@/lib/extratos/extrato-parser-core";
import type { BankStatementParserProfileRow } from "@/lib/extratos/bank-statement-parser-profiles-types";
import { extratoBrutoParaImportedRowsAutoComRastreio } from "@/lib/extratos/extrato-import-pipeline";
import { parseCSVExtrato } from "./csv-parser";
import { transacaoImportadaCoreParaImportedRow } from "./map-transacao-importada";
import { parseExtratoPdfTabelaGenerico } from "./parse-extrato-pdf-texto-generico";
import type { ImportedRow } from "./types";
import { detectarTipoExtrato } from "@/lib/extratos/detectar-tipo-extrato";
import {
  mercadoPagoTransacoesParaImportedRows,
  parseMercadoPagoPdf,
} from "@/lib/extratos/parse-mercado-pago-pdf";
import {
  parseBradesco,
  parseNubank,
  type TransacaoImportada as TransacaoBanco,
} from "@/lib/extratos/parse-extrato-bancario";

function bancoLegadoParaCore(tx: TransacaoBanco, parserId: "nubank" | "bradesco_celular"): TransacaoCore {
  const origemBase = parserId === "nubank" ? "nubank" : "bradesco";
  return {
    data: tx.data,
    descricao: tx.descricao,
    descricaoOriginal: tx.descricao,
    documento: tx.documento ?? null,
    tipo: tx.tipo,
    valor: tx.valor,
    saldo: tx.saldo ?? null,
    origem: tx.origem ?? origemBase,
    banco: parserId,
    confianca: tx.confianca,
    metadata: { parser: parserId },
  };
}

/** Roteador por tipo detectado — alinhado ao `registry-extratos` para ids de parser. */
function extratoImportacaoParseInterno(
  texto: string,
  fileName: string
): {
  rows: ImportedRow[];
  csvWarnings: string[];
  parserId: string;
  parserNome: string;
} {
  const tipo = detectarTipoExtrato(texto, fileName);

  if (tipo === "mercado_pago") {
    return {
      rows: mercadoPagoTransacoesParaImportedRows(parseMercadoPagoPdf(texto)),
      csvWarnings: [],
      parserId: "mercado_pago",
      parserNome: "Mercado Pago (PDF conta)",
    };
  }

  if (tipo === "nubank") {
    return {
      rows: parseNubank(texto).map((t) =>
        transacaoImportadaCoreParaImportedRow(bancoLegadoParaCore(t, "nubank")),
      ),
      csvWarnings: [],
      parserId: "nubank",
      parserNome: "Nubank",
    };
  }

  if (tipo === "bradesco") {
    return {
      rows: parseBradesco(texto).map((t) =>
        transacaoImportadaCoreParaImportedRow(bancoLegadoParaCore(t, "bradesco_celular")),
      ),
      csvWarnings: [],
      parserId: "bradesco_celular",
      parserNome: "Bradesco Celular",
    };
  }

  if (tipo === "csv") {
    const meta = parseCSVExtrato(texto);
    return {
      rows: meta.rows,
      csvWarnings: meta.warnings,
      parserId: "csv_generico",
      parserNome: "CSV genérico",
    };
  }

  return {
    rows: parseExtratoPdfTabelaGenerico(texto),
    csvWarnings: [],
    parserId: "pdf_tabela_generico",
    parserNome: "PDF texto / tabela genérica",
  };
}

/**
 * Roteador principal de importação (texto já lido ou extraído do PDF).
 * Mercado Pago só usa `parseMercadoPagoPdf` — não segue para Nubank nem parser genérico.
 */
export function extratoImportacaoParse(
  texto: string,
  fileName: string
): { rows: ImportedRow[]; csvWarnings: string[] } {
  const r = extratoImportacaoParseInterno(texto, fileName);
  return { rows: r.rows, csvWarnings: r.csvWarnings };
}

export function extratoImportacaoParseComParser(
  texto: string,
  fileName: string
): {
  rows: ImportedRow[];
  csvWarnings: string[];
  parserId: string;
  parserNome: string;
} {
  return extratoImportacaoParseInterno(texto, fileName);
}

export function extratoTextoParaImportedRows(texto: string, fileName: string): ImportedRow[] {
  return extratoImportacaoParse(texto, fileName).rows;
}

/** Compat: importação quando só há texto — passar `file.name` sempre que existir arquivo. */
export function parseExtratoBancarioTextoParaImportedRows(
  texto: string,
  fileName = ""
): ImportedRow[] {
  return extratoTextoParaImportedRows(texto, fileName);
}

/**
 * Extrai texto de um PDF com agrupamento por Y (worker alinhado ao `pdfjs-dist` do projeto).
 */
export async function extrairTextoExtratoPdf(
  file: File,
  options?: { password?: string }
): Promise<string> {
  const { text: raw } = await extractPdfTextLayerGrouped(file, options);
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .join("\n");
}

export { parseExtratoPdfTabelaGenerico } from "./parse-extrato-pdf-texto-generico";

export type ResultadoParsePDF = {
  rows: ImportedRow[];
  parserId: string;
  parserNome: string;
  textoExtrato: string;
};

export async function parsePDF(
  file: File,
  options?: {
    password?: string;
    perfisUsuario?: readonly BankStatementParserProfileRow[];
  }
): Promise<ResultadoParsePDF> {
  const textoExtrato = await extrairTextoExtratoPdf(file, options);
  const { rows, parserId, parserNome } = extratoBrutoParaImportedRowsAutoComRastreio(
    textoExtrato,
    file.name,
    options?.perfisUsuario
  );
  return { rows, parserId, parserNome, textoExtrato };
}
