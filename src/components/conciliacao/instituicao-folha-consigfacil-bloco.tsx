"use client";

import { Info, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type { ConsigfacilConfirmacao } from "@/types/consigfacil";
import { rotuloBadgeAutoridadeTemporal } from "@/lib/consigfacil/autoridade-temporal-consigfacil";
import {
  BadgeCorrelacaoConsigfacil,
  mensagemSemContinuidadeInstitucional,
} from "@/components/dashboard/conciliacao/conciliacao-badges";
import { DESCRICAO_CONTEXTO_INDEPENDENTE } from "@/lib/conciliacao/tipo-divergencia-contextual";
import { linhaEhRubricaConsignavel } from "@/lib/conciliacao/regras-natureza-consignavel";

export type LinhaComInstituicaoConciliacao = BaseConciliadaLinha & {
  confirmacao_consigfacil?: ConsigfacilConfirmacao;
};

export function InstituicaoFolhaConsigfacilBloco({ linha }: { linha: LinhaComInstituicaoConciliacao }) {
  if (!linhaEhRubricaConsignavel(linha)) return null;

  const cf = linha.confirmacao_consigfacil;
  const ctx = linha.contexto_instituicao;
  const rubricaOriginal =
    linha.descricao_original || linha.descricao_normalizada;
  const bancoFolha =
    linha.instituicao_original_folha ??
    cf?.instituicao_original_folha ??
    ctx?.instituicao_original_folha ??
    (linha.banco_origem && linha.banco_origem !== "—" ? linha.banco_origem : null);

  const semContinuidade = cf?.tipo_correlacao === "sem_relacao_confirmada";
  const temCorrelacao =
    !semContinuidade &&
    Boolean(cf?.contrato_correlato ?? cf?.id_consignacao_confirmada);
  if (!temCorrelacao && !bancoFolha && !semContinuidade) return null;

  return (
    <div className="rounded-md border border-border/80 bg-muted/20 px-2.5 py-2 text-[11px] space-y-1.5 mt-1">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          Rubrica original
        </p>
        <p className="font-medium text-foreground">{rubricaOriginal}</p>
        {bancoFolha && (
          <p className="text-muted-foreground">({bancoFolha})</p>
        )}
      </div>

      {semContinuidade && (
        <p className="text-[10px] text-sky-900 dark:text-sky-100 leading-snug flex items-start gap-1">
          <Info className="h-3 w-3 shrink-0 mt-0.5" />
          {cf?.mensagem_correlacao ?? mensagemSemContinuidadeInstitucional(cf)}
          <span className="block text-muted-foreground mt-0.5">{DESCRICAO_CONTEXTO_INDEPENDENTE}</span>
        </p>
      )}

      {temCorrelacao && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            ConsigFácil correlato
          </p>
          <p>
            Contrato{" "}
            <span className="font-mono font-semibold">
              {cf!.id_consignacao_confirmada}
            </span>
          </p>
          <p>
            Banco atual:{" "}
            <span className="font-medium">
              {cf!.banco_atual_consigfacil ??
                cf!.instituicao_oficial_consigfacil ??
                "—"}
            </span>
          </p>
          {cf!.possivel_migracao_carteira && (
            <Badge variant="outline" className="mt-1 text-[10px] border-amber-500/60 text-amber-800 dark:text-amber-200">
              Possível migração de carteira
            </Badge>
          )}
          {(cf!.autoridade_temporal_consigfacil ??
            linha.autoridade_temporal_consigfacil) && (
            <div className="mt-2 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Autoridade temporal
              </p>
              <Badge variant="outline" className="text-[10px]">
                {rotuloBadgeAutoridadeTemporal(
                  (cf!.autoridade_temporal_consigfacil ??
                    linha.autoridade_temporal_consigfacil)!,
                )}
              </Badge>
              <p className="text-muted-foreground leading-snug">
                {cf!.mensagem_autoridade_temporal ??
                  linha.mensagem_autoridade_temporal ??
                  ctx?.temporal.mensagem_autoridade_temporal}
              </p>
              {cf!.contrato_migrado_para_consigfacil && (
                <p className="text-amber-800 dark:text-amber-200">
                  Contrato em andamento migrado para o ConsigFácil
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { BadgeCorrelacaoConsigfacil } from "@/components/dashboard/conciliacao/conciliacao-badges";
