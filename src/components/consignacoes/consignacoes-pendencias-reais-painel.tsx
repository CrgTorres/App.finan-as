"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PendenciaConferenciaReal } from "@/lib/consignacoes-governo/aplicar-auditoria-consigfacil";
import { TriagemInteligenteForm } from "@/components/dashboard/triagem/triagem-inteligente-form";
import { contextoDePendencia } from "@/lib/triagem/triagem-service";
import { pendenciaOcultaPorTriagem } from "@/lib/triagem/aplicar-respostas-triagem";
import { MENSAGEM_ESTRUTURA_INCOMPATIVEL } from "@/lib/conciliacao/assinatura-estrutural-contrato";
import { MENSAGEM_DESCONTO_FRACIONADO_MARGEM } from "@/lib/contratos/detectar-desconto-fracionado-margem";
import { buildPendenciasReais } from "@/lib/conciliacao/pendencia-real-consignavel";
import Link from "next/link";

function rotuloBadgePendencia(p: PendenciaConferenciaReal): {
  label: string;
  variant: "destructive" | "outline" | "secondary";
} {
  if (p.descricao.includes(MENSAGEM_ESTRUTURA_INCOMPATIVEL)) {
    return { label: "Estrutura incompatível", variant: "destructive" };
  }
  if (p.descricao.includes(MENSAGEM_DESCONTO_FRACIONADO_MARGEM)) {
    return { label: "Desconto fracionado por margem", variant: "secondary" };
  }
  return { label: LABEL_TIPO[p.tipo], variant: "destructive" };
}

const LABEL_TIPO: Record<PendenciaConferenciaReal["tipo"], string> = {
  divergencia_valor: "Divergência de valor",
  desconto_sem_contrato: "Desconto sem contrato",
  contrato_sem_desconto: "Contrato sem desconto",
  margem_incompativel: "Margem incompatível",
  sem_evidencia: "Sem evidência/anexo",
  cartao_rmc_rcc_sem_confirmacao: "Cartão/RMC/RCC",
  match_baixo: "Match abaixo do limite",
  tolerancia_excedida: "Acima da tolerância",
  divergencia_consigfacil_campo: "Divergência ConsigFácil",
};

type Props = { pendencias: PendenciaConferenciaReal[] };

export function ConsignacoesPendenciasReaisPainel({ pendencias }: Props) {
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const visiveis = buildPendenciasReais(
    pendencias.filter((p) => !pendenciaOcultaPorTriagem(p.id)),
  );

  return (
    <Card className="border-amber-300/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="h-4 w-4" /> Conferência — pendências reais
        </CardTitle>
        <CardDescription>
          Somente passivo consignável (empréstimo, cartão, consignado). Exclui folha salarial,
          receitas, previdência, tributos e contas de consumo. {visiveis.length} item(ns) aberto(s).
        </CardDescription>
        <Link
          href="/dashboard/triagem"
          className="text-xs text-violet-600 hover:underline mt-1 inline-block"
        >
          Abrir painel Triagem Inteligente
        </Link>
      </CardHeader>
      <CardContent>
        {visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma pendência real no recorte atual — base alinhada ao ConsigFácil.
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-80 overflow-auto text-[11px]">
            {visiveis.map((p) => {
              const ctx = contextoDePendencia(p);
              const aberta = ativaId === p.id;
              const badge = rotuloBadgePendencia(p);
              return (
                <li key={p.id} className="rounded border p-2 bg-background space-y-2">
                  <div className="flex flex-wrap gap-1.5 items-center justify-between">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <Badge variant={badge.variant} className="text-[10px]">
                        {badge.label}
                      </Badge>
                      {p.competencia && (
                        <Badge variant="outline" className="text-[10px]">
                          {p.competencia}
                        </Badge>
                      )}
                      {p.instituicao_oficial && (
                        <span className="font-medium">{p.instituicao_oficial}</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={() => setAtivaId(aberta ? null : p.id)}
                    >
                      {aberta ? "Fechar" : "Resolver com perguntas"}
                    </Button>
                  </div>
                  <p>{p.descricao}</p>
                  {aberta && (
                    <TriagemInteligenteForm
                      contexto={ctx}
                      compacto
                      onConcluido={() => setAtivaId(null)}
                      onCancelar={() => setAtivaId(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
