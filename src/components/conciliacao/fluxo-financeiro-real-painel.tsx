"use client";

import { useMemo, type ComponentType } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import {
  agruparFluxoBaseConciliadaPorCamada,
  passivoConsignavelMes,
} from "@/lib/conciliacao/agrupar-fluxo-por-camada-financeira";
import { FLUXO_FINANCEIRO_UI as T } from "@/lib/conciliacao/textos-fluxo-financeiro-ui";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatarCompetenciaBr(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) return competencia;
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

type LinhaGrafico = { competencia: string } & Record<string, number | string>;

function TooltipCamada({
  active,
  label,
  titulo,
  linhas,
}: {
  active?: boolean;
  label?: string | number;
  titulo: string;
  linhas: Array<{ label: string; valor: number }>;
}) {
  if (!active) return null;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md max-w-xs">
      <p className="font-medium mb-1">
        {titulo} — {formatarCompetenciaBr(String(label))}
      </p>
      <ul className="space-y-0.5">
        {linhas.map((l) => (
          <li key={l.label} className="flex justify-between gap-3 tabular-nums">
            <span className="text-muted-foreground">{l.label}</span>
            <span>{brl(l.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type SerieConfig = { dataKey: string; nome: string; cor: string };

function PainelCamada({
  titulo,
  descricao,
  dados,
  series,
  tooltip,
  mostrarEixoX,
}: {
  titulo: string;
  descricao: string;
  dados: LinhaGrafico[];
  series: SerieConfig[];
  tooltip: ComponentType<{
    active?: boolean;
    payload?: Array<{ payload?: LinhaGrafico }>;
  }>;
  mostrarEixoX?: boolean;
}) {
  const TooltipComp = tooltip;
  return (
    <div className="space-y-1 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-[11px] text-muted-foreground">{descricao}</p>
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis
              dataKey="competencia"
              tickFormatter={formatarCompetenciaBr}
              fontSize={10}
              hide={!mostrarEixoX}
            />
            <YAxis fontSize={10} tickFormatter={(v) => brl(Number(v))} width={72} />
            <Tooltip content={<TooltipComp />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {series.map((s) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.nome}
                stroke={s.cor}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export type FluxoFinanceiroRealPainelProps = {
  baseConciliada: BaseConciliadaLinha[];
};

export function FluxoFinanceiroRealPainel({ baseConciliada }: FluxoFinanceiroRealPainelProps) {
  const camadas = useMemo(
    () => agruparFluxoBaseConciliadaPorCamada(baseConciliada),
    [baseConciliada],
  );

  const dadosFolha = useMemo(
    () =>
      camadas.map((c) => ({
        competencia: c.competencia,
        recebido_folha: c.folha.recebido_folha,
        bruto_folha: c.folha.bruto_folha,
        liquido_folha: c.folha.liquido_folha,
      })),
    [camadas],
  );

  const dadosBanco = useMemo(
    () =>
      camadas.map((c) => ({
        competencia: c.competencia,
        liquido_banco: c.banco.liquido_banco,
        entradas_bancarias: c.banco.entradas_bancarias,
        saidas_bancarias: c.banco.saidas_bancarias,
      })),
    [camadas],
  );

  const dadosConsignado = useMemo(
    () =>
      camadas.map((c) => ({
        competencia: c.competencia,
        pagamentos_emprestimos: c.consignado.pagamentos_emprestimos,
        cartao_saque: c.consignado.cartao_saque,
        desconto_fracionado: c.consignado.desconto_fracionado,
        passivo_consignavel: passivoConsignavelMes(c),
      })),
    [camadas],
  );

  const dadosOperacional = useMemo(
    () =>
      camadas.map((c) => ({
        competencia: c.competencia,
        refinanciamentos: c.operacional.refinanciamentos,
        portabilidades: c.operacional.portabilidades,
        suspensoes: c.operacional.suspensoes,
        quitacoes: c.operacional.quitacoes,
      })),
    [camadas],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{T.tituloCard}</CardTitle>
        <CardDescription>{T.descricaoCard}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {camadas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{T.semDados}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <PainelCamada
              titulo={T.folha.titulo}
              descricao={T.folha.descricao}
              dados={dadosFolha}
              mostrarEixoX
              tooltip={(props) => {
                const competencia = String(props.payload?.[0]?.payload?.competencia ?? "");
                const row = dadosFolha.find((d) => d.competencia === competencia);
                if (!props.active || !row) return null;
                return (
                  <TooltipCamada
                    active={props.active}
                    label={competencia}
                    titulo={T.folha.titulo}
                    linhas={[
                      { label: T.folha.recebido, valor: row.recebido_folha },
                      { label: T.folha.bruto, valor: row.bruto_folha },
                      { label: T.folha.liquido, valor: row.liquido_folha },
                    ]}
                  />
                );
              }}
              series={[
                { dataKey: "recebido_folha", nome: T.folha.recebido, cor: "#2563eb" },
                { dataKey: "bruto_folha", nome: T.folha.bruto, cor: "#3b82f6" },
                { dataKey: "liquido_folha", nome: T.folha.liquido, cor: "#60a5fa" },
              ]}
            />

            <PainelCamada
              titulo={T.banco.titulo}
              descricao={T.banco.descricao}
              dados={dadosBanco}
              tooltip={(props) => {
                const competencia = String(props.payload?.[0]?.payload?.competencia ?? "");
                const row = dadosBanco.find((d) => d.competencia === competencia);
                if (!props.active || !row) return null;
                return (
                  <TooltipCamada
                    active={props.active}
                    label={competencia}
                    titulo={T.banco.titulo}
                    linhas={[
                      { label: T.banco.liquido, valor: row.liquido_banco },
                      { label: T.banco.entradas, valor: row.entradas_bancarias },
                      { label: T.banco.saidas, valor: row.saidas_bancarias },
                    ]}
                  />
                );
              }}
              series={[
                { dataKey: "liquido_banco", nome: T.banco.liquido, cor: "#0ea5e9" },
                { dataKey: "entradas_bancarias", nome: T.banco.entradas, cor: "#06b6d4" },
                { dataKey: "saidas_bancarias", nome: T.banco.saidas, cor: "#f97316" },
              ]}
            />

            <PainelCamada
              titulo={T.consignado.titulo}
              descricao={T.consignado.descricao}
              dados={dadosConsignado}
              tooltip={(props) => {
                const competencia = String(props.payload?.[0]?.payload?.competencia ?? "");
                const row = dadosConsignado.find((d) => d.competencia === competencia);
                if (!props.active || !row) return null;
                return (
                  <TooltipCamada
                    active={props.active}
                    label={competencia}
                    titulo={T.consignado.passivoMes(brl(row.passivo_consignavel))}
                    linhas={[
                      { label: T.consignado.emprestimos, valor: row.pagamentos_emprestimos },
                      { label: T.consignado.cartaoRmc, valor: row.cartao_saque },
                      {
                        label: T.consignado.fracionadoMargem,
                        valor: row.desconto_fracionado,
                      },
                    ]}
                  />
                );
              }}
              series={[
                {
                  dataKey: "pagamentos_emprestimos",
                  nome: T.consignado.emprestimos,
                  cor: "#dc2626",
                },
                { dataKey: "cartao_saque", nome: T.consignado.cartaoSaque, cor: "#a855f7" },
                {
                  dataKey: "desconto_fracionado",
                  nome: T.consignado.fracionadoLegenda,
                  cor: "#eab308",
                },
              ]}
            />

            <PainelCamada
              titulo={T.operacional.titulo}
              descricao={T.operacional.descricao}
              dados={dadosOperacional}
              mostrarEixoX
              tooltip={(props) => {
                const competencia = String(props.payload?.[0]?.payload?.competencia ?? "");
                const row = dadosOperacional.find((d) => d.competencia === competencia);
                if (!props.active || !row) return null;
                return (
                  <TooltipCamada
                    active={props.active}
                    label={competencia}
                    titulo={T.operacional.titulo}
                    linhas={[
                      { label: T.operacional.refinanciamentos, valor: row.refinanciamentos },
                      { label: T.operacional.portabilidades, valor: row.portabilidades },
                      { label: T.operacional.suspensoes, valor: row.suspensoes },
                      { label: T.operacional.quitacoes, valor: row.quitacoes },
                    ]}
                  />
                );
              }}
              series={[
                {
                  dataKey: "refinanciamentos",
                  nome: T.operacional.refinanciamentos,
                  cor: "#f59e0b",
                },
                {
                  dataKey: "portabilidades",
                  nome: T.operacional.portabilidades,
                  cor: "#d97706",
                },
              ]}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
