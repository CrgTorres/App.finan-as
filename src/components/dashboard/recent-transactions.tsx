import type { Transaction } from "@/types";
import {
  inferTransactionSource,
  transactionSourceLabelFromTransaction,
} from "@/lib/utils/transaction-source";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { CATEGORY_COLORS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface RecentTransactionsProps {
  transactions: Transaction[];
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  return (
    <Card className="border-0 shadow-sm dark:bg-slate-900 dark:border dark:border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Últimas transações
        </CardTitle>
        <Link
          href="/dashboard/transactions"
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Ver todas
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">
            Nenhuma transação neste período
          </p>
        ) : (
          transactions.slice(0, 5).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[t.category] }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {t.description.charAt(0).toUpperCase() + t.description.slice(1)}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {t.category} · {formatDate(t.date)}
                    {inferTransactionSource(t) !== "manual"
                      ? ` · ${transactionSourceLabelFromTransaction(t)}`
                      : ""}
                  </p>
                </div>
              </div>
              <span
                className={`text-sm font-semibold tabular-nums shrink-0 ml-4 ${
                  t.type === "receita"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {t.type === "despesa" ? "- " : "+ "}
                {formatCurrency(t.amount)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
