import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { normSlugRubricaLoanMatch } from "@/lib/anexos/emprestimos-cruzamento-loans";
import type { Loan, LoanStatus } from "@/types/contracheque";

const EPS_PARCELA = 0.02;

function arredondar2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizarCodigoRubrica(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

function descricaoParecida(d1: string, d2: string): boolean {
  const a = normSlugRubricaLoanMatch(d1);
  const b = normSlugRubricaLoanMatch(d2);
  if (a.length < 4 || b.length < 4) {
    const n1 = d1.trim().toLowerCase().replace(/\s+/g, " ");
    const n2 = d2.trim().toLowerCase().replace(/\s+/g, " ");
    return n1 === n2;
  }
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 10 && longer.includes(shorter)) return true;
  let best = 0;
  for (let len = Math.min(a.length, b.length); len >= 6; len--) {
    for (let i = 0; i + len <= a.length; i++) {
      const sub = a.slice(i, i + len);
      if (b.includes(sub)) {
        best = len;
        break;
      }
    }
    if (best >= 8) return true;
  }
  return best >= 8;
}

/**
 * Indica se um `loan` já representa o mesmo contrato que o detectado na análise financeira
 * (código + descrição parecida + parcela + total de parcelas quando houver no detectado).
 */
export function loanCorrespondeEmprestimoDetectado(loan: Loan, c: EmprestimoContratoAnalise): boolean {
  const dc = normalizarCodigoRubrica(c.codigo);
  const dl = normalizarCodigoRubrica(loan.rubrica_code);
  if (dc.length > 0 && dl.length > 0 && dc !== dl) return false;

  if (Math.abs(loan.installment_amount - c.valorParcela) > EPS_PARCELA) return false;

  if (c.totalParcelas != null && loan.total_installments !== c.totalParcelas) return false;

  if (!descricaoParecida(loan.description, c.descricao)) return false;

  return true;
}

function statusLoanFromAnalise(c: EmprestimoContratoAnalise): LoanStatus {
  if (c.status === "finalizado") return "quitado";
  return "ativo";
}

function totaisParaInsert(c: EmprestimoContratoAnalise): {
  total_installments: number;
  paid_installments: number;
  total_amount: number;
} {
  const total_installments =
    c.tipoContrato === "parcelado"
      ? Math.max(1, c.totalParcelas ?? c.quantidadeAparicoes)
      : c.tipoContrato === "recorrente_01_01"
        ? 1
        : Math.max(1, c.quantidadeAparicoes);

  let paid_installments = c.quantidadeAparicoes;
  if (c.tipoContrato === "parcelado" && c.parcelaFinalDetectada != null) {
    paid_installments = c.parcelaFinalDetectada;
  }
  paid_installments = Math.max(0, Math.min(paid_installments, total_installments));

  let total_amount = c.valorProjetadoContrato;
  if (total_amount == null || total_amount <= 0 || !Number.isFinite(total_amount)) {
    total_amount = arredondar2(c.valorParcela * total_installments);
  } else {
    total_amount = arredondar2(total_amount);
  }

  return { total_installments, paid_installments, total_amount };
}

function montarLinhaInsert(userId: string, c: EmprestimoContratoAnalise): Record<string, unknown> {
  const { total_installments, paid_installments, total_amount } = totaisParaInsert(c);
  const status = statusLoanFromAnalise(c);
  const codigo = normalizarCodigoRubrica(c.codigo);
  const start = `${c.primeiraAparicao}-01`;
  const payoff =
    status === "quitado" ? `${c.ultimaAparicao}-01` : null;

  return {
    user_id: userId,
    description: c.descricao.slice(0, 800),
    total_amount,
    installment_amount: arredondar2(c.valorParcela),
    total_installments,
    paid_installments,
    start_date: start,
    status,
    payoff_date: payoff,
    rubrica_code: codigo.length > 0 ? codigo : null,
    institution_name: c.instituicaoDetectada,
    parcela_inicial_detectada: c.parcelaInicialDetectada,
    parcela_final_detectada: c.parcelaFinalDetectada,
    primeira_aparicao: c.primeiraAparicao,
    ultima_aparicao: c.ultimaAparicao,
    quantidade_aparicoes: c.quantidadeAparicoes,
    total_pago_detectado: arredondar2(c.totalPago),
    tipo_contrato: c.tipoContrato,
    origem: "contracheque",
    status_analise_contracheque: c.status,
  };
}

function loanParcialDoInsert(row: Record<string, unknown>): Loan {
  return {
    id: "",
    user_id: String(row.user_id),
    description: String(row.description),
    total_amount: Number(row.total_amount),
    installment_amount: Number(row.installment_amount),
    total_installments: Number(row.total_installments),
    paid_installments: Number(row.paid_installments),
    start_date: String(row.start_date),
    status: row.status as LoanStatus,
    created_at: "",
    rubrica_code: row.rubrica_code != null && String(row.rubrica_code).length > 0 ? String(row.rubrica_code) : undefined,
  };
}

export type CadastroEmprestimosDetectadosResultado = {
  cadastrados: number;
  jaExistiam: number;
  erros: number;
};

/**
 * Insere em `loans` cada contrato de `emprestimosPorContrato` que ainda não tenha equivalente
 * em `loansExistentes` (nem nas linhas já inseridas neste lote).
 */
export async function cadastrarEmprestimosDetectadosContracheque(
  supabase: SupabaseClient,
  userId: string,
  emprestimosPorContrato: EmprestimoContratoAnalise[],
  loansExistentes: Loan[],
): Promise<CadastroEmprestimosDetectadosResultado> {
  const acumulo: Loan[] = [...loansExistentes];
  let cadastrados = 0;
  let jaExistiam = 0;
  let erros = 0;

  for (const c of emprestimosPorContrato) {
    const jaTem = acumulo.some((loan) => loanCorrespondeEmprestimoDetectado(loan, c));
    if (jaTem) {
      jaExistiam += 1;
      continue;
    }

    const row = montarLinhaInsert(userId, c);
    const { error } = await supabase.from("loans").insert(row);

    if (error) {
      erros += 1;
      continue;
    }

    cadastrados += 1;
    acumulo.push(loanParcialDoInsert(row));
  }

  return { cadastrados, jaExistiam, erros };
}
