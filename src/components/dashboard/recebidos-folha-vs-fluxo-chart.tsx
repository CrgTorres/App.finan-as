"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ReceitaCanonicaRow,
  ReceitaGrupo,
  ResumoMensalRecebidosRow,
} from "@/lib/receitas/normalizar-recebidos";

const COR_GRUPO: Record<ReceitaGrupo, string> = {
  remuneracao_base: "#2563eb",
  gratificacoes: "#16a34a",
  verbas_eventuais: "#a855f7",
  decimo_ferias: "#f59e0b",
  entradas_bancarias: "#0ea5e9",
};

const ROTULO_GRUPO: Record<ReceitaGrupo, string> = {
  remuneracao_base: "Remuneração base",
  gratificacoes: "Gratificações",
  verbas_eventuais: "Verbas eventuais",
  decimo_ferias: "13º / Férias",
  entradas_bancarias: "Entradas bancárias",
};

const COR_ENTRADA_BANCARIA: Record<string, string> = {
  salario_liquido_transacao: "#2563eb",
  pix_recebido: "#16a34a",
  transferencia_recebida: "#f59e0b",
  outros_recebidos: "#64748b",
};

const ROTULO_ENTRADA_BANCARIA: Record<string, string> = {
  salario_liquido_transacao: "Salário (líquido extrato)",
  pix_recebido: "Pix recebido",
  transferencia_recebida: "Transferência recebida",
  outros_recebidos: "Outras entradas",
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatarCompetenciaBr(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) return competencia;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

export type RecebidosFolhaVsFluxoChartProps = {
  /** Rows da aba `Recebidos_Normalizados`. */
  recebidos: ReceitaCanonicaRow[];
  /** Linhas do `Resumo_Mensal` (apenas os campos de recebidos são usados). */
  resumoMensal: ResumoMensalRecebidosRow[];
  /** Esconde o aviso de duplicidade quando o caller já mostra em outro lugar. */
  ocultarBadgeDuplicidade?: boolean;
};

/**
 * Gráfico oficial de recebidos com toggle Composição da folha ↔ Fluxo bancário.
 *
 * - "Composição da folha": agrupa rubricas do contracheque (`eh_rubrica_contracheque`).
 * - "Fluxo bancário": agrupa entradas bancárias (`eh_entrada_bancaria`).
 *
 * NUNCA soma os dois conjuntos no mesmo total — toggle alterna entre visões.
 * Badge "Possível duplicidade" aparece quando há salário-extrato conciliado com folha.
 */
export function RecebidosFolhaVsFluxoChart({
  recebidos,
  resumoMensal,
  ocultarBadgeDuplicidade,
}: RecebidosFolhaVsFluxoChartProps) {
  const [aba, setAba] = useState<"folha" | "fluxo">("folha");

  const rubricasFolha = useMemo(
    () => recebidos.filter((r) => r.eh_rubrica_contracheque),
    [recebidos],
  );
  const entradasBancarias = useMemo(
    () => recebidos.filter((r) => r.eh_entrada_bancaria),
    [recebidos],
  );

  const totalFolha = useMemo(
    () => rubricasFolha.reduce((s, r) => s + r.valor, 0),
    [rubricasFolha],
  );
  const totalFluxo = useMemo(
    () => entradasBancarias.reduce((s, r) => s + r.valor, 0),
    [entradasBancarias],
  );

  const possuiDuplicidade = recebidos.some((r) => r.possivel_duplicidade);

  // Composição da folha: barras empilhadas por grupo + pizza por categoria
  type DadoFolhaMes = {
    competencia: string;
    remuneracao_base: number;
    gratificacoes: number;
    verbas_eventuais: number;
    decimo_ferias: number;
    entradas_bancarias: number;
  };
  const dadosFolhaPorMes = useMemo<DadoFolhaMes[]>(() => {
    const map = new Map<string, DadoFolhaMes>();
    for (const r of rubricasFolha) {
      let bucket = map.get(r.competencia);
      if (!bucket) {
        bucket = {
          competencia: r.competencia,
          remuneracao_base: 0,
          gratificacoes: 0,
          verbas_eventuais: 0,
          decimo_ferias: 0,
          entradas_bancarias: 0,
        };
        map.set(r.competencia, bucket);
      }
      bucket[r.receita_grupo] += r.valor;
    }
    return Array.from(map.values()).sort((a, b) => a.competencia.localeCompare(b.competencia));
  }, [rubricasFolha]);

  const dadosCategoriaFolha = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rubricasFolha) {
      map.set(r.receita_categoria_canonica, (map.get(r.receita_categoria_canonica) ?? 0) + r.valor);
    }
    return Array.from(map.entries())
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [rubricasFolha]);

  // Fluxo bancário: barras empilhadas por categoria de entrada
  const dadosFluxoPorMes = useMemo(() => {
    return resumoMensal
      .slice()
      .sort((a, b) => a.competencia.localeCompare(b.competencia))
      .map((r) => ({
        competencia: r.competencia,
        salario_liquido_transacao: r.entrada_bancaria_salario,
        pix_recebido: r.pix_recebido,
        transferencia_recebida: r.transferencias_recebidas,
        outros_recebidos: r.outras_entradas_bancarias,
      }));
  }, [resumoMensal]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Recebidos — composição vs. fluxo</CardTitle>
            <CardDescription>
              Alterne entre RUBRICAS da folha e ENTRADAS bancárias. Os dois nunca somam juntos.
            </CardDescription>
          </div>
          {possuiDuplicidade && !ocultarBadgeDuplicidade && (
            <Badge variant="destructive" className="gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Possível duplicidade — líquido do contracheque
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={aba} onValueChange={(v) => setAba((v as "folha" | "fluxo") ?? "folha")}>
          <TabsList className="mb-4">
            <TabsTrigger value="folha">Composição da folha</TabsTrigger>
            <TabsTrigger value="fluxo">Fluxo bancário</TabsTrigger>
          </TabsList>

          <TabsContent value="folha" className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Total bruto na folha</span>
              <span className="font-semibold text-foreground tabular-nums">{brl(totalFolha)}</span>
            </div>
            {dadosFolhaPorMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem rubricas de contracheque carregadas no período.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosFolhaPorMes}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis
                        dataKey="competencia"
                        tickFormatter={formatarCompetenciaBr}
                        fontSize={11}
                      />
                      <YAxis fontSize={11} tickFormatter={(v) => brl(Number(v))} />
                      <Tooltip
                        formatter={(value, name) => [brl(Number(value) || 0), String(name)]}
                        labelFormatter={(c) => formatarCompetenciaBr(String(c))}
                      />
                      <Legend />
                      {(
                        ["remuneracao_base", "gratificacoes", "verbas_eventuais", "decimo_ferias"] as const
                      ).map((g) => (
                        <Bar key={g} dataKey={g} stackId="folha" name={ROTULO_GRUPO[g]} fill={COR_GRUPO[g]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        formatter={(value, name) => [brl(Number(value) || 0), String(name)]}
                      />
                      <Pie
                        data={dadosCategoriaFolha}
                        dataKey="valor"
                        nameKey="categoria"
                        innerRadius={45}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {dadosCategoriaFolha.map((entry, i) => (
                          <Cell
                            key={entry.categoria}
                            fill={
                              ["#2563eb", "#16a34a", "#a855f7", "#f59e0b", "#0ea5e9", "#64748b", "#dc2626"][
                                i % 7
                              ]
                            }
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="fluxo" className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Total entradas bancárias</span>
              <span className="font-semibold text-foreground tabular-nums">{brl(totalFluxo)}</span>
            </div>
            {dadosFluxoPorMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem entradas bancárias normalizadas no período.
              </p>
            ) : (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosFluxoPorMes}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="competencia"
                      tickFormatter={formatarCompetenciaBr}
                      fontSize={11}
                    />
                    <YAxis fontSize={11} tickFormatter={(v) => brl(Number(v))} />
                    <Tooltip
                      formatter={(value, name) => [brl(Number(value) || 0), String(name)]}
                      labelFormatter={(c) => formatarCompetenciaBr(String(c))}
                    />
                    <Legend />
                    {(
                      ["salario_liquido_transacao", "pix_recebido", "transferencia_recebida", "outros_recebidos"] as const
                    ).map((k) => (
                      <Bar
                        key={k}
                        dataKey={k}
                        stackId="fluxo"
                        name={ROTULO_ENTRADA_BANCARIA[k]}
                        fill={COR_ENTRADA_BANCARIA[k]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
