"use client";

import {
  AVISO_ANALISE_NAO_SUBSTITUI_ADVOGADO,
  type HipoteseJuridicaAnalise,
} from "@/lib/anexos/analise-financeira-contracheque-padroes";
import type { ValidacaoBaseEmprestimosResultado } from "@/lib/anexos/validacao-base-emprestimos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale } from "lucide-react";

function labelIndicadorTema(tema: HipoteseJuridicaAnalise["tema"]): string {
  const map: Record<HipoteseJuridicaAnalise["tema"], string> = {
    revisao_consignado: "Taxas / consignado",
    cobranca_indevida: "Cobrança indevida",
    duplicidade_desconto: "Duplicidade",
    desconto_nao_reconhecido: "Desconto não reconhecido",
    superendividamento: "Superendividamento",
    repactuacao: "Repactuação",
    cartao_consignado_rmc_rcc: "Cartão / RMC / RCC",
    margem_consignavel: "Margem consignável",
  };
  return map[tema] ?? tema.replace(/_/g, " ");
}

export function AnaliseJuridicoTab({
  hipoteses,
  validacaoBase,
  children,
}: {
  hipoteses: HipoteseJuridicaAnalise[];
  validacaoBase?: ValidacaoBaseEmprestimosResultado | null;
  children: React.ReactNode;
}) {
  const temas = [...new Set(hipoteses.map((h) => h.tema))];
  const checklistPendente =
    validacaoBase?.checklistFinal.filter((c) => c.status === "pendente" || c.status === "parcial") ?? [];
  const p = validacaoBase?.painel;

  return (
    <section className="space-y-3 pt-2">
      <Card className="border-amber-500/35 bg-amber-500/[0.06] shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="h-4 w-4" aria-hidden />
            Triagem jurídica (informação)
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            {AVISO_ANALISE_NAO_SUBSTITUI_ADVOGADO} Não há conclusão automática nem parecer jurídico nos quadros abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Temas automáticos (referência, não conclusão):</p>
            <div className="flex flex-wrap gap-1.5">
              {temas.length === 0 ? (
                <span className="text-xs text-muted-foreground">Nenhuma hipótese listada pela análise automática.</span>
              ) : (
                temas.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] font-normal">
                    {labelIndicadorTema(t)}
                  </Badge>
                ))
              )}
            </div>
          </div>
          {p ? (
            <details className="rounded-md border border-amber-800/15 dark:border-amber-200/20 bg-background/40">
              <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-foreground">
                Força da prova · documentos em falta (painel da base)
              </summary>
              <div className="px-3 pb-3 pt-0 space-y-2 border-t border-amber-800/10 dark:border-amber-200/15">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px] pt-2">
                  <div className="rounded border border-border/50 px-2 py-1">
                    <span className="text-muted-foreground">Sem contrato formal (app)</span>
                    <p className="font-bold tabular-nums">{p.contratosSemContratoFormalAnexado}</p>
                  </div>
                  <div className="rounded border border-border/50 px-2 py-1">
                    <span className="text-muted-foreground">Extrato não verificado</span>
                    <p className="font-bold tabular-nums">{p.contratosSemExtratoBancarioCorrespondenteVerificado}</p>
                  </div>
                  <div className="rounded border border-border/50 px-2 py-1">
                    <span className="text-muted-foreground">Autorização não rastreada</span>
                    <p className="font-bold tabular-nums">{p.contratosSemAutorizacaoDeDescontoRastreada}</p>
                  </div>
                </div>
                {(() => {
                  const linhas =
                    validacaoBase?.checklistFinal.filter((c) =>
                      (["comprovantes_quitacao", "decisoes_judiciais", "taxas_seguros"] as const).includes(
                        c.id as "comprovantes_quitacao" | "decisoes_judiciais" | "taxas_seguros",
                      ),
                    ) ?? [];
                  if (linhas.length === 0) return null;
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px]">
                      {linhas.map((c) => (
                        <div key={c.id} className="rounded border border-border/50 px-2 py-1">
                          <span className="text-muted-foreground line-clamp-2">{c.label}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[9px]">
                              {c.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {checklistPendente.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Checklist com pendências</p>
                    <ul className="max-h-32 overflow-y-auto space-y-1 text-[10px]">
                      {checklistPendente.map((c) => (
                        <li key={c.id} className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[9px] shrink-0">
                            {c.status}
                          </Badge>
                          <span className="text-muted-foreground">{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </CardContent>
      </Card>
      {children}
    </section>
  );
}
