"use client";

import { CATEGORIES, MONTHS } from "@/lib/constants";
import type { TransactionFilters } from "@/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

interface TransactionFiltersProps {
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 14 }, (_, i) => currentYear - 8 + i);

export function TransactionFiltersBar({
  filters,
  onChange,
}: TransactionFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar por descrição..."
          value={filters.search ?? ""}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-9"
        />
      </div>

      <Select
        value={filters.month?.toString() ?? "all"}
        onValueChange={(v) =>
          onChange({ ...filters, month: !v || v === "all" ? undefined : parseInt(v) })
        }
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Mês" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todo o ano (jan–dez)</SelectItem>
          {MONTHS.map((m, i) => (
            <SelectItem key={i} value={(i + 1).toString()}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.year?.toString() ?? "all"}
        onValueChange={(v) =>
          onChange({ ...filters, year: !v || v === "all" ? undefined : parseInt(v) })
        }
      >
        <SelectTrigger className="w-full sm:w-32">
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {years.map((y) => (
            <SelectItem key={y} value={y.toString()}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.category ?? "all"}
        onValueChange={(v) =>
          onChange({
            ...filters,
            category: !v || v === "all" ? undefined : (v as TransactionFilters["category"]),
          })
        }
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as categorias</SelectItem>
          {CATEGORIES.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
