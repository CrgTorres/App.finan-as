"use client";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  PauseCircle,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventoOperacionalConsignado } from "@/lib/consigfacil/detectar-eventos-operacionais";
import type { RiscoRefinForcado } from "@/lib/juridico/detectar-risco-refin-forcado";
import type { ContratoComAuditoria } from "@/lib/consignacoes-governo/auditoria-contratos-unicos";
import { contarFalsosRefinRemovidos } from "./eventos-operacionais-shared";

type Props = {
  eventos: EventoOperacionalConsignado[];
  riscos: RiscoRefinForcado[];
  contratosAuditoria: ContratoComAuditoria[];
};

function KpiCard({
  titulo,
  valor,
  descricao,
  icon: Icon,
  destaque,
}: {
  titulo: string;
  valor: number;
  descricao: string;
  icon: React.ComponentType<{ className?: string }>;
  destaque?: "vermelho" | "roxo" | "verde" | "amarelo";
}) {
  const border =
    destaque === "vermelho"
      ? "border-red-300/60"
      : destaque === "roxo"
        ? "border-violet-400/60"
        : destaque === "verde"
          ? "border-emerald-300/60"
          : destaque === "amarelo"
            ? "border-amber-300/60"
            : "";

  return (
    <Card className={border}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {titulo}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{valor}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-[10px] text-muted-foreground leading-snug">{descricao}</p>
      </CardContent>
    </Card>
  );
}

export function CardsEventosOperacionais({ eventos, riscos, contratosAuditoria }: Props) {
  const suspensos = eventos.filter((e) => e.tipo === "suspensao").length;
  const bloqueios = eventos.filter((e) => e.tipo === "bloqueio").length;
  const naoProcessados = eventos.filter((e) => e.tipo === "desconto_nao_processado").length;
  const recuperados = eventos.filter((e) => e.tipo === "desconto_recuperado").length;
  const mesesSemDesconto = new Set(
    eventos
      .filter(
        (e) =>
          e.competencia &&
          (e.tipo === "desconto_nao_processado" ||
            e.tipo === "bloqueio" ||
            (e.valor_descontado === 0 && (e.valor_previsto ?? 0) > 0)),
      )
      .map((e) => e.competencia as string),
  ).size;
  const falsosRefin = contarFalsosRefinRemovidos(eventos, contratosAuditoria);
  const riscoAltoCritico = riscos.filter((r) => r.nivel === "alto" || r.nivel === "critico").length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      <KpiCard
        titulo="Contratos suspensos"
        valor={suspensos}
        descricao="Eventos de suspensão operacional (portal ou e-mail)."
        icon={PauseCircle}
        destaque="vermelho"
      />
      <KpiCard
        titulo="Bloqueios detectados"
        valor={bloqueios}
        descricao="Retorno bloqueado / não descontado no ConsigFácil."
        icon={Ban}
        destaque="vermelho"
      />
      <KpiCard
        titulo="Descontos não processados"
        valor={naoProcessados}
        descricao="Parcela enviada sem desconto efetivo na folha."
        icon={XCircle}
        destaque="amarelo"
      />
      <KpiCard
        titulo="Descontos recuperados"
        valor={recuperados}
        descricao="Valor descontado confirmado pelo governo."
        icon={CheckCircle2}
        destaque="verde"
      />
      <KpiCard
        titulo="Meses sem desconto"
        valor={mesesSemDesconto}
        descricao="Competências com quebra ou valor zero."
        icon={AlertTriangle}
        destaque="amarelo"
      />
      <KpiCard
        titulo="Falsos refin. removidos"
        valor={falsosRefin}
        descricao="Contratos com justificativa operacional — não é refin."
        icon={ShieldAlert}
        destaque="verde"
      />
      <KpiCard
        titulo="Risco refin. alto/crítico"
        valor={riscoAltoCritico}
        descricao="Padrão suspensão → quebra → novo contrato."
        icon={AlertTriangle}
        destaque="roxo"
      />
    </div>
  );
}
