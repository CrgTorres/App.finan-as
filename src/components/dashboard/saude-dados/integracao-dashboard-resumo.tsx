"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeartPulse, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import type { AlertaIntegracao } from "@/lib/auditoria/auditoria-integracao-fontes";
import type {
  NivelProntidaoAnalise,
  NivelProntidaoOperacional,
} from "@/lib/auditoria/prontidao-analise";
import { labelNivelProntidao, seloPublicosProntidao } from "@/lib/auditoria/prontidao-analise";
import { AlertasIntegracaoBanner } from "@/components/dashboard/saude-dados/alertas-integracao-banner";

const STORAGE_KEY = "financa:ultima-auditoria-integracao:v1";

type CacheAuditoria = {
  at: string;
  indice: number;
  classificacao: string;
  alertas: AlertaIntegracao[];
  nivel_prontidao?: NivelProntidaoAnalise;
  niveis_atingidos?: Record<NivelProntidaoOperacional, boolean>;
  selo_publicos?: string[];
};

export function IntegracaoDashboardResumo() {
  const [cache, setCache] = useState<CacheAuditoria | null>(null);

  const ler = () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setCache(null);
        return;
      }
      setCache(JSON.parse(raw) as CacheAuditoria);
    } catch {
      setCache(null);
    }
  };

  useEffect(() => {
    ler();
    window.addEventListener(DASHBOARD_DATA_UPDATED, ler);
    return () => window.removeEventListener(DASHBOARD_DATA_UPDATED, ler);
  }, []);

  if (!cache) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
            <span>Verifique se todas as fontes estão integradas e sincronizadas.</span>
          </div>
          <Link
            href="/dashboard/saude-dados"
            className="text-sm font-medium text-primary underline"
          >
            Abrir Saúde dos Dados
          </Link>
        </CardContent>
      </Card>
    );
  }

  const selo =
    cache.niveis_atingidos != null
      ? seloPublicosProntidao(cache.niveis_atingidos)
      : cache.selo_publicos?.join(" · ") ?? "em preparação";

  return (
    <div className="space-y-2">
      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-3">
          <HeartPulse className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-[140px]">
            <p className="text-sm font-medium">Confiabilidade dos dados</p>
            <p className="text-xs text-muted-foreground">
              Atualizado {cache.at.slice(0, 16).replace("T", " ")}
            </p>
          </div>
          <span className="text-2xl font-bold tabular-nums">{cache.indice}</span>
          <Badge variant="outline">{cache.classificacao}</Badge>
          <Link href="/dashboard/saude-dados" className="text-xs text-primary underline">
            Detalhes
          </Link>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-3 flex flex-wrap items-center gap-2">
          <Target className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-medium">Análise pronta para</p>
            <p className="text-xs text-muted-foreground mt-0.5">{selo}</p>
          </div>
          {cache.nivel_prontidao && (
            <Badge variant="secondary" className="text-xs">
              {labelNivelProntidao(cache.nivel_prontidao)}
            </Badge>
          )}
          <Link href="/dashboard/saude-dados" className="text-xs text-primary underline shrink-0">
            Prontidão
          </Link>
        </CardContent>
      </Card>

      {cache.alertas.length > 0 && (
        <AlertasIntegracaoBanner alertas={cache.alertas} max={3} />
      )}
    </div>
  );
}
