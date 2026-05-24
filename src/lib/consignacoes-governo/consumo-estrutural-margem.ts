/**
 * Consumo estrutural de margem — camadas independentes (NUNCA somar consignável + cartão + benefício).
 *
 * Prioridade: ConsigFácil vigente > folha real > timeline > catálogo > valor.
 */

import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import {
  identificarPassivoConsignavelEstrutural,
  type TipoPassivo,
} from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";
import { linhaEhRubricaConsignavel } from "@/lib/conciliacao/regras-natureza-consignavel";
import type { ConsigfacilContrato, ConsigfacilGrupoCanonico, ConsigfacilTipoMargem } from "@/types/consigfacil";
import type { MargemHistoricaCompetencia } from "@/lib/consignacoes-governo/calcular-margem-historica-avancada";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type TipoMargemEstrutural =
  | "consignavel"
  | "cartao"
  | "cartao_beneficio"
  | "reserva"
  | "fora_margem"
  | "indefinido";

export type StatusConsumoMargem =
  | "normal"
  | "pressao"
  | "saturado"
  | "reserva_ativa"
  | "suspenso"
  | "fracionado"
  | "sem_margem";

export type FonteConsumoMargem = "folha" | "consigfacil" | "hibrido";

function fonteConsumoDeMargem(
  f?: MargemHistoricaCompetencia["fonte"],
): FonteConsumoMargem {
  if (f === "portal") return "consigfacil";
  if (f === "hibrido") return "hibrido";
  if (f === "folha") return "folha";
  return "folha";
}

export interface ConsumoEstruturalMargem {
  competencia: string;
  contrato_id?: string | null;
  banco?: string | null;
  rubrica?: string | null;
  modalidade?: string | null;
  tipo_margem: TipoMargemEstrutural;
  valor_consumido: number;
  margem_total: number;
  margem_disponivel: number;
  percentual_consumo: number;
  fonte: FonteConsumoMargem;
  status: StatusConsumoMargem;
  evidencia: string[];
}

export interface ResumoConsumoEstruturalMargem {
  competencia: string;
  consignavel_total: number;
  consignavel_usado: number;
  consignavel_disponivel: number;
  consignavel_percentual: number;
  cartao_total: number;
  cartao_usado: number;
  cartao_disponivel: number;
  cartao_percentual: number;
  beneficio_total: number;
  beneficio_usado: number;
  beneficio_disponivel: number;
  beneficio_percentual: number;
  reservas_ativas: number;
  contratos_suspensos: number;
  contratos_fracionados: number;
  nivel_pressao_geral: "baixo" | "moderado" | "alto" | "critico";
}

export type PacoteConsumoEstruturalMargem = {
  linhas: ConsumoEstruturalMargem[];
  resumo: ResumoConsumoEstruturalMargem[];
  insights: string[];
};

export type LinhaFolhaConsumoMargem = {
  id?: string | null;
  competencia: string;
  valor: number;
  descricao?: string | null;
  banco?: string | null;
  rubrica?: string | null;
  modalidade?: string | null;
  grupo_canonico?: string | null;
  tipo_passivo?: TipoPassivo | string | null;
  contrato_id?: string | null;
  origem?: string | null;
};

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

const RE_FORA_MARGEM =
  /\b(SOLDO|ETAPAS|GRATIF|GRATIFICACAO|IR\b|IRRF|IMPOSTO\s*DE\s*RENDA|AMAZON\s*PREV|AMAZONPREV|FPPM|PENSAO|PENSAO\s*ALIMENT|ENERGIA|ELET|AGUA|MANUTENCAO\s*JUDICIAL)\b/;

const RE_CARTAO_BENEFICIO =
  /\b(CARTAO\s*BENEF|CARTÃO\s*BENEF|BENEFICIO\s*COMPRA|CREDCESTA\s*COMPRA|CREDCESTA\s*SAQUE|CRED\s*CESTA|CB\s*COMPRA)\b/;

const RE_CARTAO =
  /\b(RMC|RCC|CARTAO\s*CONSIGN|CARTÃO\s*CONSIGN|CARTAO\s*CRED|CARTÃO\s*CRED|MARGEM\s*CART)\b/;

const RE_CONSIGNAVEL =
  /\b(EMP\b|EMPREST|EMPRÉST|CONSIGNAD|BANCOOB|BB[\s-]*EMP|DAYCOVAL|PANAMERICANO|BMG\b|CAIXA\s*ECON|SAFRA|OLE)\b/;

const RE_RESERVA = /\bRESERVA\b/;

export function classificarTipoMargemEstrutural(input: {
  descricao?: string | null;
  modalidade?: string | null;
  grupo_canonico?: string | null;
  tipo_passivo?: string | null;
  tipo_margem_consigfacil?: ConsigfacilTipoMargem | null;
}): TipoMargemEstrutural {
  if (input.tipo_margem_consigfacil === "margem_cartao_beneficio") return "cartao_beneficio";
  if (input.tipo_margem_consigfacil === "margem_cartao") return "cartao";
  if (input.tipo_margem_consigfacil === "margem_consignavel") return "consignavel";

  const g = (input.grupo_canonico ?? "").toLowerCase();
  if (g === "cartao_beneficio") return "cartao_beneficio";
  if (g === "cartao_credito") return "cartao";
  if (g === "emprestimo_consignado") return "consignavel";

  const tp = (input.tipo_passivo ?? "").toLowerCase();
  if (tp === "cartao_consignado") return "cartao";
  if (tp === "consignado_real") return "consignavel";

  const texto = normalizarTexto(
    [input.descricao, input.modalidade, input.grupo_canonico].filter(Boolean).join(" "),
  );

  if (!texto.trim()) return "indefinido";
  if (RE_FORA_MARGEM.test(texto)) return "fora_margem";
  if (RE_RESERVA.test(texto)) return "reserva";
  if (RE_CARTAO_BENEFICIO.test(texto)) return "cartao_beneficio";
  if (RE_CARTAO.test(texto) || /\bCARTAO\b|\bCARTÃO\b/.test(texto)) return "cartao";
  if (RE_CONSIGNAVEL.test(texto)) return "consignavel";

  return "indefinido";
}

function tipoMargemDeContrato(c: ConsigfacilContrato): TipoMargemEstrutural {
  if (c.eh_cartao_beneficio || c.tipo_margem === "margem_cartao_beneficio") return "cartao_beneficio";
  if (c.eh_rmc || c.eh_rcc || c.eh_cartao || c.tipo_margem === "margem_cartao") return "cartao";
  if (c.tipo_margem === "margem_consignavel" || c.grupo_canonico === "emprestimo_consignado") {
    return "consignavel";
  }
  return classificarTipoMargemEstrutural({
    descricao: c.instituicao,
    modalidade: c.modalidade_slug,
    grupo_canonico: c.grupo_canonico,
    tipo_margem_consigfacil: c.tipo_margem,
  });
}

type TotaisCamada = {
  total: number;
  utilizada: number;
  disponivel: number;
};

function totaisCamada(
  margem: MargemHistoricaCompetencia | undefined,
  tipo: TipoMargemEstrutural,
): TotaisCamada {
  if (!margem) return { total: 0, utilizada: 0, disponivel: 0 };
  switch (tipo) {
    case "cartao":
      return {
        total: margem.margem_cartao_total,
        utilizada: margem.margem_cartao_utilizada,
        disponivel: margem.margem_cartao_disponivel,
      };
    case "cartao_beneficio":
      return {
        total: margem.margem_beneficio_total,
        utilizada: margem.margem_beneficio_utilizada,
        disponivel: margem.margem_beneficio_disponivel,
      };
    case "consignavel":
      return {
        total: margem.margem_consignavel_total,
        utilizada: margem.margem_consignavel_utilizada,
        disponivel: margem.margem_consignavel_disponivel,
      };
    default:
      return { total: 0, utilizada: 0, disponivel: 0 };
  }
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctConsumo(valor: number, total: number): number {
  if (total <= 0) return valor > 0 ? 100 : 0;
  return Math.min(100, Math.round((valor / total) * 1000) / 10);
}

function statusPorPercentualCamada(pctCamada: number): StatusConsumoMargem {
  if (pctCamada >= 90) return "saturado";
  if (pctCamada >= 70) return "pressao";
  return "normal";
}

function nivelPressaoGeral(maxPct: number): ResumoConsumoEstruturalMargem["nivel_pressao_geral"] {
  if (maxPct >= 90) return "critico";
  if (maxPct >= 75) return "alto";
  if (maxPct >= 50) return "moderado";
  return "baixo";
}

function linhaFolhaDeBaseConciliada(l: BaseConciliadaLinha): LinhaFolhaConsumoMargem {
  return {
    id: l.id,
    competencia: l.competencia ?? "",
    valor: Math.abs(l.valor),
    descricao: l.descricao_original || l.descricao_normalizada,
    banco: l.banco_origem ?? l.instituicao_original_folha,
    rubrica: l.categoria_canonica,
    grupo_canonico: l.categoria_canonica,
    contrato_id: l.vinculo_contrato_id,
    origem: l.origem,
  };
}

export function linhasFolhaConsumoDeBaseConciliada(
  baseConciliada: BaseConciliadaLinha[],
  competencia: string,
): LinhaFolhaConsumoMargem[] {
  const comp = competencia.slice(0, 7);
  return baseConciliada
    .filter(
      (l) =>
        l.origem === "contracheque" &&
        l.competencia?.slice(0, 7) === comp &&
        (l.natureza === "desconto" || l.natureza === "emprestimo" || l.natureza === "cartao") &&
        linhaEhRubricaConsignavel(l),
    )
    .map(linhaFolhaDeBaseConciliada);
}

// ---------------------------------------------------------------------------
// Cálculo por competência
// ---------------------------------------------------------------------------

export function calcularConsumoEstruturalMargem(input: {
  competencia: string;
  linhasFolha: LinhaFolhaConsumoMargem[];
  contratosConsigfacil: ConsigfacilContrato[];
  margemHistoricaCompetencia?: MargemHistoricaCompetencia | null;
}): ConsumoEstruturalMargem[] {
  const comp = input.competencia.slice(0, 7);
  const margem = input.margemHistoricaCompetencia;
  const fonteBase: FonteConsumoMargem = fonteConsumoDeMargem(margem?.fonte);
  const out: ConsumoEstruturalMargem[] = [];
  const contratosComFolha = new Set<string>();

  for (const linha of input.linhasFolha) {
    if (linha.competencia.slice(0, 7) !== comp) continue;

    const passivo = identificarPassivoConsignavelEstrutural({
      descricao: linha.descricao,
      natureza: "desconto",
      tipo_linha: "desconto",
      categoria_canonica: linha.grupo_canonico,
      id_consignacao_consigfacil: linha.contrato_id,
    });

    const tipo = classificarTipoMargemEstrutural({
      descricao: linha.descricao,
      modalidade: linha.modalidade,
      grupo_canonico: linha.grupo_canonico as ConsigfacilGrupoCanonico | undefined,
      tipo_passivo: passivo.tipo_passivo,
    });

    if (tipo === "fora_margem") continue;

    const totais = totaisCamada(margem ?? undefined, tipo);
    const valor = arredondar(Math.abs(linha.valor));
    const pct = pctConsumo(valor, totais.total);

    if (linha.contrato_id) contratosComFolha.add(linha.contrato_id);

    const contratoCf = input.contratosConsigfacil.find(
      (c) => c.id_consignacao === linha.contrato_id,
    );

    let status: StatusConsumoMargem = statusPorPercentualCamada(pct);
    const evidencia: string[] = [`Desconto na folha: ${linha.descricao ?? "—"}`];

    if (contratoCf?.contexto_margem?.desconto_operacional_por_margem) {
      status = "fracionado";
      evidencia.push(contratoCf.contexto_margem.motivo ?? "Desconto operacional por margem.");
    }

    if (tipo === "reserva") {
      status = "reserva_ativa";
      evidencia.push("Classificado como reserva de margem.");
    }

    if (totais.total <= 0 && valor > 0) status = "sem_margem";

    out.push({
      competencia: comp,
      contrato_id: linha.contrato_id ?? null,
      banco: linha.banco ?? passivo.instituicao_detectada,
      rubrica: linha.rubrica ?? null,
      modalidade: linha.modalidade ?? contratoCf?.modalidade_slug ?? null,
      tipo_margem: tipo,
      valor_consumido: valor,
      margem_total: totais.total,
      margem_disponivel: totais.disponivel,
      percentual_consumo: pct,
      fonte: contratoCf ? (fonteBase === "folha" ? "hibrido" : fonteBase) : fonteBase,
      status,
      evidencia,
    });
  }

  for (const c of input.contratosConsigfacil) {
    const tipo = tipoMargemDeContrato(c);
    if (tipo === "fora_margem" || tipo === "indefinido") continue;

    const ativoNaComp =
      c.competencia?.slice(0, 7) === comp ||
      (c.timeline_parcelas ?? []).some((t) => t.competencia.slice(0, 7) === comp);

    if (!ativoNaComp && c.status !== "ativo" && c.status !== "suspenso" && c.status !== "em_averbacao") {
      continue;
    }

    const temFolha = contratosComFolha.has(c.id_consignacao);
    const totais = totaisCamada(margem ?? undefined, tipo);
    const valorOficial = arredondar(Math.abs(c.valor_parcela || 0));
    const valorConsumido = temFolha ? 0 : valorOficial;
    const pct = temFolha ? 0 : pctConsumo(valorConsumido, totais.total);

    const evidencia: string[] = [
      `ConsigFácil: ${c.instituicao} (${c.status})`,
      `Modalidade: ${c.modalidade_slug ?? c.grupo_canonico ?? "—"}`,
    ];

    let status: StatusConsumoMargem = temFolha
      ? statusPorPercentualCamada(
          out
            .filter((x) => x.contrato_id === c.id_consignacao)
            .reduce((s, x) => s + x.valor_consumido, 0) /
            Math.max(totais.total, 1) *
            100,
        )
      : "reserva_ativa";

    if (!temFolha && c.status === "suspenso") {
      status = "suspenso";
      evidencia.push("Contrato suspenso no portal sem desconto na folha.");
    } else if (!temFolha && valorOficial > 0) {
      status = "reserva_ativa";
      evidencia.push("Parcela oficial sem desconto correspondente na folha (reserva/lançamento futuro).");
    }

    if (c.contexto_margem?.desconto_operacional_por_margem) {
      status = "fracionado";
      evidencia.push(c.contexto_margem.motivo ?? "Fragmentação operacional por margem.");
    }

    if (temFolha) continue;

    out.push({
      competencia: comp,
      contrato_id: c.id_consignacao,
      banco: c.instituicao,
      rubrica: c.codigo_instituicao,
      modalidade: c.modalidade_slug,
      tipo_margem: tipo,
      valor_consumido: valorConsumido,
      margem_total: totais.total,
      margem_disponivel: totais.disponivel,
      percentual_consumo: pct,
      fonte: "consigfacil",
      status,
      evidencia,
    });
  }

  aplicarStatusPorCamada(out, margem ?? undefined);
  return out;
}

/** Atualiza status linha a linha conforme utilização agregada da camada (sem somar camadas). */
function aplicarStatusPorCamada(
  linhas: ConsumoEstruturalMargem[],
  margem?: MargemHistoricaCompetencia,
): void {
  const camadas: TipoMargemEstrutural[] = ["consignavel", "cartao", "cartao_beneficio"];
  for (const tipo of camadas) {
    const totais = totaisCamada(margem, tipo);
    const usadoCamada =
      margem != null
        ? totais.utilizada
        : arredondar(
            linhas
              .filter((l) => l.tipo_margem === tipo)
              .reduce((s, l) => s + l.valor_consumido, 0),
          );
    const pctCamada = pctConsumo(usadoCamada, totais.total);
    const stCamada = statusPorPercentualCamada(pctCamada);

    for (const l of linhas) {
      if (l.tipo_margem !== tipo) continue;
      if (l.status === "fracionado" || l.status === "suspenso" || l.status === "reserva_ativa") {
        continue;
      }
      if (stCamada === "saturado" || stCamada === "pressao") {
        l.status = stCamada;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Consolidação e insights
// ---------------------------------------------------------------------------

export function consolidarConsumoEstruturalMargem(
  consumos: ConsumoEstruturalMargem[],
): ResumoConsumoEstruturalMargem[] {
  const porComp = new Map<string, ConsumoEstruturalMargem[]>();
  for (const c of consumos) {
    const arr = porComp.get(c.competencia) ?? [];
    arr.push(c);
    porComp.set(c.competencia, arr);
  }

  const resumos: ResumoConsumoEstruturalMargem[] = [];

  for (const [comp, linhas] of porComp) {
    const somaCamada = (tipo: TipoMargemEstrutural) => {
      const camada = linhas.filter((l) => l.tipo_margem === tipo);
      const usado = arredondar(camada.reduce((s, l) => s + l.valor_consumido, 0));
      const total = camada[0]?.margem_total ?? 0;
      const disponivel = camada[0]?.margem_disponivel ?? Math.max(0, total - usado);
      const pct = pctConsumo(usado, total);
      return { usado, total, disponivel, pct };
    };

    const cons = somaCamada("consignavel");
    const cart = somaCamada("cartao");
    const benef = somaCamada("cartao_beneficio");

    const maxPct = Math.max(cons.pct, cart.pct, benef.pct);

    resumos.push({
      competencia: comp,
      consignavel_total: cons.total,
      consignavel_usado: cons.usado,
      consignavel_disponivel: cons.disponivel,
      consignavel_percentual: cons.pct,
      cartao_total: cart.total,
      cartao_usado: cart.usado,
      cartao_disponivel: cart.disponivel,
      cartao_percentual: cart.pct,
      beneficio_total: benef.total,
      beneficio_usado: benef.usado,
      beneficio_disponivel: benef.disponivel,
      beneficio_percentual: benef.pct,
      reservas_ativas: linhas.filter((l) => l.status === "reserva_ativa").length,
      contratos_suspensos: linhas.filter((l) => l.status === "suspenso").length,
      contratos_fracionados: linhas.filter((l) => l.status === "fracionado").length,
      nivel_pressao_geral: nivelPressaoGeral(maxPct),
    });
  }

  return resumos.sort((a, b) => a.competencia.localeCompare(b.competencia));
}

export function gerarInsightsConsumoEstruturalMargem(
  resumos: ResumoConsumoEstruturalMargem[],
): string[] {
  const insights: string[] = [];
  if (resumos.length === 0) return insights;

  const ult = resumos[resumos.length - 1];

  if (ult.beneficio_percentual >= 85) {
    insights.push("A margem cartão benefício está próxima da saturação.");
  }
  if (ult.cartao_percentual >= 85) {
    insights.push("A margem cartão (RMC/RCC) está próxima da saturação.");
  }
  if (ult.consignavel_percentual >= 75) {
    insights.push("A margem consignável apresenta pressão operacional persistente.");
  }

  const mesesPressaoConsignavel = resumos.filter((r) => r.consignavel_percentual >= 70).length;
  if (mesesPressaoConsignavel >= 6) {
    insights.push(
      `Margem consignável com pressão em ${mesesPressaoConsignavel} competência(s) — camada independente do cartão.`,
    );
  }

  const reservas = resumos.reduce((s, r) => s + r.reservas_ativas, 0);
  if (reservas > 0) {
    insights.push("Há reserva ativa consumindo limite sem desconto direto na folha.");
  }

  const fracionados = resumos.reduce((s, r) => s + r.contratos_fracionados, 0);
  if (fracionados > 0) {
    insights.push("Foram detectados contratos fracionados por insuficiência de margem.");
  }

  const criticos = resumos.filter((r) => r.nivel_pressao_geral === "critico");
  if (criticos.length > 0) {
    insights.push(
      `${criticos.length} mês(es) com nível crítico em alguma camada (maior percentual entre consignável, cartão e benefício — não somados).`,
    );
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Pacote completo (base financeira)
// ---------------------------------------------------------------------------

export function montarPacoteConsumoEstruturalMargem(input: {
  baseConciliada: BaseConciliadaLinha[];
  contratos: ConsigfacilContrato[];
  competenciasMargem: MargemHistoricaCompetencia[];
  chunkSize?: number;
}): PacoteConsumoEstruturalMargem {
  const chunk = input.chunkSize ?? 12;
  const margemPorComp = new Map(input.competenciasMargem.map((m) => [m.competencia, m]));

  const comps = new Set<string>(margemPorComp.keys());
  for (const l of input.baseConciliada) {
    if (l.competencia) comps.add(l.competencia.slice(0, 7));
  }
  for (const c of input.contratos) {
    if (c.competencia) comps.add(c.competencia.slice(0, 7));
  }

  const competenciasOrdem = [...comps].sort((a, b) => a.localeCompare(b));
  const linhas: ConsumoEstruturalMargem[] = [];

  for (let i = 0; i < competenciasOrdem.length; i += chunk) {
    const bloco = competenciasOrdem.slice(i, i + chunk);
    for (const comp of bloco) {
      linhas.push(
        ...calcularConsumoEstruturalMargem({
          competencia: comp,
          linhasFolha: linhasFolhaConsumoDeBaseConciliada(input.baseConciliada, comp),
          contratosConsigfacil: input.contratos,
          margemHistoricaCompetencia: margemPorComp.get(comp) ?? null,
        }),
      );
    }
  }

  const resumoBruto = consolidarConsumoEstruturalMargem(linhas);
  const resumo = resumoBruto.map((r) => {
    const m = margemPorComp.get(r.competencia);
    if (!m) return r;
    return {
      ...r,
      consignavel_total: m.margem_consignavel_total,
      consignavel_usado: m.margem_consignavel_utilizada,
      consignavel_disponivel: m.margem_consignavel_disponivel,
      consignavel_percentual: pctConsumo(m.margem_consignavel_utilizada, m.margem_consignavel_total),
      cartao_total: m.margem_cartao_total,
      cartao_usado: m.margem_cartao_utilizada,
      cartao_disponivel: m.margem_cartao_disponivel,
      cartao_percentual: pctConsumo(m.margem_cartao_utilizada, m.margem_cartao_total),
      beneficio_total: m.margem_beneficio_total,
      beneficio_usado: m.margem_beneficio_utilizada,
      beneficio_disponivel: m.margem_beneficio_disponivel,
      beneficio_percentual: pctConsumo(m.margem_beneficio_utilizada, m.margem_beneficio_total),
      nivel_pressao_geral: nivelPressaoGeral(
        Math.max(
          pctConsumo(m.margem_consignavel_utilizada, m.margem_consignavel_total),
          pctConsumo(m.margem_cartao_utilizada, m.margem_cartao_total),
          pctConsumo(m.margem_beneficio_utilizada, m.margem_beneficio_total),
        ),
      ),
    };
  });
  const insights = gerarInsightsConsumoEstruturalMargem(resumo);

  return { linhas, resumo, insights };
}

export function pacoteConsumoEstruturalMargemVazio(): PacoteConsumoEstruturalMargem {
  return { linhas: [], resumo: [], insights: [] };
}

export function linhasExportacaoPowerBiConsumoEstrutural(pacote: PacoteConsumoEstruturalMargem): {
  MARGEM_CONSUMO_ESTRUTURAL: Array<Record<string, unknown>>;
  MARGEM_CONSUMO_RESUMO: Array<Record<string, unknown>>;
  MARGEM_CONSUMO_INSIGHTS: Array<Record<string, unknown>>;
} {
  return {
    MARGEM_CONSUMO_ESTRUTURAL: pacote.linhas.map((l) => ({
      competencia: l.competencia,
      contrato_id: l.contrato_id ?? "",
      banco: l.banco ?? "",
      rubrica: l.rubrica ?? "",
      modalidade: l.modalidade ?? "",
      tipo_margem: l.tipo_margem,
      valor_consumido: l.valor_consumido,
      margem_total: l.margem_total,
      margem_disponivel: l.margem_disponivel,
      percentual_consumo: l.percentual_consumo,
      status: l.status,
      fonte: l.fonte,
      evidencia: l.evidencia.join(" | "),
    })),
    MARGEM_CONSUMO_RESUMO: pacote.resumo.map((r) => ({ ...r })),
    MARGEM_CONSUMO_INSIGHTS: pacote.insights.map((mensagem, i) => ({
      id: i + 1,
      mensagem,
    })),
  };
}
