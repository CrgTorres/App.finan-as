import { parseCSVExtrato } from "@/lib/import/csv-parser";
import { parseExtratoPdfTabelaGenerico } from "@/lib/import/parse-extrato-pdf-texto-generico";
import type { ImportedRow } from "@/lib/import/types";
import {
  normalizarTexto,
  type ExtratoParser,
  type TransacaoImportada as TransacaoCore,
} from "./extrato-parser-core";
import { parseBradesco, parseNubank, type TransacaoImportada as TxBanco } from "./parse-extrato-bancario";
import { parseMercadoPagoPdf, isMercadoPagoExtratoText } from "./parse-mercado-pago-pdf";
import type { BankStatementParserProfileRow } from "./bank-statement-parser-profiles-types";
import { parseExtratoTextoPorPerfil, textoCombinaKeywordsDetector } from "./parse-extrato-perfil-salvo";

export class ExtratoLayoutNaoReconhecidoError extends Error {
  readonly code = "layout_nao_reconhecido" as const;

  constructor(message = "layout_nao_reconhecido") {
    super(message);
    this.name = "ExtratoLayoutNaoReconhecidoError";
  }
}

function legadoBancoParaCore(t: TxBanco, fallbackOrigem: string): TransacaoCore {
  return {
    data: t.data,
    descricao: t.descricao,
    descricaoOriginal: t.descricao,
    documento: t.documento ?? null,
    tipo: t.tipo,
    valor: t.valor,
    saldo: t.saldo ?? null,
    origem: t.origem ?? fallbackOrigem,
    banco: fallbackOrigem,
    confianca: t.confianca,
  };
}

function importedRowParaCore(r: ImportedRow, origem: string): TransacaoCore {
  return {
    data: r.date,
    descricao: r.description,
    descricaoOriginal: r.description,
    documento: r.idOperacao ?? null,
    tipo: r.type,
    valor: r.amount,
    origem,
    categoria: r.category,
  };
}

function detectarMercadoPagoExtrato(texto: string): boolean {
  return isMercadoPagoExtratoText(texto);
}

function detectarNubankExtrato(texto: string): boolean {
  const n = normalizarTexto(texto);
  return (
    n.includes("nu pagamentos") ||
    n.includes("nu financeira") ||
    n.includes("saldo final do periodo")
  );
}

function detectarBradescoCelular(texto: string): boolean {
  return normalizarTexto(texto).includes("bradesco celular");
}

function detectarCsvGenerico(_texto: string, fileName?: string): boolean {
  return (fileName ?? "").toLowerCase().trim().endsWith(".csv");
}

export const mercadoPagoParser: ExtratoParser = {
  id: "mercado_pago",
  nome: "Mercado Pago (PDF conta)",
  prioridade: 100,
  detectar: (texto: string, _fileName?: string) => detectarMercadoPagoExtrato(texto),
  parse: (texto: string, _fileName?: string): TransacaoCore[] =>
    parseMercadoPagoPdf(texto).map((t) => ({
      data: t.data,
      descricao: t.descricao,
      descricaoOriginal: t.descricao,
      documento: t.documento ?? null,
      tipo: t.tipo,
      valor: t.valor,
      saldo: t.saldo ?? null,
      origem: "mercado_pago",
      banco: "Mercado Pago",
      metadata: {
        parser: "mercado_pago",
        idOperacaoMercadoPago: t.idOperacaoMercadoPago ?? null,
      },
    })),
};

export const nubankParser: ExtratoParser = {
  id: "nubank",
  nome: "Nubank",
  prioridade: 90,
  detectar: (texto: string, _fileName?: string) => detectarNubankExtrato(texto),
  parse: (texto: string, _fileName?: string): TransacaoCore[] =>
    parseNubank(texto).map((t) => {
      const core = legadoBancoParaCore(
        { ...t, origem: t.origem ?? "nubank" },
        "nubank"
      );
      return {
        ...core,
        metadata: { ...core.metadata, parser: "nubank" as const },
      };
    }),
};

export const bradescoParser: ExtratoParser = {
  id: "bradesco_celular",
  nome: "Bradesco Celular",
  prioridade: 80,
  detectar: (texto: string, _fileName?: string) => detectarBradescoCelular(texto),
  parse: (texto: string, _fileName?: string): TransacaoCore[] =>
    parseBradesco(texto).map((t) => {
      const core = legadoBancoParaCore({ ...t, origem: t.origem ?? "bradesco" }, "bradesco");
      return {
        ...core,
        metadata: { ...core.metadata, parser: "bradesco_celular" as const },
      };
    }),
};

export const csvGenericoParser: ExtratoParser = {
  id: "csv_generico",
  nome: "CSV genérico",
  prioridade: 20,
  detectar: (texto: string, fileName?: string) => detectarCsvGenerico(texto, fileName),
  parse: (texto: string, _fileName?: string): TransacaoCore[] => {
    const meta = parseCSVExtrato(texto);
    return meta.rows.map((r) =>
      importedRowParaCore({ ...r, category: r.category }, "csv_generico")
    );
  },
};

export const pdfTabelaGenericoParser: ExtratoParser = {
  id: "pdf_tabela_generico",
  nome: "PDF texto / tabela genérica",
  prioridade: 10,
  /** Só quando não é CSV nominal (evita tratar arquivo tabular só por extensão). */
  detectar: (_texto: string, fileName?: string) =>
    !detectarCsvGenerico(_texto, fileName),
  parse: (texto: string, _fileName?: string): TransacaoCore[] =>
    parseExtratoPdfTabelaGenerico(texto).map((r) =>
      importedRowParaCore(r, "pdf_tabela_generico")
    ),
};

const PARSERS_ESPECIFICOS = [mercadoPagoParser, nubankParser, bradescoParser];

export type ResultadoParseExtratoAutomatico = {
  transacoes: TransacaoCore[];
  parserId: string;
  parserNome: string;
};

function tentarListaParsers(
  parsers: readonly ExtratoParser[],
  texto: string,
  fileName?: string
): ResultadoParseExtratoAutomatico | null {
  for (const p of parsers) {
    if (!p.detectar(texto, fileName)) continue;
    const txs = p.parse(texto, fileName);
    if (txs.length > 0) return { transacoes: txs, parserId: p.id, parserNome: p.nome };
  }
  return null;
}

function criarExtratoParserDePerfil(perfil: BankStatementParserProfileRow): ExtratoParser {
  const nomeBanco =
    perfil.bank_name?.trim() || `Layout salvo (${perfil.id.slice(0, 8)})`;
  const kws = perfil.detector_keywords ?? [];
  return {
    id: `bank_profile:${perfil.id}`,
    nome: nomeBanco,
    prioridade: 25,
    detectar: (texto: string) => textoCombinaKeywordsDetector(kws, texto),
    parse: (texto: string) => parseExtratoTextoPorPerfil(texto, perfil),
  };
}

/**
 * Escolhe o parser pelo layout (específicos por prioridade, CSV, perfis salvos, PDF genérico).
 * Lança {@link ExtratoLayoutNaoReconhecidoError} com código `layout_nao_reconhecido` se nada produzir linhas.
 */
export function parseExtratoAutomaticoComRastreio(
  texto: string,
  fileName?: string,
  options?: { perfisUsuario?: readonly BankStatementParserProfileRow[] }
): ResultadoParseExtratoAutomatico {
  const ordem = [...PARSERS_ESPECIFICOS].sort((a, b) => b.prioridade - a.prioridade);

  const rEspecificos = tentarListaParsers(ordem, texto, fileName);
  if (rEspecificos) return rEspecificos;

  if (csvGenericoParser.detectar(texto, fileName)) {
    const txs = csvGenericoParser.parse(texto, fileName);
    if (txs.length > 0)
      return {
        transacoes: txs,
        parserId: csvGenericoParser.id,
        parserNome: csvGenericoParser.nome,
      };
  }

  const perfilParsers = (options?.perfisUsuario ?? [])
    .slice()
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .map(criarExtratoParserDePerfil);

  const rPerfis = tentarListaParsers(perfilParsers, texto, fileName);
  if (rPerfis) return rPerfis;

  if (pdfTabelaGenericoParser.detectar(texto, fileName)) {
    const txs = pdfTabelaGenericoParser.parse(texto, fileName);
    if (txs.length > 0)
      return {
        transacoes: txs,
        parserId: pdfTabelaGenericoParser.id,
        parserNome: pdfTabelaGenericoParser.nome,
      };
  }

  throw new ExtratoLayoutNaoReconhecidoError();
}

export function parseExtratoAutomatico(
  texto: string,
  fileName?: string,
  options?: { perfisUsuario?: readonly BankStatementParserProfileRow[] }
): TransacaoCore[] {
  return parseExtratoAutomaticoComRastreio(texto, fileName, options).transacoes;
}
