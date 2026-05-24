"use client";

import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usePerfilLeituraAnalise } from "@/components/leitura-analise/use-perfil-leitura-analise";
import { ROTULOS_NIVEL_LEITURA } from "@/lib/leitura-analise/types-perfil-leitura";

export function PerfilLeituraResumoBanner() {
  const perfil = usePerfilLeituraAnalise();
  const desc = ROTULOS_NIVEL_LEITURA[perfil.nivel].descricao;

  return (
    <div className="rounded-lg border bg-muted/40 p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div className="space-y-1 min-w-0">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Perfil de leitura: <Badge variant="secondary">{perfil.rotuloNivel}</Badge>
        </p>
        <p className="text-[11px] text-muted-foreground line-clamp-2">{desc}</p>
      </div>
      <Link
        href="/dashboard/configuracao-leitura"
        className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted"
      >
        Ajustar perguntas
      </Link>
    </div>
  );
}
