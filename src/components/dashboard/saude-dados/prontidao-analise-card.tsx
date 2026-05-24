"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Target } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ResultadoProntidaoAnalise, NivelProntidaoAnalise } from "@/lib/auditoria/prontidao-analise";
import { labelNivelProntidao } from "@/lib/auditoria/prontidao-analise";

const NIVEL_COR: Record<NivelProntidaoAnalise, string> = {
  incompleto: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  pronto_basico: "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
  pronto_ia: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  pronto_orientador: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
  pronto_juridico: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  pronto_contabil: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  pronto_pericial: "bg-primary/15 text-primary",
};

const NIVEL_STEPS: { key: keyof ResultadoProntidaoAnalise["niveis_atingidos"]; label: string }[] = [
  { key: "pronto_basico", label: "Comum" },
  { key: "pronto_ia", label: "IA" },
  { key: "pronto_orientador", label: "Orientador" },
  { key: "pronto_juridico", label: "Advogado" },
  { key: "pronto_contabil", label: "Contador" },
  { key: "pronto_pericial", label: "Pericial" },
];

type Props = {
  prontidao: ResultadoProntidaoAnalise;
  compact?: boolean;
};

export function ProntidaoAnaliseCard({ prontidao, compact = false }: Props) {
  const nivel = prontidao.nivel_prontidao_analise;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Análise pronta para:</span>
        <Badge className={NIVEL_COR[nivel] ?? ""}>{labelNivelProntidao(nivel)}</Badge>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" /> Prontidão da análise
        </CardTitle>
        <CardDescription>
          Indica para qual uso operacional os dados já são confiáveis — além da saúde das fontes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className={`text-sm px-3 py-1 ${NIVEL_COR[nivel] ?? ""}`}>
            {labelNivelProntidao(nivel)}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">{nivel}</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {NIVEL_STEPS.map((s) => {
            const ok = prontidao.niveis_atingidos[s.key];
            return (
              <Badge
                key={s.key}
                variant={ok ? "default" : "outline"}
                className="text-[10px] gap-1"
              >
                {ok ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3 opacity-40" />}
                {s.label}
              </Badge>
            );
          })}
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Público indicado</p>
          <p className="text-sm">{prontidao.publico_indicado}</p>
          {prontidao.publicos_disponiveis.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Também disponível para: {prontidao.publicos_disponiveis.join(" · ")}
            </p>
          )}
        </div>

        {prontidao.proximos_requisitos.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Próximos requisitos</p>
            <ul className="text-xs space-y-1 list-disc pl-4 text-amber-900 dark:text-amber-100">
              {prontidao.proximos_requisitos.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {prontidao.acoes_recomendadas.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Ações recomendadas</p>
            <ul className="text-xs space-y-1 list-disc pl-4">
              {prontidao.acoes_recomendadas.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          <Link href="/dashboard/exportacao" className="text-primary underline">
            Exportação
          </Link>{" "}
          inclui a aba Prontidao_Analise com critérios detalhados.
        </p>
      </CardContent>
    </Card>
  );
}
