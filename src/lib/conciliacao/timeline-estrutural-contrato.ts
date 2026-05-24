/**
 * Timeline estrutural do contrato — continuidade de parcelas na folha ao longo do tempo.
 * Prioridade: timeline > valor isolado > snapshot ConsigFácil incompleto.
 */

import type { Payslip } from "@/types/contracheque";
import type { Loan } from "@/types/contracheque";
import type { ConsigfacilContrato, ConsigfacilStatus } from "@/types/consigfacil";
import { extrairParcelaConsignado, rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";
import { payslipContribuiHistoricoRubricas } from "@/lib/anexos/payslip-desconto-historico";
import {
  entradaPassivoDePayslipItem,
  identificarPassivoConsignavelEstrutural,
} from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";

export type ClassificacaoContinuidadeTimeline =
  | "continuidade_confirmada"
  | "continuidade_parcial"
  | "sequencia_quebrada"
  | "refinanciamento_suspeito"
  | "contrato_reiniciado"
  | "contrato_suspenso"
  | "contrato_quitado"
  | "indefinido";

export type OrigemParcelaTimeline = "folha" | "consigfacil" | "cadastro";

export type TimelineParcelaContrato = {
  competencia: string;
  parcela_atual: number | null;
  total: number | null;
  valor: number;
  origem: OrigemParcelaTimeline;
};

export type ResultadoAnaliseTimelineEstrutural = {
  timeline_parcelas: TimelineParcelaContrato[];
  classificacao_continuidade: ClassificacaoContinuidadeTimeline;
  progressao_normal: boolean;
  contrato_saudavel: boolean;
  sem_divergencia_estrutural: boolean;
  regressao_impossivel: boolean;
  salto_parcela_detectado: boolean;
  refinanciamento_provavel: boolean;
  reinicio_estrutural: boolean;
  suspensao_detectada: boolean;
  quitado_detectado: boolean;
  passos_consecutivos_perfeitos: number;
  lacunas_competencia: number;
  motivo: string;
  resumo_ui: string;
};

export const ROTULO_CLASSIFICACAO_CONTINUIDADE: Record<ClassificacaoContinuidadeTimeline, string> = {
  continuidade_confirmada: "Continuidade confirmada",
  continuidade_parcial: "Continuidade parcial",
  sequencia_quebrada: "Sequência quebrada",
  refinanciamento_suspeito: "Refinanciamento provável",
  contrato_reiniciado: "Contrato reiniciado",
  contrato_suspenso: "Contrato suspenso",
  contrato_quitado: "Contrato quitado",
  indefinido: "Timeline insuficiente",
};

function competenciaOrdem(comp: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(comp);
  if (!m) return 0;
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
}

function competenciaDePayslip(p: Payslip): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

/** Chave estável: código + total de parcelas + rubrica sem contador (074/088 e 075/088 = mesmo contrato). */
export function chaveTimelineContrato(
  code: string | undefined | null,
  description: string,
  parcelaTotal?: number | null,
): string {
  const c = (code ?? "").replace(/\D/g, "").slice(0, 6) || "----";
  const base = rubricaSemParcelaParaChave(description)
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 80);
  const t =
    parcelaTotal != null && parcelaTotal >= 1 ? String(parcelaTotal).padStart(3, "0") : "---";
  return `${c}|t:${t}|${base}`;
}

function coeficienteVariacao(vals: number[]): number {
  if (vals.length < 2) return 1;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (m <= 0) return 1;
  const sd = Math.sqrt(vals.reduce((s, x) => s + (x - m) ** 2, 0) / vals.length);
  return sd / m;
}

type ParComParcela = TimelineParcelaContrato & {
  parcela_atual: number;
  total: number;
};

function entradasComParcelaPlausivel(
  timeline: TimelineParcelaContrato[],
): ParComParcela[] {
  return timeline.filter((e): e is ParComParcela => {
    const a = e.parcela_atual;
    const t = e.total;
    return (
      a != null &&
      t != null &&
      a >= 1 &&
      t >= 1 &&
      a <= t &&
      !(a === 1 && t === 1)
    );
  });
}

/**
 * Analisa a sequência temporal de parcelas e classifica continuidade estrutural.
 */
export function analisarTimelineEstruturalContrato(
  timeline: TimelineParcelaContrato[],
  opts?: { status_consigfacil?: ConsigfacilStatus | null; situacao?: string | null },
): ResultadoAnaliseTimelineEstrutural {
  const ordenada = [...timeline].sort(
    (a, b) => competenciaOrdem(a.competencia) - competenciaOrdem(b.competencia),
  );

  const comParcela = entradasComParcelaPlausivel(ordenada);
  const valores = ordenada.map((e) => e.valor).filter((v) => v > 0);

  let passosPerfeitos = 0;
  let lacunas = 0;
  let regressao = false;
  let salto = false;
  let refin = false;
  let reinicio = false;
  let quitado = false;

  for (let i = 1; i < comParcela.length; i++) {
    const prev = comParcela[i - 1]!;
    const cur = comParcela[i]!;
    const dMes =
      competenciaOrdem(cur.competencia) - competenciaOrdem(prev.competencia);

    if (dMes > 1) {
      lacunas += dMes - 1;
      continue;
    }
    if (dMes !== 1) continue;

    if (cur.parcela_atual < prev.parcela_atual) {
      regressao = true;
    }
    if (cur.parcela_atual > prev.parcela_atual + 1) {
      salto = true;
    }

    const totalMudou =
      cur.total !== prev.total &&
      Math.abs(cur.total - prev.total) / Math.max(prev.total, 1) > 0.05;
    if (totalMudou && cur.parcela_atual <= 3) {
      refin = true;
    }

    if (prev.parcela_atual >= Math.max(3, prev.total * 0.85) && cur.parcela_atual <= 2) {
      reinicio = true;
    }

    if (
      cur.parcela_atual === cur.total ||
      (cur.parcela_atual >= cur.total - 1 && i === comParcela.length - 1)
    ) {
      quitado = true;
    }

    if (cur.total === prev.total && cur.parcela_atual === prev.parcela_atual + 1) {
      passosPerfeitos++;
    }
  }

  const ultima = comParcela[comParcela.length - 1];
  if (
    ultima &&
    ultima.parcela_atual >= ultima.total - 1 &&
    ultima.parcela_atual >= 1
  ) {
    quitado = true;
  }

  const status = opts?.status_consigfacil;
  const situacao = (opts?.situacao ?? "").toUpperCase();
  const suspenso =
    status === "suspenso" ||
    /SUSPENSO|BLOQUEADO|SEM\s+LAN/.test(situacao);

  const valorEstavel =
    valores.length >= 2 && coeficienteVariacao(valores) <= 0.12;

  let classificacao: ClassificacaoContinuidadeTimeline = "indefinido";
  let motivo = "Poucos pontos com parcela N/M na folha.";

  if (suspenso) {
    classificacao = "contrato_suspenso";
    motivo = "Status oficial ou situação indica suspensão.";
  } else if (quitado && comParcela.length >= 2) {
    classificacao = "contrato_quitado";
    motivo = "Última parcela na folha atinge ou quase atinge o total.";
  } else if (reinicio && !regressao) {
    classificacao = "contrato_reiniciado";
    motivo = "Parcela reiniciou após avanço alto (possível novo contrato na mesma rubrica).";
  } else if (refin) {
    classificacao = "refinanciamento_suspeito";
    motivo = "Total de parcelas mudou com reinício do contador.";
  } else if (regressao || salto) {
    classificacao = "sequencia_quebrada";
    motivo = regressao
      ? "Regressão de parcela entre meses consecutivos."
      : "Salto de parcela maior que +1 entre meses consecutivos.";
  } else if (passosPerfeitos >= 2 && comParcela.length >= 3) {
    classificacao = "continuidade_confirmada";
    motivo = `${passosPerfeitos} passo(s) consecutivos +1/${comParcela[0]?.total ?? "?"}.`;
  } else if (passosPerfeitos >= 1 || comParcela.length >= 2) {
    classificacao = "continuidade_parcial";
    motivo =
      lacunas > 0
        ? `Progressão com ${lacunas} lacuna(s) de competência.`
        : "Sequência parcialmente coerente.";
  }

  const progressao_normal = passosPerfeitos >= 2 && !regressao && !salto;
  const contrato_saudavel =
    classificacao === "continuidade_confirmada" && valorEstavel && !suspenso;
  const sem_divergencia_estrutural =
    contrato_saudavel ||
    classificacao === "continuidade_confirmada" ||
    classificacao === "contrato_quitado";

  const ult = comParcela[comParcela.length - 1];
  const resumo_ui =
    comParcela.length === 0
      ? "Sem parcelas N/M na folha"
      : ult
        ? `${ult.parcela_atual}/${ult.total} · ${ROTULO_CLASSIFICACAO_CONTINUIDADE[classificacao]}`
        : ROTULO_CLASSIFICACAO_CONTINUIDADE[classificacao];

  return {
    timeline_parcelas: ordenada,
    classificacao_continuidade: classificacao,
    progressao_normal,
    contrato_saudavel,
    sem_divergencia_estrutural,
    regressao_impossivel: regressao,
    salto_parcela_detectado: salto,
    refinanciamento_provavel: refin,
    reinicio_estrutural: reinicio,
    suspensao_detectada: suspenso,
    quitado_detectado: quitado,
    passos_consecutivos_perfeitos: passosPerfeitos,
    lacunas_competencia: lacunas,
    motivo,
    resumo_ui,
  };
}

/** Timeline prioriza sobre valor isolado / ConsigFácil sem parcela. */
export function timelinePriorizaSobreValorIsolado(
  analise: Pick<ResultadoAnaliseTimelineEstrutural, "sem_divergencia_estrutural" | "classificacao_continuidade">,
): boolean {
  return (
    analise.sem_divergencia_estrutural ||
    analise.classificacao_continuidade === "continuidade_confirmada"
  );
}

/**
 * Valida se a assinatura estrutural observada permanece compatível com a timeline do contrato.
 * Bloqueia continuidade parcial quando chaves ou classificação indicam contratos distintos.
 */
export function validarEAssinaturaNaTimeline(input: {
  assinatura_contrato: import("@/lib/conciliacao/assinatura-estrutural-contrato").AssinaturaEstruturalContrato;
  assinatura_observada: import("@/lib/conciliacao/assinatura-estrutural-contrato").AssinaturaEstruturalContrato;
  analise: ResultadoAnaliseTimelineEstrutural;
  chave_contrato: string;
  chave_observada: string;
}): {
  compativel: boolean;
  bloquear_continuidade_parcial: boolean;
  motivo: string;
} {
  const { analise, chave_contrato, chave_observada, assinatura_contrato, assinatura_observada } =
    input;

  if (chave_contrato !== chave_observada) {
    const baseC = chave_contrato.split("|").slice(2).join("|");
    const baseO = chave_observada.split("|").slice(2).join("|");
    if (baseC && baseO && baseC !== baseO) {
      return {
        compativel: false,
        bloquear_continuidade_parcial: true,
        motivo: "Chave de timeline distinta da rubrica observada.",
      };
    }
  }

  if (
    analise.classificacao_continuidade === "sequencia_quebrada" ||
    analise.classificacao_continuidade === "contrato_reiniciado" ||
    analise.regressao_impossivel
  ) {
    return {
      compativel: false,
      bloquear_continuidade_parcial: true,
      motivo: analise.motivo,
    };
  }

  if (
    assinatura_contrato.instituicao_normalizada &&
    assinatura_observada.instituicao_normalizada &&
    assinatura_contrato.instituicao_normalizada !== assinatura_observada.instituicao_normalizada
  ) {
    return {
      compativel: false,
      bloquear_continuidade_parcial: true,
      motivo: "Instituição da assinatura diverge da timeline estrutural.",
    };
  }

  if (analise.classificacao_continuidade === "continuidade_parcial") {
    const rubricaOk =
      assinatura_contrato.rubrica_canonica === assinatura_observada.rubrica_canonica ||
      assinatura_contrato.rubrica_canonica.includes(assinatura_observada.rubrica_canonica) ||
      assinatura_observada.rubrica_canonica.includes(assinatura_contrato.rubrica_canonica);
    if (!rubricaOk) {
      return {
        compativel: false,
        bloquear_continuidade_parcial: true,
        motivo: "Continuidade parcial não autoriza rubrica estruturalmente distinta.",
      };
    }
  }

  return {
    compativel: true,
    bloquear_continuidade_parcial: false,
    motivo: analise.motivo,
  };
}

export function montarTimelinesDesdeFolha(payslips: Payslip[]): Map<string, TimelineParcelaContrato[]> {
  const map = new Map<string, TimelineParcelaContrato[]>();
  const porCompetenciaChave = new Map<string, TimelineParcelaContrato>();

  for (const p of payslips) {
    if (!payslipContribuiHistoricoRubricas(p)) continue;
    const comp = competenciaDePayslip(p);

    for (const it of p.items ?? []) {
      if (it.type !== "desconto" || it.value <= 0) continue;
      const passivo = identificarPassivoConsignavelEstrutural(entradaPassivoDePayslipItem(it));
      if (!passivo.consignavel) continue;

      const par = extrairParcelaConsignado(it.description);
      const chave = chaveTimelineContrato(
        it.code,
        it.description,
        par.parcelaTotal ?? it.parcelaTotal,
      );
      const entrada: TimelineParcelaContrato = {
        competencia: comp,
        parcela_atual: par.parcelaAtual ?? it.parcelaAtual ?? null,
        total: par.parcelaTotal ?? it.parcelaTotal ?? null,
        valor: it.value,
        origem: "folha",
      };

      const dedupeKey = `${chave}::${comp}`;
      if (!porCompetenciaChave.has(dedupeKey)) {
        porCompetenciaChave.set(dedupeKey, entrada);
        const arr = map.get(chave) ?? [];
        arr.push(entrada);
        map.set(chave, arr);
      }
    }
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => competenciaOrdem(a.competencia) - competenciaOrdem(b.competencia));
  }
  return map;
}

export function resolverChaveTimelineParaLoan(loan: Loan): string {
  return chaveTimelineContrato(
    loan.rubrica_code,
    loan.description ?? loan.institution_name ?? "",
    loan.total_installments > 0 ? loan.total_installments : null,
  );
}

export function resolverChaveTimelineParaContrato(
  c: ConsigfacilContrato,
  loan?: Loan | null,
): string {
  if (loan) return resolverChaveTimelineParaLoan(loan);
  const par = extrairParcelaConsignado(c.texto_bruto || c.instituicao);
  return chaveTimelineContrato(
    c.codigo_instituicao,
    `${c.instituicao} ${c.texto_bruto}`,
    c.parcelas_total > 0 ? c.parcelas_total : par.parcelaTotal,
  );
}

export function montarTimelineContratoUnificada(input: {
  payslips: Payslip[];
  loan?: Loan | null;
  contrato?: ConsigfacilContrato | null;
}): ResultadoAnaliseTimelineEstrutural {
  const chave = input.contrato
    ? resolverChaveTimelineParaContrato(input.contrato, input.loan)
    : input.loan
      ? resolverChaveTimelineParaLoan(input.loan)
      : null;

  const map = montarTimelinesDesdeFolha(input.payslips);
  const timeline: TimelineParcelaContrato[] = chave ? [...(map.get(chave) ?? [])] : [];

  if (input.contrato?.competencia) {
    const jaTem = timeline.some((t) => t.competencia === input.contrato!.competencia);
    if (!jaTem && input.contrato.valor_parcela > 0) {
      timeline.push({
        competencia: input.contrato.competencia,
        parcela_atual: input.contrato.parcela_atual,
        total: input.contrato.parcelas_total > 0 ? input.contrato.parcelas_total : null,
        valor: input.contrato.valor_parcela,
        origem: "consigfacil",
      });
    }
  }

  timeline.sort((a, b) => competenciaOrdem(a.competencia) - competenciaOrdem(b.competencia));

  return analisarTimelineEstruturalContrato(timeline, {
    status_consigfacil: input.contrato?.status,
    situacao: input.contrato?.situacao_importacao ?? input.contrato?.observacao,
  });
}

export type ContratoComTimeline = ConsigfacilContrato & {
  timeline_parcelas: TimelineParcelaContrato[];
  classificacao_continuidade: ClassificacaoContinuidadeTimeline;
  timeline_analise: ResultadoAnaliseTimelineEstrutural;
};

export type LoanComTimeline = Loan & {
  timeline_parcelas?: TimelineParcelaContrato[];
  classificacao_continuidade?: ClassificacaoContinuidadeTimeline;
  timeline_analise?: ResultadoAnaliseTimelineEstrutural;
};

export function enriquecerContratosComTimelineEstrutural(input: {
  payslips: Payslip[];
  contratos: ConsigfacilContrato[];
  loans: Loan[];
  matchesLoanPorIdConsignacao?: Map<string, string>;
}): {
  contratos: ContratoComTimeline[];
  loans: LoanComTimeline[];
  porChave: Map<string, ResultadoAnaliseTimelineEstrutural>;
} {
  const mapFolha = montarTimelinesDesdeFolha(input.payslips);
  const loanPorId = new Map(input.loans.map((l) => [l.id, l]));
  const porChave = new Map<string, ResultadoAnaliseTimelineEstrutural>();

  const contratos: ContratoComTimeline[] = input.contratos.map((c) => {
    const loanId = input.matchesLoanPorIdConsignacao?.get(c.id_consignacao);
    const loan = loanId ? loanPorId.get(loanId) : undefined;
    const analise = montarTimelineContratoUnificada({
      payslips: input.payslips,
      loan: loan ?? null,
      contrato: c,
    });
    const chave = resolverChaveTimelineParaContrato(c, loan ?? null);
    porChave.set(chave, analise);
    return {
      ...c,
      timeline_parcelas: analise.timeline_parcelas,
      classificacao_continuidade: analise.classificacao_continuidade,
      timeline_analise: analise,
    };
  });

  const loans: LoanComTimeline[] = input.loans.map((l) => {
    const analise = montarTimelineContratoUnificada({ payslips: input.payslips, loan: l });
    const chave = resolverChaveTimelineParaLoan(l);
    porChave.set(chave, analise);
    return {
      ...l,
      timeline_parcelas: analise.timeline_parcelas,
      classificacao_continuidade: analise.classificacao_continuidade,
      timeline_analise: analise,
    };
  });

  return { contratos, loans, porChave };
}
