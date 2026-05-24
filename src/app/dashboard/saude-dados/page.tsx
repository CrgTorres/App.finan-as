"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Loader2, RefreshCw, Shield } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/types";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buildBaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import { listarStatusManualConciliacao } from "@/lib/conciliacao/status-manual-conciliacao-service";
import type { EntradaStatusManualBaseConciliada } from "@/lib/conciliacao/conciliacao-financeira";
import { listarSnapshotsConsigfacil } from "@/lib/consignacoes-governo/consigfacil-service";
import {
  consolidarSnapshotsConsigfacil,
  reparseSnapshotsBrutos,
} from "@/lib/consignacoes-governo/normalizar-consigfacil";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import { usePerfilLeituraAnalise } from "@/components/leitura-analise/use-perfil-leitura-analise";
import { sincronizarFontesAnalise } from "@/lib/auditoria/sincronizar-fontes-analise";
import { FonteIntegracaoCard } from "@/components/dashboard/saude-dados/fonte-integracao-card";
import { AlertasIntegracaoBanner } from "@/components/dashboard/saude-dados/alertas-integracao-banner";
import { ProntidaoAnaliseCard } from "@/components/dashboard/saude-dados/prontidao-analise-card";

const CLASSIFICACAO_COR: Record<string, string> = {
  baixo: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  medio: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  alto: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  excelente: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
};

export default function SaudeDadosPage() {
  const perfilLeitura = usePerfilLeituraAnalise();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [evidencias, setEvidencias] = useState<LoanEvidence[]>([]);
  const [statusManual, setStatusManual] = useState<EntradaStatusManualBaseConciliada[]>([]);
  const [snapshotsConsigfacil, setSnapshotsConsigfacil] = useState<ConsigfacilSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const [{ data: tx }, { data: ln }, { data: ps }, { data: ev }, statusRes, consigfacilRes] =
        await Promise.all([
          supabase.from("transactions").select("*").order("date", { ascending: true }),
          supabase.from("loans").select("*"),
          supabase
            .from("payslips")
            .select("*")
            .order("year", { ascending: true })
            .order("month", { ascending: true }),
          supabase.from("loan_evidences").select("*").order("created_at", { ascending: false }),
          (async () => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) return { data: [], origem: "local" as const, error: null };
            return listarStatusManualConciliacao(supabase, user.user.id);
          })(),
          (async () => {
            const { data: user } = await supabase.auth.getUser();
            if (!user.user) return { snapshots: [], origem: "local" as const };
            return listarSnapshotsConsigfacil(supabase, user.user.id);
          })(),
        ]);
      setTransactions((tx as Transaction[]) ?? []);
      setLoans((ln as Loan[]) ?? []);
      setPayslips((ps as Payslip[]) ?? []);
      setEvidencias((ev as LoanEvidence[]) ?? []);
      setStatusManual(statusRes.data);
      setSnapshotsConsigfacil(reparseSnapshotsBrutos(consigfacilRes.snapshots));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const onUpdate = () => void loadData();
    window.addEventListener(DASHBOARD_DATA_UPDATED, onUpdate);
    return () => window.removeEventListener(DASHBOARD_DATA_UPDATED, onUpdate);
  }, [loadData]);

  const baseConsigfacil = useMemo(
    () => consolidarSnapshotsConsigfacil(snapshotsConsigfacil, perfilLeitura.configAuditoria),
    [snapshotsConsigfacil, perfilLeitura.configAuditoria],
  );

  const base = useMemo(
    () =>
      buildBaseFinanceiraNormalizada({
        transactions,
        loans,
        payslips,
        evidencias,
        statusManualConciliacao: statusManual,
        consigfacil: baseConsigfacil,
        perfilLeitura,
        snapshotsConsigfacilRaw: snapshotsConsigfacil,
      }),
    [
      transactions,
      loans,
      payslips,
      evidencias,
      statusManual,
      baseConsigfacil,
      perfilLeitura,
      snapshotsConsigfacil,
    ],
  );

  const integracao = base.integracaoFontes;
  const indice = integracao.indice_confiabilidade;

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "financa:ultima-auditoria-integracao:v1",
        JSON.stringify({
          at: integracao.auditado_em,
          indice: indice.indice,
          classificacao: indice.classificacao,
          alertas: integracao.alertas.slice(0, 12),
          nivel_prontidao: integracao.prontidao.nivel_prontidao_analise,
          niveis_atingidos: integracao.prontidao.niveis_atingidos,
          selo_publicos: integracao.prontidao.publicos_disponiveis,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [integracao, indice]);

  const handleSincronizar = async () => {
    setSyncing(true);
    try {
      const res = sincronizarFontesAnalise({
        transactions,
        loans,
        payslips,
        evidencias,
        statusManualConciliacao: statusManual,
        consigfacil: baseConsigfacil,
        snapshotsConsigfacil,
        perfilLeitura,
        origin: "saude_dados_reprocessar",
      });
      toast.success(
        `Sincronização concluída (${res.passos.length} etapas). Índice de confiabilidade: ${res.auditoria.indice_confiabilidade.indice}.`,
      );
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na sincronização.");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> Saúde dos Dados
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Verifica se cada fonte está integrada, normalizada, vinculada à base, usada em gráficos,
            exportação e scores. Responde: o que falta sincronizar e o que precisa reprocessar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={syncing}>
            <RefreshCw className="h-4 w-4 mr-1" /> Recarregar
          </Button>
          <Button size="sm" onClick={handleSincronizar} disabled={syncing}>
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Sincronizar todas as fontes
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Índice de confiabilidade dos dados
          </CardTitle>
          <CardDescription>
            0–40 baixo · 41–70 médio · 71–90 alto · 91–100 excelente
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <span className="text-4xl font-bold tabular-nums">{indice.indice}</span>
          <Badge className={CLASSIFICACAO_COR[indice.classificacao] ?? ""}>
            {indice.classificacao}
          </Badge>
          <ul className="text-xs text-muted-foreground space-y-0.5 flex-1 min-w-[200px]">
            {indice.fatores.map((f, i) => (
              <li key={i}>· {f}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <ProntidaoAnaliseCard prontidao={integracao.prontidao} />

      {integracao.alertas.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">Alertas</h2>
          <AlertasIntegracaoBanner alertas={integracao.alertas} max={8} linkSaude={false} />
        </section>
      )}

      {integracao.perguntas_sugeridas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Perguntas sugeridas para o Perfil de Leitura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {integracao.perguntas_sugeridas.slice(0, 5).map((p) => (
              <div key={p.chave} className="rounded border p-2">
                <p className="font-medium">{p.pergunta_sugerida}</p>
                <p className="text-muted-foreground mt-1">{p.motivo}</p>
                <Badge variant="outline" className="mt-1 text-[9px]">
                  {p.nivel} · {p.tipo_problema}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="text-sm font-semibold mb-3">Fontes integradas ({integracao.fontes.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {integracao.fontes.map((f) => (
            <FonteIntegracaoCard
              key={f.fonte}
              fonte={f}
              onReprocessar={handleSincronizar}
              reprocessando={syncing}
            />
          ))}
        </div>
      </section>

      <p className="text-[10px] text-muted-foreground">
        Exportação: abas Saude_Dados, Fontes_Integradas, Prontidao_Analise, Confiabilidade_Dados,
        Perguntas_Sugeridas, Atualizacoes_Juridicas — em /dashboard/exportacao.
      </p>
    </div>
  );
}
