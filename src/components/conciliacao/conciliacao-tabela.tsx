"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  EyeOff,
  Tag,
  ArrowLeftRight,
  Banknote,
  CreditCard,
  FileWarning,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  BaseConciliadaLinha,
  StatusConciliacao,
  StatusManualUsuario,
} from "@/lib/conciliacao/conciliacao-financeira";
import type { ConsigfacilConfirmacao } from "@/types/consigfacil";
import {
  BadgeCorrelacaoConsigfacil,
  InstituicaoFolhaConsigfacilBloco,
  type LinhaComInstituicaoConciliacao,
} from "@/components/conciliacao/instituicao-folha-consigfacil-bloco";
import { linhaEhRubricaConsignavel } from "@/lib/conciliacao/regras-natureza-consignavel";
import {
  entradaPassivoDeLinhaBase,
  identificarPassivoConsignavelEstrutural,
  ROTULO_TIPO_PASSIVO,
} from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";

type Agrupamento = "competencia" | "banco" | "contrato" | "categoria" | "nenhum";

const LINHAS_POR_LOTE = 50;

const ROTULOS_STATUS_CONCILIACAO: Record<StatusConciliacao, string> = {
  conciliado: "Conciliado",
  possivel_duplicidade: "Possível duplicidade",
  precisa_revisao: "Precisa revisão",
  nao_conciliado: "Não conciliado",
  congelada_operacionalmente: "Congelada (operacional)",
  aguardando_recuperacao: "Aguardando recuperação",
  suspensa_oficial: "Suspensa (oficial)",
};

/**
 * Cores definidas pelo usuário: VERDE conciliado, AMARELO duplicidade, VERMELHO revisão,
 * CINZA ignorado/manual.
 */
function classesStatus(linha: BaseConciliadaLinha): string {
  if (linha.status_manual === "ignorar") {
    return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  }
  if (linha.status_manual === "transferencia_propria") {
    return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  }
  switch (linha.status_conciliacao) {
    case "conciliado":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "possivel_duplicidade":
      return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
    case "precisa_revisao":
      return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
    case "congelada_operacionalmente":
    case "aguardando_recuperacao":
      return "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200";
    case "suspensa_oficial":
      return "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300";
    default:
      return "bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300";
  }
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

function formatarCompetenciaBr(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) return competencia;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

const BOTOES_REVISAO: Array<{
  status: StatusManualUsuario;
  label: string;
  icon: typeof CheckCircle2;
}> = [
  { status: "salario", label: "Confirmar salário", icon: Banknote },
  { status: "duplicidade_contracheque", label: "Marcar duplicidade", icon: AlertTriangle },
  { status: "transferencia_propria", label: "Transferência própria", icon: ArrowLeftRight },
  { status: "emprestimo_pessoal", label: "Empréstimo confirmado", icon: Tag },
  { status: "ignorar", label: "Ignorar linha", icon: EyeOff },
  { status: "precisa_contrato", label: "Precisa contrato", icon: FileWarning },
  { status: "pagamento_emprestimo", label: "Pagamento empréstimo", icon: CreditCard },
];

export type ConciliacaoTabelaProps = {
  linhas: BaseConciliadaLinha[];
  titulo?: string;
  descricao?: string;
  /** Status manual atualmente aplicado (mantido por eventoId). */
  statusManualPorEventoId: ReadonlyMap<string, StatusManualUsuario>;
  /** Acionado quando o usuário clica num botão de revisão (passe a chamada do serviço aqui). */
  onAlterarStatusManual: (
    eventoId: string,
    status: StatusManualUsuario | null,
  ) => void | Promise<void>;
  /** eventoIds que estão sendo persistidos no momento (mostra spinner no botão). */
  eventoIdsSalvando?: ReadonlySet<string>;
};

export function ConciliacaoTabela({
  linhas,
  titulo = "Base_Conciliada",
  descricao,
  statusManualPorEventoId,
  onAlterarStatusManual,
  eventoIdsSalvando,
}: ConciliacaoTabelaProps) {
  const [busca, setBusca] = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState<string>("todas");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroNatureza, setFiltroNatureza] = useState<string>("todas");
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("competencia");
  const [linhaExpandida, setLinhaExpandida] = useState<string | null>(null);
  const [limiteVisivel, setLimiteVisivel] = useState(LINHAS_POR_LOTE);

  const metaPassivoPorLinha = useMemo(() => {
    const map = new Map<string, { consignavel: boolean; rotuloPassivo: string }>();
    for (const l of linhas) {
      const consignavel = linhaEhRubricaConsignavel(l);
      const rotuloPassivo = consignavel
        ? ""
        : ROTULO_TIPO_PASSIVO[
            identificarPassivoConsignavelEstrutural(entradaPassivoDeLinhaBase(l)).tipo_passivo
          ];
      map.set(l.id, { consignavel, rotuloPassivo });
    }
    return map;
  }, [linhas]);

  const linhasFiltradas = useMemo(() => {
    const buscaNorm = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (filtroOrigem !== "todas" && l.origem !== filtroOrigem) return false;
      if (filtroStatus !== "todos" && l.status_conciliacao !== filtroStatus) return false;
      if (filtroNatureza !== "todas" && l.natureza !== filtroNatureza) return false;
      if (
        buscaNorm &&
        !l.descricao_normalizada.toLowerCase().includes(buscaNorm) &&
        !l.categoria_canonica.toLowerCase().includes(buscaNorm) &&
        !l.banco_origem.toLowerCase().includes(buscaNorm)
      ) {
        return false;
      }
      return true;
    });
  }, [linhas, busca, filtroOrigem, filtroStatus, filtroNatureza]);

  const totalLinhas = linhasFiltradas.length;
  const linhasVisiveis = useMemo(
    () => linhasFiltradas.slice(0, limiteVisivel),
    [linhasFiltradas, limiteVisivel],
  );
  const gruposVisiveis = useMemo(() => {
    if (agrupamento === "nenhum") {
      return [{ chave: "Todas as linhas", linhas: linhasVisiveis }];
    }
    const map = new Map<string, BaseConciliadaLinha[]>();
    for (const l of linhasVisiveis) {
      let chave: string;
      switch (agrupamento) {
        case "competencia":
          chave = l.competencia || "—";
          break;
        case "banco":
          chave = l.banco_origem || "Sem instituição";
          break;
        case "contrato":
          chave = l.vinculo_contrato_id ? `Contrato ${l.vinculo_contrato_id}` : "Sem contrato";
          break;
        case "categoria":
          chave = l.categoria_canonica || "—";
          break;
        default:
          chave = "—";
      }
      const arr = map.get(chave) ?? [];
      arr.push(l);
      map.set(chave, arr);
    }
    return Array.from(map.entries())
      .map(([chave, lns]) => ({ chave, linhas: lns }))
      .sort((a, b) => a.chave.localeCompare(b.chave));
  }, [linhasVisiveis, agrupamento]);
  const restantes = totalLinhas - linhasVisiveis.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>
          {descricao ??
            `${totalLinhas} linha(s) — filtros e agrupamento aplicados.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Buscar descrição / banco / categoria…"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setLimiteVisivel(LINHAS_POR_LOTE);
            }}
            className="lg:col-span-2"
          />
          <select
            value={filtroOrigem}
            onChange={(e) => setFiltroOrigem(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="todas">Origem: todas</option>
            <option value="contracheque">Contracheque</option>
            <option value="extrato_bancario">Extrato</option>
            <option value="contrato">Contrato</option>
          </select>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="todos">Status: todos</option>
            <option value="conciliado">Conciliado</option>
            <option value="possivel_duplicidade">Possível duplicidade</option>
            <option value="precisa_revisao">Precisa revisão</option>
            <option value="nao_conciliado">Não conciliado</option>
          </select>
          <select
            value={filtroNatureza}
            onChange={(e) => setFiltroNatureza(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="todas">Natureza: todas</option>
            <option value="receita">Receita</option>
            <option value="desconto">Desconto</option>
            <option value="emprestimo">Empréstimo</option>
            <option value="cartao">Cartão</option>
            <option value="saque">Saque</option>
            <option value="transferencia">Transferência</option>
            <option value="tarifa">Tarifa</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Agrupar por:</span>
          {(["competencia", "banco", "contrato", "categoria", "nenhum"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setAgrupamento(g)}
              className={cn(
                "px-2.5 py-1 rounded-md border transition-colors",
                agrupamento === g
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              {g === "nenhum" ? "Sem agrupamento" : g}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {gruposVisiveis.map((g) => (
            <div key={g.chave} className="rounded-lg border border-border">
              <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide">
                  {agrupamento === "competencia" ? formatarCompetenciaBr(g.chave) : g.chave}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {g.linhas.length} linha(s) ·{" "}
                  {brl(g.linhas.reduce((s, l) => s + l.valor, 0))}
                </p>
              </div>
              <div className="divide-y divide-border">
                {g.linhas.map((l) => {
                  const linha = l as LinhaComInstituicaoConciliacao;
                  const cf = linha.confirmacao_consigfacil as ConsigfacilConfirmacao | undefined;
                  const statusManual = statusManualPorEventoId.get(l.id) ?? null;
                  const salvando = eventoIdsSalvando?.has(l.id) ?? false;
                  return (
                    <div key={l.id} className={cn("p-3 space-y-2", classesStatus(l))}>
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate" title={l.descricao_original}>
                              {l.descricao_original || l.descricao_normalizada}
                            </p>
                            <Badge variant="outline" className="text-[10px]">
                              {l.origem}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {l.categoria_canonica}
                            </Badge>
                            {l.possivel_duplicidade && (
                              <Badge variant="destructive" className="text-[10px] gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                duplicidade
                              </Badge>
                            )}
                            {statusManual && (
                              <Badge variant="secondary" className="text-[10px]">
                                manual: {statusManual}
                              </Badge>
                            )}
                            {metaPassivoPorLinha.get(l.id)?.consignavel ? (
                              <BadgeCorrelacaoConsigfacil cf={cf} />
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-muted-foreground font-normal"
                              >
                                {metaPassivoPorLinha.get(l.id)?.rotuloPassivo ?? "—"} — fora da
                                conciliação consignável
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] opacity-80 mt-0.5">
                            {l.data} ·{" "}
                            {linha.instituicao_original_folha || l.banco_origem || "—"} ·{" "}
                            {ROTULOS_STATUS_CONCILIACAO[l.status_conciliacao]}
                          </p>
                          {metaPassivoPorLinha.get(l.id)?.consignavel && (
                            <InstituicaoFolhaConsigfacilBloco linha={linha} />
                          )}
                          {l.observacao && (
                            <p className="text-[11px] opacity-80 mt-1 italic">{l.observacao}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tabular-nums">{brl(l.valor)}</p>
                          <button
                            className="text-[11px] underline opacity-70 hover:opacity-100"
                            onClick={() =>
                              setLinhaExpandida((c) => (c === l.id ? null : l.id))
                            }
                          >
                            {linhaExpandida === l.id ? "Esconder ações" : "Revisar"}
                          </button>
                        </div>
                      </div>

                      {linhaExpandida === l.id && (
                        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-current/10">
                          {BOTOES_REVISAO.map(({ status, label, icon: Icon }) => {
                            const ativo = statusManual === status;
                            return (
                              <Button
                                key={status}
                                size="sm"
                                variant={ativo ? "default" : "outline"}
                                disabled={salvando}
                                onClick={() => void onAlterarStatusManual(l.id, ativo ? null : status)}
                              >
                                {salvando ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Icon className="h-3 w-3" />
                                )}
                                {ativo ? `${label} (remover)` : label}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {restantes > 0 && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimiteVisivel((n) => n + LINHAS_POR_LOTE)}
              >
                Carregar mais {Math.min(restantes, LINHAS_POR_LOTE)} de {restantes} linha(s)
              </Button>
            </div>
          )}

          {totalLinhas === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nenhuma linha conforme os filtros.
              {linhas.length === 0 && (
                <span className="block mt-1">
                  Importe extrato, anexe contracheques ou cadastre contratos.
                </span>
              )}
            </div>
          )}
        </div>

        <Legenda />
      </CardContent>
    </Card>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-2 border-t border-border">
      <span className="font-semibold">Cores:</span>
      <Cor cor="bg-emerald-50 dark:bg-emerald-950/40" icon={CheckCircle2} texto="Conciliado" />
      <Cor cor="bg-amber-50 dark:bg-amber-950/40" icon={AlertTriangle} texto="Possível duplicidade" />
      <Cor cor="bg-red-50 dark:bg-red-950/40" icon={XCircle} texto="Precisa revisão" />
      <Cor cor="bg-slate-100 dark:bg-slate-800" icon={EyeOff} texto="Ignorada / transferência" />
    </div>
  );
}

function Cor({ cor, icon: Icon, texto }: { cor: string; icon: typeof CheckCircle2; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-3 w-3 rounded-sm", cor)} />
      <Icon className="h-3 w-3" /> {texto}
    </span>
  );
}
