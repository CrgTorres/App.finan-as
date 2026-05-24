"use client";

import { History } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { HistoricoContratoEvento } from "@/lib/consignacoes-governo/historico-contrato-eventos";

type Props = { eventos: HistoricoContratoEvento[] };

export function ConsignacoesHistoricoEventos({ eventos }: Props) {
  if (eventos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Histórico de eventos
          </CardTitle>
          <CardDescription>Importe snapshots ConsigFácil para reconstruir o histórico.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const recentes = [...eventos].reverse().slice(0, 30);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" /> Histórico de eventos
        </CardTitle>
        <CardDescription>
          {eventos.length} evento(s) — criado, importado, confirmado, refinanciado, suspenso, divergência…
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 max-h-80 overflow-auto text-[11px]">
          {recentes.map((e, i) => (
            <li key={`${e.contrato_id}-${e.data}-${i}`} className="rounded border p-2 flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] shrink-0">
                {e.data}
              </Badge>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {e.tipo_evento}
              </Badge>
              <span className="font-medium">{e.instituicao_oficial}</span>
              <span className="text-muted-foreground flex-1">{e.descricao}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
