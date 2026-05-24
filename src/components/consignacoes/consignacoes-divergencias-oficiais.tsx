"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  FileWarning,
  FileMinus,
  ShieldOff,
  CircleSlash,
  FileX,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ConsigfacilAjusteBase, ConsigfacilContrato } from "@/types/consigfacil";
import type { ConsignacaoOrdenadaLinha } from "@/lib/consignacoes-governo/consolidar-consignacoes-ordenadas";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

type CategoriaDivergencia =
  | "consigfacil_vs_contracheque"
  | "consigfacil_vs_contrato"
  | "folha_sem_oficial"
  | "contrato_sem_desconto"
  | "desconto_sem_contrato";

const META: Record<
  CategoriaDivergencia,
  { titulo: string; descricao: string; cor: string; icon: React.ComponentType<{ className?: string }> }
> = {
  consigfacil_vs_contracheque: {
    titulo: "ConsigFácil × Contracheque",
    descricao: "Divergências apontadas pelos ajustes oficiais sobre rubricas do contracheque.",
    cor: "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20",
    icon: FileWarning,
  },
  consigfacil_vs_contrato: {
    titulo: "ConsigFácil × Contrato (Loan)",
    descricao: "Divergências oficiais comparadas com o cadastro interno do empréstimo.",
    cor: "border-orange-300 bg-orange-50/40 dark:bg-orange-950/20",
    icon: AlertTriangle,
  },
  folha_sem_oficial: {
    titulo: "Folha sem confirmação oficial",
    descricao:
      "Contratos com desconto observado em folha mas que NÃO foram confirmados pelo ConsigFácil.",
    cor: "border-red-300 bg-red-50/40 dark:bg-red-950/20",
    icon: ShieldOff,
  },
  contrato_sem_desconto: {
    titulo: "Contrato ConsigFácil sem desconto",
    descricao: "Contrato oficial ativo mas sem nenhum desconto detectado em folha/extrato.",
    cor: "border-blue-300 bg-blue-50/40 dark:bg-blue-950/20",
    icon: FileMinus,
  },
  desconto_sem_contrato: {
    titulo: "Desconto sem contrato",
    descricao: "Linhas com desconto recorrente sem `Loan` nem ConsigFácil correspondentes.",
    cor: "border-rose-300 bg-rose-50/40 dark:bg-rose-950/20",
    icon: FileX,
  },
};

type Props = {
  ajustes: ConsigfacilAjusteBase[];
  consignacoes: ConsignacaoOrdenadaLinha[];
  contratosConsigfacil: ConsigfacilContrato[];
};

export function ConsignacoesDivergenciasOficiais({
  ajustes,
  consignacoes,
  contratosConsigfacil,
}: Props) {
  const grupos = useMemo(() => {
    const consigfacil_vs_contracheque: ConsigfacilAjusteBase[] = [];
    const consigfacil_vs_contrato: ConsigfacilAjusteBase[] = [];
    for (const a of ajustes) {
      if (a.tipo_ajuste !== "divergencia") continue;
      if (a.alvo_tipo === "contracheque_item") consigfacil_vs_contracheque.push(a);
      else if (a.alvo_tipo === "loan") consigfacil_vs_contrato.push(a);
    }

    const folha_sem_oficial = consignacoes.filter(
      (l) =>
        l.alvo_tipo === "loan" &&
        l.meses_detectados > 0 &&
        !l.confirmado_consigfacil &&
        !l.vinculo_consigfacil_id,
    );

    // Contratos ConsigFácil sem nenhuma linha consolidada com desconto observado.
    const contrato_sem_desconto = contratosConsigfacil.filter((c) => {
      if (c.status !== "ativo") return false;
      if (c.eh_cartao_beneficio) return false; // cartão benefício costuma ter "sem lançamento"
      const linha = consignacoes.find((l) => l.vinculo_consigfacil_id === c.id_consignacao);
      return !linha || linha.meses_detectados === 0;
    });

    const desconto_sem_contrato = consignacoes.filter((l) => l.alvo_tipo === "desconto_avulso");

    return {
      consigfacil_vs_contracheque,
      consigfacil_vs_contrato,
      folha_sem_oficial,
      contrato_sem_desconto,
      desconto_sem_contrato,
    };
  }, [ajustes, consignacoes, contratosConsigfacil]);

  const totalDivergencias =
    grupos.consigfacil_vs_contracheque.length +
    grupos.consigfacil_vs_contrato.length +
    grupos.folha_sem_oficial.length +
    grupos.contrato_sem_desconto.length +
    grupos.desconto_sem_contrato.length;

  if (totalDivergencias === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleSlash className="h-4 w-4" /> Divergências oficiais
          </CardTitle>
          <CardDescription>Sem divergências detectadas no recorte atual.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Divergências oficiais
        </CardTitle>
        <CardDescription>
          {totalDivergencias} ponto(s) de auditoria distribuído(s) em 5 categorias.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ConsigFácil × Contracheque */}
        <BlocoAjustes
          categoria="consigfacil_vs_contracheque"
          itens={grupos.consigfacil_vs_contracheque}
        />
        {/* ConsigFácil × Contrato */}
        <BlocoAjustes categoria="consigfacil_vs_contrato" itens={grupos.consigfacil_vs_contrato} />

        {/* Folha sem confirmação oficial */}
        <BlocoConsignacoes
          categoria="folha_sem_oficial"
          itens={grupos.folha_sem_oficial}
          mensagemVazio="Tudo confirmado."
        />
        {/* Contrato sem desconto */}
        <BlocoContratos
          categoria="contrato_sem_desconto"
          itens={grupos.contrato_sem_desconto}
        />
        {/* Desconto sem contrato */}
        <BlocoConsignacoes
          categoria="desconto_sem_contrato"
          itens={grupos.desconto_sem_contrato}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function BlocoAjustes({
  categoria,
  itens,
}: {
  categoria: CategoriaDivergencia;
  itens: ConsigfacilAjusteBase[];
}) {
  if (itens.length === 0) return null;
  const meta = META[categoria];
  const Icon = meta.icon;
  return (
    <div className={`rounded-md border p-3 ${meta.cor}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-sm">
            {meta.titulo} <Badge variant="outline" className="ml-1 text-[10px]">{itens.length}</Badge>
          </p>
          <p className="text-[11px] text-muted-foreground">{meta.descricao}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1 text-[11px]">
        {itens.slice(0, 10).map((a, i) => (
          <li key={i} className="rounded border p-2 bg-background">
            <p className="font-mono text-[10px] text-muted-foreground">
              {a.alvo_tipo}:{a.alvo_id} · {a.campo}
            </p>
            <p>
              Original ({a.fonte_original}):{" "}
              <span className="font-mono">{String(a.valor_original ?? "—")}</span>
              {" → "}Oficial: <span className="font-mono">{String(a.valor_oficial ?? "—")}</span>
              {a.diferenca_pct != null && (
                <Badge variant="outline" className="ml-1 text-[10px]">
                  Δ {a.diferenca_pct.toFixed(1)}%
                </Badge>
              )}
            </p>
            {a.motivo_ajuste && (
              <p className="text-muted-foreground italic">{a.motivo_ajuste}</p>
            )}
          </li>
        ))}
        {itens.length > 10 && (
          <li className="text-muted-foreground">+ {itens.length - 10} item(ns)…</li>
        )}
      </ul>
    </div>
  );
}

function BlocoConsignacoes({
  categoria,
  itens,
  mensagemVazio,
}: {
  categoria: CategoriaDivergencia;
  itens: ConsignacaoOrdenadaLinha[];
  mensagemVazio?: string;
}) {
  if (itens.length === 0) return null;
  void mensagemVazio;
  const meta = META[categoria];
  const Icon = meta.icon;
  return (
    <div className={`rounded-md border p-3 ${meta.cor}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5" />
        <div>
          <p className="font-medium text-sm">
            {meta.titulo}{" "}
            <Badge variant="outline" className="ml-1 text-[10px]">{itens.length}</Badge>
          </p>
          <p className="text-[11px] text-muted-foreground">{meta.descricao}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1 text-[11px]">
        {itens.slice(0, 10).map((l) => (
          <li key={l.id} className="rounded border p-2 bg-background flex items-center gap-2 flex-wrap">
            <strong>{l.instituicao_oficial}</strong>
            <Badge variant="outline" className="text-[10px]">{l.grupo_canonico}</Badge>
            <span className="text-muted-foreground">
              {l.primeiro_desconto ?? "—"} → {l.ultimo_desconto ?? "—"} · {l.meses_detectados}m
            </span>
            <span className="tabular-nums ml-auto">{brl(l.valor_parcela_oficial)}</span>
          </li>
        ))}
        {itens.length > 10 && (
          <li className="text-muted-foreground">+ {itens.length - 10} item(ns)…</li>
        )}
      </ul>
    </div>
  );
}

function BlocoContratos({
  categoria,
  itens,
}: {
  categoria: CategoriaDivergencia;
  itens: ConsigfacilContrato[];
}) {
  if (itens.length === 0) return null;
  const meta = META[categoria];
  const Icon = meta.icon;
  return (
    <div className={`rounded-md border p-3 ${meta.cor}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5" />
        <div>
          <p className="font-medium text-sm">
            {meta.titulo}{" "}
            <Badge variant="outline" className="ml-1 text-[10px]">{itens.length}</Badge>
          </p>
          <p className="text-[11px] text-muted-foreground">{meta.descricao}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1 text-[11px]">
        {itens.slice(0, 10).map((c) => (
          <li key={c.id_consignacao} className="rounded border p-2 bg-background flex items-center gap-2 flex-wrap">
            <strong>{c.instituicao}</strong>
            <span className="text-muted-foreground">
              {c.parcela_atual}/{c.parcelas_total} · {c.status}
            </span>
            <span className="tabular-nums ml-auto">{brl(c.valor_parcela)}</span>
          </li>
        ))}
        {itens.length > 10 && (
          <li className="text-muted-foreground">+ {itens.length - 10} item(ns)…</li>
        )}
      </ul>
    </div>
  );
}
