"use client";

import { Badge } from "@/components/ui/badge";
import type { SinteseConfiabilidadeContrato } from "@/services/contratos/auditar-confiabilidade-contrato";
import type { NivelConfiancaLeitura } from "@/types/contrato-extraido";

function badgeNivel(n: NivelConfiancaLeitura) {
  if (n === "alta")
    return <Badge className="text-[10px] h-5 bg-emerald-600/90">Confiança alta</Badge>;
  if (n === "media") return <Badge className="text-[10px] h-5 bg-amber-600/90">Confiança média</Badge>;
  return <Badge variant="destructive" className="text-[10px] h-5">Confiança baixa</Badge>;
}

function badgeConfianca(c: "alta" | "media" | "baixa" | "ausente") {
  const map = {
    alta: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
    media: "bg-amber-600/15 text-amber-900 dark:text-amber-100",
    baixa: "bg-orange-600/15 text-orange-900 dark:text-orange-100",
    ausente: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`text-[8px] px-1 py-0 rounded font-medium uppercase ${map[c]}`}>{c}</span>
  );
}

type Props = {
  sintese: SinteseConfiabilidadeContrato;
  scoreOcr?: number;
};

export function SinteseConfiabilidadeContratoBlock({ sintese, scoreOcr }: Props) {
  const temBloqueio = sintese.bloqueiosConfirmacao.length > 0;

  return (
    <div
      className={`rounded-md border p-3 space-y-2.5 ${
        temBloqueio
          ? "border-destructive/50 bg-destructive/5"
          : sintese.nivelGeral === "alta"
            ? "border-emerald-500/45 bg-emerald-500/[0.06]"
            : "border-amber-500/40 bg-amber-500/[0.05]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold text-foreground">Síntese de confiabilidade</p>
        {badgeNivel(sintese.nivelGeral)}
        <span className="text-[10px] text-muted-foreground">
          Score ajustado {sintese.scoreAjustado}/100
          {scoreOcr != null ? ` · OCR bruto ${scoreOcr}/100` : ""}
        </span>
        {!sintese.podeConfirmar ? (
          <Badge variant="outline" className="text-[9px] h-5 border-destructive/60 text-destructive">
            Confirmação bloqueada
          </Badge>
        ) : null}
      </div>

      <p className="text-[10px] text-foreground/90 leading-snug">{sintese.veredito}</p>

      <div className="grid gap-2 sm:grid-cols-2 text-[10px]">
        <div className="rounded border border-border/50 bg-background/40 px-2 py-1.5">
          <p className="font-medium text-foreground mb-0.5">Seguro</p>
          <p className="text-foreground/90 leading-snug">{sintese.seguro.resumo}</p>
        </div>
        <div className="rounded border border-border/50 bg-background/40 px-2 py-1.5">
          <p className="font-medium text-foreground mb-0.5">Datas</p>
          <p
            className={`leading-snug ${sintese.datas.coerentes ? "text-foreground/90" : "text-destructive font-medium"}`}
          >
            {sintese.datas.resumo}
          </p>
        </div>
      </div>

      {sintese.pontosFortes.length > 0 ? (
        <div>
          <p className="text-[9px] font-medium text-emerald-800 dark:text-emerald-200 mb-0.5">
            Pontos consistentes
          </p>
          <ul className="list-disc pl-4 text-[9px] text-foreground/85 space-y-0.5">
            {sintese.pontosFortes.map((p) => (
              <li key={p.slice(0, 40)}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {sintese.bloqueiosConfirmacao.length > 0 ? (
        <ul className="list-disc pl-4 text-[10px] text-destructive space-y-0.5">
          {sintese.bloqueiosConfirmacao.map((b) => (
            <li key={b.slice(0, 48)}>{b}</li>
          ))}
        </ul>
      ) : null}

      {sintese.pendencias.length > 0 ? (
        <ul className="list-disc pl-4 text-[10px] text-amber-900 dark:text-amber-100 space-y-0.5">
          {sintese.pendencias.slice(0, 5).map((p) => (
            <li key={p.slice(0, 48)}>{p}</li>
          ))}
        </ul>
      ) : null}

      <details className="text-[9px]">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          Confiança por campo ({sintese.campos.length})
        </summary>
        <ul className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
          {sintese.campos.map((c) => (
            <li key={String(c.chave)} className="flex flex-wrap items-center gap-1.5 gap-y-0.5">
              {badgeConfianca(c.confianca)}
              <span className="text-muted-foreground">{c.rotulo}:</span>
              <span className="font-medium text-foreground">{c.valorExibicao}</span>
            </li>
          ))}
        </ul>
      </details>

      <p className="text-[8px] text-muted-foreground leading-snug border-t border-border/40 pt-2">
        O app cruza OCR, matemática (IOF, parcela×prazo, BCB) e titular logado. Não substitui advogado nem o PDF
        assinado — use para decisão prática e sync do cadastro com rastreio.
      </p>
    </div>
  );
}
