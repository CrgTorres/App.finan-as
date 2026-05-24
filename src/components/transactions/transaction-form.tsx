"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/constants";
import type { Transaction, TransactionFormData } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import { persistManualCategoryRule } from "@/lib/transacoes/classification-rules-service";

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transaction?: Transaction;
}

const defaultForm: TransactionFormData = {
  description: "",
  amount: 0,
  date: new Date().toISOString().split("T")[0],
  type: "despesa",
  category: "Outros",
};

function formatAmountDisplay(value: number): string {
  if (!value) return "";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function TransactionForm({
  open,
  onClose,
  onSuccess,
  transaction,
}: TransactionFormProps) {
  const [form, setForm] = useState<TransactionFormData>(
    transaction
      ? {
          description: transaction.description,
          amount: transaction.amount,
          date: transaction.date,
          type: transaction.type,
          category: transaction.category,
        }
      : defaultForm
  );
  const [amountDisplay, setAmountDisplay] = useState<string>(
    transaction ? formatAmountDisplay(transaction.amount) : ""
  );
  const [loading, setLoading] = useState(false);

  function updateField<K extends keyof TransactionFormData>(
    key: K,
    value: TransactionFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) {
      setAmountDisplay("");
      updateField("amount", 0);
      return;
    }
    const cents = parseInt(digits, 10);
    const value = cents / 100;
    const formatted = value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    setAmountDisplay(formatted);
    updateField("amount", value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) {
      toast.error("Informe uma descrição.");
      return;
    }
    if (!form.amount || form.amount <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Sessão expirada. Faça login novamente.");
      setLoading(false);
      return;
    }

    const basePayload = {
      ...form,
      description: form.description.charAt(0).toUpperCase() + form.description.slice(1),
      user_id: user.id,
    };

    const { error } = transaction
      ? await supabase
          .from("transactions")
          .update(basePayload)
          .eq("id", transaction.id)
      : await supabase.from("transactions").insert({
          ...basePayload,
          source_ref: null,
          source_imported_at: new Date().toISOString(),
        });

    if (error) {
      toast.error("Erro ao salvar transação.");
      setLoading(false);
      return;
    }

    if (transaction && transaction.category !== form.category) {
      void persistManualCategoryRule(
        supabase,
        user.id,
        basePayload.description,
        form.category
      ).catch(() => {});
    }

    toast.success(
      transaction ? "Transação atualizada!" : "Transação adicionada!"
    );
    emitDashboardDataUpdated({ origin: "transacao_manual" });
    onSuccess();
    onClose();
    if (!transaction) {
      setForm(defaultForm);
      setAmountDisplay("");
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {transaction ? "Editar transação" : "Nova transação"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => updateField("type", "receita")}
              className={`py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${
                form.type === "receita"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                  : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              Receita
            </button>
            <button
              type="button"
              onClick={() => updateField("type", "despesa")}
              className={`py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${
                form.type === "despesa"
                  ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                  : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              Despesa
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              placeholder="Ex: Aluguel, Supermercado..."
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Valor (R$)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500 dark:text-slate-400 pointer-events-none">
                R$
              </span>
              <Input
                id="amount"
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={amountDisplay}
                onChange={handleAmountChange}
                className="pl-9 tabular-nums"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <Input
              id="date"
              type="date"
              value={form.date}
              onChange={(e) => updateField("date", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select
              value={form.category}
              onValueChange={(v) =>
                updateField("category", v as TransactionFormData["category"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
