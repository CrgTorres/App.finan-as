import type { Payslip, Loan, PayslipItem } from "@/types/contracheque";
import type { Transaction } from "@/types";
import { transactionIsExtratoImport } from "@/lib/utils/transaction-source";
import { preprocessDescricaoParaDetecaoBanco, normalizarParaBusca } from "@/lib/reading/instituicoes-financeiras";
import { filtrarPayslipsAnaliseSemAdiantamentoParcial130 } from "@/lib/anexos/decimo-terceiro-coerencia";
import type { BoletimMes } from "./boletins-catalog";

/** Heurísticas só para destacar temas úteis no app — não são “gatilhos jurídicos”. */
const CONSIG_HR = /\bconsig|\bemprest|parcela\b|\bcet\b|\biof\b|\bfinanc|\bcredcesta\b|\bcredi\s*cesta\b/i;

function itemEhConsignadoOuBanco(it: PayslipItem): boolean {
  if (!it || it.type !== "desconto") return false;
  if (it.banco?.compe) return true;
  const n = normalizarParaBusca(preprocessDescricaoParaDetecaoBanco(it.description ?? ""));
  return CONSIG_HR.test(n);
}

export type SinaisPerfilFinanceiro = {
  temContracheques: boolean;
  temExtratoUltimos180d: boolean;
  temEmprestimoAtivoCadastrado: boolean;
  temRubricaConsignadoOuBancoNaFolha: boolean;
  cargaDescontosAlta: boolean;
};

export function computeSinaisPerfil(
  payslips: Payslip[],
  loans: Loan[],
  transactions: Transaction[],
  ref = new Date()
): SinaisPerfilFinanceiro {
  const cutoff = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 180);
  const payslipsAnalise = filtrarPayslipsAnaliseSemAdiantamentoParcial130(payslips);

  const temContracheques = payslipsAnalise.length > 0;

  const temExtratoUltimos180d = transactions.some((t) => {
    if (!transactionIsExtratoImport(t)) return false;
    const d = new Date(`${t.date}T12:00:00`);
    return Number.isFinite(d.getTime()) && d >= cutoff;
  });

  const temEmprestimoAtivoCadastrado = loans.some((l) => l.status === "ativo");

  let temRubricaConsignadoOuBancoNaFolha = false;
  let cargaDescontosAlta = false;

  for (const p of payslipsAnalise) {
    const gross = Number(p.gross_salary) || 0;
    const disc = Number(p.total_discounts) || 0;
    if (gross > 200 && disc / gross >= 0.35) cargaDescontosAlta = true;

    for (const it of p.items ?? []) {
      if (itemEhConsignadoOuBanco(it)) {
        temRubricaConsignadoOuBancoNaFolha = true;
        break;
      }
    }
    if (temRubricaConsignadoOuBancoNaFolha) break;
  }

  return {
    temContracheques,
    temExtratoUltimos180d,
    temEmprestimoAtivoCadastrado,
    temRubricaConsignadoOuBancoNaFolha,
    cargaDescontosAlta,
  };
}

/** Score editorial para ordenar cartões conforme dados que você já tem no sistema. */
export function scoreBoletimRelevanteParaPerfil(b: BoletimMes, s: SinaisPerfilFinanceiro): number {
  let sc = 0;
  const tem = new Set(b.temas);
  if (tem.has("contracheque") && s.temContracheques) sc += 2;
  if ((tem.has("consignado") || tem.has("margem")) && s.temRubricaConsignadoOuBancoNaFolha) sc += 3;
  if (tem.has("extrato") && s.temExtratoUltimos180d) sc += 2;
  if ((tem.has("superendividamento") || tem.has("negociacao")) &&
    (s.temEmprestimoAtivoCadastrado || s.cargaDescontosAlta)) {
    sc += 2;
  }
  if (tem.has("venda_casada") && s.temRubricaConsignadoOuBancoNaFolha && s.temContracheques) sc += 1;
  if (tem.has("juros_encargos") || tem.has("informacao_tarifas")) {
    if (s.temExtratoUltimos180d) sc += 1;
    if (s.temContracheques) sc += 1;
  }
  if (tem.has("bacen_procon") && (s.temExtratoUltimos180d || s.temContracheques)) sc += 1;
  return sc;
}
