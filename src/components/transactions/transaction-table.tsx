"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { CATEGORY_COLORS } from "@/lib/constants";
import { TransactionForm } from "./transaction-form";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { toast } from "sonner";

interface TransactionTableProps {
  transactions: Transaction[];
  onRefresh: () => void;
}

export function TransactionTable({
  transactions,
  onRefresh,
}: TransactionTableProps) {
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao excluir transação.");
      return;
    }

    toast.success("Transação excluída.");
    onRefresh();
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <p className="text-lg font-medium">Nenhuma transação encontrada</p>
        <p className="text-sm mt-1">Adicione sua primeira transação acima</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Descrição</TableHead>
              <TableHead className="hidden sm:table-cell">Data</TableHead>
              <TableHead className="hidden md:table-cell">Categoria</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.id} className="hover:bg-slate-50/50">
                <TableCell className="font-medium text-slate-800">
                  {t.description}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-slate-500 text-sm">
                  {formatDate(t.date)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: CATEGORY_COLORS[t.category] }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[t.category] }}
                    />
                    {t.category}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      t.type === "receita"
                        ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                        : "border-red-200 text-red-700 bg-red-50"
                    }
                  >
                    {t.type === "receita" ? "Receita" : "Despesa"}
                  </Badge>
                </TableCell>
                <TableCell
                  className={`text-right font-semibold tabular-nums ${
                    t.type === "receita" ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {t.type === "despesa" ? "- " : "+ "}
                  {formatCurrency(t.amount)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100 transition-colors">
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setEditingTransaction(t)}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editingTransaction && (
        <TransactionForm
          open={!!editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSuccess={onRefresh}
          transaction={editingTransaction}
        />
      )}
    </>
  );
}
