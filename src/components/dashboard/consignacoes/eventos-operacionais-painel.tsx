"use client";

import { useMemo, useState } from "react";
import { Activity, Filter, ShieldCheck, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EventoOperacionalConsignado } from "@/lib/consigfacil/detectar-eventos-operacionais";
import type { RiscoRefinForcado } from "@/lib/juridico/detectar-risco-refin-forcado";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import type { ContratoComAuditoria } from "@/lib/consignacoes-governo/auditoria-contratos-unicos";
import { CardsEventosOperacionais } from "./cards-eventos-operacionais";
import { TimelineContratoOperacional } from "./timeline-contrato-operacional";
import { RiscoRefinForcadoPainel } from "./risco-refin-forcado-painel";
import {
  FILTROS_EVENTOS_VAZIOS,
  LABEL_MOTIVO_QUEBRA,
  LABEL_ORIGEM,
  LABEL_TIPO_EVENTO,
  aplicarFiltrosEventos,
  contratosComEventos,
  enriquecerLinhaEvento,
  filtrarRiscos,
  fmtBrl,
  type FiltrosEventosOperacionais,
} from "./eventos-operacionais-shared";

type Props = {
  eventos: EventoOperacionalConsignado[];
  riscos: RiscoRefinForcado[];
  contratos: ConsigfacilContrato[];
  contratosAuditoria?: ContratoComAuditoria[];
};

const TIPOS: EventoOperacionalConsignado["tipo"][] = [
  "suspensao",
  "inadimplencia",
  "bloqueio",
  "desconto_nao_processado",
  "desconto_recuperado",
  "quebra_temporaria",
  "retorno_operacional",
];

const ORIGENS: EventoOperacionalConsignado["origem"][] = [
  "consigfacil",
  "contracheque",
  "extrato",
  "email",
  "manual",
];

const NIVEIS_RISCO: RiscoRefinForcado["nivel"][] = ["medio", "alto", "critico"];

export function EventosOperacionaisPainel({
  eventos,
  riscos,
  contratos,
  contratosAuditoria = [],
}: Props) {
  const [filtros, setFiltros] = useState<FiltrosEventosOperacionais>(FILTROS_EVENTOS_VAZIOS);
  const [contratoTimeline, setContratoTimeline] = useState<string | null>(null);

  const bancos = useMemo(
    () => Array.from(new Set(eventos.map((e) => e.banco).filter(Boolean) as string[])).sort(),
    [eventos],
  );
  const contratosIds = useMemo(
    () =>
      Array.from(new Set(eventos.map((e) => e.contrato).filter(Boolean) as string[])).sort(),
    [eventos],
  );
  const competencias = useMemo(
    () =>
      Array.from(new Set(eventos.map((e) => e.competencia).filter(Boolean) as string[])).sort(),
    [eventos],
  );

  const eventosFiltrados = useMemo(
    () => aplicarFiltrosEventos(eventos, filtros),
    [eventos, filtros],
  );
  const riscosFiltrados = useMemo(
    () => filtrarRiscos(riscos, filtros),
    [riscos, filtros],
  );
  const linhasTabela = useMemo(
    () => eventosFiltrados.map(enriquecerLinhaEvento),
    [eventosFiltrados],
  );
  const contratosTimeline = useMemo(
    () => contratosComEventos(eventosFiltrados, contratos),
    [eventosFiltrados, contratos],
  );

  const semFiltros =
    JSON.stringify(filtros) === JSON.stringify(FILTROS_EVENTOS_VAZIOS);

  if (eventos.length === 0) {
    return (
      <Card className="border-slate-300/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Eventos operacionais do consignado
          </CardTitle>
          <CardDescription>
            Trilha oficial: suspensão, bloqueio, inadimplência e descontos recuperados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Não foram encontrados eventos operacionais que expliquem quebras de desconto.
            Importe uma captura do ConsigFácil (incluindo &quot;Descontos Recuperados&quot;) ou
            registre um e-mail de suspensão.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card className="border-blue-300/50 bg-blue-50/30 dark:bg-blue-950/15">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Eventos operacionais do consignado
          </CardTitle>
          <CardDescription>
            Explica por que o desconto zerou, por que não é refinanciamento automático e se há
            risco de refin induzido. Exportação:{" "}
            <code className="text-[10px]">Eventos_Operacionais_Consignado</code> e{" "}
            <code className="text-[10px]">Risco_Refin_Forcado</code>.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-3.5 w-3.5" /> Filtros operacionais
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Banco</span>
            <Select
              value={filtros.banco ?? "__all__"}
              onValueChange={(v) =>
                setFiltros((f) => ({ ...f, banco: v === "__all__" ? null : v }))
              }
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {bancos.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Contrato</span>
            <Select
              value={filtros.contrato ?? "__all__"}
              onValueChange={(v) =>
                setFiltros((f) => ({ ...f, contrato: v === "__all__" ? null : v }))
              }
            >
              <SelectTrigger className="h-8 w-[180px] text-xs font-mono">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {contratosIds.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Competência</span>
            <Select
              value={filtros.competencia ?? "__all__"}
              onValueChange={(v) =>
                setFiltros((f) => ({ ...f, competencia: v === "__all__" ? null : v }))
              }
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {competencias.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Tipo evento</span>
            <Select
              value={filtros.tipo_evento ?? "__all__"}
              onValueChange={(v) =>
                setFiltros((f) => ({
                  ...f,
                  tipo_evento:
                    v === "__all__" ? null : (v as EventoOperacionalConsignado["tipo"]),
                }))
              }
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LABEL_TIPO_EVENTO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Origem</span>
            <Select
              value={filtros.origem ?? "__all__"}
              onValueChange={(v) =>
                setFiltros((f) => ({
                  ...f,
                  origem:
                    v === "__all__" ? null : (v as EventoOperacionalConsignado["origem"]),
                }))
              }
            >
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {ORIGENS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {LABEL_ORIGEM[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Nível risco</span>
            <Select
              value={filtros.nivel_risco ?? "__all__"}
              onValueChange={(v) =>
                setFiltros((f) => ({
                  ...f,
                  nivel_risco: v === "__all__" ? null : (v as RiscoRefinForcado["nivel"]),
                }))
              }
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {NIVEIS_RISCO.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-1.5 text-[10px] cursor-pointer pb-1">
            <input
              type="checkbox"
              checked={filtros.somente_removidos_conferencia}
              onChange={(e) =>
                setFiltros((f) => ({
                  ...f,
                  somente_removidos_conferencia: e.target.checked,
                }))
              }
              className="rounded"
            />
            Só removidos da conferência
          </label>

          <label className="flex items-center gap-1.5 text-[10px] cursor-pointer pb-1">
            <input
              type="checkbox"
              checked={filtros.somente_risco_alto_critico}
              onChange={(e) =>
                setFiltros((f) => ({
                  ...f,
                  somente_risco_alto_critico: e.target.checked,
                }))
              }
              className="rounded"
            />
            Só risco alto/crítico
          </label>

          {!semFiltros && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFiltros(FILTROS_EVENTOS_VAZIOS)}
            >
              <X className="h-3 w-3 mr-1" /> Limpar
            </Button>
          )}

          <Badge variant="outline" className="text-[10px] ml-auto">
            {eventosFiltrados.length} evento(s) · {riscosFiltrados.length} risco(s)
          </Badge>
        </CardContent>
      </Card>

      <CardsEventosOperacionais
        eventos={eventosFiltrados}
        riscos={riscosFiltrados}
        contratosAuditoria={contratosAuditoria}
      />

      <TimelineContratoOperacional
        contratos={contratosTimeline}
        eventos={eventosFiltrados}
        contratoSelecionado={contratoTimeline}
        onContratoChange={setContratoTimeline}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Eventos que explicam quebras
          </CardTitle>
          <CardDescription>
            Cada linha corresponde a um registro em{" "}
            <code className="text-[10px]">Eventos_Operacionais_Consignado</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {linhasTabela.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum evento no recorte dos filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Banco</TableHead>
                  <TableHead className="text-[10px]">Contrato</TableHead>
                  <TableHead className="text-[10px]">Competência</TableHead>
                  <TableHead className="text-[10px]">Tipo</TableHead>
                  <TableHead className="text-[10px]">Motivo quebra</TableHead>
                  <TableHead className="text-[10px] text-right">Previsto</TableHead>
                  <TableHead className="text-[10px] text-right">Descontado</TableHead>
                  <TableHead className="text-[10px] text-right">Diferença</TableHead>
                  <TableHead className="text-[10px] min-w-[160px]">Justificativa</TableHead>
                  <TableHead className="text-[10px]">Origem</TableHead>
                  <TableHead className="text-[10px]">Conferência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasTabela.map((row, i) => (
                  <TableRow key={`${row.tipo}-${row.contrato}-${row.competencia}-${i}`}>
                    <TableCell className="text-[11px]">{row.banco ?? "—"}</TableCell>
                    <TableCell className="text-[10px] font-mono">{row.contrato ?? "—"}</TableCell>
                    <TableCell className="text-[10px] tabular-nums">
                      {row.competencia ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px]">
                        {LABEL_TIPO_EVENTO[row.tipo]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px]">
                      {LABEL_MOTIVO_QUEBRA[row.motivo_quebra_desconto]}
                    </TableCell>
                    <TableCell className="text-[10px] text-right tabular-nums">
                      {fmtBrl(row.valor_previsto)}
                    </TableCell>
                    <TableCell className="text-[10px] text-right tabular-nums">
                      {fmtBrl(row.valor_descontado)}
                    </TableCell>
                    <TableCell className="text-[10px] text-right tabular-nums">
                      {fmtBrl(row.diferenca)}
                    </TableCell>
                    <TableCell
                      className="text-[10px] text-muted-foreground max-w-[200px] truncate"
                      title={row.justificativa ?? ""}
                    >
                      {row.justificativa ?? "—"}
                    </TableCell>
                    <TableCell className="text-[10px]">{LABEL_ORIGEM[row.origem]}</TableCell>
                    <TableCell>
                      {row.removido_da_conferencia ? (
                        <Badge
                          variant="secondary"
                          className="text-[9px] gap-1 border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/40"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Refinanciamento descartado por justificativa operacional oficial
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RiscoRefinForcadoPainel riscos={riscosFiltrados} />
    </section>
  );
}
