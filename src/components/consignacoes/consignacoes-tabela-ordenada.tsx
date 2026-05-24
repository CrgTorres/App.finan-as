"use client";

import { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  CreditCard,
  Ban,
  ListOrdered,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConsignacaoOrdenadaLinha } from "@/lib/consignacoes-governo/consolidar-consignacoes-ordenadas";
import { rotuloBadgeEstrutura } from "@/lib/contratos/classificar-estrutura-contrato";
import { rotuloBadgeAutoridadeTemporal } from "@/lib/consigfacil/autoridade-temporal-consigfacil";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

function corStatus(status: ConsignacaoOrdenadaLinha["status_oficial"]): string {
  switch (status) {
    case "ativo":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "suspenso":
      return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
    case "quitado":
      return "bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300";
    case "refinanciado":
      return "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300";
    case "substituido":
      return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
    case "cartao_beneficio":
      return "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300";
    case "rmc":
    case "rcc":
      return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
    default:
      return "bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300";
  }
}

type Props = { linhas: ConsignacaoOrdenadaLinha[] };

export function ConsignacoesTabelaOrdenada({ linhas }: Props) {
  const [expandido, setExpandido] = useState<string | null>(null);

  if (linhas.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" /> Consignações ordenadas
          </CardTitle>
          <CardDescription>
            Nenhuma consignação no recorte atual — ajuste os filtros.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const totalParcela = linhas.reduce((s, l) => s + l.valor_parcela_oficial, 0);
  const totalPago = linhas.reduce((s, l) => s + l.valor_total_pago_estimado, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4" /> Consignações ordenadas
            </CardTitle>
            <CardDescription>
              Ordenadas por <strong>primeiro_desconto</strong> →{" "}
              <strong>instituicao_oficial</strong> → <strong>modalidade_oficial</strong>.
            </CardDescription>
          </div>
          <div className="text-right text-xs space-y-0.5">
            <p>
              <span className="text-muted-foreground">Total parcela oficial:</span>{" "}
              <strong className="tabular-nums">{brl(totalParcela)}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Total pago estimado:</span>{" "}
              <strong className="tabular-nums">{brl(totalPago)}</strong>
            </p>
            <p className="text-muted-foreground">{linhas.length} linha(s)</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border rounded-md border overflow-hidden">
          {linhas.map((l) => {
            const aberto = expandido === l.id;
            const badgeEstrutura = rotuloBadgeEstrutura({
              tipo_estrutura: l.tipo_estrutura,
              fonte_estrutura_contrato: l.fonte_estrutura_contrato,
              confianca_estrutural: l.confianca_estrutural,
              tem_parc_estrutural: l.exibir_parcelas_estruturais,
              mensagem_exibicao: l.mensagem_estrutura,
            });
            const textoParcela =
              l.tipo_estrutura === "historico"
                ? l.meses_detectados > 0
                  ? `${l.meses_detectados} meses detectados`
                  : l.mensagem_estrutura
                : l.exibir_parcelas_estruturais && l.parcelas_total > 0
                  ? `${l.parcela_atual}/${l.parcelas_total} parcelas`
                  : "";
            return (
              <div
                key={l.id}
                className={cn("p-3", corStatus(l.status_oficial))}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setExpandido(aberto ? null : l.id)}
                >
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {l.primeiro_desconto ?? "—"}
                          {l.ultimo_desconto && l.ultimo_desconto !== l.primeiro_desconto
                            ? ` → ${l.ultimo_desconto}`
                            : ""}
                        </Badge>
                        <span className="font-medium text-sm truncate" title={l.instituicao_oficial}>
                          {l.instituicao_oficial}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {l.grupo_canonico}
                        </Badge>
                        {l.modalidade_oficial && (
                          <Badge variant="outline" className="text-[10px]">
                            {l.modalidade_oficial}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {l.status_oficial}
                        </Badge>
                        <Badge
                          variant={
                            badgeEstrutura.variant === "consigfacil"
                              ? "default"
                              : badgeEstrutura.variant === "estrutural"
                                ? "secondary"
                                : "outline"
                          }
                          className={cn(
                            "text-[10px]",
                            badgeEstrutura.variant === "consigfacil" && "bg-sky-700",
                            badgeEstrutura.variant === "historico" && "border-amber-500/60",
                          )}
                        >
                          {badgeEstrutura.rotulo}
                        </Badge>
                        {l.eh_refinanciamento && (
                          <Badge variant="secondary" className="text-[10px] gap-0.5">
                            <RefreshCw className="h-3 w-3" /> refin
                          </Badge>
                        )}
                        {l.eh_cartao_beneficio && (
                          <Badge variant="secondary" className="text-[10px] gap-0.5">
                            <CreditCard className="h-3 w-3" /> cartão benefício
                          </Badge>
                        )}
                        {(l.eh_rmc || l.eh_rcc) && (
                          <Badge variant="destructive" className="text-[10px] gap-0.5">
                            <CreditCard className="h-3 w-3" /> {l.eh_rmc ? "RMC" : "RCC"}
                          </Badge>
                        )}
                        {l.status_oficial === "suspenso" && (
                          <Badge variant="destructive" className="text-[10px] gap-0.5">
                            <Ban className="h-3 w-3" /> SUSPENSO
                          </Badge>
                        )}
                        <Badge
                          variant={
                            l.autoridade_temporal_consigfacil === "oficial_atual"
                              ? "default"
                              : "outline"
                          }
                          className={cn(
                            "text-[10px]",
                            l.autoridade_temporal_consigfacil === "migracao_carga_inicial" &&
                              "border-violet-500/60 text-violet-800 dark:text-violet-200",
                            l.autoridade_temporal_consigfacil === "contextual_historica" &&
                              "border-sky-500/60",
                          )}
                        >
                          {rotuloBadgeAutoridadeTemporal(l.autoridade_temporal_consigfacil)}
                        </Badge>
                        {l.contrato_migrado_para_consigfacil && (
                          <Badge variant="outline" className="text-[10px] border-violet-500/50">
                            Contrato em andamento migrado para o ConsigFácil
                          </Badge>
                        )}
                        {l.confirmado_consigfacil && l.autoridade_temporal_consigfacil === "oficial_atual" && (
                          <Badge className="text-[10px] gap-0.5 bg-emerald-600">
                            <ShieldCheck className="h-3 w-3" /> Confirmado ConsigFácil
                          </Badge>
                        )}
                        {l.divergencia_consigfacil && l.autoridade_temporal_consigfacil === "oficial_atual" && (
                          <Badge variant="destructive" className="text-[10px] gap-0.5">
                            <AlertTriangle className="h-3 w-3" /> Divergência
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        {l.meses_detectados > 0
                          ? `${l.meses_detectados} mês(es) detectado(s)`
                          : "Sem desconto observado"}
                        {textoParcela ? ` · ${textoParcela}` : ""}
                        {" · "}
                        {l.fonte_estrutura_contrato} (estrutural {l.confianca_estrutural}%)
                        {" · classificação "}
                        {l.fonte_principal} ({Math.round(l.grau_confianca)}/100)
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {brl(l.valor_parcela_oficial)}
                      </p>
                      {l.valor_parcela_folha > 0 &&
                        Math.abs(l.valor_parcela_folha - l.valor_parcela_oficial) > 0.01 && (
                          <p className="text-[10px] opacity-80">
                            folha: {brl(l.valor_parcela_folha)}
                          </p>
                        )}
                      {l.valor_total_pago_estimado > 0 && (
                        <p className="text-[10px] opacity-80">
                          pago: {brl(l.valor_total_pago_estimado)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
                {aberto && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 text-[11px] border-t pt-2">
                    <div>
                      <p className="text-muted-foreground">Origem (não usado em gráficos):</p>
                      <p className="font-mono">{l.instituicao_original ?? "—"}</p>
                      {l.modalidade_original && (
                        <p className="font-mono opacity-80">
                          modalidade: {l.modalidade_original}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Vínculos:</p>
                      {l.vinculo_loan_id && (
                        <p>loan_id: <span className="font-mono">{l.vinculo_loan_id}</span></p>
                      )}
                      {l.vinculo_consigfacil_id && (
                        <p>
                          consigfacil_id: <span className="font-mono">{l.vinculo_consigfacil_id}</span>
                        </p>
                      )}
                    </div>
                    {l.competencias_detectadas.length > 0 && (
                      <div className="sm:col-span-2">
                        <p className="text-muted-foreground">Competências detectadas:</p>
                        <p className="font-mono">{l.competencias_detectadas.join(", ")}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
