"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ResultadoFonteIntegracao } from "@/lib/auditoria/auditoria-integracao-fontes";
import type { FonteIntegracaoId } from "@/lib/auditoria/auditoria-integracao-fontes";

const TITULO: Record<FonteIntegracaoId, string> = {
  ficha_financeira: "Ficha financeira",
  contracheque: "Contracheques",
  extrato_bancario: "Extratos bancários",
  nota_fiscal: "Notas fiscais",
  contrato_emprestimo: "Contratos",
  margem_consignavel: "Margem consignável",
  consigfacil: "ConsigFácil",
  decisao_judicial: "Decisões judiciais",
  evidencia_ocr: "OCR / evidências",
  perfil_leitura: "Perfil de leitura",
};

const VARIANT_STATUS: Record<
  ResultadoFonteIntegracao["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  integrada: "default",
  parcial: "secondary",
  ausente: "destructive",
  com_erro: "destructive",
  desatualizada: "outline",
};

const LINK_ACAO: Partial<Record<FonteIntegracaoId, string>> = {
  ficha_financeira: "/dashboard/contracheque",
  contracheque: "/dashboard/contracheque",
  extrato_bancario: "/dashboard/import",
  nota_fiscal: "/dashboard/nota-fiscal",
  contrato_emprestimo: "/dashboard/contrato-emprestimo",
  margem_consignavel: "/dashboard/conciliacao",
  consigfacil: "/dashboard/consignacoes",
  decisao_judicial: "/dashboard/contrato-emprestimo",
  evidencia_ocr: "/dashboard/analise",
  perfil_leitura: "/dashboard/configuracao-leitura",
};

type Props = {
  fonte: ResultadoFonteIntegracao;
  onReprocessar?: () => void;
  reprocessando?: boolean;
};

export function FonteIntegracaoCard({ fonte, onReprocessar, reprocessando }: Props) {
  const titulo = TITULO[fonte.fonte];
  const link = LINK_ACAO[fonte.fonte];

  return (
    <Card
      className={
        fonte.status === "integrada"
          ? "border-emerald-300/50"
          : fonte.status === "ausente"
            ? "border-red-300/50"
            : fonte.precisa_reprocessar
              ? "border-amber-400/60"
              : ""
      }
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{titulo}</CardTitle>
          <Badge variant={VARIANT_STATUS[fonte.status]} className="text-[9px] shrink-0 uppercase">
            {fonte.status}
          </Badge>
        </div>
        <CardDescription className="text-[10px] tabular-nums">
          {fonte.quantidade_registros} registro(s)
          {fonte.ultima_atualizacao ? ` · ${fonte.ultima_atualizacao.slice(0, 10)}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-[10px]">
        {fonte.usada_em.length > 0 && (
          <p>
            <span className="text-muted-foreground">Usada em: </span>
            {fonte.usada_em.slice(0, 4).join(", ")}
            {fonte.usada_em.length > 4 ? ` +${fonte.usada_em.length - 4}` : ""}
          </p>
        )}
        {fonte.pendencias.length > 0 && (
          <ul className="list-disc pl-3 text-amber-800 dark:text-amber-200 space-y-0.5">
            {fonte.pendencias.slice(0, 2).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {fonte.recomendacoes[0] && (
          <p className="text-muted-foreground leading-snug">{fonte.recomendacoes[0]}</p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {link && (
            <Link
              href={link}
              className="inline-flex h-7 items-center rounded-md border px-2 text-[10px] hover:bg-muted"
            >
              Abrir fonte
            </Link>
          )}
          {fonte.precisa_reprocessar && onReprocessar && (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-[10px]"
              onClick={onReprocessar}
              disabled={reprocessando}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${reprocessando ? "animate-spin" : ""}`} />
              Reprocessar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
