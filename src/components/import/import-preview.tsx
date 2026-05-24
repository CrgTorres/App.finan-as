"use client";

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckSquare2, Square, TrendingUp, TrendingDown, Download } from "lucide-react";
import { CATEGORIES, CATEGORY_COLORS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type { ImportedRow } from "@/lib/import/types";
import type { Category } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { persistManualCategoryRule } from "@/lib/transacoes/classification-rules-service";
import { resolverDescricaoVisualExtrato } from "@/lib/transacoes/descricao-visual-extrato";

interface ImportPreviewProps {
  rows: ImportedRow[];
  onRowsChange: (rows: ImportedRow[]) => void;
  onImport: (rows: ImportedRow[]) => Promise<void>;
  loading: boolean;
}

function capitalizarExibicaoExtrato(s: string): string {
  const t = s.normalize("NFC").trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function ImportPreview({ rows, onRowsChange, onImport, loading }: ImportPreviewProps) {
  const selected = rows.filter((r) => r.selected);

  function toggleRow(id: string) {
    onRowsChange(rows.map((r) => r.id === id ? { ...r, selected: !r.selected } : r));
  }

  function toggleAll() {
    const allSelected = rows.every((r) => r.selected);
    onRowsChange(rows.map((r) => ({ ...r, selected: !allSelected })));
  }

  async function changeCategory(id: string, category: Category) {
    const row = rows.find((r) => r.id === id);
    onRowsChange(
      rows.map((r) => (r.id === id ? { ...r, category } : r))
    );
    if (!row) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    void persistManualCategoryRule(supabase, user.id, row.description, category).catch(() => {});
  }

  // Dados do gráfico apenas com selecionadas + tipo despesa
  const despesas = selected.filter((r) => r.type === "despesa");
  const receitas = selected.filter((r) => r.type === "receita");

  const byCat = despesas.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + r.amount;
    return acc;
  }, {});

  const chartData = Object.entries(byCat).map(([cat, total]) => ({
    name: cat,
    value: total,
    color: CATEGORY_COLORS[cat as Category] ?? "#6b7280",
  }));

  const totalDespesas = despesas.reduce((s, r) => s + r.amount, 0);
  const totalReceitas = receitas.reduce((s, r) => s + r.amount, 0);

  /** Somas sobre todas as linhas detectadas (validação crédito/débito). */
  const somaReceitasTodas = rows.filter((r) => r.type === "receita").reduce((s, r) => s + r.amount, 0);
  const somaDespesasTodas = rows.filter((r) => r.type === "despesa").reduce((s, r) => s + r.amount, 0);
  /* Cards principais por linhas selecionadas na prévia */
  const todasMarcadas = rows.every((r) => r.selected);

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total no extrato</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-1">
              {rows.length}{" "}
              <span className="text-sm font-normal text-slate-400">({selected.length} selec.)</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Despesas</p>
            </div>
            <p className="text-2xl font-bold text-red-600 tabular-nums tracking-tight">
              {formatCurrency(totalDespesas)}
            </p>
            {todasMarcadas ? null : (
              <p className="text-[10px] text-slate-400 mt-0.5">
                Extrato inteiro (desp.): {formatCurrency(somaDespesasTodas)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receitas</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600 tabular-nums tracking-tight">
              {formatCurrency(totalReceitas)}
            </p>
            {todasMarcadas ? null : (
              <p className="text-[10px] text-slate-400 mt-0.5">
                Extrato inteiro (rec.): {formatCurrency(somaReceitasTodas)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de rosca por categoria */}
      {chartData.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Despesas por categoria (selecionadas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => [formatCurrency(Number(v)), ""]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-xs text-slate-600 dark:text-slate-400">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabela de preview */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Transações detectadas
          </CardTitle>
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors"
          >
            {todasMarcadas
              ? <CheckSquare2 className="h-4 w-4 text-blue-600" />
              : <Square className="h-4 w-4" />}
            {todasMarcadas ? "Desmarcar todas" : "Selecionar todas"}
          </button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="w-8 px-4 py-2.5"></th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[200px] max-w-[300px]">
                    Descrição
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[150px]">
                    Classificação automática
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Categoria
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const semantic = row.semantic;
                  const vis = semantic
                    ? {
                        tituloPrincipal: capitalizarExibicaoExtrato(semantic.titulo),
                        subtitulo: semantic.subtitulo?.trim() ? semantic.subtitulo : null,
                      }
                    : resolverDescricaoVisualExtrato(row.description, {
                        idOperacao: row.idOperacao,
                      });

                  const subLinha = semantic
                    ? vis.subtitulo
                    : [vis.subtitulo, row.category].filter(Boolean).join(" · ");

                  return (
                  <tr
                    key={row.id}
                    onClick={() => toggleRow(row.id)}
                    className={`border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors ${
                      row.selected
                        ? "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        : "opacity-40 hover:opacity-60 bg-slate-50/50 dark:bg-slate-900/40"
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {row.selected
                        ? <CheckSquare2 className="h-4 w-4 text-blue-600" />
                        : <Square className="h-4 w-4 text-slate-300" />}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">
                      {formatDate(row.date)}
                    </td>
                    <td
                      className="px-3 py-2.5 align-top min-w-[200px] max-w-[320px]"
                      title={row.description}
                    >
                      <div className="font-medium text-slate-800 dark:text-slate-200 leading-snug">
                        {vis.tituloPrincipal}
                      </div>
                      {subLinha ? (
                        <div className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                          {subLinha}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 align-top min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                      {semantic ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="text-[11px] font-medium border-slate-200 dark:border-slate-600"
                              style={{
                                borderColor:
                                  CATEGORY_COLORS[semantic.categoriaSugerida] ?? "#94a3b8",
                                color:
                                  CATEGORY_COLORS[semantic.categoriaSugerida] ?? undefined,
                              }}
                            >
                              {semantic.categoriaSugerida}
                            </Badge>
                            <span className="text-[11px] tabular-nums font-medium text-slate-600 dark:text-slate-400">
                              {semantic.score}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {semantic.motivo}
                          </p>
                          {semantic.precisaAprendizado ? (
                            <p className="text-[10px] text-amber-700 dark:text-amber-500/90">
                              Pode beneficiar de uma correção sua — será memorizada.
                            </p>
                          ) : null}
                          {row.category !== semantic.categoriaSugerida ? (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              Categoria aplicada na importação: {row.category}.
                            </p>
                          ) : null}
                          {row.autoClass?.motivo?.includes("Regra") ? (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-snug">
                              {row.autoClass.motivo}
                            </p>
                          ) : null}
                        </div>
                      ) : row.autoClass ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="text-[11px] font-medium border-slate-200 dark:border-slate-600"
                              style={{
                                borderColor: CATEGORY_COLORS[row.autoClass.categoriaSugerida] ?? "#94a3b8",
                                color: CATEGORY_COLORS[row.autoClass.categoriaSugerida] ?? undefined,
                              }}
                            >
                              {row.autoClass.categoriaSugerida}
                            </Badge>
                            <span className="text-[11px] tabular-nums font-medium text-slate-600 dark:text-slate-400">
                              {row.autoClass.confianca}%
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                            {row.autoClass.motivo}
                          </p>
                          {row.category !== row.autoClass.categoriaSugerida ? (
                            <p className="text-[10px] text-amber-700 dark:text-amber-500/90">
                              Você alterou a categoria aplicada na importação.
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={row.category}
                        onValueChange={(v) => changeCategory(row.id, v as Category)}
                      >
                        <SelectTrigger className="h-7 text-xs w-36 border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat} className="text-xs">
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          row.type === "receita"
                            ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                            : "border-red-200 text-red-700 bg-red-50"
                        }`}
                      >
                        {row.type === "receita" ? "Receita" : "Despesa"}
                      </Badge>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                      row.type === "receita" ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {row.type === "despesa" ? "- " : "+ "}
                      {formatCurrency(row.amount)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Botão de importar */}
      <div className="flex justify-end">
        <Button
          onClick={() => onImport(selected)}
          disabled={selected.length === 0 || loading}
          className="gap-2 px-6"
        >
          <Download className="h-4 w-4" />
          {loading
            ? "Importando..."
            : `Importar ${selected.length} transaç${selected.length === 1 ? "ão" : "ões"}`}
        </Button>
      </div>
    </div>
  );
}
