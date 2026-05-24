"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LinhaMatchContratoCompleta } from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";

type Props = {
  matches: LinhaMatchContratoCompleta[];
  maxItens?: number;
};

export function MatchContratoDebugTriagem({ matches, maxItens = 12 }: Props) {
  const lista = matches.slice(0, maxItens);
  if (lista.length === 0) return null;

  return (
    <Card className="border-slate-500/35">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Match de contratos (debug forense)</CardTitle>
        <CardDescription>
          Vinculação contextual — rubrica forte, parcela/total e bloqueios de fusão automática.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
        {lista.map((m) => {
          const d = m.match_debug;
          return (
            <article
              key={`${m.id_consignacao}-${m.loan_id ?? "sem-loan"}`}
              className="rounded-lg border p-3 text-xs space-y-2 bg-muted/20"
            >
              <div className="flex flex-wrap gap-1 items-center">
                <Badge variant="outline">{d.banco}</Badge>
                <Badge variant="secondary">score {m.score}</Badge>
                <Badge variant="outline">{m.faixa}</Badge>
                {d.rubrica_identificador_forte && (
                  <Badge className="bg-violet-600">rubrica forte</Badge>
                )}
                {!d.fusao_automatica_permitida && (
                  <Badge variant="destructive">fusão bloqueada</Badge>
                )}
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
                <div>
                  <dt className="text-muted-foreground">Rubrica</dt>
                  <dd className="font-medium">{d.rubrica ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Contrato</dt>
                  <dd className="font-mono">{d.contrato}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Parcela</dt>
                  <dd>
                    {d.parcela}/{d.total}
                  </dd>
                </div>
              </dl>
              <p className="text-emerald-800 dark:text-emerald-200">
                <span className="font-semibold">MATCH:</span> {m.motivo_match}
              </p>
              {m.motivo_bloqueio_match && (
                <p className="text-amber-900 dark:text-amber-100">
                  <span className="font-semibold">BLOQUEIO:</span> {m.motivo_bloqueio_match}
                </p>
              )}
            </article>
          );
        })}
      </CardContent>
    </Card>
  );
}
