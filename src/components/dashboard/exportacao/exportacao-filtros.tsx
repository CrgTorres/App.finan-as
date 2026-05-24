"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const FILTRO_TODOS = "__todos__";

export type ExportacaoFiltrosState = {
  dataInicio: string;
  dataFim: string;
  banco: string;
  tipo: string;
  risco: string;
  categoria: string;
};

export function criarFiltrosExportacaoVazios(): ExportacaoFiltrosState {
  return {
    dataInicio: "",
    dataFim: "",
    banco: FILTRO_TODOS,
    tipo: FILTRO_TODOS,
    risco: FILTRO_TODOS,
    categoria: FILTRO_TODOS,
  };
}

export function ExportacaoFiltros({
  value,
  onChange,
  bancos,
  tipos,
  riscos,
  categorias,
}: {
  value: ExportacaoFiltrosState;
  onChange: (next: ExportacaoFiltrosState) => void;
  bancos: string[];
  tipos: string[];
  riscos: string[];
  categorias: string[];
}) {
  const set = (patch: Partial<ExportacaoFiltrosState>) => onChange({ ...value, ...patch });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filtros da exportação</CardTitle>
        <CardDescription>
          Os filtros afetam a Base_Normalizada, CSV, JSON e as abas do Excel que dependem de eventos financeiros.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <label className="flex flex-col gap-1 text-xs">
          Período inicial
          <input
            type="date"
            className="h-9 rounded-md border bg-background px-2"
            value={value.dataInicio}
            onChange={(e) => set({ dataInicio: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Período final
          <input
            type="date"
            className="h-9 rounded-md border bg-background px-2"
            value={value.dataFim}
            onChange={(e) => set({ dataFim: e.target.value })}
          />
        </label>
        <SelectFiltro label="Banco" value={value.banco} options={bancos} onChange={(banco) => set({ banco })} />
        <SelectFiltro label="Tipo" value={value.tipo} options={tipos} onChange={(tipo) => set({ tipo })} />
        <SelectFiltro label="Risco" value={value.risco} options={riscos} onChange={(risco) => set({ risco })} />
        <SelectFiltro
          label="Categoria"
          value={value.categoria}
          options={categorias}
          onChange={(categoria) => set({ categoria })}
        />
      </CardContent>
    </Card>
  );
}

function SelectFiltro({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      <select className="h-9 rounded-md border bg-background px-2" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={FILTRO_TODOS}>Todos</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

