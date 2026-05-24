"use client";

import { useMemo } from "react";
import { Filter, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConsignacaoOrdenadaLinha } from "@/lib/consignacoes-governo/consolidar-consignacoes-ordenadas";
import type { FiltrosConsignacoes } from "@/lib/consignacoes-governo/consignacoes-filtros";
import { FILTROS_VAZIOS } from "@/lib/consignacoes-governo/consignacoes-filtros";
import { instituicaoEhRotuloInvalido } from "@/lib/consignacoes-governo/parser-consigfacil-print";

type Props = {
  linhas: ConsignacaoOrdenadaLinha[];
  filtros: FiltrosConsignacoes;
  onChange: (next: FiltrosConsignacoes) => void;
};

function toggleEmLista<T>(arr: T[] | null, valor: T): T[] | null {
  if (arr === null) return [valor];
  if (arr.includes(valor)) {
    const novo = arr.filter((x) => x !== valor);
    return novo.length === 0 ? null : novo;
  }
  return [...arr, valor];
}

function Pill({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-[10px] rounded-md border px-2 py-0.5 transition-colors " +
        (ativo
          ? "bg-foreground text-background border-foreground"
          : "bg-background hover:bg-muted")
      }
    >
      {children}
    </button>
  );
}

export function ConsignacoesFiltrosBarra({ linhas, filtros, onChange }: Props) {
  const bancos = useMemo(
    () =>
      Array.from(
        new Set(
          linhas
            .map((l) => l.instituicao_oficial)
            .filter(
              (b) =>
                b &&
                b !== "—" &&
                b !== "Não identificado" &&
                !instituicaoEhRotuloInvalido(b),
            ),
        ),
      ).sort(),
    [linhas],
  );
  const grupos = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.grupo_canonico))).sort(),
    [linhas],
  );
  const statuses = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.status_oficial))).sort(),
    [linhas],
  );
  const competenciasUnicas = useMemo(
    () =>
      Array.from(
        new Set(
          linhas.flatMap((l) => [l.primeiro_desconto, l.ultimo_desconto].filter(Boolean) as string[]),
        ),
      ).sort(),
    [linhas],
  );

  const compMin = competenciasUnicas[0] ?? "";
  const compMax = competenciasUnicas[competenciasUnicas.length - 1] ?? "";

  const semFiltros =
    JSON.stringify({ ...filtros, _v: 1 }) === JSON.stringify({ ...FILTROS_VAZIOS, _v: 1 });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtros
          </CardTitle>
          {!semFiltros && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(FILTROS_VAZIOS)}
              className="h-7"
            >
              <X className="h-3 w-3 mr-1" /> Limpar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Banco */}
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Banco (instituição oficial)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {bancos.map((b) => (
              <Pill
                key={b}
                ativo={filtros.bancos?.includes(b) ?? false}
                onClick={() => onChange({ ...filtros, bancos: toggleEmLista(filtros.bancos, b) })}
              >
                {b}
              </Pill>
            ))}
          </div>
        </div>

        {/* Modalidade (grupo canônico) */}
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Modalidade (grupo canônico)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {grupos.map((g) => (
              <Pill
                key={g}
                ativo={filtros.modalidades?.includes(g) ?? false}
                onClick={() =>
                  onChange({ ...filtros, modalidades: toggleEmLista(filtros.modalidades, g) })
                }
              >
                {g}
              </Pill>
            ))}
          </div>
        </div>

        {/* Período */}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Competência de
            </p>
            <Input
              type="month"
              value={filtros.competencia_de ?? ""}
              min={compMin || undefined}
              max={compMax || undefined}
              onChange={(e) =>
                onChange({ ...filtros, competencia_de: e.target.value || null })
              }
            />
          </label>
          <label className="text-xs">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Competência até
            </p>
            <Input
              type="month"
              value={filtros.competencia_ate ?? ""}
              min={compMin || undefined}
              max={compMax || undefined}
              onChange={(e) =>
                onChange({ ...filtros, competencia_ate: e.target.value || null })
              }
            />
          </label>
        </div>

        {/* Status + Margem + Confiança */}
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Status
            </p>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((s) => (
                <Pill
                  key={s}
                  ativo={filtros.status?.includes(s) ?? false}
                  onClick={() =>
                    onChange({ ...filtros, status: toggleEmLista(filtros.status, s) })
                  }
                >
                  {s}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Margem
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(["margem_consignavel", "margem_cartao", "margem_cartao_beneficio", "sem_margem"] as const).map((m) => (
                <Pill
                  key={m}
                  ativo={filtros.margens?.includes(m) ?? false}
                  onClick={() =>
                    onChange({ ...filtros, margens: toggleEmLista(filtros.margens, m) })
                  }
                >
                  {m}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Risco/Confiança
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(["todos", "alto_confianca", "baixa_confianca", "sem_correspondencia"] as const).map((f) => (
                <Pill
                  key={f}
                  ativo={filtros.faixa_confianca === f}
                  onClick={() => onChange({ ...filtros, faixa_confianca: f })}
                >
                  {f}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-3 pt-1">
          <label className="text-xs flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filtros.apenas_confirmado_consigfacil}
              onChange={(e) =>
                onChange({ ...filtros, apenas_confirmado_consigfacil: e.target.checked })
              }
            />
            Apenas confirmadas pelo ConsigFácil
          </label>
          <label className="text-xs flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filtros.apenas_divergencia}
              onChange={(e) =>
                onChange({ ...filtros, apenas_divergencia: e.target.checked })
              }
            />
            Apenas com divergência
          </label>
          {!semFiltros && (
            <Badge variant="outline" className="text-[10px]">
              Filtros ativos
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
