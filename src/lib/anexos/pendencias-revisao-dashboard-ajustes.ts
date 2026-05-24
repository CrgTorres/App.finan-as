/**
 * Ajustes puramente de UI: combina validação da base (engine) com o estado de revisão
 * das pendências da análise de folha, sem alterar geradores nem parsers.
 */

import type {
  ChecklistItemMelhoria,
  EmprestimoContratoAnalise,
} from "@/lib/anexos/analise-financeira-contracheque-padroes";
import type { ConsolidacaoLogicaEmprestimosResultado } from "@/lib/anexos/consolidacao-logica-emprestimos";
import type { PendenciasRevisaoSyncSnapshot } from "@/lib/anexos/pendencias-analise-ui";
import type {
  ItemChecklistFinalBase,
  StatusBaseEmprestimos,
  ValidacaoBaseEmprestimosResultado,
} from "@/lib/anexos/validacao-base-emprestimos";
import type { Payslip } from "@/types/contracheque";

function clamp0100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export type RiscoBarraCor = "verde" | "amarelo" | "vermelho";

export type ScoresAnaliseDashboard = {
  qualidadeBase: number;
  completudeDocumental: number;
  consistenciaFinanceira: number;
  consistenciaTemporal: number;
  confiabilidadeOcr: number;
  /** Média das duas consistências (exibição única de “consistência”). */
  consistenciaGeral: number;
  scoreJuridicoPreliminar: number;
  riscoGeral: RiscoBarraCor;
  /** Média simples dos cinco primeiros eixos (sem jurídico). */
  mediaEixos: number;
};

export type TimelineEventoAnalise = {
  id: string;
  competencia?: string;
  label: string;
  detalhe: string;
  /** Credor para agrupar na timeline (quando conhecido). */
  instituicao?: string | null;
  categoria:
    | "primeira_folha"
    | "refinanciamento"
    | "troca_contrato"
    | "contratos_simultaneos"
    | "contrato_quitado";
  /** Quando `categoria === "refinanciamento"`, granularidade da hipótese analítica. */
  nivelSuspeitaRefin?: "possivel" | "provavel";
};

const ORDEM_STATUS: StatusBaseEmprestimos[] = [
  "incompleta",
  "em revisão",
  "consistente para análise financeira",
  "consistente para análise jurídica preliminar",
];

function indiceStatus(s: StatusBaseEmprestimos): number {
  const i = ORDEM_STATUS.indexOf(s);
  return i < 0 ? 0 : i;
}

function rebaixarStatusSeNecessario(
  atual: StatusBaseEmprestimos,
  minimo: StatusBaseEmprestimos,
): StatusBaseEmprestimos {
  if (indiceStatus(atual) <= indiceStatus(minimo)) return atual;
  return minimo;
}

function notaChecklist(v: ValidacaoBaseEmprestimosResultado): { ok: number; total: number } {
  const total = v.checklistFinal.length;
  const ok = v.checklistFinal.filter((c) => c.status === "ok").length;
  return { ok, total: Math.max(1, total) };
}

export function calcularScoresDashboard(
  validacaoBase: ValidacaoBaseEmprestimosResultado,
  snapshot: PendenciasRevisaoSyncSnapshot | null,
  numHipotesesJuridicas: number,
): ScoresAnaliseDashboard {
  const p = validacaoBase.painel;
  const n = Math.max(1, p.totalContratosInferidos);
  const { ok, total } = notaChecklist(validacaoBase);

  const gapTemporal =
    (p.contratosComMesesFaltantes + p.contratosComParcelaForaDeSequencia + p.contratosSemTotalDeParcelas) / n;
  const gapFin =
    (p.contratosComPossivelRefinanciamento + p.contratosComPossivelDuplicidade + p.contratosComBaixaConfianca) / n;

  let qualidadeBase = 100 - gapTemporal * 28 - gapFin * 22 - (p.contratosSemContratoFormalAnexado / n) * 8;
  let completudeDocumental = clamp0100((ok / total) * 100 - (total - ok) * 4);
  let consistenciaFinanceira =
    100 - (p.contratosComPossivelRefinanciamento / n) * 35 - (p.contratosComPossivelDuplicidade / n) * 25;
  let consistenciaTemporal =
    100 - (p.contratosComMesesFaltantes / n) * 30 - (p.contratosComParcelaForaDeSequencia / n) * 25;
  let confiabilidadeOcr = 92 - (p.contratosComBaixaConfianca / n) * 40 - (p.contratosSemTotalDeParcelas / n) * 12;

  let scoreJuridicoPreliminar = 88 - numHipotesesJuridicas * 5;

  if (snapshot && snapshot.resumo.total > 0) {
    const r = snapshot.resumo;
    const tipoAb = snapshot.abertosPorTipo;
    qualidadeBase += r.resolvidas * 2.5 - r.ignoradas * 4 - r.confirmadas * 1.2;
    completudeDocumental += r.resolvidas * 1.5 - (r.abertas + r.revisaoPendente) * 1.8;
    consistenciaFinanceira += r.resolvidas * 1.2 - tipoAb.possivel_refinanciamento * 3;
    consistenciaTemporal += r.resolvidas * 1.5 - tipoAb.continuidade * 2.5;
    confiabilidadeOcr -= r.ignoradas * 6;
    confiabilidadeOcr -= tipoAb.ocr * 4;
    confiabilidadeOcr += r.resolvidas * 0.8;

    for (const [, cnt] of Object.entries(snapshot.altoAbertoPorGrupo)) {
      const extra = Math.max(0, cnt - 1);
      scoreJuridicoPreliminar -= cnt * 5 + extra * 12;
    }
    scoreJuridicoPreliminar += r.resolvidas * 4;
  }

  qualidadeBase = clamp0100(qualidadeBase);
  consistenciaFinanceira = clamp0100(consistenciaFinanceira);
  consistenciaTemporal = clamp0100(consistenciaTemporal);
  confiabilidadeOcr = clamp0100(confiabilidadeOcr);
  scoreJuridicoPreliminar = clamp0100(scoreJuridicoPreliminar);

  const consistenciaGeral = clamp0100((consistenciaFinanceira + consistenciaTemporal) / 2);
  const mediaEixos = clamp0100(
    (qualidadeBase + completudeDocumental + consistenciaFinanceira + consistenciaTemporal + confiabilidadeOcr) / 5,
  );

  let riscoGeral: RiscoBarraCor = "verde";
  if (mediaEixos < 72 || (snapshot && snapshot.resumo.altoImpactoAbertas >= 3)) riscoGeral = "amarelo";
  if (mediaEixos < 48 || (snapshot && snapshot.resumo.altoImpactoAbertas >= 6)) riscoGeral = "vermelho";

  return {
    qualidadeBase,
    completudeDocumental: clamp0100(completudeDocumental),
    consistenciaFinanceira,
    consistenciaTemporal,
    confiabilidadeOcr,
    consistenciaGeral,
    scoreJuridicoPreliminar,
    riscoGeral,
    mediaEixos,
  };
}

export function mergeValidacaoBaseComRevisao(
  base: ValidacaoBaseEmprestimosResultado,
  snapshot: PendenciasRevisaoSyncSnapshot | null,
): ValidacaoBaseEmprestimosResultado {
  if (!snapshot || snapshot.resumo.total === 0) return base;

  const r = snapshot.resumo;
  const checklistFinal: ItemChecklistFinalBase[] = base.checklistFinal.map((c) => {
    let status = c.status;
    let detalhe = c.detalhe ?? "";

    if (c.id === "parcelas_conferidas" && r.resolvidas > 0 && status === "pendente") {
      status = "parcial";
      detalhe = `${detalhe} Revisão folha: ${r.resolvidas} pendência(ns) marcada(s) como resolvida(s).`;
    }
    if (c.id === "duplicidades_revisadas" && r.confirmadas > 0) {
      if (status === "ok") {
        detalhe = `${detalhe} · ${r.confirmadas} pendência(ns) confirmada(s) (prioridade de revisão).`;
      } else {
        if (status === "pendente") status = "parcial";
        detalhe = `${detalhe} · ${r.confirmadas} pendência(ns) confirmada(s) na triagem da folha.`;
      }
    }
    if (c.id === "contracheques_mensais" && r.revisaoPendente > 0) {
      detalhe = `${detalhe} · ${r.revisaoPendente} item(ns) marcados «precisa revisar».`;
    }

    return detalhe !== (c.detalhe ?? "") || status !== c.status ? { ...c, status, detalhe } : c;
  });

  let statusBase = base.statusBase;
  let resumoStatus = base.resumoStatus;

  if (r.confirmadas > 0 || r.revisaoPendente > 0 || r.altoImpactoAbertas > 0) {
    statusBase = rebaixarStatusSeNecessario(statusBase, "em revisão");
  }

  const syncLinhas: string[] = [];
  syncLinhas.push(
    `Revisão pendências (folha): ${r.total} total · ${r.abertas} abertas · ${r.resolvidas} resolv. · ${r.ignoradas} ignor. · ${r.confirmadas} confirm. · ${r.revisaoPendente} p/ revisar · ${r.altoImpactoAbertas} alto impacto aberto.`,
  );
  if (r.contratosComAltoImpactoAberto > 0) {
    syncLinhas.push(`${r.contratosComAltoImpactoAberto} contrato(s) com alerta alto em aberto.`);
  }
  resumoStatus = [base.resumoStatus, ...syncLinhas].join(" ");

  return {
    ...base,
    painel: {
      ...base.painel,
      refinanciamentosConfirmadosTriagem: snapshot.resumo.refinanciamentoConfirmadoTriagem ?? 0,
    },
    checklistFinal,
    statusBase,
    resumoStatus,
  };
}

export function mergeChecklistMelhoriaComRevisao(
  items: ChecklistItemMelhoria[],
  snapshot: PendenciasRevisaoSyncSnapshot | null,
): ChecklistItemMelhoria[] {
  if (!snapshot || snapshot.resumo.total === 0) return items;

  const r = snapshot.resumo;
  return items.map((it) => {
    const partes: string[] = [];
    if (it.detalhe) partes.push(it.detalhe);
    if (r.resolvidas > 0 && r.abertas === 0) {
      partes.push("Triagem da folha: nenhuma pendência em aberto.");
    }
    if (r.confirmadas > 0) {
      partes.push(`${r.confirmadas} pendência(ns) confirmada(s) — elevar prioridade de revisão.`);
    }
    if (r.ignoradas > 0) {
      partes.push(`${r.ignoradas} ignorada(s): reduz confiança na leitura automática/OCR.`);
    }
    if (r.revisaoPendente > 0) {
      partes.push(`${r.revisaoPendente} marcada(s) «precisa revisar».`);
    }
    const detalhe = partes.join(" ").trim();
    return { ...it, detalhe: detalhe || undefined };
  });
}

export function gerarTimelineEventosAnaliseUi(
  payslips: Payslip[],
  emprestimosPorContrato: EmprestimoContratoAnalise[],
  consolidacao: ConsolidacaoLogicaEmprestimosResultado,
): TimelineEventoAnalise[] {
  const out: TimelineEventoAnalise[] = [];

  if (payslips.length > 0) {
    const sorted = [...payslips].sort((a, b) => a.year - b.year || a.month - b.month);
    const first = sorted[0]!;
    const labelFirst = `${String(first.month).padStart(2, "0")}/${first.year}`;
    out.push({
      id: "primeira-folha",
      competencia: labelFirst,
      label: "Primeira folha na base",
      detalhe: `${sorted.length} anexo(s) no período analisado.`,
      categoria: "primeira_folha",
    });
  }

  for (const s of consolidacao.suspeitasRefinanciamento ?? []) {
    out.push({
      id: s.id,
      competencia: s.contratoNovo.primeiraAparicao.replace("-", "/"),
      label:
        s.nivel === "provavel"
          ? "Hipótese analítica: provável refinanciamento"
          : "Hipótese analítica: possível refinanciamento",
      instituicao: s.instituicao,
      detalhe: `${s.instituicao}: «${s.contratoAnterior.descricao.slice(0, 56)}${s.contratoAnterior.descricao.length > 56 ? "…" : ""}» → «${s.contratoNovo.descricao.slice(0, 56)}${s.contratoNovo.descricao.length > 56 ? "…" : ""}». ${s.mensagem}`,
      categoria: "refinanciamento",
      nivelSuspeitaRefin: s.nivel,
    });
  }

  for (const g of consolidacao.grupos) {
    if (g.tipoConsolidacao === "contratos_distintos_mesmo_banco" || g.tipoConsolidacao === "possivel_mesmo_contrato") {
      if (g.contratosOriginais.length >= 2) {
        out.push({
          id: `sim-${g.grupoId}`,
          competencia: g.ultimaAparicao.replace("-", "/"),
          label: "Contratos simultâneos / sobreposição",
          detalhe: `${g.instituicao}: ${g.contratosOriginais.length} linhas inferidas relacionadas.`,
          categoria: "contratos_simultaneos",
        });
      }
    }
  }

  for (const c of emprestimosPorContrato) {
    const txtObs = c.observacoes.join(" ").toLowerCase();
    if (/troca|intervalo|hiato|rubrica renomeada|renegoci|amortiza/i.test(txtObs)) {
      out.push({
        id: `troca-${c.codigo}`,
        competencia: c.primeiraAparicao.replace("-", "/"),
        label: "Sinal de troca / alteração de contrato",
        detalhe: c.descricao.slice(0, 120),
        categoria: "troca_contrato",
      });
    }
    if (
      c.status === "finalizado" ||
      (c.parcelaFinalDetectada != null && c.totalParcelas != null && c.parcelaFinalDetectada >= c.totalParcelas)
    ) {
      const ultima = c.ultimaAparicao.replace("-", "/");
      const parcelaTxt =
        c.parcelaFinalDetectada != null && c.totalParcelas != null
          ? ` · parcela ${c.parcelaFinalDetectada}/${c.totalParcelas}`
          : "";
      out.push({
        id: `quit-${c.codigo}-${c.primeiraAparicao}`,
        competencia: ultima,
        label: "Série encerrada na base (heurística)",
        instituicao: c.instituicaoDetectada,
        detalhe: `«${c.descricao.slice(0, 72)}» — última competência ${ultima}${parcelaTxt}. O desconto deixou de aparecer nas folhas seguintes; não confirma quitação real nem altera pendências.`,
        categoria: "contrato_quitado",
      });
    }
  }

  const order = (e: TimelineEventoAnalise) => e.competencia ?? "";
  return [...out].sort((a, b) => order(a).localeCompare(order(b), "pt-BR"));
}

export function largurasBarraRisco(scores: ScoresAnaliseDashboard): { verde: number; amarelo: number; vermelho: number } {
  const m = scores.mediaEixos;
  if (scores.riscoGeral === "verde") {
    return { verde: Math.max(55, m), amarelo: Math.max(15, 100 - m - 20), vermelho: Math.max(10, 20) };
  }
  if (scores.riscoGeral === "amarelo") {
    return { verde: Math.min(45, m * 0.6), amarelo: Math.max(35, m * 0.85), vermelho: Math.max(15, 100 - m * 0.5) };
  }
  return { verde: Math.max(10, m * 0.35), amarelo: Math.max(25, m * 0.55), vermelho: Math.max(40, 100 - m) };
}
