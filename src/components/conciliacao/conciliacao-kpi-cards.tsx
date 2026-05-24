"use client";

import {
  Banknote,
  Wallet,
  Scale,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CreditCard,
  ArrowLeftRight,
  FileText,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import type {
  ResultadoConciliacaoFolhaExtrato,
  ResultadoConciliacaoContratoExtrato,
} from "@/lib/conciliacao/conciliacao-financeira";

type KpiCardData = {
  titulo: string;
  valor: string;
  detalhe: string;
  icon: LucideIcon;
  tom: "neutro" | "positivo" | "alerta" | "critico";
};

const TOM_CLASSE: Record<KpiCardData["tom"], string> = {
  neutro: "bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
  positivo: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  alerta: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  critico: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export type ConciliacaoKpiCardsProps = {
  baseConciliada: BaseConciliadaLinha[];
  conciliacaoFolhaExtrato: ResultadoConciliacaoFolhaExtrato[];
  conciliacaoContratoExtrato: ResultadoConciliacaoContratoExtrato[];
  possuiFonteBancariaReal?: boolean;
};

export function ConciliacaoKpiCards({
  baseConciliada,
  conciliacaoFolhaExtrato,
  conciliacaoContratoExtrato,
  possuiFonteBancariaReal = true,
}: ConciliacaoKpiCardsProps) {
  const salarioPrevistoFolha = baseConciliada
    .filter((l) => l.origem === "contracheque" && l.natureza === "receita")
    .reduce((s, l) => s + l.valor, 0);

  const liquidoConciliadoBanco = conciliacaoFolhaExtrato.reduce(
    (s, r) => s + (r.liquido_extrato ?? 0),
    0,
  );

  const diferencaConciliada = conciliacaoFolhaExtrato.reduce(
    (s, r) => s + (r.diferenca ?? 0),
    0,
  );

  const emprestimosCreditados = baseConciliada
    .filter((l) => l.categoria_canonica === "emprestimo_pessoal_creditado")
    .reduce((s, l) => s + l.valor, 0);

  const pagamentosForaDaFolha = baseConciliada
    .filter((l) => l.categoria_canonica === "pagamento_emprestimo_extrato")
    .reduce((s, l) => s + l.valor, 0);

  const duplicidades = baseConciliada.filter((l) => l.possivel_duplicidade).length;

  const cartaoRmcRcc = baseConciliada.filter(
    (l) =>
      l.categoria_canonica === "rmc" ||
      l.categoria_canonica === "rcc" ||
      l.categoria_canonica === "cartao_consignado_folha" ||
      l.categoria_canonica === "cartao_consignado_extrato",
  ).length;

  const transferenciasIgnoradas = baseConciliada.filter(
    (l) => l.status_manual === "transferencia_propria" || l.status_manual === "ignorar",
  ).length;

  const contratosSemVinculo = conciliacaoContratoExtrato.filter(
    (c) => c.status === "sem_contrato",
  ).length;

  const creditosSemContrato = baseConciliada.filter(
    (l) =>
      l.categoria_canonica === "emprestimo_pessoal_creditado" && !l.vinculo_contrato_id,
  ).length;

  const cardsTodas: KpiCardData[] = [
    {
      titulo: "Salário previsto na folha",
      valor: brl(salarioPrevistoFolha),
      detalhe: "Bruto somando rubricas de vantagem do contracheque.",
      icon: Banknote,
      tom: "neutro",
    },
    {
      titulo: "Líquido conciliado no banco",
      valor: brl(liquidoConciliadoBanco),
      detalhe: `${conciliacaoFolhaExtrato.filter((r) => r.status === "conciliado").length} mês(es) com salário conciliado.`,
      icon: Wallet,
      tom: liquidoConciliadoBanco > 0 ? "positivo" : "neutro",
    },
    {
      titulo: "Diferença encontrada",
      valor: brl(diferencaConciliada),
      detalhe: "Soma das diferenças líquido contracheque vs. transação bancária.",
      icon: Scale,
      tom: diferencaConciliada > 10 ? "alerta" : "neutro",
    },
    {
      titulo: "Empréstimos creditados",
      valor: brl(emprestimosCreditados),
      detalhe: `${baseConciliada.filter((l) => l.categoria_canonica === "emprestimo_pessoal_creditado").length} linha(s).`,
      icon: TrendingUp,
      tom: emprestimosCreditados > 0 ? "alerta" : "neutro",
    },
    {
      titulo: "Pagamentos fora da folha",
      valor: brl(pagamentosForaDaFolha),
      detalhe: `${baseConciliada.filter((l) => l.categoria_canonica === "pagamento_emprestimo_extrato").length} linha(s).`,
      icon: TrendingDown,
      tom: pagamentosForaDaFolha > 0 ? "alerta" : "neutro",
    },
    {
      titulo: "Possíveis duplicidades",
      valor: String(duplicidades),
      detalhe: "Salário-extrato versus rubricas do contracheque do mesmo mês.",
      icon: AlertTriangle,
      tom: duplicidades > 0 ? "alerta" : "positivo",
    },
    {
      titulo: "Cartão / RMC / RCC",
      valor: String(cartaoRmcRcc),
      detalhe: "Indícios de cartão consignado em folha ou extrato.",
      icon: CreditCard,
      tom: cartaoRmcRcc > 0 ? "critico" : "positivo",
    },
    {
      titulo: "Transferências ignoradas",
      valor: String(transferenciasIgnoradas),
      detalhe: "Marcadas manualmente como entre contas próprias ou ignoradas.",
      icon: ArrowLeftRight,
      tom: "neutro",
    },
    {
      titulo: "Contratos sem vínculo",
      valor: String(contratosSemVinculo),
      detalhe: "Contratos anexados sem crédito bancário correspondente.",
      icon: FileText,
      tom: contratosSemVinculo > 0 ? "alerta" : "positivo",
    },
    {
      titulo: "Créditos sem contrato",
      valor: String(creditosSemContrato),
      detalhe: "Empréstimo recebido na conta sem contrato anexado.",
      icon: Search,
      tom: creditosSemContrato > 0 ? "critico" : "positivo",
    },
  ];

  const titulosSomenteComExtrato = new Set([
    "Líquido conciliado no banco",
    "Diferença encontrada",
    "Possíveis duplicidades",
    "Pagamentos fora da folha",
    "Empréstimos creditados",
    "Créditos sem contrato",
    "Contratos sem vínculo",
  ]);

  const cards = possuiFonteBancariaReal
    ? cardsTodas
    : cardsTodas.filter((c) => !titulosSomenteComExtrato.has(c.titulo));

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.titulo} size="sm">
            <CardContent className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground leading-tight">{c.titulo}</p>
                <div className={`p-1.5 rounded-md ${TOM_CLASSE[c.tom]}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className="text-lg font-bold tabular-nums">{c.valor}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{c.detalhe}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
