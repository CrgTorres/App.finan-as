"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types";
import { cn } from "@/lib/utils";
import {
  transactionSourceLabelFromTransaction,
  transactionSourceTitle,
} from "@/lib/utils/transaction-source";
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
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import { resolverDescricaoVisualExtrato } from "@/lib/transacoes/descricao-visual-extrato";

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

  const rootRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);

  const [scrollTrackWidth, setScrollTrackWidth] = useState(0);
  const [needsHScroll, setNeedsHScroll] = useState(false);
  const [tableInView, setTableInView] = useState(true);
  const [mirrorLayout, setMirrorLayout] = useState({ left: 0, width: 0 });

  const updateMirrorMetrics = useCallback(() => {
    const sc = scrollElRef.current;
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    setMirrorLayout({ left: r.left, width: r.width });
    setScrollTrackWidth(sc.scrollWidth);
    setNeedsHScroll(sc.scrollWidth > sc.clientWidth + 1);
  }, []);

  const syncMirrorFromTable = useCallback(() => {
    const sc = scrollElRef.current;
    const m = mirrorRef.current;
    if (!sc || !m) return;
    if (m.scrollLeft !== sc.scrollLeft) m.scrollLeft = sc.scrollLeft;
  }, []);

  const onMirrorScroll = useCallback(() => {
    const sc = scrollElRef.current;
    const m = mirrorRef.current;
    if (!sc || !m) return;
    if (sc.scrollLeft !== m.scrollLeft) sc.scrollLeft = m.scrollLeft;
  }, []);

  useEffect(() => {
    if (transactions.length === 0) return;

    const root = rootRef.current;
    if (!root) return;

    const scrollEl = root.querySelector<HTMLElement>(
      '[data-slot="table-container"]'
    );
    if (!scrollEl) return;

    scrollElRef.current = scrollEl;

    const table = scrollEl.querySelector("table");

    updateMirrorMetrics();

    const ro = new ResizeObserver(() => updateMirrorMetrics());
    ro.observe(scrollEl);
    if (table) ro.observe(table);

    scrollEl.addEventListener("scroll", syncMirrorFromTable, { passive: true });
    window.addEventListener("resize", updateMirrorMetrics);
    document.addEventListener("scroll", updateMirrorMetrics, true);

    const io = new IntersectionObserver(([e]) => setTableInView(e.isIntersecting), {
      threshold: 0,
      rootMargin: "48px",
    });
    io.observe(scrollEl);

    return () => {
      ro.disconnect();
      scrollEl.removeEventListener("scroll", syncMirrorFromTable);
      window.removeEventListener("resize", updateMirrorMetrics);
      document.removeEventListener("scroll", updateMirrorMetrics, true);
      io.disconnect();
      scrollElRef.current = null;
    };
  }, [transactions, updateMirrorMetrics, syncMirrorFromTable]);

  useEffect(() => {
    if (!needsHScroll || !tableInView) return;
    const id = requestAnimationFrame(() => syncMirrorFromTable());
    return () => cancelAnimationFrame(id);
  }, [needsHScroll, tableInView, scrollTrackWidth, syncMirrorFromTable]);

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
    emitDashboardDataUpdated({ origin: "transacao_delete" });
    onRefresh();
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
        <p className="text-lg font-medium">Nenhuma transação encontrada</p>
        <p className="text-sm mt-1">Adicione sua primeira transação acima</p>
      </div>
    );
  }

  const showSyncedBar =
    needsHScroll && tableInView && mirrorLayout.width > 0;

  return (
    <>
      {showSyncedBar && (
        <div
          ref={mirrorRef}
          className={cn(
            "fixed z-40 overflow-x-auto overflow-y-hidden border-t border-slate-200 dark:border-slate-700",
            "bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-[0_-4px_14px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_14px_rgba(0,0,0,0.35)]",
            "max-md:bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-0"
          )}
          style={{
            left: mirrorLayout.left,
            width: mirrorLayout.width,
            height: 17,
          }}
          onScroll={onMirrorScroll}
        >
          <div
            className="h-px pointer-events-none shrink-0"
            style={{ width: scrollTrackWidth }}
            aria-hidden
          />
        </div>
      )}
      <div
        ref={rootRef}
        className={cn(showSyncedBar && "transaction-table-hide-inner-x-scrollbar")}
      >
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Descrição</TableHead>
              <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Data</TableHead>
              <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Categoria</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tipo</TableHead>
              <TableHead className="hidden lg:table-cell text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 max-w-[7rem]">
                Origem
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Valor</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => {
              const vis = resolverDescricaoVisualExtrato(t.description);
              const descSub = [vis.subtitulo, t.category]
                .filter(Boolean)
                .join(" · ");

              return (
              <TableRow
                key={t.id}
                className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <TableCell className="font-semibold text-slate-900 dark:text-slate-100 text-[15px]" title={t.description}>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="truncate">{vis.tituloPrincipal}</span>
                    {descSub ? (
                      <span className="truncate text-[12px] font-normal text-slate-500 dark:text-slate-400">
                        {descSub}
                      </span>
                    ) : null}
                    <span className="lg:hidden text-[10px] font-normal text-slate-400 dark:text-slate-500 truncate" title={transactionSourceTitle(t)}>
                      {transactionSourceLabelFromTransaction(t)}
                      {t.source_ref?.trim() ? ` · ${t.source_ref}` : ""}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-slate-500 dark:text-slate-400 text-sm">
                  {formatDate(t.date)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <span
                    className="inline-flex items-center gap-1.5 text-sm font-medium"
                    style={{ color: CATEGORY_COLORS[t.category] }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
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
                        ? "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 text-sm px-2.5 py-0.5"
                        : "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 text-sm px-2.5 py-0.5"
                    }
                  >
                    {t.type === "receita" ? "Receita" : "Despesa"}
                  </Badge>
                </TableCell>
                <TableCell
                  className="hidden lg:table-cell align-top text-xs text-slate-500 dark:text-slate-400 max-w-[9rem]"
                  title={transactionSourceTitle(t)}
                >
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <Badge variant="secondary" className="w-fit shrink-0 font-medium text-[10px] px-1.5 py-0">
                      {transactionSourceLabelFromTransaction(t)}
                    </Badge>
                    {(t.source_ref ?? "").trim() ? (
                      <span className="truncate text-[10px] opacity-90">{t.source_ref}</span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell
                  className={`text-right font-bold tabular-nums text-[15px] ${
                    t.type === "receita"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {t.type === "despesa" ? "- " : "+ "}
                  {formatCurrency(t.amount)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                      <DropdownMenuItem
                        className="text-slate-700 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700 cursor-pointer"
                        onClick={() => setEditingTransaction(t)}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/40 cursor-pointer"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
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
