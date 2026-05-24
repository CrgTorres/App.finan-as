"use client";

import Link from "next/link";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AlertaIntegracao } from "@/lib/auditoria/auditoria-integracao-fontes";

type Props = {
  alertas: AlertaIntegracao[];
  max?: number;
  linkSaude?: boolean;
};

export function AlertasIntegracaoBanner({ alertas, max = 5, linkSaude = true }: Props) {
  const visiveis = alertas.slice(0, max);
  if (visiveis.length === 0) return null;

  return (
    <div className="space-y-2">
      {visiveis.map((a) => {
        const Icon =
          a.severidade === "critico" ? XCircle : a.severidade === "aviso" ? AlertTriangle : Info;
        return (
          <Card
            key={a.id}
            className={
              a.severidade === "critico"
                ? "border-red-300/70 bg-red-50/50 dark:bg-red-950/20"
                : a.severidade === "aviso"
                  ? "border-amber-300/70 bg-amber-50/40 dark:bg-amber-950/20"
                  : "border-border"
            }
          >
            <CardContent className="py-3 flex gap-2">
              <Icon className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">{a.titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.descricao}</p>
                {a.acao && (
                  <p className="text-xs mt-1">
                    {a.acao.startsWith("/") ? (
                      <Link href={a.acao} className="underline font-medium">
                        Ver detalhes
                      </Link>
                    ) : (
                      <span className="font-medium">{a.acao}</span>
                    )}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {linkSaude && alertas.length > max && (
        <Link href="/dashboard/saude-dados" className="text-xs text-primary underline">
          +{alertas.length - max} alerta(s) — ver Saúde dos Dados
        </Link>
      )}
    </div>
  );
}
