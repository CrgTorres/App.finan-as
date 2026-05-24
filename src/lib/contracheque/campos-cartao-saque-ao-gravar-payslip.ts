import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedPayslipPayload } from "@/lib/anexos/sead-payslip-parse";
import {
  detectarCartaoSaqueEmRubricasContracheque,
  type PayslipHistoricoRubricaMin,
} from "@/lib/contracheque/detectar-cartao-saque-em-rubricas-contracheque";
import type { AnaliseCartaoSaqueContracheque, CamposCartaoSaqueEmbutidoPayslip } from "@/types/cartao-saque-embutido";
import { ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE } from "@/types/cartao-saque-embutido";
import type { Payslip } from "@/types/contracheque";

export function analiseCartaoSaqueParaCamposPayslip(
  analise: AnaliseCartaoSaqueContracheque,
): CamposCartaoSaqueEmbutidoPayslip {
  const rubricas = analise.rubricas;
  const termos = [...new Set(rubricas.map((r) => r.termoEncontrado))];
  const somaValor = rubricas.reduce((s, r) => s + r.valorDescontado, 0);
  const banco =
    rubricas.find((r) => r.bancoPossivel)?.bancoPossivel ??
    null;

  return {
    cartao_saque_embutido_detectado: analise.encontrado,
    cartao_saque_tipo: rubricas[0]?.termoEncontrado ?? null,
    cartao_saque_risco: analise.encontrado ? analise.nivel_risco_global : null,
    cartao_saque_termos: termos.length ? termos : null,
    cartao_saque_linhas: rubricas.length ? rubricas.map((r) => r.nomeRubrica) : null,
    cartao_saque_valor_mensal: somaValor > 0 ? Math.round(somaValor * 100) / 100 : null,
    cartao_saque_banco_possivel: banco,
    cartao_saque_observacao: analise.encontrado ? ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE : null,
    cartao_saque_status_conferencia: analise.encontrado ? "pendente_conferencia" : null,
    cartao_saque_analise_json: analise.encontrado ? analise : null,
  };
}

export function anexarCartaoSaqueAoPayloadParsed(
  parsed: ParsedPayslipPayload,
  month: number,
  year: number,
  historico: PayslipHistoricoRubricaMin[] = [],
): ParsedPayslipPayload {
  const analise = detectarCartaoSaqueEmRubricasContracheque(parsed.items ?? [], { mes: month, ano: year }, historico);
  return { ...parsed, cartaoSaqueContracheque: analise };
}

export function historicoRubricaDePayslips(payslips: Payslip[]): PayslipHistoricoRubricaMin[] {
  return payslips.map((p) => ({
    mes: p.month,
    ano: p.year,
    items: p.items ?? [],
  }));
}

/** Calcula colunas `cartao_saque_*` ao importar/atualizar contracheque (rubricas de desconto). */
export async function camposCartaoSaqueParaGravarPayslip(
  supabase: SupabaseClient,
  userId: string,
  parsed: ParsedPayslipPayload,
  month: number,
  year: number,
): Promise<Record<string, unknown>> {
  const { data: historicoRows } = await supabase
    .from("payslips")
    .select("month, year, items")
    .eq("user_id", userId)
    .limit(120);

  const historico: PayslipHistoricoRubricaMin[] = (historicoRows ?? [])
    .filter((r) => !(r.month === month && r.year === year))
    .map((r) => ({
      mes: r.month as number,
      ano: r.year as number,
      items: (r.items as Payslip["items"]) ?? [],
    }));

  const analise =
    parsed.cartaoSaqueContracheque ??
    detectarCartaoSaqueEmRubricasContracheque(parsed.items ?? [], { mes: month, ano: year }, historico);

  return analiseCartaoSaqueParaCamposPayslip(analise) as Record<string, unknown>;
}

/** Sem round-trip ao Supabase — use em «Gravar todos» da ficha corrida. */
export function camposCartaoSaqueLocalParaGravar(
  parsed: ParsedPayslipPayload,
  month: number,
  year: number,
  historico: PayslipHistoricoRubricaMin[] = [],
): Record<string, unknown> {
  const historicoFiltrado = historico.filter((h) => !(h.mes === month && h.ano === year));
  const analise =
    parsed.cartaoSaqueContracheque ??
    detectarCartaoSaqueEmRubricasContracheque(parsed.items ?? [], { mes: month, ano: year }, historicoFiltrado);
  return analiseCartaoSaqueParaCamposPayslip(analise) as Record<string, unknown>;
}
