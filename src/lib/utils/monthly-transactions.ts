import type { Transaction } from "@/types";
import type { MonthlyComparisonRow } from "@/components/dashboard/monthly-comparison-chart";

const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function parseTransactionDate(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD (ou com /)
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return new Date(y, m - 1, d, 12, 0, 0);
    }
  }

  // BR legado: DD/MM/YYYY (ou -)
  const br = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]);
    const y = Number(br[3]);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return new Date(y, m - 1, d, 12, 0, 0);
    }
  }

  const fallback = new Date(s);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

/**
 * Agrega receitas e despesas por mês civil, preenchendo meses vazios no intervalo.
 * `from` e `to` inclusive (primeiro dia de cada mês como Date).
 */
export function aggregateTransactionsByMonth(
  transactions: Transaction[],
  from: Date,
  to: Date
): MonthlyComparisonRow[] {
  const map = new Map<string, { receitas: number; despesas: number; y: number; m: number }>();

  const fromYM = from.getFullYear() * 12 + from.getMonth();
  const toYM = to.getFullYear() * 12 + to.getMonth();

  for (const t of transactions) {
    const d = parseTransactionDate(String(t.date));
    if (!d) continue;
    const ty = d.getFullYear() * 12 + d.getMonth();
    if (ty < fromYM || ty > toYM) continue;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, { receitas: 0, despesas: 0, y, m });
    const row = map.get(key)!;
    if (t.type === "receita") row.receitas += t.amount;
    else row.despesas += t.amount;
  }

  const rows: MonthlyComparisonRow[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const agg = map.get(key) ?? { receitas: 0, despesas: 0, y, m };
    rows.push({
      key,
      label: `${MONTH_SHORT[m - 1]}/${String(y).slice(-2)}`,
      receitas: agg.receitas,
      despesas: agg.despesas,
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  return rows;
}
