import type { SupabaseClient } from "@supabase/supabase-js";
import {
  detectarCartaoOuSaqueEmbutido,
  montarLinhasAnalisaveisDePayslipItems,
} from "@/lib/contracheque/detectar-cartao-ou-saque-embutido";
import { mensagemErroCartaoSaquePayslip } from "@/lib/contracheque/mensagem-erro-cartao-saque-payslip";
import type { Payslip, PayslipItem } from "@/types/contracheque";
import type {
  AnaliseCartaoSaqueContracheque,
  ResultadoDeteccaoCartaoSaqueEmbutido,
} from "@/types/cartao-saque-embutido";

type PayslipReprocessavel = Pick<Payslip, "id" | "month" | "year" | "items" | "raw_text">;

export type ResultadoReprocessamentoCartaoSaque = {
  analisados: number;
  atualizados: number;
  alertasEncontrados: number;
  recorrentes: number;
  erros: number;
  colunasProntas: boolean;
  primeiraMensagemErro: string | null;
};

function normalizarItemsPayslip(items: unknown): PayslipItem[] {
  if (Array.isArray(items)) return items as PayslipItem[];
  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items) as unknown;
      return Array.isArray(parsed) ? (parsed as PayslipItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function camposPersistenciaCartaoSaque(
  resultado: ResultadoDeteccaoCartaoSaqueEmbutido,
): Record<string, unknown> {
  const analise = resultado.analiseContracheque ?? null;
  return {
    cartao_saque_embutido_detectado: resultado.encontrado,
    cartao_saque_tipo: resultado.encontrado ? resultado.tipo_detectado : null,
    cartao_saque_risco: resultado.encontrado ? resultado.nivel_risco : null,
    cartao_saque_termos: resultado.termos_encontrados.length ? resultado.termos_encontrados : null,
    cartao_saque_linhas: resultado.linhas_suspeitas.length ? resultado.linhas_suspeitas : null,
    cartao_saque_valor_mensal: resultado.valor_mensal_estimado,
    cartao_saque_banco_possivel: resultado.banco_possivel,
    cartao_saque_analise_json: resultado.encontrado ? analise ?? resultado : null,
  };
}

function historicoParaDeteccao(rows: PayslipReprocessavel[]) {
  return rows.map((p) => ({
    mes: p.month,
    ano: p.year,
    raw_text: p.raw_text ?? "",
    items: normalizarItemsPayslip(p.items),
  }));
}

function contarRubricasRecorrentes(analise: AnaliseCartaoSaqueContracheque | null | undefined): number {
  return analise?.rubricas.filter((r) => r.descontoRecorrente).length ?? 0;
}

async function verificarColunasCartaoSaque(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("payslips").select("cartao_saque_embutido_detectado").limit(1);
  if (!error) return true;
  if (/column|schema cache|cartao_saque/i.test(error.message)) return false;
  throw new Error(mensagemErroCartaoSaquePayslip(error.message));
}

async function buscarPayslipsDoUsuario(supabase: SupabaseClient): Promise<PayslipReprocessavel[]> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr) throw new Error(mensagemErroCartaoSaquePayslip(authErr.message));
  if (!user) throw new Error("Sessão expirada. Faça login novamente.");

  const pageSize = 500;
  const rows: PayslipReprocessavel[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("payslips")
      .select("id, month, year, items, raw_text")
      .eq("user_id", user.id)
      .order("year", { ascending: true })
      .order("month", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(mensagemErroCartaoSaquePayslip(error.message));
    const chunk = (data ?? []) as PayslipReprocessavel[];
    rows.push(
      ...chunk.map((p) => ({
        ...p,
        items: normalizarItemsPayslip(p.items),
      })),
    );
    if (chunk.length < pageSize) break;
  }
  return rows;
}

/**
 * Reprocessa folhas já gravadas sem tocar em conferência/observação manual.
 * Prioriza rubricas em `items` (tabela importada), não o OCR bruto.
 */
export async function reprocessarCartaoSaqueContracheques(
  supabase: SupabaseClient,
): Promise<ResultadoReprocessamentoCartaoSaque> {
  const colunasProntas = await verificarColunasCartaoSaque(supabase);
  const rows = await buscarPayslipsDoUsuario(supabase);
  const historico = historicoParaDeteccao(rows);

  const resumo: ResultadoReprocessamentoCartaoSaque = {
    analisados: rows.length,
    atualizados: 0,
    alertasEncontrados: 0,
    recorrentes: 0,
    erros: 0,
    colunasProntas,
    primeiraMensagemErro: null,
  };

  if (!colunasProntas) {
    resumo.primeiraMensagemErro =
      "Execute supabase/patch_payslips_cartao_saque_embutido.sql no Supabase antes de gravar.";
    return resumo;
  }

  for (const row of rows) {
    try {
      const competencia = { mes: row.month, ano: row.year };
      const items = normalizarItemsPayslip(row.items);
      const lancamentos = montarLinhasAnalisaveisDePayslipItems(items, competencia);
      const resultado = detectarCartaoOuSaqueEmbutido("", lancamentos, {
        competencia,
        payslipsHistorico: historico.filter((p) => !(p.mes === row.month && p.ano === row.year)),
        temContratoFormalVinculado: false,
      });
      const update = camposPersistenciaCartaoSaque(resultado);

      const { error } = await supabase.from("payslips").update(update).eq("id", row.id);
      if (error) throw new Error(mensagemErroCartaoSaquePayslip(error.message));

      resumo.atualizados += 1;
      if (resultado.encontrado) resumo.alertasEncontrados += 1;
      resumo.recorrentes += contarRubricasRecorrentes(resultado.analiseContracheque);

      console.info("[cartao-saque] contracheque atualizado", {
        id: row.id,
        detectado: resultado.encontrado,
        rubricas: resultado.analiseContracheque?.rubricas.length ?? 0,
      });
    } catch (error) {
      resumo.erros += 1;
      const msg = error instanceof Error ? error.message : String(error);
      if (!resumo.primeiraMensagemErro) resumo.primeiraMensagemErro = msg;
      console.warn("[cartao-saque] falha ao atualizar contracheque", {
        id: row.id,
        error: msg,
      });
    }
  }

  return resumo;
}
