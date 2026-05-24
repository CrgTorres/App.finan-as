"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, RefreshCw, AlertTriangle, CreditCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import { TimelineEstruturalBadge } from "@/components/conciliacao/timeline-estrutural-badge";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

const COR_STATUS: Record<string, string> = {
  ativo: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  suspenso: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  importado: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  quitado: "bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
  refinanciado: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  substituido: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  cartao_beneficio: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  rmc: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  rcc: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  em_averbacao: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  desconhecido: "bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
};

export type ConsigfacilContratosTabelaProps = {
  contratos: ConsigfacilContrato[];
};

export function ConsigfacilContratosTabela({ contratos }: ConsigfacilContratosTabelaProps) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroMargem, setFiltroMargem] = useState("todas");

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return contratos
      .filter((c) => {
        if (filtroStatus !== "todos" && c.status !== filtroStatus) return false;
        if (filtroMargem !== "todas" && c.tipo_margem !== filtroMargem) return false;
        if (
          b &&
          !c.instituicao.toLowerCase().includes(b) &&
          !c.id_consignacao.includes(b) &&
          !(c.codigo_instituicao ?? "").toLowerCase().includes(b)
        )
          return false;
        return true;
      })
      .sort((a, b2) => b2.data_contrato.localeCompare(a.data_contrato));
  }, [contratos, busca, filtroStatus, filtroMargem]);

  if (contratos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contratos oficiais ConsigFácil</CardTitle>
          <CardDescription>Importe um snapshot para visualizar consignações.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const totalParcelas = lista.reduce((s, c) => s + c.valor_parcela, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contratos oficiais ConsigFácil</CardTitle>
        <CardDescription>
          {lista.length} de {contratos.length} contrato(s) — total parcelas atuais {brl(totalParcelas)} / mês.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Buscar instituição, código…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="todos">Status: todos</option>
            <option value="ativo">Ativo</option>
            <option value="suspenso">Suspenso</option>
            <option value="refinanciado">Refinanciado</option>
            <option value="substituido">Substituído</option>
            <option value="quitado">Quitado</option>
            <option value="cartao_beneficio">Cartão benefício</option>
            <option value="em_averbacao">Em averbação</option>
          </select>
          <select
            value={filtroMargem}
            onChange={(e) => setFiltroMargem(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="todas">Margem: todas</option>
            <option value="margem_consignavel">Consignável</option>
            <option value="margem_cartao">Cartão</option>
            <option value="margem_cartao_beneficio">Cartão benefício</option>
          </select>
        </div>

        <div className="divide-y divide-border rounded-md border border-border">
          {lista.map((c) => {
            const cor = COR_STATUS[c.status] ?? COR_STATUS.desconhecido;
            return (
              <div key={c.id_consignacao} className={cn("p-3 space-y-1.5", cor)}>
                <div className="flex items-start gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">{c.id_consignacao}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {c.instituicao}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {c.tipo_margem}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {c.status}
                      </Badge>
                      {c.eh_refinanciamento && (
                        <Badge variant="secondary" className="text-[10px] gap-0.5">
                          <RefreshCw className="h-3 w-3" /> refin
                        </Badge>
                      )}
                      {c.contrato_substituido && (
                        <Badge variant="secondary" className="text-[10px]">
                          substituiu {c.contrato_substituido}
                        </Badge>
                      )}
                      {(c.eh_rmc || c.eh_rcc) && (
                        <Badge variant="destructive" className="text-[10px] gap-0.5">
                          <CreditCard className="h-3 w-3" /> {c.eh_rmc ? "RMC" : "RCC"}
                        </Badge>
                      )}
                      {c.eh_cartao_beneficio && !c.eh_rmc && !c.eh_rcc && (
                        <Badge variant="secondary" className="text-[10px] gap-0.5">
                          <CreditCard className="h-3 w-3" /> Cartão Benefício
                        </Badge>
                      )}
                      {c.status === "suspenso" && (
                        <Badge variant="destructive" className="text-[10px]">
                          SUSPENSO
                        </Badge>
                      )}
                      {c.situacao_importacao === "importado_suspenso" && (
                        <Badge variant="destructive" className="text-[10px]">
                          IMPORTADO SUSPENSO
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <ShieldCheck className="h-3 w-3" /> oficial
                      </Badge>
                      {c.confianca < 0.5 && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          confiança {(c.confianca * 100).toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      Data: {c.data_contrato} · Período: {c.competencia} · Averbado por:{" "}
                      {c.averbado_por ?? "—"} · Código: {c.codigo_instituicao ?? "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">
                      {c.valor_parcela > 0 ? brl(c.valor_parcela) : "Sem lançamento"}
                    </p>
                    <p className="text-[11px] opacity-80">
                      {c.parcelas_total > 0
                        ? c.parcela_atual != null && c.parcela_atual > 0
                          ? `${c.parcela_atual}/${c.parcelas_total} parcelas`
                          : "parcela atual não informada"
                        : "Prazo indeterminado"}
                    </p>
                  </div>
                </div>
                {c.classificacao_continuidade && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <TimelineEstruturalBadge
                      classificacao={c.classificacao_continuidade}
                      resumo={c.timeline_analise?.resumo_ui}
                      compacto
                    />
                    {c.timeline_parcelas && c.timeline_parcelas.length > 0 && (
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {c.timeline_parcelas
                          .filter((t) => t.parcela_atual != null && t.total != null)
                          .map((t) => `${t.parcela_atual}/${t.total}`)
                          .join(" → ")}
                      </p>
                    )}
                  </div>
                )}
                {c.observacao && (
                  <p className="text-[11px] opacity-80 italic">{c.observacao}</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
