import type { Loan } from "@/types/contracheque";
import type { ContratoEmprestimoAnalise, EmprestimosAnaliseFromPayslips } from "@/lib/anexos/emprestimos-analise-from-payslips";
import { rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";

/** Limite de linhas `payslips` carregadas na página de análise (competências). */
export const PAYSLIPS_ANALISE_LIMIT = 500;

/** Normalização de texto de rubrica / descrição para cruzar folha × cadastro e deduplicar cadastros automáticos. */
export function normSlugRubricaLoanMatch(s: string): string {
  return rubricaSemParcelaParaChave(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/([a-z])\1{2,}/g, "$1$1")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .slice(0, 72);
}

function scoreParcela(loan: Loan, c: ContratoEmprestimoAnalise): number {
  const inst = loan.installment_amount;
  if (!Number.isFinite(inst) || inst <= 0) return 0;
  const d = Math.abs(c.valorMediano - inst);
  if (d <= Math.max(5, 0.06 * inst)) return 4;
  if (d <= Math.max(18, 0.12 * inst)) return 2;
  if (d <= Math.max(40, 0.22 * inst)) return 1;
  return 0;
}

function scoreTexto(loan: Loan, c: ContratoEmprestimoAnalise): number {
  const a = normSlugRubricaLoanMatch(loan.description);
  const b = c.slugBase;
  if (a.length < 5 || b.length < 5) return 0;
  if (a === b) return 5;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (longer.includes(shorter) && shorter.length >= 10) return 4;
  let best = 0;
  for (let len = Math.min(a.length, b.length); len >= 6; len--) {
    for (let i = 0; i + len <= a.length; i++) {
      if (b.includes(a.slice(i, i + len))) {
        best = len;
        break;
      }
    }
    if (best >= 12) return 4;
  }
  if (best >= 8) return 2;
  return 0;
}

function scoreTotalParcelas(loan: Loan, c: ContratoEmprestimoAnalise): number {
  if (!c.ultimaParcela || !loan.total_installments || loan.total_installments < 1) return 0;
  const diff = Math.abs(loan.total_installments - c.ultimaParcela.total);
  if (diff <= 1) return 2;
  if (diff <= 3) return 1;
  return 0;
}

function scoreLinha(loan: Loan, c: ContratoEmprestimoAnalise): number {
  return scoreParcela(loan, c) + scoreTexto(loan, c) + scoreTotalParcelas(loan, c);
}

export type CruzamentoLinha = {
  loan: Loan;
  melhorContrato?: ContratoEmprestimoAnalise;
  score: number;
  tipo: "ok" | "fragil" | "sem_match";
  motivo: string;
};

export function cruzarLoansComAnaliseFolha(loans: Loan[], data: EmprestimosAnaliseFromPayslips): CruzamentoLinha[] {
  const rows: CruzamentoLinha[] = [];
  for (const loan of loans) {
    let best: ContratoEmprestimoAnalise | undefined;
    let bestScore = 0;
    for (const c of data.contratos) {
      const s = scoreLinha(loan, c);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }

    let tipo: CruzamentoLinha["tipo"] = "sem_match";
    let motivo =
      "Nenhuma rubrica da folha combina de forma convincente com este cadastro (parcela + descrição + total de parcelas).";
    if (best && bestScore >= 8) {
      tipo = "ok";
      motivo = "Forte correspondência entre cadastro e rubrica na folha (valor, texto e/ou total de parcelas).";
    } else if (best && bestScore >= 5) {
      tipo = "fragil";
      motivo = "Correspondência parcial — confira no PDF se é o mesmo contrato.";
    }

    rows.push({
      loan,
      melhorContrato: best && bestScore >= 5 ? best : undefined,
      score: bestScore,
      tipo,
      motivo,
    });
  }
  return rows;
}

export function contratosFolhaSemLoanCadastrado(
  cruz: CruzamentoLinha[],
  data: EmprestimosAnaliseFromPayslips
): ContratoEmprestimoAnalise[] {
  const matched = new Set(
    cruz.filter((r) => r.melhorContrato != null).map((r) => r.melhorContrato!.chave)
  );
  return data.contratos.filter((c) => !matched.has(c.chave));
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function textoResumoEmprestimosParaChat(input: {
  data: EmprestimosAnaliseFromPayslips;
  loans: Loan[];
  ultimoLiquido?: number | null;
}): string {
  const { data, loans, ultimoLiquido } = input;
  const cruz = cruzarLoansComAnaliseFolha(loans, data);
  const folhaSemCadastro = contratosFolhaSemLoanCadastrado(cruz, data);
  const lines: string[] = [];

  lines.push("# Resumo: empréstimos na folha + cadastro (loans)");
  lines.push(`Gerado em: ${new Date().toLocaleString("pt-BR")}`);
  lines.push("");
  lines.push("## KPIs (detecção na folha)");
  lines.push(`- Competências com folha (deduplicadas): ${data.competenciasProcessadas}`);
  if (data.primeiraCompetencia && data.ultimaCompetencia) {
    lines.push(
      `- Período: ${String(data.primeiraCompetencia.month).padStart(2, "0")}/${data.primeiraCompetencia.year} → ${String(data.ultimaCompetencia.month).padStart(2, "0")}/${data.ultimaCompetencia.year}`
    );
  }
  lines.push(`- Contratos distintos na folha: ${data.kpis.nContratosDistintos}`);
  lines.push(`- Total descontado (histórico, só empréstimos/consignados detectados): ${brl(data.kpis.totalHistoricoDescontado)}`);
  lines.push(`- Média mensal no período (parcelas detectadas): ${brl(data.kpis.mediaMensalNoPeriodo)}`);
  lines.push(`- Descontos no período exc. IR e Amazon Prev: ${brl(data.kpis.totalHistoricoDescontosExcIrAmazon)} (média ${brl(data.kpis.mediaMensalDescontosExcIrAmazon)})`);
  lines.push(`- Parte «outros» (não classificada como empréstimo): ${brl(data.kpis.totalHistoricoOutrosNaoEmprestimo)}`);
  lines.push(`- Parcelas empréstimo no último mês da série: ${brl(data.kpis.parcelaNoUltimoMes)}`);
  lines.push(
    `- Último mês exc. IR/Amazon: ${brl(data.kpis.descontosExcIrAmazonNoUltimoMes)} (outros não-empréstimo: ${brl(data.kpis.outrosNaoEmprestimoNoUltimoMes)})`
  );
  if (data.kpis.progressoMedioPonderadoPct != null) {
    lines.push(`- Progresso médio ponderado (N/M): ${data.kpis.progressoMedioPonderadoPct}%`);
  }
  if (ultimoLiquido != null && ultimoLiquido > 0) {
    const pct = (data.kpis.parcelaNoUltimoMes / ultimoLiquido) * 100;
    lines.push(`- Último líquido de referência: ${brl(ultimoLiquido)} (~${pct.toFixed(1)}% em empréstimos no último mês)`);
  }
  lines.push("");

  lines.push("## Cadastro `loans` × rubricas na folha");
  if (loans.length === 0) {
    lines.push("- Nenhum empréstimo cadastrado na tabela `loans`.");
  } else {
    for (const r of cruz) {
      const L = r.loan;
      lines.push(
        `- **${L.description.trim()}** (${L.status}) · parcela cadastrada ${brl(L.installment_amount)} · ${L.paid_installments}/${L.total_installments} pagas`
      );
      lines.push(`  - Cruzamento: ${r.tipo.toUpperCase()} (score ${r.score}) — ${r.motivo}`);
      if (r.melhorContrato) {
        const c = r.melhorContrato;
        lines.push(
          `  - Folha: «${c.label}» · mediana ${brl(c.valorMediano)} · conf. ${c.confianca}` +
            (c.ultimaParcela
              ? ` · última N/M ${String(c.ultimaParcela.atual).padStart(2, "0")}/${String(c.ultimaParcela.total).padStart(2, "0")}`
              : "")
        );
      }
    }
  }
  lines.push("");

  lines.push("## Rubricas na folha sem cadastro correspondente");
  if (folhaSemCadastro.length === 0) {
    lines.push("- Nenhuma (ou todas já associadas a algum `loan` com score ≥ 5).");
  } else {
    for (const c of folhaSemCadastro.slice(0, 30)) {
      lines.push(`- «${c.label}» · valor parcela (mediana) ${brl(c.valorMediano)} · total pago ${brl(c.totalPago)} · conf. ${c.confianca}`);
    }
    if (folhaSemCadastro.length > 30) lines.push(`- … e mais ${folhaSemCadastro.length - 30} contrato(s).`);
  }
  lines.push("");

  lines.push("## Instituição (COMPE) + referências Bacen / portais");
  const comConf = data.contratos.filter((c) => c.confirmacaoInstituicao);
  if (comConf.length === 0) {
    lines.push("- Nenhum contrato com cruzamento COMPE + indício de consignado (ou rubrica sem banco reconhecível).");
  } else {
    for (const c of comConf.slice(0, 25)) {
      const x = c.confirmacaoInstituicao!;
      lines.push(
        `- «${c.label}» → COMPE **${x.compe}** (${x.nome}), confiança ref.: ${x.confiancaRef}. Links: ${x.urlsReferencia.join(" · ")}`
      );
    }
    if (comConf.length > 25) lines.push(`- … e mais ${comConf.length - 25} contrato(s) com referência.`);
  }
  lines.push("");

  lines.push("## Padrões inferidos");
  if (data.padroesDetectados.length === 0) {
    lines.push("- Nenhum padrão adicional listado.");
  } else {
    for (const p of data.padroesDetectados) {
      lines.push(`- ${p.mensagem}`);
    }
  }
  lines.push("");

  lines.push("## Plano de resolução (priorizado)");
  for (const s of data.sugestoesResolucao) {
    lines.push(`- **${s.prioridade.toUpperCase()}** — ${s.titulo}: ${s.detalhe}`);
  }
  lines.push("");

  lines.push("## Pendências (amostra)");
  const pend = data.pendencias;
  const maxP = 35;
  for (let i = 0; i < Math.min(maxP, pend.length); i++) {
    lines.push(`- ${pend[i]}`);
  }
  if (pend.length > maxP) lines.push(`- … e mais ${pend.length - maxP} item(ns).`);

  lines.push("");
  lines.push("_(Texto gerado pelo app para colar em chat / consultor. Confirme sempre com o PDF e o contrato.)_");
  return lines.join("\n");
}
