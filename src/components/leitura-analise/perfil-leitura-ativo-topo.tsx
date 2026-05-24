"use client";

import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePerfilLeituraAnalise } from "@/components/leitura-analise/use-perfil-leitura-analise";
import {
  NIVEIS_LEITURA_ORDEM,
  ROTULOS_NIVEL_LEITURA,
  type NivelLeituraAnalise,
} from "@/lib/leitura-analise/types-perfil-leitura";

const NIVEIS_EXIBICAO: NivelLeituraAnalise[] = NIVEIS_LEITURA_ORDEM;

type Props = {
  /** Destaque visual para página de conciliação. */
  destaque?: boolean;
};

export function PerfilLeituraAtivoTopo({ destaque = false }: Props) {
  const perfil = usePerfilLeituraAnalise();

  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3",
        destaque ? "border-primary/40 bg-primary/5" : "bg-muted/30",
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <p className="text-sm font-semibold flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Perfil ativo
          </p>
          <p className="text-[11px] text-muted-foreground">
            {ROTULOS_NIVEL_LEITURA[perfil.nivel].descricao}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {NIVEIS_EXIBICAO.map((n) => {
              const ativo = n === perfil.nivel;
              return (
                <Badge
                  key={n}
                  variant={ativo ? "default" : "outline"}
                  className={cn(
                    "text-[10px]",
                    ativo && "ring-2 ring-primary/30",
                    !ativo && "opacity-60",
                  )}
                >
                  {ROTULOS_NIVEL_LEITURA[n].titulo}
                </Badge>
              );
            })}
          </div>
        </div>
        <Link
          href="/dashboard/configuracao-leitura"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Alterar perfil de leitura
        </Link>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Catálogo v{perfil.catalogoVersion} — parâmetros gravados na exportação e auditoria.
      </p>
    </div>
  );
}
