"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import type { Transaction, TransactionFilters } from "@/types";
import { exportToCSV } from "@/lib/utils/csv";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { TransactionFiltersBar } from "@/components/transactions/transaction-filters";
import { Button } from "@/components/ui/button";
import { Plus, Download, Loader2 } from "lucide-react";

const now = new Date();
const defaultFilters: TransactionFilters = {
  month: now.getMonth() + 1,
  year: now.getFullYear(),
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [dataRefreshTick, setDataRefreshTick] = useState(0);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false });

    if (
      filters.year != null &&
      filters.month != null &&
      filters.month >= 1 &&
      filters.month <= 12
    ) {
      const start = `${filters.year}-${String(filters.month).padStart(2, "0")}-01`;
      const end = new Date(filters.year, filters.month, 0);
      const endStr = `${filters.year}-${String(filters.month).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
      query = query.gte("date", start).lte("date", endStr);
    } else if (filters.year) {
      query = query
        .gte("date", `${filters.year}-01-01`)
        .lte("date", `${filters.year}-12-31`);
    }

    if (filters.category && filters.category !== "all") {
      query = query.eq("category", filters.category);
    }

    if (filters.search) {
      query = query.ilike("description", `%${filters.search}%`);
    }

    const { data } = await query;
    setTransactions((data as Transaction[]) ?? []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions, dataRefreshTick]);

  useEffect(() => {
    const onDataUpdated = () => setDataRefreshTick((n) => n + 1);
    window.addEventListener(DASHBOARD_DATA_UPDATED, onDataUpdated);
    return () => window.removeEventListener(DASHBOARD_DATA_UPDATED, onDataUpdated);
  }, []);

  function handleExportCSV() {
    const filename = `transacoes-${filters.year ?? "todas"}-${filters.month ? String(filters.month).padStart(2, "0") : "todos"}`;
    exportToCSV(transactions, filename);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Transações</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {transactions.length} transação(ões) encontrada(s)
            {filters.year != null &&
            (filters.month === undefined || filters.month < 1 || filters.month > 12)
              ? ` · período: todo o ano ${filters.year}`
              : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={transactions.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova transação
          </Button>
        </div>
      </div>

      <TransactionFiltersBar filters={filters} onChange={setFilters} />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <TransactionTable
          transactions={transactions}
          onRefresh={fetchTransactions}
        />
      )}

      <TransactionForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={fetchTransactions}
      />
    </div>
  );
}
