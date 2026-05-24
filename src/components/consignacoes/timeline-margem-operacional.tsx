"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  EventoMargemHistorica,
  TipoEventoMargemHistorica,
} from "@/lib/consignacoes-governo/calcular-margem-historica-avancada";
import { cn } from "@/lib/utils";

const ROTULO_TIPO: Record<TipoEventoMargemHistorica, string> = {
  entrada_banco: "Entrada",
  saida_banco: "Saída",
  refinanciamento: "Refin",
  quebra_sequencia: "Quebra",
  desconto_fracionado: "Fracionado",
  cartao_consignado: "Cartão",
  cartao_beneficio: "Benefício",
  sufocamento: "Sufocamento",
  recuperacao: "Recuperação",
};

const COR_SEVERIDADE: Record<string, string> = {
  baixa: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  media: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  alta: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  critica: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

function formatarComp(c: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(c);
  if (!m) return c;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1]}/${m[1]}`;
}

type Props = {
  eventos: EventoMargemHistorica[];
  pageSize?: number;
};

export function TimelineMargemOperacional({ eventos, pageSize = 40 }: Props) {
  const deferred = useDeferredValue(eventos);
  const [pagina, setPagina] = useState(0);
  const [filtro, setFiltro] = useState<TipoEventoMargemHistorica | "todos">("todos");

  const ordenados = useMemo(() => {
    const list = [...deferred].sort((a, b) => b.competencia.localeCompare(a.competencia));
    if (filtro === "todos") return list;
    return list.filter((e) => e.tipo === filtro);
  }, [deferred, filtro]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / pageSize));
  const slice = ordenados.slice(pagina * pageSize, (pagina + 1) * pageSize);

  const tiposPresentes = useMemo(() => {
    const s = new Set<TipoEventoMargemHistorica>();
    for (const e of deferred) s.add(e.tipo);
    return [...s];
  }, [deferred]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Timeline operacional de margem</CardTitle>
        <CardDescription>
          Entradas, refinanciamentos, quebras, cartões, sufocamento e recuperações — prioridade estrutural.
        </CardDescription>
        <div className="flex flex-wrap gap-1 pt-2">
          <button
            type="button"
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border",
              filtro === "todos" && "bg-primary text-primary-foreground",
            )}
            onClick={() => {
              setFiltro("todos");
              setPagina(0);
            }}
          >
            Todos ({deferred.length})
          </button>
          {tiposPresentes.map((t) => (
            <button
              key={t}
              type="button"
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border",
                filtro === t && "bg-primary text-primary-foreground",
              )}
              onClick={() => {
                setFiltro(t);
                setPagina(0);
              }}
            >
              {ROTULO_TIPO[t]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
        {slice.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento na seleção.</p>
        ) : (
          <ul className="space-y-2 border-l-2 border-muted ml-2 pl-3">
            {slice.map((e, i) => (
              <li key={`${e.competencia}-${e.tipo}-${i}`} className="relative">
                <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium tabular-nums">{formatarComp(e.competencia)}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {ROTULO_TIPO[e.tipo]}
                  </Badge>
                  <span className={cn("text-[10px] px-1.5 py-0 rounded", COR_SEVERIDADE[e.severidade])}>
                    {e.severidade}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{e.descricao}</p>
                {(e.banco || e.contrato) && (
                  <p className="text-[10px] text-muted-foreground/80">
                    {[e.banco, e.contrato].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs">
            <button
              type="button"
              className="underline disabled:opacity-40"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </button>
            <span className="text-muted-foreground">
              {pagina + 1} / {totalPaginas}
            </span>
            <button
              type="button"
              className="underline disabled:opacity-40"
              disabled={pagina >= totalPaginas - 1}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
