"use client";

import { useMemo } from "react";
import { formatarIsoPtBr } from "@/lib/contratos/datas-texto-br";
import { gerarCronogramaContratoExtraido } from "@/services/contratos/cronograma-contrato-extraido";
import type { ContratoExtraido } from "@/types/contrato-extraido";

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = {
  extraido: ContratoExtraido;
  parcelasPagas?: number;
};

export function CronogramaContratoExtraidoBlock({ extraido, parcelasPagas = 0 }: Props) {
  const cron = useMemo(
    () => gerarCronogramaContratoExtraido(extraido, { parcelasPagas }),
    [extraido, parcelasPagas],
  );

  if (!cron) {
    return (
      <p className="text-[10px] text-muted-foreground leading-snug">
        Cronograma indisponível: falta 1º vencimento, parcela ou quantidade de parcelas no OCR.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/[0.06] p-2 space-y-2">
      <p className="text-[11px] font-semibold text-foreground">Cronograma e quitação antecipada</p>
      <p className="text-[10px] text-foreground/90 leading-snug">
        {cron.dataDocumentoBr ? (
          <>
            Data do documento: <strong>{cron.dataDocumentoBr}</strong>
            {" · "}
          </>
        ) : null}
        1º vencimento: <strong>{formatarIsoPtBr(cron.primeiroVencimento)}</strong>
        {" · "}
        Último: <strong>{formatarIsoPtBr(cron.ultimoVencimento)}</strong>
        {" · "}
        {cron.totalParcelas}× {formatBRL(cron.valorParcela)} = <strong>{formatBRL(cron.totalNominal)}</strong>
      </p>

      <div className="overflow-x-auto max-h-36 overflow-y-auto rounded border border-border/60">
        <table className="w-full text-[9px]">
          <thead>
            <tr className="text-muted-foreground border-b border-border/50">
              <th className="text-left py-1 px-1.5 font-medium">#</th>
              <th className="text-left py-1 px-1.5 font-medium">Vencimento</th>
              <th className="text-right py-1 px-1.5 font-medium">Parcela</th>
            </tr>
          </thead>
          <tbody>
            {cron.parcelas.length <= 6 ? (
              cron.parcelas.map((p) => (
                <tr key={p.numero} className="border-b border-border/30">
                  <td className="py-0.5 px-1.5">{p.numero}</td>
                  <td className="py-0.5 px-1.5">{p.vencimentoBr}</td>
                  <td className="py-0.5 px-1.5 text-right">{formatBRL(p.valor)}</td>
                </tr>
              ))
            ) : (
              <>
                {cron.parcelas.slice(0, 3).map((p) => (
                  <tr key={p.numero} className="border-b border-border/30">
                    <td className="py-0.5 px-1.5">{p.numero}</td>
                    <td className="py-0.5 px-1.5">{p.vencimentoBr}</td>
                    <td className="py-0.5 px-1.5 text-right">{formatBRL(p.valor)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="py-0.5 px-1.5 text-center text-muted-foreground">
                    … {cron.totalParcelas - 5} parcelas intermediárias …
                  </td>
                </tr>
                {cron.parcelas.slice(-2).map((p) => (
                  <tr key={p.numero} className="border-b border-border/30">
                    <td className="py-0.5 px-1.5">{p.numero}</td>
                    <td className="py-0.5 px-1.5">{p.vencimentoBr}</td>
                    <td className="py-0.5 px-1.5 text-right">{formatBRL(p.valor)}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded border border-sky-500/35 bg-sky-500/5 px-2 py-1.5 text-[10px] leading-snug space-y-1">
        <p className="font-medium text-foreground">Quitação antecipada (estimativa)</p>
        <p className="text-foreground/90">
          Com <strong>{cron.quitacao.parcelasRestantes}</strong> parcela(s) restante(s)
          {cron.parcelasPagasAssumidas > 0 ? ` (${cron.parcelasPagasAssumidas} já pagas no cadastro)` : ""}: valor
          presente ≈ <strong>{formatBRL(cron.quitacao.valorPresente)}</strong>
          {cron.quitacao.taxaMensalPctUsada > 0 ? (
            <>
              {" "}
              (taxa {cron.quitacao.taxaMensalPctUsada.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% a.m. —{" "}
              {cron.quitacao.fonteTaxa})
            </>
          ) : (
            <> ({cron.quitacao.fonteTaxa})</>
          )}
        </p>
        <p className="text-[9px] text-muted-foreground">
          Modelo BCB «prestações fixas»; o banco pode usar saldo devedor contábil distinto. Sincronize o cadastro do
          empréstimo com 1º vencimento = <code className="text-[9px]">{cron.primeiroVencimento}</code> e{" "}
          {cron.totalParcelas} parcelas.
        </p>
      </div>

      {cron.avisos.map((a) => (
        <p key={a} className="text-[9px] text-amber-800 dark:text-amber-200">
          {a}
        </p>
      ))}
    </div>
  );
}
