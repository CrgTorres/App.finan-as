import type {
  BaseMargemConsignavel,
  ConsigfacilContrato,
  ConsigfacilMargem,
  ConsigfacilRefinanciamento,
  ConsigfacilResumoMensalMargem,
  ConsigfacilSnapshot,
} from "@/types/consigfacil";
import { calcularConfiancaConsigfacil } from "@/lib/consignacoes-governo/score-confianca-consigfacil";
import {
  aplicarRefinanciamentosNosContratos,
  detectarRefinanciamentosConsigfacil,
} from "@/lib/consignacoes-governo/detectar-refinanciamento-consigfacil";
import {
  filtrarRefinanciamentosComContratosUnicos,
  type ContratoUnicoConfirmado,
  type RefinanciamentoDescartado,
} from "@/lib/consignacoes-governo/auditoria-contratos-unicos";
import {
  CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
  type ConfigAuditoriaConsigfacil,
} from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import { parseConsigfacilTexto } from "@/lib/consignacoes-governo/parser-consigfacil-print";
import { salvarSnapshotsLocaisDireto } from "@/lib/consignacoes-governo/consigfacil-service";
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import {
  detectarEventosOperacionais,
  extrairDescontosRecuperadosDeSnapshots,
  type EventoOperacionalConsignado,
} from "@/lib/consigfacil/detectar-eventos-operacionais";

/**
 * Recebe N snapshots (várias capturas do portal, em datas diferentes) e produz
 * a base canônica ConsigFácil:
 *  - contratos deduplicados por `id_consignacao` (mantém a captura mais recente)
 *  - margens deduplicadas por (`tipo_margem`, `competencia`) — mais recente vence
 *  - cartões deduplicados por `id_consignacao`
 *  - histórico mesclado (sem duplicar mesmo evento+competência+id)
 *  - refinanciamentos detectados sobre o conjunto consolidado
 */
export type BaseConsignacoesGoverno = {
  contratos: ConsigfacilContrato[];
  /** Apenas contratos que NÃO são cartão benefício — para "contratos consignados comuns". */
  contratosConsignadosComuns: ConsigfacilContrato[];
  /** Apenas contratos de cartão benefício — agregação separada. */
  cartoesBeneficio: ConsigfacilContrato[];
  margens: ConsigfacilMargem[];
  margensSerieTemporal: BaseMargemConsignavel[];
  /** Resumo mensal com as 6 colunas oficiais nomeadas (consignavel/cartão/cartão benefício). */
  resumoMargemMensal: ConsigfacilResumoMensalMargem[];
  refinanciamentos: ConsigfacilRefinanciamento[];
  /** Pares descartados por regra de contrato único (falso refinanciamento). */
  refinanciamentosDescartados: RefinanciamentoDescartado[];
  contratosUnicosConfirmados: ContratoUnicoConfirmado[];
  cartoes: ConsigfacilSnapshot["cartoes"];
  historico: ConsigfacilSnapshot["historico"];
  /** Suspensão, bloqueio, inadimplência, descontos recuperados/não processados. */
  eventosOperacionais: EventoOperacionalConsignado[];
  avisos: string[];
};

function montarResumoMargemMensal(
  margens: ConsigfacilMargem[],
): ConsigfacilResumoMensalMargem[] {
  const map = new Map<string, ConsigfacilResumoMensalMargem>();
  for (const m of margens) {
    let row = map.get(m.competencia);
    if (!row) {
      row = {
        competencia: m.competencia,
        margem_consignavel_total: 0,
        margem_consignavel_disponivel: 0,
        margem_consignavel_utilizada: 0,
        margem_consignavel_percentual: 0,
        margem_cartao_total: 0,
        margem_cartao_disponivel: 0,
        margem_cartao_utilizada: 0,
        margem_cartao_percentual: 0,
        margem_cartao_beneficio_total: 0,
        margem_cartao_beneficio_disponivel: 0,
        margem_cartao_beneficio_utilizada: 0,
        margem_cartao_beneficio_percentual: 0,
      };
      map.set(m.competencia, row);
    }
    if (m.tipo_margem === "margem_consignavel") {
      row.margem_consignavel_total = m.margem_total;
      row.margem_consignavel_disponivel = m.margem_disponivel;
      row.margem_consignavel_utilizada = m.margem_utilizada;
      row.margem_consignavel_percentual = m.percentual_comprometido;
    } else if (m.tipo_margem === "margem_cartao") {
      row.margem_cartao_total = m.margem_total;
      row.margem_cartao_disponivel = m.margem_disponivel;
      row.margem_cartao_utilizada = m.margem_utilizada;
      row.margem_cartao_percentual = m.percentual_comprometido;
    } else if (m.tipo_margem === "margem_cartao_beneficio") {
      row.margem_cartao_beneficio_total = m.margem_total;
      row.margem_cartao_beneficio_disponivel = m.margem_disponivel;
      row.margem_cartao_beneficio_utilizada = m.margem_utilizada;
      row.margem_cartao_beneficio_percentual = m.percentual_comprometido;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.competencia.localeCompare(b.competencia));
}

function ordenarPorCapturaDesc(a: ConsigfacilSnapshot, b: ConsigfacilSnapshot): number {
  return b.capturado_em.localeCompare(a.capturado_em);
}

export function consolidarSnapshotsConsigfacil(
  snapshots: ConsigfacilSnapshot[],
  configAuditoria: ConfigAuditoriaConsigfacil = CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
): BaseConsignacoesGoverno {
  const avisos: string[] = [];
  const snapshotsOrdenados = snapshots.slice().sort(ordenarPorCapturaDesc);

  // Mantém último snapshot por id_consignacao (mais recente vence)
  const contratosMap = new Map<string, ConsigfacilContrato>();
  const cartoesMap = new Map<string, ConsigfacilSnapshot["cartoes"][number]>();
  const margensMap = new Map<string, ConsigfacilMargem>();
  const historicoMap = new Map<string, ConsigfacilSnapshot["historico"][number]>();

  for (const snap of snapshotsOrdenados) {
    for (const c of snap.contratos) {
      if (!contratosMap.has(c.id_consignacao)) {
        contratosMap.set(c.id_consignacao, c);
      }
    }
    for (const k of snap.cartoes) {
      if (!cartoesMap.has(k.id_consignacao)) cartoesMap.set(k.id_consignacao, k);
    }
    for (const m of snap.margens) {
      const key = `${m.tipo_margem}__${m.competencia}`;
      if (!margensMap.has(key)) margensMap.set(key, m);
    }
    for (const h of snap.historico) {
      const key = `${h.id_consignacao}__${h.evento}__${h.competencia}`;
      if (!historicoMap.has(key)) historicoMap.set(key, h);
    }
    if (snap.avisos.length) avisos.push(...snap.avisos.map((a) => `[${snap.capturado_em}] ${a}`));
  }

  let contratos = Array.from(contratosMap.values()).map((c) => ({
    ...c,
    confianca: calcularConfiancaConsigfacil(c),
  }));

  const historico = Array.from(historicoMap.values());
  const descontosRecuperados = extrairDescontosRecuperadosDeSnapshots(snapshotsOrdenados);
  const eventosOperacionais = detectarEventosOperacionais({
    contratos,
    historico,
    descontosRecuperados,
    textosBrutosConsigfacil: snapshotsOrdenados.map((s) => s.bruto).filter(Boolean),
  });

  const refsBrutos = detectarRefinanciamentosConsigfacil(contratos, configAuditoria, eventosOperacionais);
  const filtroRef = filtrarRefinanciamentosComContratosUnicos({
    contratos,
    refinanciamentos: refsBrutos,
  });
  const refs = filtroRef.refinanciamentosConfirmados;
  contratos = aplicarRefinanciamentosNosContratos(contratos, refs);

  const margens = Array.from(margensMap.values());
  const margensSerieTemporal: BaseMargemConsignavel[] = margens
    .map((m) => ({
      competencia: m.competencia,
      tipo_margem: m.tipo_margem,
      margem_total: m.margem_total,
      margem_utilizada: m.margem_utilizada,
      margem_disponivel: m.margem_disponivel,
      percentual_comprometido: m.percentual_comprometido,
    }))
    .sort((a, b) =>
      a.competencia === b.competencia
        ? (a.tipo_margem ?? "").localeCompare(b.tipo_margem ?? "")
        : a.competencia.localeCompare(b.competencia),
    );

  const contratosConsignadosComuns = contratos.filter((c) => !c.eh_cartao_beneficio);
  const cartoesBeneficio = contratos.filter((c) => c.eh_cartao_beneficio);

  return {
    contratos,
    contratosConsignadosComuns,
    cartoesBeneficio,
    margens,
    margensSerieTemporal,
    resumoMargemMensal: montarResumoMargemMensal(margens),
    refinanciamentos: refs,
    refinanciamentosDescartados: filtroRef.refinanciamentosDescartados,
    contratosUnicosConfirmados: filtroRef.contratosUnicosConfirmados,
    cartoes: Array.from(cartoesMap.values()),
    historico,
    eventosOperacionais,
    avisos,
  };
}

/**
 * Reidrata um snapshot que veio "vazio" do Supabase (apenas `bruto` + metadados)
 * rodando o parser sobre o texto bruto. Útil para reprocessar conteúdo antigo
 * sem reimportar do portal.
 */
const REPARSER_CONCILIACAO_VERSION = "2026-05-22-passivo-estrutural";

/**
 * Limpa caches locais derivados da conciliação (auditoria integrada em session).
 * Snapshots ConsigFácil são regravados via `persistirLocal` em `reprocessarSnapshotsConsigfacil`.
 */
export function limparCacheConciliacaoLocal(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("financa:ultima-auditoria-integracao:v1");
    sessionStorage.removeItem("financa:consigfacil_reparser_version");
  } catch {
    /* noop */
  }
}

/**
 * Reparseia snapshots a partir do `bruto`, persiste no localStorage e emite
 * `DASHBOARD_DATA_UPDATED` uma vez por versão de parser (evita loop no load).
 */
export function reprocessarSnapshotsConsigfacil(
  snapshots: ConsigfacilSnapshot[],
  opts?: { persistirLocal?: boolean; emitirDashboard?: boolean },
): ConsigfacilSnapshot[] {
  limparCacheConciliacaoLocal();
  const reparsed = reparseSnapshotsBrutos(snapshots);
  if (opts?.persistirLocal !== false && typeof window !== "undefined") {
    salvarSnapshotsLocaisDireto(reparsed);
  }
  if (opts?.emitirDashboard !== false && typeof window !== "undefined") {
    try {
      const key = "financa:consigfacil_reparser_version";
      if (sessionStorage.getItem(key) !== REPARSER_CONCILIACAO_VERSION) {
        sessionStorage.setItem(key, REPARSER_CONCILIACAO_VERSION);
        emitDashboardDataUpdated({ origin: "consigfacil_reparse" });
      }
    } catch {
      emitDashboardDataUpdated({ origin: "consigfacil_reparse" });
    }
  }
  return reparsed;
}

export function reparseSnapshotsBrutos(snapshots: ConsigfacilSnapshot[]): ConsigfacilSnapshot[] {
  return snapshots.map((s) => {
    if (!s.bruto || s.bruto.length === 0) return s;
    if (s.contratos.length > 0 || s.margens.length > 0) return s;
    const reparsed = parseConsigfacilTexto({
      texto: s.bruto,
      documentoOrigem: s.documento_origem,
      origem: s.origem,
      capturadoEm: s.capturado_em,
    });
    return {
      ...s,
      contratos: reparsed.contratos,
      cartoes: reparsed.cartoes,
      margens: reparsed.margens.length > 0 ? reparsed.margens : s.margens,
      historico: reparsed.historico.length > 0 ? reparsed.historico : s.historico,
      avisos: [...new Set([...s.avisos, ...reparsed.avisos])],
    };
  });
}

export const baseConsignacoesGovernoVazia: BaseConsignacoesGoverno = {
  contratos: [],
  contratosConsignadosComuns: [],
  cartoesBeneficio: [],
  margens: [],
  margensSerieTemporal: [],
  resumoMargemMensal: [],
  refinanciamentos: [],
  refinanciamentosDescartados: [],
  contratosUnicosConfirmados: [],
  cartoes: [],
  historico: [],
  eventosOperacionais: [],
  avisos: [],
};

/** Dicionário de colunas (Power BI / Dicionario_Colunas). */
export function dicionarioColunasConsigfacil(): Array<{ coluna: string; descricao: string }> {
  return [
    { coluna: "id_consignacao", descricao: "Código da consignação no portal ConsigFácil." },
    { coluna: "instituicao", descricao: "Banco/financeira responsável pela consignação." },
    { coluna: "valor_parcela", descricao: "Valor mensal cobrado (R$)." },
    { coluna: "parcela_atual", descricao: "Parcela corrente / número original." },
    { coluna: "parcelas_total", descricao: "Total de parcelas previstas no contrato oficial." },
    { coluna: "tipo_margem", descricao: "Margem usada (consignável, cartão, cartão benefício)." },
    {
      coluna: "status",
      descricao: "Status oficial ConsigFácil (ativo, suspenso, importado, etc.).",
    },
    { coluna: "eh_refinanciamento", descricao: "true quando detectamos refinanciamento/portabilidade." },
    { coluna: "contrato_substituido", descricao: "ID da consignação substituída pelo novo contrato." },
    { coluna: "confianca", descricao: "Score 0..1 calculado pelo extrator." },
    { coluna: "fonte_oficial", descricao: "Sempre true — origem oficial do portal." },
    { coluna: "eh_cartao_beneficio", descricao: "true para cartão benefício (não somar com empréstimo consignado comum)." },
    { coluna: "margem_total", descricao: "Limite total de margem no momento da captura." },
    { coluna: "margem_utilizada", descricao: "Margem já comprometida em consignações." },
    { coluna: "margem_disponivel", descricao: "Saldo de margem ainda disponível." },
    { coluna: "percentual_comprometido", descricao: "Margem utilizada / margem total (%)." },
    // 6 colunas oficiais (Resumo_Mensal estendido)
    { coluna: "margem_consignavel_total", descricao: "Margem consignável: limite total no portal." },
    { coluna: "margem_consignavel_disponivel", descricao: "Margem consignável: saldo disponível." },
    { coluna: "margem_cartao_total", descricao: "Margem cartão: limite total no portal." },
    { coluna: "margem_cartao_disponivel", descricao: "Margem cartão: saldo disponível." },
    { coluna: "margem_cartao_beneficio_total", descricao: "Margem cartão benefício: limite total." },
    { coluna: "margem_cartao_beneficio_disponivel", descricao: "Margem cartão benefício: saldo disponível." },
    // Confirmação não-destrutiva
    { coluna: "confirmado_consigfacil", descricao: "true quando ConsigFácil confirmou o registro (sem divergência)." },
    { coluna: "divergencia_consigfacil", descricao: "true quando ConsigFácil contradiz o valor original." },
    { coluna: "valor_original", descricao: "Valor antes da confirmação (OCR/contracheque/contrato)." },
    { coluna: "valor_oficial", descricao: "Valor oficial vindo do ConsigFácil." },
    { coluna: "fonte_original", descricao: "Fonte do valor antes do ConsigFácil." },
    { coluna: "fonte_oficial", descricao: "Sempre consigfacil_oficial em linhas de ajuste." },
    { coluna: "motivo_ajuste", descricao: "Texto humano explicando confirmação ou divergência." },
    {
      coluna: "motivo_quebra_desconto",
      descricao:
        "Por que o desconto não ocorreu (suspensao_operacional, bloqueio_governo, inadimplencia, etc.).",
    },
    {
      coluna: "justificativa_operacional_oficial",
      descricao: "true quando evento operacional oficial explica a quebra (não é refin).",
    },
  ];
}
