"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, CheckCircle2, Gauge, Info, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AnaliseMargemHistorica, MargemHistorica } from "@/lib/consignacoes-governo/margem-historica-unificada";
import type { MargemHistoricaDetalhe } from "@/lib/consignacoes-governo/calcular-margem-desde-folha";
import {
  PCT_MARGEM_CARTAO_BENEFICIO_FOLHA,
  PCT_MARGEM_CARTAO_FOLHA,
  PCT_MARGEM_CONSIGNAVEL_FOLHA,
} from "@/lib/consignacoes-governo/calcular-margem-desde-folha";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatarCompetenciaBr(c: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(c);
  if (!m) return c;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

const LABEL_TIPO: Record<string, string> = {
  consignavel: "Consignável (30%)",
  cartao: "Cartão (5%)",
  cartao_beneficio: "Cartão benefício (5%)",
};

const CORES: Record<string, string> = {
  consignavel: "#2563eb",
  cartao: "#a855f7",
  cartao_beneficio: "#0ea5e9",
};

const SEVERIDADE_CLASS: Record<string, string> = {
  info: "border-blue-300/60 bg-blue-50/50 dark:bg-blue-950/20",
  atencao: "border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20",
  alerta: "border-red-300/60 bg-red-50/50 dark:bg-red-950/20",
  positivo: "border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20",
};

type Props = {
  margemHistorica: MargemHistorica[];
  detalhes: MargemHistoricaDetalhe[];
  analise: AnaliseMargemHistorica;
};

export function MargemHistoricaPainelCompleto({ margemHistorica, detalhes, analise }: Props) {
  const [tipoGrafico, setTipoGrafico] = useState<"consignavel" | "cartao" | "cartao_beneficio">(
    "consignavel",
  );

  const dadosGrafico = useMemo(() => {
    return analise.serie_consignavel.map((s) => ({
      competencia: s.competencia,
      total: s.margem_total,
      utilizada: s.margem_utilizada,
      disponivel: Math.max(0, s.margem_total - s.margem_utilizada),
      pct: s.percentual_comprometido,
      origem: s.origem,
    }));
  }, [analise.serie_consignavel]);

  const dadosTipo = useMemo(() => {
    return margemHistorica
      .filter((m) => m.tipo_margem === tipoGrafico)
      .map((m) => ({
        competencia: m.competencia,
        total: m.margem_total,
        utilizada: m.margem_utilizada,
        pct: m.percentual_comprometido,
      }));
  }, [margemHistorica, tipoGrafico]);

  const tabela = useMemo(() => {
    return [...detalhes].sort((a, b) => b.competencia.localeCompare(a.competencia));
  }, [detalhes]);

  if (margemHistorica.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Margem consignável desde 2012
          </CardTitle>
          <CardDescription>
            Importe contracheques e uma captura do ConsigFácil para reconstruir a série mensal.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card className="border-blue-300/40 bg-blue-50/20 dark:bg-blue-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" /> Margem consignável — histórico e vigente
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Reconstruímos cada mês a partir dos <strong>contracheques</strong> (proventos − IR −
            Amazon Prev − pensão × 30% / 5% / 5%). Quando existe print do{" "}
            <strong>ConsigFácil</strong> na mesma competência, o valor do portal prevalece — como
            na sua tela vigente (ex.: margem total R$ 2.147, saldo R$ 509).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>
            Fórmula estimada na folha: base = proventos − obrigatórios; consignável ={" "}
            {PCT_MARGEM_CONSIGNAVEL_FOLHA * 100}% · cartão = {PCT_MARGEM_CARTAO_FOLHA * 100}% ·
            benefício = {PCT_MARGEM_CARTAO_BENEFICIO_FOLHA * 100}%.
          </p>
          <p>
            Período: {analise.primeira_competencia ?? "—"} → {analise.ultima_competencia ?? "—"} ·{" "}
            {analise.competencias_com_folha} mês(es) pela folha ·{" "}
            {analise.competencias_oficiais_consigfacil} com dado oficial do portal.
          </p>
        </CardContent>
      </Card>

      {/* Vigente — 3 cards na mesma competência de referência */}
      {analise.competencia_vigente && (
        <p className="text-xs text-muted-foreground px-1">
          Referência vigente:{" "}
          <span className="font-mono font-medium">
            {formatarCompetenciaBr(analise.competencia_vigente)}
          </span>
          {" — "}
          as três camadas usam a mesma competência (portal prevalece quando completo).
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {analise.vigente.map((v) => (
          <Card key={v.tipo_margem}>
            <CardHeader className="pb-2">
              <CardDescription>{LABEL_TIPO[v.tipo_margem] ?? v.tipo_margem}</CardDescription>
              <CardTitle className="text-lg tabular-nums">
                {brl(v.margem_disponivel)}
                <span className="text-xs font-normal text-muted-foreground block mt-0.5">
                  disponível de {brl(v.margem_total)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 flex flex-wrap gap-1.5">
              <Badge variant={v.percentual_comprometido >= 35 ? "destructive" : "secondary"}>
                {v.percentual_comprometido}% usado
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {v.origem === "consigfacil_oficial" ? "ConsigFácil" : "Estimado folha"}
              </Badge>
              {(v.competencia_dado ?? v.competencia) && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {formatarCompetenciaBr(v.competencia_dado ?? v.competencia!)}
                  {v.competencia_dado &&
                    analise.competencia_vigente &&
                    v.competencia_dado !== analise.competencia_vigente && (
                      <span className="opacity-70"> · ref.</span>
                    )}
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Insights */}
      {analise.insights.length > 0 && (
        <div className="space-y-2">
          {analise.insights.map((ins, i) => (
            <div
              key={`${ins.titulo}-${i}`}
              className={`rounded-lg border px-3 py-2.5 text-xs flex gap-2 ${SEVERIDADE_CLASS[ins.severidade] ?? SEVERIDADE_CLASS.info}`}
            >
              {ins.severidade === "alerta" ? (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              ) : ins.severidade === "positivo" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : ins.severidade === "atencao" ? (
                <TrendingUp className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">{ins.titulo}</p>
                <p className="mt-0.5 opacity-90 leading-relaxed">{ins.mensagem}</p>
                {ins.competencias && ins.competencias.length > 0 && (
                  <p className="mt-1 font-mono text-[10px] opacity-75">
                    {ins.competencias.map(formatarCompetenciaBr).join(" · ")}
                    {ins.competencias.length >= 12 ? " …" : ""}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Evolução — margem consignável</CardTitle>
            <CardDescription>Total, utilizada e % comprometido por competência</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full min-h-[256px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="competencia" tickFormatter={formatarCompetenciaBr} fontSize={10} />
                  <YAxis tickFormatter={(v) => brl(Number(v))} fontSize={10} width={72} />
                  <Tooltip
                    formatter={(value, name) => [brl(Number(value) || 0), String(name)]}
                    labelFormatter={(l) => formatarCompetenciaBr(String(l ?? ""))}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#94a3b8"
                    fill="#94a3b8"
                    fillOpacity={0.15}
                    name="Margem total"
                  />
                  <Area
                    type="monotone"
                    dataKey="utilizada"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.45}
                    name="Utilizada (descontos)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">% comprometido por tipo</CardTitle>
              <CardDescription>Linha do tempo por modalidade de margem</CardDescription>
            </div>
            <select
              className="text-xs border rounded-md px-2 py-1 bg-background"
              value={tipoGrafico}
              onChange={(e) =>
                setTipoGrafico(e.target.value as "consignavel" | "cartao" | "cartao_beneficio")
              }
            >
              <option value="consignavel">Consignável</option>
              <option value="cartao">Cartão</option>
              <option value="cartao_beneficio">Cartão benefício</option>
            </select>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full min-h-[256px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dadosTipo}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="competencia" tickFormatter={formatarCompetenciaBr} fontSize={10} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={10} width={40} />
                  <Tooltip labelFormatter={(l) => formatarCompetenciaBr(String(l ?? ""))} />
                  <Line
                    type="monotone"
                    dataKey="pct"
                    stroke={CORES[tipoGrafico]}
                    strokeWidth={2}
                    dot={false}
                    name="% usado"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela detalhada */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tabela mês a mês (desde {analise.ano_inicio})</CardTitle>
          <CardDescription>
            Base de cálculo, descontos classificados na folha e origem do dado
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Competência</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs text-right">Base folha</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="text-xs text-right">Utilizada</TableHead>
                <TableHead className="text-xs text-right">Disponível</TableHead>
                <TableHead className="text-xs text-right">%</TableHead>
                <TableHead className="text-xs">Fonte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tabela.slice(0, 120).map((row) => (
                <TableRow key={`${row.competencia}-${row.tipo_margem}`}>
                  <TableCell className="text-xs font-mono">
                    {formatarCompetenciaBr(row.competencia)}
                  </TableCell>
                  <TableCell className="text-xs">{row.tipo_margem}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {row.base_remuneracao != null ? brl(row.base_remuneracao) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {brl(row.margem_total)}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {brl(row.margem_utilizada)}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {brl(row.margem_disponivel)}
                  </TableCell>
                  <TableCell className="text-xs text-right tabular-nums">
                    {row.percentual_comprometido}%
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-[9px]">
                      {row.origem === "consigfacil_oficial" ? "Portal" : "Folha"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {tabela.length > 120 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Exibindo 120 de {tabela.length} linhas — exporte pela planilha completa se precisar de
              todo o histórico.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
