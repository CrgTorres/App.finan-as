"use client";

import { Wallet, CreditCard, PiggyBank } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ConsigfacilMargem, ConsigfacilTipoMargem } from "@/types/consigfacil";

type MargemKey = Exclude<ConsigfacilTipoMargem, null>;

const ROTULOS: Record<MargemKey, string> = {
  margem_consignavel: "Margem Consignável",
  margem_cartao: "Margem Cartão",
  margem_cartao_beneficio: "Margem Cartão Benefício",
  outra: "Outra margem",
  desconhecida: "Margem (não identificada)",
};

const ICONES: Record<MargemKey, typeof Wallet> = {
  margem_consignavel: Wallet,
  margem_cartao: CreditCard,
  margem_cartao_beneficio: PiggyBank,
  outra: Wallet,
  desconhecida: Wallet,
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

function corPorComprometimento(pct: number): string {
  if (pct >= 80) return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (pct >= 60) return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

export type ConsigfacilMargemCardsProps = {
  margens: ConsigfacilMargem[];
};

export function ConsigfacilMargemCards({ margens }: ConsigfacilMargemCardsProps) {
  // Mostra a margem mais recente por tipo. Filtra modalidades sem margem (null).
  const maisRecentePorTipo = new Map<MargemKey, ConsigfacilMargem & { tipo_margem: MargemKey }>();
  for (const m of margens) {
    if (m.tipo_margem == null) continue;
    const tm = m.tipo_margem;
    const atual = maisRecentePorTipo.get(tm);
    if (!atual || atual.capturado_em < m.capturado_em) {
      maisRecentePorTipo.set(tm, { ...m, tipo_margem: tm });
    }
  }
  const lista = Array.from(maisRecentePorTipo.values());

  if (lista.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Margem consignável (oficial)</CardTitle>
          <CardDescription>Importe um snapshot do ConsigFácil para visualizar.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {lista.map((m) => {
        const Icon = ICONES[m.tipo_margem];
        return (
          <Card key={m.tipo_margem} size="sm">
            <CardContent className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground leading-tight">{ROTULOS[m.tipo_margem]}</p>
                <div className={cn("p-1.5 rounded-md", corPorComprometimento(m.percentual_comprometido))}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className="text-lg font-bold tabular-nums">{brl(m.margem_disponivel)}</p>
              <p className="text-[11px] text-muted-foreground">
                de {brl(m.margem_total)} · usados {m.percentual_comprometido.toFixed(0)}%
              </p>
              <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    m.percentual_comprometido >= 80
                      ? "bg-red-500"
                      : m.percentual_comprometido >= 60
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                  )}
                  style={{ width: `${Math.min(100, m.percentual_comprometido)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Captura: {m.capturado_em.slice(0, 10)} · oficial ConsigFácil
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
