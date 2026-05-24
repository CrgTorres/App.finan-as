import { parsePdfTabelaGenerico } from "@/lib/extratos/parse-pdf-tabela-generico";
import type { TransacaoImportada as TransacaoCore } from "@/lib/extratos/extrato-parser-core";
import { truncarRodapeDocumentosBr } from "@/lib/extratos/pdf-descricao-truncar-rodape";
import type { ImportedRow } from "./types";
import { transacaoImportadaCoreParaImportedRow } from "./map-transacao-importada";

function fallbackParaImportedRowCore(
  date: string,
  desc: string,
  amount: number,
  tipo: "receita" | "despesa"
): TransacaoCore {
  const d = desc.trim();
  return {
    data: date,
    descricao: d,
    descricaoOriginal: d,
    documento: null,
    tipo,
    valor: amount,
    origem: "pdf_tabela_generico",
    metadata: { parser: "pdf_tabela_generico" as const },
  };
}

function parseDate(raw: string): string {
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return raw.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function parseMoney(raw: string): number {
  const s = raw.replace(/[R$\s]/g, "").trim();
  if (s.includes(",") && s.includes("."))
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  if (s.includes(",")) return parseFloat(s.replace(",", "."));
  return parseFloat(s) || 0;
}

/** Regex por linha (fallback quando o parser tabular genérico não encontra estrutura reconhecível). */
function parseExtratoPdfLinhasFallback(text: string): ImportedRow[] {
  const rows: ImportedRow[] = [];
  const seen = new Set<string>();

  function push(date: string, desc: string, rawValue: string, forceType?: "receita" | "despesa") {
    const value = parseMoney(rawValue);
    const descLimpa = truncarRodapeDocumentosBr(desc);
    if (!value || !descLimpa.trim() || descLimpa.length < 3) return;
    const amount = Math.abs(value);
    const type: "receita" | "despesa" =
      forceType ?? (value < 0 ? "despesa" : "receita");

    const key = `${date}|${descLimpa.trim().toLowerCase()}|${amount}`;
    if (seen.has(key)) return;
    seen.add(key);

    rows.push(
      transacaoImportadaCoreParaImportedRow(fallbackParaImportedRowCore(date, descLimpa, amount, type))
    );
  }

  const lines = text.split("\n");

  const p1 =
    /(\d{2}\/\d{2}\/\d{4})\s+([A-Za-zÀ-ÿ0-9 *\-_./,'"()&]+?)\s+([-+]?R?\$?\s?[\d.,]{4,})/;

  const currentYear = new Date().getFullYear();
  const p2 = /(\d{2}\/\d{2})\s+([A-Za-zÀ-ÿ0-9 *\-_./,'"()&]{5,60}?)\s+([-+]?[\d.,]{4,})\s*$/;

  const p3 = /(\d{2}\/\d{2}\/\d{4})\s+([A-Za-zÀ-ÿ0-9 *\-_./,'"()&]{5,60}?)\s+([\d.,]+)?\s+([\d.,]+)?/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const m1 = line.match(p1);
    if (m1) {
      push(parseDate(m1[1]), m1[2], m1[3]);
      continue;
    }

    const m2 = line.match(p2);
    if (m2) {
      const [dd, mm] = m2[1].split("/");
      push(`${currentYear}-${mm}-${dd}`, m2[2], m2[3]);
      continue;
    }

    const m3 = line.match(p3);
    if (m3 && (m3[3] || m3[4])) {
      const debit = m3[3] ? parseMoney(m3[3]) : 0;
      const credit = m3[4] ? parseMoney(m3[4]) : 0;
      if (credit > 0) push(parseDate(m3[1]), m3[2], String(credit), "receita");
      else if (debit > 0) push(parseDate(m3[1]), m3[2], String(-debit), "despesa");
    }
  }

  return rows;
}

/**
 * PDF genérico: tenta tabela `(data | descr | opcional doc | valor R$ | saldo R$)`, depois heurística por linha.
 */
export function parseExtratoPdfTabelaGenerico(text: string): ImportedRow[] {
  const tabular = parsePdfTabelaGenerico(text).map(transacaoImportadaCoreParaImportedRow);
  if (tabular.length > 0) return tabular;
  return parseExtratoPdfLinhasFallback(text);
}
