"use client";

import { Scale } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RiscoRefinForcado } from "@/lib/juridico/detectar-risco-refin-forcado";
import { CLASSE_COR } from "./eventos-operacionais-shared";

const NIVEL_VARIANT: Record<
  RiscoRefinForcado["nivel"],
  "destructive" | "default" | "secondary" | "outline"
> = {
  critico: "destructive",
  alto: "destructive",
  medio: "secondary",
  baixo: "outline",
};

type Props = {
  riscos: RiscoRefinForcado[];
};

export function RiscoRefinForcadoPainel({ riscos }: Props) {
  if (riscos.length === 0) {
    return (
      <Card className="border-violet-300/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4" /> Risco de refinanciamento induzido
          </CardTitle>
          <CardDescription>
            Exibe padrões médio, alto e crítico — aba{" "}
            <code className="text-[10px]">Risco_Refin_Forcado</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhum padrão de refinanciamento induzido em nível médio ou superior no recorte
            atual.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-violet-400/50 ${CLASSE_COR.roxo}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" /> Risco de refinanciamento induzido
        </CardTitle>
        <CardDescription>
          Sequência típica: suspensão → inadimplência → quebra → novo contrato → parcela
          menor. Dados alinhados à exportação{" "}
          <code className="text-[10px]">Risco_Refin_Forcado</code> ({riscos.length}{" "}
          registro(s)).
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px]">Banco</TableHead>
              <TableHead className="text-[10px]">Contrato original</TableHead>
              <TableHead className="text-[10px]">Contrato novo</TableHead>
              <TableHead className="text-[10px]">Sequência</TableHead>
              <TableHead className="text-[10px] text-right">Score</TableHead>
              <TableHead className="text-[10px]">Nível</TableHead>
              <TableHead className="text-[10px] min-w-[200px]">Recomendação</TableHead>
              <TableHead className="text-[10px] min-w-[180px]">Evidências</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {riscos.map((r, i) => (
              <TableRow key={`${r.contrato_origem}-${r.contrato_destino}-${i}`}>
                <TableCell className="text-[11px] font-medium">{r.banco}</TableCell>
                <TableCell className="text-[10px] font-mono">{r.contrato_origem ?? "—"}</TableCell>
                <TableCell className="text-[10px] font-mono">{r.contrato_destino ?? "—"}</TableCell>
                <TableCell className="text-[10px] max-w-[220px]">
                  <span className="line-clamp-2" title={r.sequencia_texto}>
                    {r.sequencia_texto}
                  </span>
                  {r.justificativa_operacional_presente && (
                    <Badge
                      variant="outline"
                      className="mt-1 text-[9px] border-violet-400 text-violet-800 dark:text-violet-200"
                    >
                      Justificativa operacional no contrato anterior
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-[11px] text-right tabular-nums font-semibold">
                  {r.score}
                </TableCell>
                <TableCell>
                  <Badge variant={NIVEL_VARIANT[r.nivel]} className="text-[10px] uppercase">
                    {r.nivel}
                  </Badge>
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground leading-snug">
                  {r.recomendacao}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground">
                  <ul className="list-disc pl-3 space-y-0.5 max-h-24 overflow-auto">
                    {r.evidencias.map((ev, j) => (
                      <li key={j}>{ev}</li>
                    ))}
                  </ul>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
