import { transacaoImportadaCoreParaImportedRow } from "@/lib/import/map-transacao-importada";
import type { ImportedRow } from "@/lib/import/types";
import type { BankStatementParserProfileRow } from "./bank-statement-parser-profiles-types";
import { parseExtratoAutomatico, parseExtratoAutomaticoComRastreio } from "./registry-extratos";

export { ExtratoLayoutNaoReconhecidoError } from "./registry-extratos";

export type ResultadoExtratoBrutoImportedRowsAuto = {
  rows: ImportedRow[];
  parserId: string;
  parserNome: string;
};

/** Converte texto de extrato em linhas + identificação do parser que produziu o resultado. */
export function extratoBrutoParaImportedRowsAutoComRastreio(
  texto: string,
  fileName: string,
  perfisUsuario?: readonly BankStatementParserProfileRow[]
): ResultadoExtratoBrutoImportedRowsAuto {
  const { transacoes, parserId, parserNome } = parseExtratoAutomaticoComRastreio(
    texto,
    fileName,
    { perfisUsuario }
  );
  return {
    rows: transacoes.map(transacaoImportadaCoreParaImportedRow),
    parserId,
    parserNome,
  };
}

/** Converte texto de extrato em linhas de importação (`parseExtratoAutomatico`). */
export function extratoBrutoParaImportedRowsAuto(
  texto: string,
  fileName: string,
  perfisUsuario?: readonly BankStatementParserProfileRow[]
): ImportedRow[] {
  const txs = parseExtratoAutomatico(texto, fileName, { perfisUsuario });
  return txs.map(transacaoImportadaCoreParaImportedRow);
}
