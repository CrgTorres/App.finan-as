"use client";

import type { ContratoExtraido } from "@/types/contrato-extraido";
import type { ResultadoChecagemBcbPrestFixas } from "@/services/contratos/bcb-calculadora-cidadao-financiamento";
import { URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS } from "@/services/contratos/bcb-calculadora-cidadao-financiamento";
import { ExternalLink } from "lucide-react";

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = {
  extraido: ContratoExtraido;
  resumo: ResultadoChecagemBcbPrestFixas;
};

/** Linha compacta + valores para colar no simulador BCB (prestações fixas). */
export function ResumoBcbCalculadoraCidadao({ extraido, resumo }: Props) {
  const meses = extraido.parcelas != null ? Math.round(extraido.parcelas) : null;
  const parcela = extraido.parcela;
  const financiado = resumo.valorFinanciadoUsado;
  const taxaImpl = resumo.taxaImplicitaMensalPct.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });

  const camposSimulador = [
    { rotulo: "Nº meses", valor: meses != null ? String(meses) : "—" },
    {
      rotulo: "Taxa juros mensal",
      valor: extraido.jurosMensal != null ? `${extraido.jurosMensal}%` : `${taxaImpl}% (implícita)`,
    },
    { rotulo: "Valor da prestação", valor: parcela != null ? formatBRL(parcela) : "—" },
    { rotulo: "Valor financiado", valor: formatBRL(financiado) },
  ];

  return (
    <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] min-w-0">
          <span className="font-semibold text-foreground shrink-0">BCB · prestações fixas</span>
          <span className="text-muted-foreground tabular-nums">
            Implícita <strong className="text-foreground">{taxaImpl}%</strong> a.m.
          </span>
          {extraido.cetMensal != null ? (
            <span className="text-muted-foreground tabular-nums">· CET doc. {extraido.cetMensal}% a.m.</span>
          ) : null}
        </div>
        <a
          href={URL_CALCULADORA_CIDADAO_FIN_PREST_FIXAS}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400 hover:underline shrink-0"
        >
          Simulador
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>

      <details className="text-[10px] group">
        <summary className="cursor-pointer text-muted-foreground list-none [&::-webkit-details-marker]:hidden hover:text-foreground">
          Campos para colar no BCB
        </summary>
        <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {camposSimulador.map((c) => (
            <div key={c.rotulo} className="min-w-0 rounded border border-border/40 bg-background/50 px-2 py-1.5">
              <dt className="text-[9px] text-muted-foreground leading-tight">{c.rotulo}</dt>
              <dd className="font-medium text-foreground tabular-nums truncate" title={c.valor}>
                {c.valor}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
