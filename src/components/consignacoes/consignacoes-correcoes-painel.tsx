"use client";

import { ShieldCheck, Wrench, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  LoanCorrigidoConsigfacil,
  LinhaMatchContratoCompleta,
} from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";

type Props = {
  loansCorrigidos: LoanCorrigidoConsigfacil[];
  matches: LinhaMatchContratoCompleta[];
};

export function ConsignacoesCorrecoesPainel({ loansCorrigidos, matches }: Props) {
  const confirmados = matches.filter((m) => m.faixa === "match_confirmado").length;
  const provaveis = matches.filter((m) => m.faixa === "match_provavel").length;
  const manuais = matches.filter((m) => m.faixa === "match_manual").length;

  return (
    <Card className="border-emerald-300/60 bg-emerald-50/30 dark:bg-emerald-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" /> Correções automáticas ConsigFácil
        </CardTitle>
        <CardDescription>
          Quando o score de match é ≥ 90, a base interna é corrigida automaticamente
          (banco, parcelas, status, modalidade). O cadastro original é preservado em
          auditoria.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-emerald-600 gap-1">
            <ShieldCheck className="h-3 w-3" /> {confirmados} match confirmado(s)
          </Badge>
          <Badge variant="outline">{provaveis} provável(is)</Badge>
          <Badge variant="outline">{manuais} revisão manual</Badge>
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> {loansCorrigidos.length} loan(s) corrigido(s)
          </Badge>
        </div>
        {loansCorrigidos.length > 0 && (
          <ul className="text-[11px] space-y-1 max-h-40 overflow-auto">
            {loansCorrigidos.map((lc) => (
              <li key={lc.id} className="rounded border p-2 bg-background">
                <strong>{lc.institution_name ?? lc.description}</strong>
                <span className="text-muted-foreground">
                  {" "}
                  · score {lc.score_match} · campos: {lc.campos_corrigidos.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
