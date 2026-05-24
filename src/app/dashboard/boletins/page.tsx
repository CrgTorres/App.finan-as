"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import { MONTHS } from "@/lib/constants";
import {
  buildBoletinsJanela6Meses,
  CHECKLIST_DEFESA_CONSUMIDOR,
  TEMA_LABEL,
  type BoletimMes,
} from "@/lib/defesa-consumidor/boletins-catalog";
import { computeSinaisPerfil, scoreBoletimRelevanteParaPerfil } from "@/lib/defesa-consumidor/profile-signals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import { ExternalLink, Loader2, Scale, Search } from "lucide-react";

const CHECKLIST_STORAGE_KEY = "financa-consumer-checklist:v1";

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function boletimMatches(b: BoletimMes, q: string): boolean {
  const blob = norm(
    [
      b.titulo,
      b.subtitulo,
      ...b.texto,
      ...b.temas.map((t) => TEMA_LABEL[t]),
      ...b.usarDadosDoApp,
    ].join(" ")
  );
  return blob.includes(q);
}

export default function BoletinsDefesaPage() {
  const [loading, setLoading] = useState(true);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [query, setQuery] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [dataRefreshTick, setDataRefreshTick] = useState(0);

  const loadBoletinsData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [{ data: ps }, { data: ls }, { data: tx }] = await Promise.all([
      supabase.from("payslips").select("*"),
      supabase.from("loans").select("*"),
      supabase.from("transactions").select("*").order("date", { ascending: false }).limit(2500),
    ]);
    setPayslips((ps as Payslip[]) ?? []);
    setLoans((ls as Loan[]) ?? []);
    setTransactions((tx as Transaction[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadBoletinsData();
  }, [loadBoletinsData, dataRefreshTick]);

  useEffect(() => {
    const onDataUpdated = () => setDataRefreshTick((n) => n + 1);
    window.addEventListener(DASHBOARD_DATA_UPDATED, onDataUpdated);
    return () => window.removeEventListener(DASHBOARD_DATA_UPDATED, onDataUpdated);
  }, []);

  useEffect(() => {
    try {
      const r = localStorage.getItem(CHECKLIST_STORAGE_KEY);
      setChecks(r ? JSON.parse(r) : {});
    } catch {
      setChecks({});
    }
  }, []);

  const toggleCheck = useCallback((id: string) => {
    setChecks((prev) => {
      const n = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });
  }, []);

  const limparChecklist = useCallback(() => {
    setChecks({});
    try {
      localStorage.removeItem(CHECKLIST_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const sinais = useMemo(
    () => computeSinaisPerfil(payslips, loans, transactions),
    [payslips, loans, transactions]
  );

  const boletinsBase = useMemo(() => buildBoletinsJanela6Meses(), []);

  const boletinsSorted = useMemo(() => {
    return [...boletinsBase].sort((a, b) => {
      const sb = scoreBoletimRelevanteParaPerfil(b, sinais);
      const sa = scoreBoletimRelevanteParaPerfil(a, sinais);
      if (sb !== sa) return sb - sa;
      if (b.ano !== a.ano) return b.ano - a.ano;
      return b.mes - a.mes;
    });
  }, [boletinsBase, sinais]);

  const q = norm(query);

  const boletinsFiltrados = useMemo(() => {
    if (!q) return boletinsSorted;
    return boletinsSorted.filter((b) => boletimMatches(b, q));
  }, [boletinsSorted, q]);

  const checklistFiltrado = useMemo(() => {
    if (!q) return [...CHECKLIST_DEFESA_CONSUMIDOR];
    return CHECKLIST_DEFESA_CONSUMIDOR.filter(
      (it) =>
        norm(it.texto).includes(q) ||
        norm(it.grupo).includes(q) ||
        it.temaRelacionado.some((t) => norm(TEMA_LABEL[t]).includes(q))
    );
  }, [q]);

  const checklistPorGrupo = useMemo(() => {
    const m = new Map<string, typeof checklistFiltrado>();
    for (const it of checklistFiltrado) {
      if (!m.has(it.grupo)) m.set(it.grupo, []);
      m.get(it.grupo)!.push(it);
    }
    return [...m.entries()];
  }, [checklistFiltrado]);

  const totalChecks = CHECKLIST_DEFESA_CONSUMIDOR.length;
  const doneChecks = CHECKLIST_DEFESA_CONSUMIDOR.filter((c) => checks[c.id]).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-24 md:pb-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Scale className="h-7 w-7 text-amber-600 dark:text-amber-400 shrink-0" />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            Boletins e checklist — defesa bancária
          </h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Janela de <strong>6 meses civis</strong> em formato de boletins (temas típicos, sem número de recurso inventado) +{" "}
          <strong>checklist salvo neste navegador</strong> + <strong>busca</strong> por palavras-chave nos dois blocos.
          Pontuação inicial dos cartões usa os dados já carregados: contracheques, empréstimos e extratos.
        </p>
        <Card className="border-amber-300/70 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/25">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              Informação importante
            </CardTitle>
            <CardDescription className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
              Isto não é assessoria jurídica. Para julgamentos concretos use os portais dos tribunais (ex.: STJ) com os filtros do
              seu caso. Links abaixo abrem apenas fontes institucionais conhecidas.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Perfil inferido pela sua base (heurísticas)</CardTitle>
          <CardDescription>Usado apenas para destacar cartões mais úteis e para você validar lacunas nos dados.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={sinais.temContracheques ? "default" : "secondary"} className="font-normal">
            Contracheques: {sinais.temContracheques ? "sim" : "não há na base"}
          </Badge>
          <Badge variant={sinais.temExtratoUltimos180d ? "default" : "secondary"} className="font-normal">
            Extrato (~180 dias): {sinais.temExtratoUltimos180d ? "sim" : "ausente"}
          </Badge>
          <Badge variant={sinais.temRubricaConsignadoOuBancoNaFolha ? "default" : "secondary"} className="font-normal">
            Consignado/banco detectado na folha: {sinais.temRubricaConsignadoOuBancoNaFolha ? "sim" : "não detectei"}
          </Badge>
          <Badge variant={sinais.temEmprestimoAtivoCadastrado ? "default" : "secondary"} className="font-normal">
            Empréstimo manual ativo: {sinais.temEmprestimoAtivoCadastrado ? "sim" : "não há"}
          </Badge>
          <Badge variant={sinais.cargaDescontosAlta ? "destructive" : "secondary"} className="font-normal">
            Descontos ≥ 35% do bruto (últimos contracheques): {sinais.cargaDescontosAlta ? "sim" : "não"}
          </Badge>
          <div className="w-full mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <Link className="text-blue-600 dark:text-blue-400 underline font-medium" href="/dashboard/contracheque">
              Contracheque
            </Link>
            <span aria-hidden className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <Link className="text-blue-600 dark:text-blue-400 underline font-medium" href="/dashboard/import">
              Importar extrato
            </Link>
            <span aria-hidden className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <Link className="text-blue-600 dark:text-blue-400 underline font-medium" href="/dashboard/transactions">
              Transações
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="busca-defesa" className="flex items-center gap-2 text-sm font-medium">
          <Search className="h-4 w-4 text-slate-500" aria-hidden />
          Buscar em boletins e checklist
        </Label>
        <Input
          id="busca-defesa"
          placeholder="Ex.: consignado, Bacen, venda casada, extrato..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xl"
          autoComplete="off"
        />
        {q && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Boletins: {boletinsFiltrados.length} · Itens da checklist visíveis: {checklistFiltrado.length}
          </p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Boletins (janela móvel 6 meses)</h2>
        {boletinsFiltrados.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Nenhum boletim com esse termo. Limpe o campo de busca.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {boletinsFiltrados.map((b) => (
              <Card
                key={b.id}
                className={cn(
                  "border border-slate-200 dark:border-slate-700",
                  scoreBoletimRelevanteParaPerfil(b, sinais) > 0 &&
                    "ring-1 ring-amber-400/50 dark:ring-amber-600/35 shadow-sm"
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="shrink-0 font-mono tabular-nums text-[11px]">
                      {MONTHS[b.mes - 1]}/{b.ano}
                    </Badge>
                    {scoreBoletimRelevanteParaPerfil(b, sinais) > 0 && (
                      <Badge className="shrink-0 bg-amber-600 hover:bg-amber-600 dark:bg-amber-700 dark:hover:bg-amber-700">
                        Destaque para seus dados
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base leading-snug pt-1">{b.titulo}</CardTitle>
                  <CardDescription className="text-xs">{b.subtitulo}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {b.texto.map((p, idx) => (
                    <p key={`${b.id}-${idx}`}>{p}</p>
                  ))}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {b.temas.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[11px] font-normal">
                        {TEMA_LABEL[t]}
                      </Badge>
                    ))}
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Cruzamento com esta plataforma
                    </p>
                    <ul className="text-xs space-y-1 list-disc list-outside ml-4">
                      {b.usarDadosDoApp.map((u) => (
                        <li key={u}>{u}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-col gap-1.5 pt-1">
                    {b.fontesConsulta.map((f) => (
                      <a
                        key={f.href}
                        href={f.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {f.label}
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator />

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Checklist interativo</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Progresso neste navegador:{" "}
              <strong className="text-slate-800 dark:text-slate-200">
                {doneChecks}/{totalChecks}
              </strong>
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={limparChecklist}>
            Zerar marcações locais
          </Button>
        </div>

        {checklistFiltrado.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Nenhum item visível para essa busca.</p>
        ) : (
          <div className="space-y-6">
            {checklistPorGrupo.map(([grupo, items]) => (
              <Card key={grupo}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{grupo}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.map((it) => (
                    <label
                      key={it.id}
                      className={cn(
                        "flex gap-3 items-start rounded-lg border border-transparent px-2 py-2 -mx-2",
                        "hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                        checked={!!checks[it.id]}
                        onChange={() => toggleCheck(it.id)}
                      />
                      <span className="space-y-1">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 block">{it.texto}</span>
                        {it.ajuda && <span className="text-xs text-slate-600 dark:text-slate-400 block">{it.ajuda}</span>}
                        <span className="flex flex-wrap gap-1 pt-1">
                          {it.temaRelacionado.map((t) => (
                            <Badge key={`${it.id}-${t}`} variant="outline" className="text-[10px] font-normal">
                              {TEMA_LABEL[t]}
                            </Badge>
                          ))}
                        </span>
                      </span>
                    </label>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
