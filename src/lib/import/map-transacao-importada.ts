import { aplicarEnriquecimentoReferenciasExtrato } from "@/lib/extratos/extrato-enriquecimento-referencias";
import type { TransacaoImportada } from "@/lib/extratos/extrato-parser-core";
import { categorize } from "./categorizer";
import type { ImportedRow } from "./types";

/** Converte resultado de parsers legados (Nubank, Bradesco) para linha da importação. */
export function transacaoExtratoLikeParaImportedRow(t: {
  descricao: string;
  valor: number;
  data: string;
  tipo: "receita" | "despesa";
}): ImportedRow {
  return {
    id: crypto.randomUUID(),
    description: t.descricao.charAt(0).toUpperCase() + t.descricao.slice(1),
    amount: t.valor,
    date: t.data,
    type: t.tipo,
    category: categorize(t.descricao),
    selected: true,
  };
}

export function transacaoImportadaCoreParaImportedRow(t: TransacaoImportada): ImportedRow {
  const pid =
    t.metadata?.parser !== undefined && typeof t.metadata.parser === "string"
      ? t.metadata.parser
      : undefined;
  const idMp = t.metadata?.idOperacaoMercadoPago;

  let idOperacao: string | undefined;
  if (typeof idMp === "string" && idMp.trim().length > 0) {
    idOperacao = idMp.trim();
  } else if (pid !== "mercado_pago") {
    /** Referência operacional do parser (ex.: Bradesco); não usar CPF/CNPJ injetado pelo enriquecimento. */
    idOperacao = t.documento?.trim() || undefined;
  } else {
    idOperacao = undefined;
  }

  const tx = aplicarEnriquecimentoReferenciasExtrato(t);
  const base = transacaoExtratoLikeParaImportedRow(tx);
  return {
    ...base,
    idOperacao,
    extratoParserId: pid,
  };
}
