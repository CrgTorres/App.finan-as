"use client";

import { useState } from "react";
import { Archive, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LinhaMonitoramentoHistoricoTriagem } from "@/lib/triagem/classificar-natureza-estrutural-pendencia";

function fmtMoeda(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ROTULO_ORIGEM: Record<string, string> = {
  ficha_financeira: "Ficha financeira",
  inferencia_historica: "Inferência histórica",
  ocr_legado: "OCR legado (sem PARC)",
  extrato_bancario: "Extrato bancário",
  consigfacil: "ConsigFácil",
};

type Props = {
  linhas: LinhaMonitoramentoHistoricoTriagem[];
  total: number;
};

export function MonitoramentoHistoricoTriagemPainel({ linhas, total }: Props) {
  const [aberto, setAberto] = useState(false);

  if (total === 0) return null;

  return (
    <Card className="border-slate-400/40 bg-slate-500/5">
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setAberto((v) => !v)}
        >
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Archive className="h-4 w-4 text-slate-600" />
              Histórico identificado sem estrutura oficial
              <Badge variant="secondary" className="text-[10px]">
                {total}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Processamento histórico saneado — sem necessidade de ação humana estrutural
            </CardDescription>
          </div>
          {aberto ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
        </button>
      </CardHeader>
      {aberto && (
        <CardContent className="max-h-72 overflow-y-auto">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 pr-2">Banco</th>
                  <th className="py-1 pr-2">Período</th>
                  <th className="py-1 pr-2">Meses</th>
                  <th className="py-1 pr-2">Valor médio</th>
                  <th className="py-1">Origem</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.pendencia_id} className="border-b border-border/40">
                    <td className="py-1.5 pr-2 font-medium">{l.banco}</td>
                    <td className="py-1.5 pr-2">{l.periodo}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{l.meses_detectados}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{fmtMoeda(l.valor_medio)}</td>
                    <td className="py-1.5 text-muted-foreground">
                      {ROTULO_ORIGEM[l.origem] ?? l.origem}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
