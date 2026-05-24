"use client";

import { useMemo, useState } from "react";
import {
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  HelpCircle,
  Search,
  Tag,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ResumoQualidadeClassificacao } from "@/lib/dashboard/base-financeira-normalizada";
import { ehDivergenciaClassificacaoReal } from "@/lib/conciliacao/classificacao-canonica";
import { ConciliacaoInspecaoLinha } from "@/components/dashboard/conciliacao/conciliacao-inspecao-linha";
import type {
  FonteClassificacao,
  GrupoFinanceiroCanonico,
  ResultadoClassificacaoFinanceira,
} from "@/types/consigfacil";

const ROTULO_FONTE: Record<FonteClassificacao, string> = {
  consigfacil_oficial: "ConsigFácil oficial",
  alias_oficial: "Alias oficial",
  match_exato_catalogo: "Match exato (catálogo)",
  match_alias_catalogo: "Match alias (catálogo)",
  match_fuzzy_catalogo: "Match fuzzy (catálogo)",
  ocr_contracheque: "OCR contracheque",
  heuristica_descricao: "Heurística descrição",
  inferencia: "Inferência",
  sem_correspondencia: "Sem correspondência",
};

const COR_FONTE: Record<FonteClassificacao, string> = {
  consigfacil_oficial: "bg-emerald-600",
  alias_oficial: "bg-emerald-500",
  match_exato_catalogo: "bg-emerald-400",
  match_alias_catalogo: "bg-sky-500",
  match_fuzzy_catalogo: "bg-sky-400",
  ocr_contracheque: "bg-amber-400",
  heuristica_descricao: "bg-amber-500",
  inferencia: "bg-orange-500",
  sem_correspondencia: "bg-red-500",
};

const ROTULO_GRUPO: Record<GrupoFinanceiroCanonico, string> = {
  emprestimo_consignado: "Empréstimo consignado",
  cartao_beneficio: "Cartão benefício",
  cartao_credito: "Cartão de crédito",
  contribuicao: "Contribuição",
  seguros: "Seguros",
  refinanciamentos: "Refinanciamentos",
  saque_complementar: "Saque complementar",
  rmc: "RMC",
  rcc: "RCC",
  outros: "Outros",
  rubrica_folha_nao_consignavel: "Fora da conciliação consignável",
  conta_consumo: "Conta de consumo",
};

export type ConsigfacilQualidadeClassificacaoPainelProps = {
  resumo: ResumoQualidadeClassificacao;
  classificacoesLoans: Array<{ loan_id: string } & ResultadoClassificacaoFinanceira>;
  classificacoesBaseConciliada: Array<{ linha_id: string } & ResultadoClassificacaoFinanceira>;
};

function corPorConfianca(conf: number): string {
  if (conf >= 80) return "text-emerald-700 dark:text-emerald-300";
  if (conf >= 60) return "text-sky-700 dark:text-sky-300";
  if (conf >= 40) return "text-amber-700 dark:text-amber-300";
  return "text-red-700 dark:text-red-300";
}

function PercentBar({
  total,
  parts,
}: {
  total: number;
  parts: Array<{ label: string; value: number; cor: string }>;
}) {
  if (total === 0) return null;
  return (
    <div className="h-2 w-full rounded-md overflow-hidden flex">
      {parts
        .filter((p) => p.value > 0)
        .map((p, i) => (
          <div
            key={`${p.label}-${i}`}
            className={cn("h-full", p.cor)}
            style={{ width: `${(p.value / total) * 100}%` }}
            title={`${p.label}: ${p.value} (${((p.value / total) * 100).toFixed(1)}%)`}
          />
        ))}
    </div>
  );
}

export function ConsigfacilQualidadeClassificacaoPainel({
  resumo,
  classificacoesLoans,
  classificacoesBaseConciliada,
}: ConsigfacilQualidadeClassificacaoPainelProps) {
  const [busca, setBusca] = useState("");
  const [filtroFonte, setFiltroFonte] = useState<FonteClassificacao | "todas">("todas");

  const todas = useMemo(
    () => [
      ...classificacoesLoans.map((c) => ({ ...c, alvo_tipo: "loan" as const, alvo_id: c.loan_id })),
      ...classificacoesBaseConciliada.map((c) => ({
        ...c,
        alvo_tipo: "base_conciliada" as const,
        alvo_id: c.linha_id,
      })),
    ],
    [classificacoesLoans, classificacoesBaseConciliada],
  );

  const totalDivergenciasInspecao = useMemo(
    () => todas.filter((c) => ehDivergenciaClassificacaoReal(c)).length,
    [todas],
  );

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return todas.filter((c) => {
      if (
        c.grupo_canonico === "rubrica_folha_nao_consignavel" ||
        c.grupo_canonico === "conta_consumo"
      ) {
        return false;
      }
      if (filtroFonte !== "todas" && c.fonte_classificacao !== filtroFonte) return false;
      if (!b) return true;
      return (
        (c.instituicao_original ?? "").toLowerCase().includes(b) ||
        (c.instituicao_oficial ?? "").toLowerCase().includes(b) ||
        (c.modalidade_original ?? "").toLowerCase().includes(b) ||
        (c.modalidade_oficial ?? "").toLowerCase().includes(b) ||
        c.grupo_canonico.toLowerCase().includes(b)
      );
    });
  }, [todas, busca, filtroFonte]);

  if (resumo.total_linhas === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Qualidade da classificação</CardTitle>
          <CardDescription>
            Sem linhas para classificar — importe contracheques, transações ou snapshots ConsigFácil.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fontes: FonteClassificacao[] = [
    "consigfacil_oficial",
    "alias_oficial",
    "match_exato_catalogo",
    "match_alias_catalogo",
    "match_fuzzy_catalogo",
    "ocr_contracheque",
    "heuristica_descricao",
    "inferencia",
    "sem_correspondencia",
  ];
  const grupos = Object.keys(resumo.por_grupo) as GrupoFinanceiroCanonico[];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3 flex-wrap">
          <div className="p-2 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle>Qualidade da classificação</CardTitle>
            <CardDescription>
              Cobertura do catálogo ConsigFácil (oficial × inferida) em cada linha financeira.
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Confiança média
            </p>
            <p
              className={cn(
                "text-3xl font-bold tabular-nums leading-none",
                corPorConfianca(resumo.confianca_media),
              )}
            >
              {resumo.confianca_media.toFixed(1)}
              <span className="text-base font-normal text-muted-foreground">/100</span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-md border p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total de linhas
            </p>
            <p className="text-lg font-semibold tabular-nums">{resumo.total_linhas}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {resumo.total_linhas_consignavel} consignável · {resumo.total_linhas_fora_consignavel}{" "}
              fora
            </p>
          </div>
          <div className="rounded-md border p-2 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-600" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Oficiais (ConsigFácil)
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {resumo.por_fonte.consigfacil_oficial +
                  resumo.por_fonte.alias_oficial +
                  resumo.por_fonte.match_exato_catalogo +
                  resumo.por_fonte.match_alias_catalogo +
                  resumo.por_fonte.match_fuzzy_catalogo}
              </p>
            </div>
          </div>
          <div className="rounded-md border p-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Divergências
              </p>
              <p className="text-lg font-semibold tabular-nums">{resumo.total_divergencias}</p>
            </div>
          </div>
          <div className="rounded-md border p-2 flex items-start gap-2">
            <HelpCircle className="h-4 w-4 mt-0.5 text-red-600" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Sem correspondência
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {resumo.total_sem_correspondencia}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium">Por fonte</p>
          <PercentBar
            total={resumo.total_linhas_consignavel}
            parts={fontes.map((f) => ({
              label: ROTULO_FONTE[f],
              value: resumo.por_fonte[f],
              cor: COR_FONTE[f],
            }))}
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {fontes
              .filter((f) => resumo.por_fonte[f] > 0)
              .map((f) => (
                <Badge key={f} variant="outline" className="text-[10px] gap-1">
                  <span className={cn("inline-block h-2 w-2 rounded-sm", COR_FONTE[f])} />
                  {ROTULO_FONTE[f]} · {resumo.por_fonte[f]}
                </Badge>
              ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium">Por grupo canônico</p>
          <div className="grid gap-1.5 md:grid-cols-2 lg:grid-cols-3">
            {grupos
              .filter((g) => resumo.por_grupo[g] > 0)
              .map((g) => (
                <div
                  key={g}
                  className="flex items-center justify-between rounded-md border px-2 py-1 text-xs"
                >
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" /> {ROTULO_GRUPO[g]}
                  </span>
                  <span className="font-semibold tabular-nums">{resumo.por_grupo[g]}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-medium">Inspeção por linha</p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {totalDivergenciasInspecao} divergência(s) real(is) · {filtradas.length} linha(s) na
              lista
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar instituição, modalidade, grupo…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-7"
              />
            </div>
            <select
              value={filtroFonte}
              onChange={(e) => setFiltroFonte(e.target.value as FonteClassificacao | "todas")}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="todas">Todas as fontes</option>
              {fontes.map((f) => (
                <option key={f} value={f}>
                  {ROTULO_FONTE[f]}
                </option>
              ))}
            </select>
          </div>

          <div className="divide-y divide-border rounded-md border max-h-80 overflow-auto">
            {filtradas.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma linha com este filtro.</p>
            )}
            {filtradas.slice(0, 200).map((c) => (
              <ConciliacaoInspecaoLinha
                key={`${c.alvo_tipo}::${c.alvo_id}`}
                alvoTipo={c.alvo_tipo}
                classificacao={c}
              />
            ))}
            {filtradas.length > 200 && (
              <p className="p-2 text-[11px] text-muted-foreground italic">
                Exibindo as primeiras 200 linhas — use a busca para refinar.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
