"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type {
  LinhaSaneamentoEstrutural,
  ResumoSaneamentoEstrutural,
} from "@/lib/contratos/normalizar-estrutura-contratos-historicos";

type Props = {
  linhas: LinhaSaneamentoEstrutural[];
  resumo: ResumoSaneamentoEstrutural | null;
  maxLinhas?: number;
};

export function SaneamentoEstruturalPainel({ linhas, resumo, maxLinhas = 200 }: Props) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas.slice(0, maxLinhas);
    return linhas
      .filter(
        (l) =>
          l.banco.toLowerCase().includes(q) ||
          l.contrato.toLowerCase().includes(q) ||
          (l.rubrica ?? "").toLowerCase().includes(q) ||
          (l.motivo_correcao ?? "").toLowerCase().includes(q),
      )
      .slice(0, maxLinhas);
  }, [linhas, busca, maxLinhas]);

  if (linhas.length === 0 && !resumo) return null;

  return (
    <Card className="border-amber-500/35">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Saneamento estrutural</CardTitle>
        <CardDescription>
          Correções de OCR, fusões desfeitas e refin descartados — não entram na fila financeira.
        </CardDescription>
        {resumo && (
          <div className="flex flex-wrap gap-1 pt-2">
            <Badge variant="outline">{resumo.contratos_analisados} contratos</Badge>
            <Badge variant="secondary">{resumo.parcelas_corrigidas} parcelas corrigidas</Badge>
            <Badge variant="destructive">{resumo.ocrs_invalidados} OCR inválido</Badge>
            <Badge variant="outline">{resumo.fusoes_desfeitas} fusões desfeitas</Badge>
            <Badge variant="outline">{resumo.refinanciamentos_descartados} refin descartados</Badge>
            {resumo.pendencias_financeiras_removidas > 0 && (
              <Badge className="bg-emerald-700">
                {resumo.pendencias_financeiras_removidas} pend. financeiras removidas
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Filtrar banco, contrato, rubrica…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-8 text-xs"
        />
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur">
              <tr className="text-left border-b">
                <th className="p-2 font-medium">Banco</th>
                <th className="p-2 font-medium">Contrato</th>
                <th className="p-2 font-medium">Rubrica</th>
                <th className="p-2 font-medium">Original</th>
                <th className="p-2 font-medium">Corrigida</th>
                <th className="p-2 font-medium">Motivo</th>
                <th className="p-2 font-medium">Fonte</th>
                <th className="p-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={`${l.entidade}-${l.contrato}`} className="border-b border-border/50">
                  <td className="p-2 whitespace-nowrap">{l.banco}</td>
                  <td className="p-2 font-mono">{l.contrato}</td>
                  <td className="p-2">{l.rubrica ?? "—"}</td>
                  <td className="p-2 tabular-nums">
                    {l.parcela_atual_original ?? "—"}/{l.parcelas_total_original ?? "—"}
                  </td>
                  <td className="p-2 tabular-nums">
                    {l.parcela_atual_corrigida ?? "—"}/{l.parcelas_total_corrigida ?? "—"}
                  </td>
                  <td className="p-2 max-w-[180px] truncate" title={l.motivo_correcao ?? ""}>
                    {l.motivo_correcao ?? "—"}
                  </td>
                  <td className="p-2">{l.fonte_correcao ?? "—"}</td>
                  <td className="p-2">
                    <Badge
                      variant={
                        l.status === "ocr_invalido"
                          ? "destructive"
                          : l.status === "corrigido"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {l.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {linhas.length > maxLinhas && (
          <p className="text-xs text-muted-foreground">
            Exibindo até {maxLinhas} de {linhas.length} linhas. Exporte o Excel para a aba completa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
