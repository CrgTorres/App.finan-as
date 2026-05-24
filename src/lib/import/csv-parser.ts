import Papa from "papaparse";
import { categorize } from "./categorizer";
import type { ImportedRow } from "./types";
import { parseMoneyBR, parseMoneyCsvCell } from "./parse-money-br";

const MAX_ABS_VALUE = 1_000_000;

function parseDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (/^\d{1,6}$/.test(t) && !/^\d{8}$/.test(t)) return null;

  const br = t.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const compact = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return null;
}

const DATE_ALIASES = [
  "data",
  "date",
  "dt",
  "data lançamento",
  "data lancamento",
  "data do lançamento",
  "data transacao",
  "data transação",
  "posting date",
  "transaction date",
  "data pagamento",
  "data mov",
  "data movimento",
];

const DESC_ALIASES = [
  "descricao",
  "descrição",
  "historico",
  "histórico",
  "memo",
  "description",
  "lancamento",
  "lançamento",
  "estabelecimento",
  "titulo",
  "título",
  "complemento",
  "portador",
  "identificador",
  "transaction description",
  "narration",
  "particulars",
  "beneficiario",
  "beneficiário",
  "favorecido",
];

const AMOUNT_ALIASES = [
  "valor",
  "amount",
  "value",
  "montante",
  "quantia",
  "valor da fatura",
  "valor transacao",
  "valor transação",
  "vlr",
  "vl",
  "total",
];

const DEBIT_ALIASES = [
  "debits",
  "debito",
  "débito",
  "saida",
  "saída",
  "debit",
  "out",
  "valor saída",
  "valor saida",
  "débitos",
  "debitos",
  "pagamentos",
  "despesas",
];

const CREDIT_ALIASES = [
  "credits",
  "credito",
  "crédito",
  "entrada",
  "credit",
  "in",
  "valor entrada",
  "créditos",
  "creditos",
  "recebimentos",
  "receitas",
];

/** Rótulos de linha / célula de agregação — não são lançamentos (nomes de coluna CREDITS/DEBITS não entram aqui). */
const EXCLUDED_SUMMARY_KEYS = new Set([
  "initial_balance",
  "final_balance",
  "balance",
  "saldo",
  "total",
  "subtotal",
  "saldoinicial",
  "saldofinal",
  "saldo_anterior",
  "saldo_atual",
]);

function normalizeBannerKey(h: string): string {
  return (h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function rowIsBalanceSheetHeaderBanner(cells: string[]): boolean {
  const keys = cells.map((c) => normalizeBannerKey(c ?? "")).filter(Boolean);
  if (keys.length < 2) return false;
  const onlyInitialFinalCreditsDebits = keys.every(
    (k) =>
      k === "initial_balance" ||
      k === "final_balance" ||
      k === "credits" ||
      k === "debits"
  );
  return onlyInitialFinalCreditsDebits;
}

function rowContainsExcludedSummaryToken(cells: string[]): boolean {
  for (const c of cells) {
    const k = normalizeBannerKey(c ?? "");
    if (k && EXCLUDED_SUMMARY_KEYS.has(k)) return true;
  }
  return false;
}

function matchCol(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => {
    const norm = h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
    return aliases.some((a) => {
      const normA = a
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, "")
        .trim();
      return norm === normA || norm.includes(normA) || normA.includes(norm);
    });
  });
}

function cellLooksLikeTransactionDate(cell: string | undefined): boolean {
  const t = String(cell ?? "").trim();
  return (
    /\d{2}[\/\-.]\d{2}[\/\-.]\d{4}/.test(t) ||
    /^\d{4}-\d{2}-\d{2}/.test(t) ||
    /^\d{8}$/.test(t)
  );
}

function rowLikelyLooksLikeColumnTitles(cells: string[]): boolean {
  return cells.some((c) => /[a-zA-ZÀ-ÿ]/u.test(String(c ?? "").trim()));
}

type HeaderResolved = {
  headerIdx: number;
  headers: string[];
  dateIdx: number;
  descIdx: number;
  amtIdx: number;
  debitIdx: number;
  creditIdx: number;
};

function resolveTransactionHeader(rows: string[][]): HeaderResolved | null {
  const maxScan = Math.min(rows.length, 120);
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r];
    if (!row?.some((c) => String(c ?? "").trim())) continue;
    const cells = row.map((c) => String(c ?? ""));
    if (!rowLikelyLooksLikeColumnTitles(cells)) continue;
    if (rowIsBalanceSheetHeaderBanner(cells)) continue;

    const headers = cells.map((h) => h.toLowerCase().trim());

    const dateIdx = matchCol(headers, DATE_ALIASES);
    const descIdx = matchCol(headers, DESC_ALIASES);
    const amtIdx = matchCol(headers, AMOUNT_ALIASES);
    const debitIdx = matchCol(headers, DEBIT_ALIASES);
    const creditIdx = matchCol(headers, CREDIT_ALIASES);

    const hasMinCols =
      dateIdx >= 0 &&
      descIdx >= 0 &&
      (amtIdx >= 0 || debitIdx >= 0 || creditIdx >= 0);
    if (!hasMinCols) continue;

    return { headerIdx: r, headers, dateIdx, descIdx, amtIdx, debitIdx, creditIdx };
  }
  return null;
}

function firstPlausibleHeaderRow(rows: string[][]): number {
  const idx = rows.findIndex((row) => {
    const cells = row.map((c) => String(c ?? ""));
    if (!cells.some((c) => c.trim())) return false;
    if (rowIsBalanceSheetHeaderBanner(cells)) return false;
    return rowLikelyLooksLikeColumnTitles(cells);
  });
  return idx >= 0 ? idx : 0;
}

function detectDelimiterFromFirstLine(content: string): string {
  const first = (content.split(/\r?\n/)[0] ?? "").replace(/^\uFEFF/, "");
  return first.includes(";") ? ";" : ",";
}

export type ParseCsvExtratoResult = {
  rows: ImportedRow[];
  skippedOverOneMillion: number;
  warnings: string[];
};

export function parseCSVExtrato(content: string): ParseCsvExtratoResult {
  const warnings: string[] = [];
  let skippedOverOneMillion = 0;

  if (!content.trim()) {
    return { rows: [], skippedOverOneMillion: 0, warnings: [] };
  }

  const delimiter = detectDelimiterFromFirstLine(content);

  const result = Papa.parse<string[]>(content, {
    skipEmptyLines: true,
    header: false,
    delimiter,
  });

  const rows = result.data as string[][];
  if (rows.length < 2) {
    return { rows: [], skippedOverOneMillion: 0, warnings: [] };
  }

  const resolved = resolveTransactionHeader(rows);

  let headerIdx: number;
  let headers: string[];
  let dateIdx: number;
  let descIdx: number;
  let amtIdx: number;
  let debitIdx: number;
  let creditIdx: number;

  if (resolved) {
    ({
      headerIdx,
      headers,
      dateIdx,
      descIdx,
      amtIdx,
      debitIdx,
      creditIdx,
    } = resolved);
  } else {
    headerIdx = firstPlausibleHeaderRow(rows);
    headers = rows[headerIdx]!.map((h) => String(h ?? "").toLowerCase().trim());
    dateIdx = matchCol(headers, DATE_ALIASES);
    descIdx = matchCol(headers, DESC_ALIASES);
    amtIdx = matchCol(headers, AMOUNT_ALIASES);
    debitIdx = matchCol(headers, DEBIT_ALIASES);
    creditIdx = matchCol(headers, CREDIT_ALIASES);
  }

  const hasMinCols =
    dateIdx >= 0 &&
    descIdx >= 0 &&
    (amtIdx >= 0 || debitIdx >= 0 || creditIdx >= 0);

  const isNubankFormat =
    !hasMinCols &&
    headers.length >= 4 &&
    headers.some((h) => h.includes("categor")) &&
    headers.some((h) => h.includes("titulo") || h.includes("título"));

  const imported: ImportedRow[] = [];

  const tryPush = (
    rowI: number,
    date: string,
    description: string,
    amount: number,
    type: "receita" | "despesa"
  ): void => {
    if (amount <= 0 || !description || description.trim().length < 2) return;

    const dkey = normalizeBannerKey(description);
    if (dkey && EXCLUDED_SUMMARY_KEYS.has(dkey)) return;

    if (amount > MAX_ABS_VALUE || !Number.isFinite(amount)) {
      skippedOverOneMillion++;
      return;
    }

    imported.push({
      id: crypto.randomUUID(),
      description: description.trim(),
      amount,
      date,
      type,
      category: categorize(description),
      selected: true,
    });
  };

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !String(c ?? "").trim())) continue;

    const cells = row.map((c) => String(c ?? ""));

    if (rowIsBalanceSheetHeaderBanner(cells)) continue;

    if (rowContainsExcludedSummaryToken(cells)) continue;

    let date = "";
    let description = "";

    const fillDescDate = (): boolean => {
      if (isNubankFormat) {
        date = parseDate(row[0] ?? "") ?? "";
        description = (row[2] ?? row[1] ?? "").trim();
        return Boolean(date && description);
      }
      if (hasMinCols) {
        const dateCell = row[dateIdx] ?? "";
        if (!cellLooksLikeTransactionDate(dateCell)) return false;
        date = parseDate(dateCell) ?? "";
        description = String(row[descIdx] ?? "").trim();
        return Boolean(date && description);
      }
      const d0 = row[0] ?? "";
      if (!cellLooksLikeTransactionDate(d0)) return false;
      date = parseDate(d0) ?? "";
      description = String(row[1] ?? "").trim();
      return Boolean(date && description);
    };

    if (!fillDescDate()) continue;

    if (EXCLUDED_SUMMARY_KEYS.has(normalizeBannerKey(description))) continue;

    if (isNubankFormat) {
      const raw = parseMoneyCsvCell(row[3] ?? "", delimiter);
      const amount = Math.abs(raw);
      const type: "receita" | "despesa" = raw >= 0 ? "despesa" : "receita";
      tryPush(i, date, description, amount, type);
      continue;
    }

    if (hasMinCols) {
      if (amtIdx >= 0) {
        const raw = parseMoneyCsvCell(row[amtIdx] ?? "", delimiter);
        if (raw === 0) continue;
        const amount = Math.abs(raw);
        const type: "receita" | "despesa" = raw > 0 ? "receita" : "despesa";
        tryPush(i, date, description, amount, type);
        continue;
      }

      const hasSplitCreditDebit = creditIdx >= 0 && debitIdx >= 0;

      if (hasSplitCreditDebit) {
        const creditRaw = parseMoneyCsvCell(row[creditIdx] ?? "", delimiter);
        const debitRaw = parseMoneyCsvCell(row[debitIdx] ?? "", delimiter);

        if (creditRaw > 0) {
          tryPush(i, date, description, Math.abs(creditRaw), "receita");
        } else if (debitRaw !== 0) {
          tryPush(i, date, description, Math.abs(debitRaw), "despesa");
        }
        continue;
      }

      if (creditIdx >= 0) {
        const creditRaw = parseMoneyCsvCell(row[creditIdx] ?? "", delimiter);
        if (creditRaw > 0) {
          tryPush(i, date, description, Math.abs(creditRaw), "receita");
        }
        continue;
      }

      if (debitIdx >= 0) {
        const debitRaw = parseMoneyCsvCell(row[debitIdx] ?? "", delimiter);
        if (debitRaw !== 0) {
          tryPush(i, date, description, Math.abs(debitRaw), "despesa");
        }
        continue;
      }

      continue;
    }

    const raw = parseMoneyCsvCell(row[2] ?? "", delimiter);
    if (raw === 0) continue;
    const amount = Math.abs(raw);
    const type: "receita" | "despesa" = raw > 0 ? "receita" : "despesa";
    tryPush(i, date, description, amount, type);
  }

  if (skippedOverOneMillion > 0) {
    warnings.push(
      `${skippedOverOneMillion} linha(s) com valor absoluto acima de ${MAX_ABS_VALUE.toLocaleString("pt-BR")} foram ignoradas (possível erro de leitura de colunas).`
    );
  }

  return { rows: imported, skippedOverOneMillion, warnings };
}

export function parseCSV(content: string): ImportedRow[] {
  return parseCSVExtrato(content).rows;
}

export { parseMoneyBR };
