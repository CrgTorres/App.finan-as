"use client";

import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ROTULOS_SINAIS_RISCO,
  type ClassificacaoRiscoFinanceiro,
  type ResultadoScoreRiscoFinanceiro,
} from "@/lib/conciliacao/score-risco-financeiro";

const ROTULO_CLASSIFICACAO: Record<ClassificacaoRiscoFinanceiro, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
  critico: "Crítico",
};

const CORES_CLASSIFICACAO: Record<ClassificacaoRiscoFinanceiro, string> = {
  baixo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  medio: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  alto: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  critico: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

function IconePorClassificacao({ c }: { c: ClassificacaoRiscoFinanceiro }) {
  if (c === "baixo") return <ShieldCheck className="h-5 w-5" />;
  if (c === "critico") return <ShieldAlert className="h-5 w-5" />;
  return <ShieldQuestion className="h-5 w-5" />;
}

export type RiscoJuridicoFinanceiroPainelProps = {
  score: ResultadoScoreRiscoFinanceiro;
};

/**
 * Mostra o `indice_risco_financeiro` (0-100), a classificação e a contribuição de cada
 * sinal. A barra visual usa o peso × intensidade para indicar quanto cada item está
 * "pesando" no score atual.
 */
export function RiscoJuridicoFinanceiroPainel({ score }: RiscoJuridicoFinanceiroPainelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3 flex-wrap">
          <div className={cn("p-2 rounded-md", CORES_CLASSIFICACAO[score.classificacao])}>
            <IconePorClassificacao c={score.classificacao} />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle>Risco jurídico-financeiro</CardTitle>
            <CardDescription>
              Índice composto a partir da Base_Conciliada, contratos anexados e rubricas suspeitas.
            </CardDescription>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Risco</p>
              <p className="text-3xl font-bold tabular-nums leading-none">
                {score.indice_risco_financeiro}
                <span className="text-base font-normal text-muted-foreground">/100</span>
              </p>
              <Badge variant="outline" className={cn("mt-1", CORES_CLASSIFICACAO[score.classificacao])}>
                {ROTULO_CLASSIFICACAO[score.classificacao]}
              </Badge>
            </div>
            <div className="pt-1 border-t border-border/60 mt-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Confiança
              </p>
              <p className="text-lg font-semibold tabular-nums leading-none text-emerald-700 dark:text-emerald-300">
                {score.indice_confianca_base}
                <span className="text-xs font-normal text-muted-foreground">/100</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                ConsigFácil aumenta confiança sem subtrair risco.
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {score.componentes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum sinal de risco detectado nos dados atuais.
          </p>
        ) : (
          <ul className="space-y-3">
            {score.componentes.map((c) => (
              <li key={c.sinal} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{ROTULOS_SINAIS_RISCO[c.sinal]}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    +{c.contribuicao} pts · peso {c.peso} · intensidade {(c.intensidade * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-current opacity-60"
                    style={{
                      width: `${Math.min(100, (c.contribuicao / c.peso) * 100)}%`,
                      color:
                        c.contribuicao >= c.peso * 0.7
                          ? "#dc2626"
                          : c.contribuicao >= c.peso * 0.4
                            ? "#f59e0b"
                            : "#2563eb",
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{c.detalhe}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
