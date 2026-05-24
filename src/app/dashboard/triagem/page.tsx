"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Filter,
  Download,
  Zap,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import { usePerfilLeituraAnalise } from "@/components/leitura-analise/use-perfil-leitura-analise";
import {
  pendenciaOcultaPorTriagem,
  TRIAGEM_ATUALIZADA,
} from "@/lib/triagem/aplicar-respostas-triagem";
import { carregarAprendizadoDivergencias } from "@/lib/triagem/aprendizado-divergencias";
import { filtrarItensTriagem } from "@/lib/triagem/montar-contexto-divergencia-guiada";
import {
  agruparPendenciasPorPercentualDivergencia,
  resolverPendenciasDivergenciaEmLote,
  sugerirPadraoParaPercentual,
} from "@/lib/triagem/resolver-padrao-divergencia-lote";
import type { FiltroTriagemResolutiva } from "@/lib/triagem/triagem-resolutiva-tipos";
import { PainelResolucaoDivergenciaLateral } from "@/components/dashboard/triagem/painel-resolucao-divergencia-lateral";
import { RespostaDivergenciaCard } from "@/components/dashboard/triagem/resposta-divergencia-card";
import {
  agruparDivergenciasLogicas,
  autoResolverGruposElegiveis,
  criarContextoAgrupamento,
  linhasExportacaoClustersLogicos,
  resolverGrupoDivergenciaLogica,
  type DecisaoGrupoDivergencia,
  type GrupoDivergenciaLogica,
} from "@/lib/triagem/agrupar-divergencias-logicas";
import { PadroesDetectadosTriagem } from "@/components/dashboard/triagem/padroes-detectados-triagem";
import { ContextosResolutivosPainel } from "@/components/dashboard/triagem/contextos-resolutivos-painel";
import {
  filtrarFilaComRastreabilidade,
  exportarContextoResolutivoCsv,
} from "@/lib/triagem/rastreabilidade-triagem-consolidada";
import { salvarPreferenciaVisualizacaoConsolidada } from "@/lib/leitura-analise/perfil-leitura-storage";
import { Label } from "@/components/ui/label";
import {
  filtrarPorPrioridade,
  type FiltroPrioridadeTriagem,
} from "@/lib/triagem/calcular-prioridade-risco-triagem";
import {
  PriorizacaoRiscoTriagemPainel,
  ItemTriagemCardPriorizado,
} from "@/components/dashboard/triagem/priorizacao-risco-triagem-painel";
import { FilaTrabalhoPerfilPainel } from "@/components/dashboard/triagem/fila-trabalho-perfil-painel";
import { MatchContratoDebugTriagem } from "@/components/dashboard/triagem/match-contrato-debug-triagem";
import { SaneamentoEstruturalPainel } from "@/components/dashboard/triagem/saneamento-estrutural-painel";
import {
  montarFilaTrabalhoPerfil,
  linhasExportacaoFilaTrabalho,
  type PerfilTrabalhoTriagem,
} from "@/lib/triagem/montar-fila-trabalho-perfil";
import {
  processarTriagemCompleta,
  type TriagemPipelineModo,
  type TriagemPipelineSnapshot,
} from "@/lib/triagem/processar-triagem-completa";
import { ROTULOS_TRIAGEM_UI } from "@/lib/triagem/rotulos-triagem-resolutiva-ui";
import {
  isTriagemProcessingLocked,
  subscribeTriagemProcessingLock,
} from "@/lib/triagem/triagem-processing-lock";

const FILTROS: { id: FiltroTriagemResolutiva; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "abertas", label: "Abertas" },
  { id: "resolvidas_auto", label: "Auto" },
  { id: "resolvidas_pergunta", label: "Por pergunta" },
  { id: "aprendidas", label: "Aprendidas" },
  { id: "operacionais", label: "Operacionais" },
  { id: "refin_reais", label: "Refin real" },
  { id: "risco_alto", label: "Risco alto" },
];

export default function TriagemInteligenteResolutivaPage() {
  const perfilLeitura = usePerfilLeituraAnalise();
  const [snapshot, setSnapshot] = useState<TriagemPipelineSnapshot | null>(null);
  const [inicializando, setInicializando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [filtro, setFiltro] = useState<FiltroTriagemResolutiva>("abertas");
  const [filtroPrioridade, setFiltroPrioridade] = useState<FiltroPrioridadeTriagem>("todas");
  const [itemAtivoId, setItemAtivoId] = useState<string | null>(null);
  const [grupoRevisaoId, setGrupoRevisaoId] = useState<string | null>(null);
  const [linhasReveladasContexto, setLinhasReveladasContexto] = useState<Set<string>>(
    () => new Set(),
  );
  const [perfilTrabalhoAtivo, setPerfilTrabalhoAtivo] =
    useState<PerfilTrabalhoTriagem>("usuario_comum");

  useEffect(() => {
    return subscribeTriagemProcessingLock((s) => setProcessando(s.locked));
  }, []);

  const executarPipeline = useCallback(
    async (modo: TriagemPipelineModo) => {
      try {
        const res = await processarTriagemCompleta({
          modo,
          perfilLeitura,
          snapshotAtual: snapshot,
        });
        if (!res.ok) {
          toast.error("Aguarde o processamento atual finalizar.");
          return null;
        }
        setSnapshot(res.snapshot);
        if (res.mensagem) toast.success(res.mensagem);
        return res;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha no processamento da triagem.");
        return null;
      }
    },
    [perfilLeitura, snapshot],
  );

  useEffect(() => {
    let ativo = true;
    setInicializando(true);
    void processarTriagemCompleta({ modo: "recarregar", perfilLeitura }).then((res) => {
      if (!ativo) return;
      if (res.ok) setSnapshot(res.snapshot);
      else if (!res.ok) {
        toast.error("Aguarde o processamento atual finalizar.");
      }
      setInicializando(false);
    });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial única
  }, []);

  useEffect(() => {
    const onData = (ev: Event) => {
      const origin = (ev as CustomEvent<{ origin?: string }>).detail?.origin;
      if (origin?.startsWith("triagem_pipeline_")) return;
      if (isTriagemProcessingLocked()) return;
      void executarPipeline("recarregar");
    };
    const onTriagem = () => {
      if (isTriagemProcessingLocked()) return;
      void executarPipeline("recalcular_derivados");
    };
    window.addEventListener(DASHBOARD_DATA_UPDATED, onData);
    window.addEventListener(TRIAGEM_ATUALIZADA, onTriagem);
    return () => {
      window.removeEventListener(DASHBOARD_DATA_UPDATED, onData);
      window.removeEventListener(TRIAGEM_ATUALIZADA, onTriagem);
    };
  }, [executarPipeline]);

  const base = snapshot?.base;
  const itensTriagem = snapshot?.itensTriagem ?? [];
  const agrupamento = snapshot?.agrupamento;
  const consolidacaoContextual = snapshot?.consolidacaoContextual;
  const saneamentoNatureza = snapshot?.saneamentoNatureza;
  const priorizacao = snapshot?.priorizacao;
  const rastreabilidade = snapshot?.rastreabilidade;
  const visualizacaoConsolidada = perfilLeitura.visualizacaoConsolidadaInteligente;
  const contextoAgrupamento = useMemo(
    () => (itensTriagem.length ? criarContextoAgrupamento(itensTriagem, perfilLeitura) : null),
    [itensTriagem, perfilLeitura, snapshot?.version],
  );

  const itensBaseFilaRastreada = useMemo(() => {
    if (!agrupamento || !rastreabilidade) return [];
    const filtrados = filtrarItensTriagem(itensTriagem, filtro);
    const abertos = filtrados.filter((i) => !pendenciaOcultaPorTriagem(i.pendencia.id));
    const semClusters = abertos.filter((i) => !agrupamento.idsEmCluster.has(i.pendencia.id));
    const fila = filtrarFilaComRastreabilidade(semClusters, rastreabilidade, {
      visualizacaoConsolidada,
      idsEmCluster: agrupamento.idsEmCluster,
      linhasReveladas: linhasReveladasContexto,
    });
    const ids = new Set(fila.map((i) => i.pendencia.id));
    for (const id of linhasReveladasContexto) {
      if (!ids.has(id)) {
        const item = itensTriagem.find((i) => i.pendencia.id === id);
        if (item) fila.push(item);
      }
    }
    return fila;
  }, [
    itensTriagem,
    filtro,
    snapshot?.version,
    agrupamento,
    rastreabilidade,
    visualizacaoConsolidada,
    linhasReveladasContexto,
  ]);

  const filaTrabalho = useMemo(() => {
    if (!priorizacao || !agrupamento || !rastreabilidade || !base) return null;
    return montarFilaTrabalhoPerfil({
      filaPrincipal: priorizacao.fila_principal,
      riscosRefin: base.riscoRefinForcado,
      incluirFontesAuxiliares: false,
    });
  }, [priorizacao, agrupamento, rastreabilidade, base, snapshot?.version]);

  const itensVisiveis = useMemo(() => {
    if (!priorizacao) return [];
    const idsFila = new Set(itensBaseFilaRastreada.map((i) => i.pendencia.id));
    if (filtroPrioridade === "monitoramento") {
      return priorizacao.monitoramento.filter((i) => idsFila.has(i.pendencia.id));
    }
    let lista = priorizacao.fila_principal.filter((i) => idsFila.has(i.pendencia.id));
    if (filtroPrioridade !== "todas") {
      lista = filtrarPorPrioridade(lista, filtroPrioridade);
    }
    return lista;
  }, [priorizacao, filtroPrioridade, itensBaseFilaRastreada]);

  const itemAtivo = useMemo(
    () =>
      itensTriagem.find((i) => i.pendencia.id === itemAtivoId) ??
      itensVisiveis.find((i) => i.pendencia.id === itemAtivoId) ??
      null,
    [itensTriagem, itensVisiveis, itemAtivoId],
  );

  const itensPorIdMap = useMemo(() => {
    const m = new Map<string, (typeof itensTriagem)[0]>();
    for (const item of itensTriagem) {
      m.set(item.pendencia.id, item);
    }
    return m;
  }, [itensTriagem]);

  const kpis = snapshot?.metricas;

  const stats = useMemo(() => {
    const autoElegivel = itensTriagem.filter(
      (i) =>
        !pendenciaOcultaPorTriagem(i.pendencia.id) &&
        i.motor.resolvido &&
        i.motor.remover_conferencia,
    );
    const aprendidas = itensTriagem.filter((i) => i.aprendizado_aplicado);
    return {
      auto: autoElegivel.length,
      aprendidas: aprendidas.length,
      aprendizadoStore: carregarAprendizadoDivergencias().length,
    };
  }, [itensTriagem, snapshot?.version]);

  const padroesPct = useMemo(() => {
    if (!base) return new Map();
    const abertas = base.pendenciasConferenciaReais.filter((p) => !pendenciaOcultaPorTriagem(p.id));
    return agruparPendenciasPorPercentualDivergencia(abertas);
  }, [base, snapshot?.version]);

  const handleResolverGrupo = (
    grupo: GrupoDivergenciaLogica,
    decisao: DecisaoGrupoDivergencia,
  ) => {
    if (!contextoAgrupamento) return;
    const r = resolverGrupoDivergenciaLogica(grupo, decisao, contextoAgrupamento);
    setGrupoRevisaoId(null);
    setItemAtivoId(null);
    void executarPipeline("recalcular_derivados");
    toast.success(
      `${r.linhas_resolvidas} linha(s) — ${decisao}${r.removido_conferencia ? " (removidas da conferência)" : ""}.`,
    );
  };

  const handleRevisarGrupo = (grupo: GrupoDivergenciaLogica) => {
    setGrupoRevisaoId(grupo.grupo_id);
    const primeiraId = grupo.linhas_ids.find((id) => !pendenciaOcultaPorTriagem(id));
    if (primeiraId) setItemAtivoId(primeiraId);
    else toast.info("Todas as linhas deste grupo já foram resolvidas.");
  };

  const autoResolverClusters = () => {
    if (!agrupamento || !contextoAgrupamento) return;
    const { grupos, linhas } = autoResolverGruposElegiveis(
      agrupamento.grupos,
      contextoAgrupamento,
    );
    if (grupos === 0) {
      toast.info("Nenhum cluster elegível para auto-resolução (confiança ≥85% e perfil).");
      return;
    }
    void executarPipeline("recalcular_derivados");
    toast.success(`${grupos} grupo(s), ${linhas} linha(s) resolvida(s) automaticamente.`);
  };

  const exportarCsvClusters = () => {
    if (!agrupamento) return;
    const linhas = linhasExportacaoClustersLogicos(agrupamento.grupos, agrupamento.metricas);
    const cols = Object.keys(linhas[0] ?? { grupo_id: "" });
    const header = cols.join(";");
    const body = linhas
      .map((row) => cols.map((c) => String(row[c] ?? "").replace(/;/g, ",")).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `triagem_clusters_logicos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação Triagem_Clusters_Logicos (CSV) gerada.");
  };

  const exportarCsvTriagem = () => {
    if (!rastreabilidade) return;
    const linhas = rastreabilidade.linhas_resolutiva;
    const cols = Object.keys(linhas[0] ?? { banco: "" });
    const header = cols.join(";");
    const body = linhas
      .map((row) => cols.map((c) => String(row[c as keyof typeof row] ?? "").replace(/;/g, ",")).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `triagem_resolutiva_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação Triagem_Resolutiva (CSV) gerada.");
  };

  const exportarCsvFilaTrabalho = () => {
    if (!filaTrabalho) return;
    const linhas = linhasExportacaoFilaTrabalho(filaTrabalho);
    const cols = Object.keys(linhas[0] ?? { perfil: "" });
    const header = cols.join(";");
    const body = linhas
      .map((row) => cols.map((c) => String(row[c as keyof typeof row] ?? "").replace(/;/g, ",")).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `triagem_fila_trabalho_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação Triagem_Fila_Trabalho (CSV) gerada.");
  };

  const botoesDesabilitados = processando || inicializando || !snapshot;
  const ultimoSaneamentoResumo = snapshot?.ultimoSaneamentoResumo ?? null;

  if (inicializando && !snapshot) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando triagem resolutiva…
      </div>
    );
  }

  if (
    !snapshot ||
    !base ||
    !priorizacao ||
    !agrupamento ||
    !consolidacaoContextual ||
    !saneamentoNatureza ||
    !rastreabilidade ||
    !kpis
  ) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Não foi possível montar a triagem. Tente recarregar.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto pb-24">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-violet-600" />
            Triagem Inteligente Resolutiva
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Pipeline contextual: histórico saneado, monitoramento automático e fila humana
            estrutural para decisões reais.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Badge variant="secondary">Perfil: {perfilLeitura.rotuloNivel}</Badge>
            <Badge variant="outline">
              {kpis.fila_humana} {ROTULOS_TRIAGEM_UI.filaHumanaEstrutural.toLowerCase()}
            </Badge>
            {kpis.fila_humana === 0 && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0">
                {ROTULOS_TRIAGEM_UI.triagemEstabilizada}
              </Badge>
            )}
            <Badge variant="outline" className="text-emerald-700">
              {stats.auto} auto pelo motor
            </Badge>
            {processando && (
              <Badge variant="default" className="bg-violet-600 animate-pulse">
                Processamento em andamento
              </Badge>
            )}
            <div className="flex items-center gap-2">
              <input
                id="viz-consolidada"
                type="checkbox"
                className="h-4 w-4 rounded border"
                checked={visualizacaoConsolidada}
                onChange={(e) => {
                  salvarPreferenciaVisualizacaoConsolidada(e.target.checked);
                  perfilLeitura.recarregar();
                }}
              />
              <Label htmlFor="viz-consolidada" className="text-xs cursor-pointer font-normal">
                Visualização consolidada inteligente
              </Label>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={botoesDesabilitados}
            onClick={() => void executarPipeline("recarregar")}
          >
            {processando ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Recarregar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={botoesDesabilitados}
            onClick={() => void executarPipeline("reprocessar_vinculacao")}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Reprocessar vinculação
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={botoesDesabilitados}
            onClick={() => void executarPipeline("saneamento_estrutural")}
          >
            {processando ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4 mr-1" />
            )}
            Saneamento estrutural
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={botoesDesabilitados}
            onClick={() => void executarPipeline("aplicar_auto")}
          >
            <Zap className="h-4 w-4 mr-1" /> Aplicar auto ({stats.auto})
          </Button>
          <Button variant="outline" size="sm" onClick={exportarCsvTriagem}>
            <Download className="h-4 w-4 mr-1" /> CSV resolutiva
          </Button>
          <Button variant="outline" size="sm" onClick={exportarCsvClusters}>
            <Download className="h-4 w-4 mr-1" /> CSV clusters
          </Button>
          <Button variant="outline" size="sm" onClick={exportarCsvFilaTrabalho}>
            <Download className="h-4 w-4 mr-1" /> CSV fila trabalho
          </Button>
          <Link
            href="/dashboard/exportacao"
            className="inline-flex h-8 items-center rounded-md border px-3 text-xs"
          >
            Excel completo
          </Link>
        </div>
      </header>

      {kpis.total_monitoramento > 0 && (
        <p className="text-xs text-muted-foreground -mt-2">
          {ROTULOS_TRIAGEM_UI.motorContextualMonitorados(kpis.total_monitoramento)}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className={kpis.fila_humana === 0 ? "border-emerald-500/40" : undefined}>
          <CardHeader className="pb-2">
            <CardDescription>{ROTULOS_TRIAGEM_UI.itensProcessados}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{kpis.total_processado}</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              {ROTULOS_TRIAGEM_UI.subtituloBaseSaneada}
            </p>
          </CardHeader>
        </Card>
        <Card className="border-emerald-500/30">
          <CardHeader className="pb-2">
            <CardDescription>Resolução automática</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{kpis.total_resolvido}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-500/30">
          <CardHeader className="pb-2">
            <CardDescription>{ROTULOS_TRIAGEM_UI.itensMonitoradosAutomaticamente}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{kpis.total_monitoramento}</CardTitle>
          </CardHeader>
        </Card>
        <Card
          className={
            kpis.fila_humana === 0 ? "border-emerald-500/40 bg-emerald-500/5" : "border-violet-500/30"
          }
        >
          <CardHeader className="pb-2">
            <CardDescription>{ROTULOS_TRIAGEM_UI.filaHumanaEstrutural}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{kpis.fila_humana}</CardTitle>
            {kpis.fila_humana === 0 && (
              <Badge className="mt-2 bg-emerald-600 hover:bg-emerald-600 text-white border-0 text-[10px]">
                {ROTULOS_TRIAGEM_UI.triagemEstabilizada}
              </Badge>
            )}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Padrões aprendidos</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{stats.aprendizadoStore}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fracionados (base)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {base.descontosFracionadosConciliados.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ganho triagem</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{kpis.ganho_triagem_pct}%</CardTitle>
          </CardHeader>
        </Card>
        {visualizacaoConsolidada && (
          <Card className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardDescription>Redução cognitiva</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {consolidacaoContextual.metricas.reducao_cognitiva_pct}%
              </CardTitle>
            </CardHeader>
          </Card>
        )}
        <Card className="border-red-500/30">
          <CardHeader className="pb-2">
            <CardDescription>Prioridade estrutural alta</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{priorizacao.metricas.criticas}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Linhas consolidadas (auditoria)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {rastreabilidade.metricas.triagem_linhas_consolidadas}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contextos resolvidos</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {rastreabilidade.metricas.triagem_contextos_resolvidos}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Redução de ruído</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {rastreabilidade.metricas.triagem_reducao_ruido_percentual}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-emerald-500/30">
          <CardHeader className="pb-2">
            <CardDescription>Estruturais oficiais</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {priorizacao.metricas.estruturais_oficiais}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-500/30">
          <CardHeader className="pb-2">
            <CardDescription>Históricos monitorados</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {priorizacao.metricas.historicos_monitorados}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <PriorizacaoRiscoTriagemPainel
        priorizacao={priorizacao}
        filtroPrioridade={filtroPrioridade}
        onFiltroPrioridade={setFiltroPrioridade}
        onAbrirItem={(id) => setItemAtivoId(id)}
        monitoramentoHistorico={saneamentoNatureza.monitoramento_historico}
        metricasSnapshot={kpis}
      />

      {filaTrabalho && (
        <FilaTrabalhoPerfilPainel
          filaTrabalho={filaTrabalho}
          perfilAtivo={perfilTrabalhoAtivo}
          onPerfilAtivo={setPerfilTrabalhoAtivo}
          onAbrirEntidade={(item) => setItemAtivoId(item.entidade_id)}
        />
      )}

      <MatchContratoDebugTriagem matches={base.consigfacilConciliacao.matches} />

      <SaneamentoEstruturalPainel
        linhas={base.saneamentoEstrutural?.linhas ?? []}
        resumo={ultimoSaneamentoResumo ?? base.saneamentoEstrutural?.resumo ?? null}
      />

      {visualizacaoConsolidada && (
        <ContextosResolutivosPainel
          contextos={rastreabilidade.contextos}
          metricas={consolidacaoContextual.metricas}
          itensPorId={itensPorIdMap}
          linhasReveladas={linhasReveladasContexto}
          onVerLinha={(id) => setItemAtivoId(id)}
          onExportarContexto={(ctx) => {
            const csv = exportarContextoResolutivoCsv(
              ctx,
              itensPorIdMap,
              rastreabilidade.auditorias,
            );
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `contexto_${ctx.contexto_id}_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Contexto exportado (CSV + auditoria).");
          }}
          onRevelarLinhasContexto={(ctx) => {
            setLinhasReveladasContexto((prev) => {
              const next = new Set(prev);
              for (const lid of ctx.linhas_relacionadas) next.add(lid);
              return next;
            });
            void executarPipeline("recalcular_derivados");
            toast.info(
              `${ctx.quantidade_ocorrencias} linha(s) liberadas na fila humana estrutural para revisão.`,
            );
          }}
          onManterConsolidado={(ctx) => {
            setLinhasReveladasContexto((prev) => {
              const next = new Set(prev);
              for (const lid of ctx.linhas_relacionadas) next.delete(lid);
              return next;
            });
            void executarPipeline("recalcular_derivados");
          }}
        />
      )}

      <PadroesDetectadosTriagem
        grupos={agrupamento.grupos}
        metricas={agrupamento.metricas}
        grupoRevisaoId={grupoRevisaoId}
        onResolverGrupo={handleResolverGrupo}
        onRevisarGrupo={handleRevisarGrupo}
        onAutoClusters={autoResolverClusters}
        autoElegiveis={agrupamento.metricas.grupos_auto_elegiveis}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Button
              key={f.id}
              type="button"
              size="sm"
              variant={filtro === f.id ? "default" : "outline"}
              onClick={() => setFiltro(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      {padroesPct.size > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Padrões de % (lote)</CardTitle>
            <CardDescription>Padrão percentual na fila estrutural — resolução em sequência</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[...padroesPct.entries()].map(([pct, lista]) => (
              <Button
                key={pct}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const { resolvidas } = resolverPendenciasDivergenciaEmLote({
                    pendencias: lista,
                    percentualAlvo: pct,
                    padrao: sugerirPadraoParaPercentual(pct),
                  });
                  void executarPipeline("recalcular_derivados");
                  toast.success(`${resolvidas} resolvida(s) (~${pct}%).`);
                }}
              >
                {lista.length}× {pct.toFixed(1)}%
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {ROTULOS_TRIAGEM_UI.filaHumanaListaTitulo} ({itensVisiveis.length})
            {visualizacaoConsolidada && consolidacaoContextual.metricas.linhas_consolidadas > 0 && (
              <span className="text-muted-foreground font-normal text-sm ml-2">
                {consolidacaoContextual.metricas.linhas_consolidadas} em contextos consolidados
              </span>
            )}
          </CardTitle>
          <CardDescription>{ROTULOS_TRIAGEM_UI.filaHumanaListaDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {itensVisiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {ROTULOS_TRIAGEM_UI.nenhumaAcaoFiltro}
            </p>
          ) : (
            itensVisiveis.map((item) => (
              <div key={item.pendencia.id} className="space-y-2">
                <ItemTriagemCardPriorizado
                  item={item}
                  onResolver={() => setItemAtivoId(item.pendencia.id)}
                />
                {(item.motor.resolvido || item.resolucao_usuario?.resultado.remover_pendencia) && (
                  <RespostaDivergenciaCard item={item} compacto />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <PainelResolucaoDivergenciaLateral
        item={itemAtivo}
        aberto={itemAtivoId != null}
        onFechar={() => {
          setItemAtivoId(null);
          setGrupoRevisaoId(null);
        }}
        onConcluido={() => {
          setItemAtivoId(null);
          setGrupoRevisaoId(null);
          void executarPipeline("recalcular_derivados");
        }}
      />
    </div>
  );
}
