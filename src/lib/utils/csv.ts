import type { Transaction } from "@/types";
import { formatDate } from "./format";

export function exportToCSV(transactions: Transaction[], filename: string) {
  const headers = ["Descrição", "Valor", "Data", "Tipo", "Categoria"];

  const rows = transactions.map((t) => [
    `"${t.description.replace(/"/g, '""')}"`,
    t.amount.toFixed(2).replace(".", ","),
    formatDate(t.date),
    t.type === "receita" ? "Receita" : "Despesa",
    t.category,
  ]);

  const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
