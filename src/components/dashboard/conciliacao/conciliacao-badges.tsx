"use client";

import { AlertTriangle, Info, Link2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TipoDivergenciaContextual } from "@/lib/conciliacao/tipo-divergencia-contextual";
import {
  ehContextoInstitucionalIndependente,
  ehDescontoFracionadoMargem,
  ehEstruturaIncompativel,
  TITULO_CONTEXTO_INDEPENDENTE,
  TITULO_ESTRUTURA_INCOMPATIVEL,
} from "@/lib/conciliacao/tipo-divergencia-contextual";
import {
  MENSAGEM_DESCONTO_FRACIONADO_MARGEM,
  TITULO_BADGE_DESCONTO_FRACIONADO_MARGEM,
} from "@/lib/contratos/detectar-desconto-fracionado-margem";
import type { ConsigfacilConfirmacao } from "@/types/consigfacil";
import { MENSAGEM_ESTRUTURA_INCOMPATIVEL } from "@/lib/conciliacao/assinatura-estrutural-contrato";
import { MENSAGEM_SEM_EVIDENCIA_CONTINUIDADE_INSTITUCIONAL } from "@/lib/consigfacil/regras-correlacao-institucional";

export type TomBadgeDivergenciaContextual = "critico" | "independente" | "monitoramento" | "neutro";

export function tomBadgeDivergenciaContextual(
  tipo: TipoDivergenciaContextual,
): TomBadgeDivergenciaContextual {
  if (tipo === "divergencia_estrutural_real" || ehEstruturaIncompativel(tipo)) return "critico";
  if (ehDescontoFracionadoMargem(tipo)) return "monitoramento";
  if (ehContextoInstitucionalIndependente(tipo)) return "independente";
  if (tipo === "monitoramento_contextual") return "monitoramento";
  return "neutro";
}

const CLASSE_TOM: Record<TomBadgeDivergenciaContextual, string> = {
  critico: "border-red-500/60 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100",
  independente:
    "border-sky-500/55 bg-sky-50 text-sky-900 dark:bg-sky-950/35 dark:text-sky-100",
  monitoramento:
    "border-amber-400/55 bg-amber-50/80 text-amber-900 dark:bg-amber-950/25 dark:text-amber-100",
  neutro: "border-slate-400/50 text-slate-700 dark:text-slate-300",
};

export type BadgeDivergenciaContextualProps = {
  tipo: TipoDivergenciaContextual;
  titulo?: string;
  className?: string;
};

export function BadgeDivergenciaContextual({
  tipo,
  titulo,
  className,
}: BadgeDivergenciaContextualProps) {
  const tom = tomBadgeDivergenciaContextual(tipo);
  const label =
    titulo ??
    (ehDescontoFracionadoMargem(tipo)
      ? TITULO_BADGE_DESCONTO_FRACIONADO_MARGEM
      : ehEstruturaIncompativel(tipo)
        ? TITULO_ESTRUTURA_INCOMPATIVEL
        : ehContextoInstitucionalIndependente(tipo)
          ? TITULO_CONTEXTO_INDEPENDENTE
          : "");

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] gap-0.5 shrink-0", CLASSE_TOM[tom], className)}
    >
      {tom === "critico" ? (
        <AlertTriangle className="h-3 w-3" />
      ) : tom === "independente" ? (
        <Info className="h-3 w-3" />
      ) : null}
      {label}
    </Badge>
  );
}

export function BadgeCorrelacaoConsigfacil({
  cf,
}: {
  cf: ConsigfacilConfirmacao | undefined;
}) {
  if (cf?.mensagem_correlacao?.trim() === MENSAGEM_DESCONTO_FRACIONADO_MARGEM) {
    return (
      <Badge
        variant="outline"
        className={cn("text-[10px] gap-0.5", CLASSE_TOM.monitoramento)}
      >
        Desconto fracionado por margem
      </Badge>
    );
  }
  if (cf?.mensagem_correlacao?.trim() === MENSAGEM_ESTRUTURA_INCOMPATIVEL) {
    return (
      <Badge
        variant="destructive"
        className="text-[10px] gap-0.5"
      >
        <AlertTriangle className="h-3 w-3" />
        Estrutura incompatível
      </Badge>
    );
  }
  if (cf?.tipo_correlacao === "sem_relacao_confirmada") {
    return (
      <Badge
        variant="outline"
        className={cn("text-[10px] gap-0.5", CLASSE_TOM.independente)}
      >
        <Info className="h-3 w-3" />
        {TITULO_CONTEXTO_INDEPENDENTE}
      </Badge>
    );
  }
  if (!cf?.contrato_correlato && !cf?.id_consignacao_confirmada) return null;

  if (cf.match_historico_correlato || cf.possivel_migracao_carteira) {
    return (
      <Badge variant="outline" className="text-[10px] gap-0.5 border-sky-500/50 text-sky-800 dark:text-sky-200">
        <Link2 className="h-3 w-3" />
        Contrato correlato encontrado no ConsigFácil
      </Badge>
    );
  }

  if (cf.confirmado_consigfacil) {
    return (
      <Badge className="text-[10px] gap-0.5 bg-emerald-600">
        <ShieldCheck className="h-3 w-3" />
        Confirmado ConsigFácil
      </Badge>
    );
  }

  if (cf.divergencia_consigfacil) {
    return (
      <Badge variant="destructive" className="text-[10px] gap-0.5">
        <AlertTriangle className="h-3 w-3" />
        Divergência ConsigFácil
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="text-[10px] gap-0.5">
      <Link2 className="h-3 w-3" />
      Correlato ConsigFácil
    </Badge>
  );
}

/** Legado: mensagem curta em linhas sem correlato confirmado. */
export function mensagemSemContinuidadeInstitucional(cf?: ConsigfacilConfirmacao): string {
  return cf?.mensagem_correlacao ?? MENSAGEM_SEM_EVIDENCIA_CONTINUIDADE_INSTITUCIONAL;
}
