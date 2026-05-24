"use client";

import { useMemo } from "react";
import { AlertTriangle, GitBranch, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConsigfacilContrato } from "@/types/consigfacil";
import type { EventoOperacionalConsignado } from "@/lib/consigfacil/detectar-eventos-operacionais";
import { montarLinhaDoTempoContrato } from "@/lib/consigfacil/detectar-eventos-operacionais";
import {
  CLASSE_COR,
  LABEL_ORIGEM,
  LABEL_STATUS_CONTRATO,
  LABEL_TIPO_EVENTO,
  corPorTipoEvento,
  fmtBrl,
  formatCompetenciaPt,
  nomeInstituicaoContrato,
  rotuloContratoOperacional,
  rotuloParcelaContrato,
  rotuloSituacaoImportacao,
  textoTimelineAssertivo,
} from "./eventos-operacionais-shared";

type Props = {
  contratos: ConsigfacilContrato[];
  eventos: EventoOperacionalConsignado[];
  contratoSelecionado: string | null;
  onContratoChange: (id: string) => void;
};

function ResumoCampo({
  rotulo,
  valor,
  mono,
}: {
  rotulo: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-[120px]">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={`text-xs font-medium leading-snug ${mono ? "font-mono tabular-nums" : ""}`}>
        {valor}
      </p>
    </div>
  );
}

export function TimelineContratoOperacional({
  contratos,
  eventos,
  contratoSelecionado,
  onContratoChange,
}: Props) {
  const contrato = useMemo(
    () =>
      contratos.find(
        (c) =>
          c.id_consignacao === contratoSelecionado ||
          c.codigo_instituicao === contratoSelecionado,
      ) ?? contratos[0] ?? null,
    [contratos, contratoSelecionado],
  );

  const linhas = useMemo(() => {
    if (!contrato) return [];
    return montarLinhaDoTempoContrato(contrato, eventos);
  }, [contrato, eventos]);

  if (contratos.length === 0) {
    return null;
  }

  const idAtual = contrato?.id_consignacao ?? contratos[0]?.id_consignacao ?? "";
  const labelAtual = contrato ? rotuloContratoOperacional(contrato) : "Selecione o contrato";

  const banco = contrato ? nomeInstituicaoContrato(contrato) : "—";
  const codigo = contrato?.codigo_instituicao ?? contrato?.id_consignacao ?? "—";
  const importacao = contrato ? rotuloSituacaoImportacao(contrato.situacao_importacao) : null;
  const statusLabel = contrato
    ? (LABEL_STATUS_CONTRATO[contrato.status] ?? contrato.status)
    : "—";
  const suspenso = contrato?.status === "suspenso";

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4" /> Timeline operacional por contrato
          </CardTitle>
          <CardDescription className="mt-1.5 max-w-2xl leading-relaxed">
            Mostra, mês a mês, por que o desconto parou ou voltou — com base no ConsigFácil e na
            folha. Use para distinguir <strong>suspensão real</strong> de falso refinanciamento.
          </CardDescription>
        </div>

        <div className="max-w-xl space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Contrato analisado
          </p>
          <Select value={idAtual} onValueChange={(v) => v && onContratoChange(v)}>
            <SelectTrigger className="h-9 text-xs text-left">
              <SelectValue placeholder="Selecione o contrato">{labelAtual}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {contratos.map((c) => (
                <SelectItem key={c.id_consignacao} value={c.id_consignacao} className="text-xs">
                  {rotuloContratoOperacional(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {contrato && (
          <>
            {suspenso && (
              <div
                role="status"
                className="flex gap-2 rounded-lg border border-red-300/70 bg-red-50/90 px-3 py-2.5 text-xs text-red-950 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-100"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Contrato suspenso no ConsigFácil</p>
                  <p className="mt-0.5 opacity-90 leading-relaxed">
                    O portal não deve processar desconto enquanto a suspensão estiver ativa. Não
                    classifique automaticamente como refinanciamento ou quitação.
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                Resumo do contrato
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <ResumoCampo rotulo="Instituição (oficial)" valor={banco} />
                <ResumoCampo rotulo="Código no banco" valor={codigo} mono />
                <ResumoCampo rotulo="Parcelas" valor={rotuloParcelaContrato(contrato)} />
                <ResumoCampo
                  rotulo="Parcela mensal (portal)"
                  valor={fmtBrl(contrato.valor_parcela)}
                  mono
                />
                <ResumoCampo rotulo="Situação no portal" valor={statusLabel} />
                {importacao && <ResumoCampo rotulo="Origem da linha" valor={importacao} />}
                {contrato.competencia && (
                  <ResumoCampo
                    rotulo="Competência do print"
                    valor={formatCompetenciaPt(contrato.competencia)}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum evento operacional encontrado para este contrato no recorte atual. Importe uma
            captura do ConsigFácil ou registre e-mail de suspensão/bloqueio.
          </p>
        ) : (
          <ol className="relative border-l border-border ml-2 space-y-4">
            {linhas.map((l) => {
              const cor = corPorTipoEvento(l.tipo);
              const assertivo = contrato ? textoTimelineAssertivo(l, contrato) : null;
              const tipoLabel =
                LABEL_TIPO_EVENTO[l.tipo as keyof typeof LABEL_TIPO_EVENTO] ?? l.tipo;
              const origemLabel = LABEL_ORIGEM[l.origem as keyof typeof LABEL_ORIGEM] ?? l.origem;
              const semDesconto =
                l.valor_descontado == null ||
                l.valor_descontado === 0 ||
                (l.valor_previsto != null &&
                  l.valor_previsto > 0 &&
                  (l.valor_descontado ?? 0) === 0);

              return (
                <li key={`${l.competencia}-${l.tipo}`} className="ml-4">
                  <span
                    className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 bg-background ${cor === "verde" ? "border-emerald-500" : cor === "vermelho" ? "border-red-500" : cor === "amarelo" ? "border-amber-500" : cor === "roxo" ? "border-violet-500" : "border-muted-foreground"}`}
                  />
                  <div className={`rounded-lg border p-3 text-[11px] ${CLASSE_COR[cor]}`}>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <strong className="tabular-nums text-xs">
                        {formatCompetenciaPt(l.competencia)}
                      </strong>
                      <Badge variant="outline" className="text-[9px] h-5 font-medium">
                        {tipoLabel}
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] h-5">
                        Fonte: {origemLabel}
                      </Badge>
                      {semDesconto && l.tipo !== "desconto_recuperado" && (
                        <Badge variant="destructive" className="text-[9px] h-5">
                          Sem desconto na folha
                        </Badge>
                      )}
                    </div>

                    {assertivo ? (
                      <div className="space-y-1.5 mb-2">
                        <p className="font-semibold text-xs leading-snug">{assertivo.titulo}</p>
                        <p className="leading-relaxed opacity-95">{assertivo.detalhe}</p>
                        <p className="flex gap-1.5 items-start leading-relaxed opacity-90 italic">
                          <Info className="h-3 w-3 shrink-0 mt-0.5" />
                          <span>{assertivo.impacto}</span>
                        </p>
                      </div>
                    ) : (
                      <p className="leading-snug mb-2">{l.evento}</p>
                    )}

                    <div className="grid gap-2 sm:grid-cols-3 rounded-md border border-black/5 dark:border-white/10 bg-background/40 px-2.5 py-2 tabular-nums text-[10px]">
                      <div>
                        <p className="text-muted-foreground">Parcela prevista (portal)</p>
                        <p className="font-medium">{fmtBrl(l.valor_previsto)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Desconto na folha</p>
                        <p className={`font-medium ${semDesconto ? "text-red-700 dark:text-red-300" : ""}`}>
                          {fmtBrl(l.valor_descontado)}
                        </p>
                      </div>
                      {l.valor_previsto != null &&
                        l.valor_descontado != null &&
                        l.valor_previsto > 0 && (
                          <div>
                            <p className="text-muted-foreground">Diferença</p>
                            <p className="font-medium">
                              {fmtBrl(l.valor_descontado - l.valor_previsto)}
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
