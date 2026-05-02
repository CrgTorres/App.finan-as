import type { Transaction } from "@/types";
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
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-slate-500">
          Últimas transações
        </CardTitle>
        <Link
          href="/dashboard/transactions"
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          Ver todas
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            Nenhuma transação neste período
          </p>
        ) : (
          transactions.slice(0, 5).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[t.category] }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {t.description}
                  </p>
                  <p className="text-xs text-slate-400">
                    {t.category} · {formatDate(t.date)}
                  </p>
                </div>
              </div>
              <span
                className={`text-sm font-semibold tabular-nums shrink-0 ml-4 ${
                  t.type === "receita" ? "text-emerald-600" : "text-red-600"
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
