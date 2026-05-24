"use client";

import { useMemo } from "react";
import { CalendarRange, ShieldCheck, RefreshCw, CreditCard, Ban } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConsignacaoOrdenadaLinha } from "@/lib/consignacoes-governo/consolidar-consignacoes-ordenadas";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

const CORES_GRUPO: Record<string, string> = {
  emprestimo_consignado: "bg-blue-500",
  cartao_beneficio: "bg-indigo-500",
  cartao_credito: "bg-purple-500",
  contribuicao: "bg-slate-500",
  seguros: "bg-rose-500",
  refinanciamentos: "bg-violet-600",
  saque_complementar: "bg-orange-500",
  rmc: "bg-red-500",
  rcc: "bg-red-600",
  outros: "bg-gray-400",
};

function competenciaParaIndice(c: string, base: string): number {
  // c = "yyyy-mm". Devolve número de meses desde `base`.
  const [ya, ma] = c.split("-").map(Number);
  const [yb, mb] = base.split("-").map(Number);
  return (ya - yb) * 12 + (ma - mb);
}

function formatarCompetenciaBr(c: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(c);
  if (!m) return c;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

type Props = { linhas: ConsignacaoOrdenadaLinha[] };

/**
 * Timeline horizontal — cada linha = uma consignação, com barra colorida
 * cobrindo do `primeiro_desconto` até o `ultimo_desconto`.
 *
 * Não usa biblioteca de gráfico — é puro HTML/Tailwind para evitar engasgar
 * o Recharts com séries esparsas.
 */
export function ConsignacoesLinhaDoTempo({ linhas }: Props) {
  const comTimeline = useMemo(
    () => linhas.filter((l) => l.primeiro_desconto != null),
    [linhas],
  );

  const { minComp, maxComp, totalMeses } = useMemo(() => {
    if (comTimeline.length === 0) {
      return { minComp: "", maxComp: "", totalMeses: 0 };
    }
    let mn = comTimeline[0].primeiro_desconto as string;
    let mx = comTimeline[0].ultimo_desconto ?? mn;
    for (const l of comTimeline) {
      if (l.primeiro_desconto && l.primeiro_desconto < mn) mn = l.primeiro_desconto;
      const u = l.ultimo_desconto ?? l.primeiro_desconto ?? mn;
      if (u > mx) mx = u;
    }
    const t = competenciaParaIndice(mx, mn) + 1;
    return { minComp: mn, maxComp: mx, totalMeses: Math.max(1, t) };
  }, [comTimeline]);

  if (comTimeline.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" /> Linha do tempo de consignações
          </CardTitle>
          <CardDescription>
            Importe contracheques/extratos com descontos ou snapshots ConsigFácil para visualizar.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Régua de marcações (mostra ~6 marcadores no eixo)
  const marcadores = (() => {
    const n = Math.min(6, totalMeses);
    const passos: string[] = [];
    for (let i = 0; i < n; i++) {
      const offset = Math.round((i * (totalMeses - 1)) / Math.max(1, n - 1));
      const [y, m] = minComp.split("-").map(Number);
      const idxMes = m - 1 + offset;
      const ano = y + Math.floor(idxMes / 12);
      const mes = (idxMes % 12) + 1;
      passos.push(`${ano}-${String(mes).padStart(2, "0")}`);
    }
    return Array.from(new Set(passos));
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4" /> Linha do tempo de consignações
        </CardTitle>
        <CardDescription>
          {comTimeline.length} consignação(ões) entre {formatarCompetenciaBr(minComp)} e{" "}
          {formatarCompetenciaBr(maxComp)}. Cores = grupo canônico.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 max-h-96 overflow-auto">
          {/* Régua superior */}
          <div className="flex text-[10px] text-muted-foreground pl-[14rem] pr-2">
            {marcadores.map((m) => (
              <div key={m} className="flex-1 text-center tabular-nums">
                {formatarCompetenciaBr(m)}
              </div>
            ))}
          </div>
          {comTimeline.map((l) => {
            const inicio = competenciaParaIndice(l.primeiro_desconto as string, minComp);
            const fim = competenciaParaIndice(l.ultimo_desconto ?? (l.primeiro_desconto as string), minComp);
            const left = (inicio / totalMeses) * 100;
            const width = Math.max(2, ((fim - inicio + 1) / totalMeses) * 100);
            return (
              <div
                key={l.id}
                className="grid items-center gap-2 text-[11px]"
                style={{ gridTemplateColumns: "14rem 1fr 6rem" }}
              >
                <div className="truncate" title={l.instituicao_oficial}>
                  <span className="font-medium">{l.instituicao_oficial}</span>{" "}
                  <span className="text-muted-foreground">· {l.grupo_canonico}</span>
                </div>
                <div className="relative h-5 bg-muted/40 rounded">
                  <div
                    className={cn(
                      "absolute top-0 bottom-0 rounded flex items-center justify-center gap-0.5 px-1",
                      CORES_GRUPO[l.grupo_canonico] ?? "bg-gray-400",
                      l.status_oficial === "suspenso" && "opacity-60 ring-2 ring-red-400",
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${l.primeiro_desconto} → ${l.ultimo_desconto ?? l.primeiro_desconto}`}
                  >
                    {l.eh_refinanciamento && (
                      <RefreshCw className="h-2.5 w-2.5 text-white" />
                    )}
                    {l.eh_cartao_beneficio && (
                      <CreditCard className="h-2.5 w-2.5 text-white" />
                    )}
                    {l.status_oficial === "suspenso" && <Ban className="h-2.5 w-2.5 text-white" />}
                    {l.confirmado_consigfacil && <ShieldCheck className="h-2.5 w-2.5 text-white" />}
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  {brl(l.valor_parcela_oficial)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t">
          {Object.entries(CORES_GRUPO)
            .filter(([g]) => comTimeline.some((l) => l.grupo_canonico === g))
            .map(([g, cor]) => (
              <Badge key={g} variant="outline" className="text-[10px] gap-1">
                <span className={cn("inline-block h-2 w-2 rounded-sm", cor)} />
                {g}
              </Badge>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
