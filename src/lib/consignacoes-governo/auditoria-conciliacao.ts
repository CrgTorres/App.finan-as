/**
 * Auditoria de conciliação ConsigFácil — cada alteração automática ou
 * divergência vira uma linha rastreável para exportação e painel.
 *
 * Campos obrigatórios (pedido do usuário):
 *   - valor_anterior
 *   - valor_novo
 *   - origem
 *   - score
 *   - data
 *   - usuario
 *   - campo_alterado
 */

import type { ConsigfacilAjusteBase, ConsigfacilCampoAjustavel } from "@/types/consigfacil";
import type {
  LoanCorrigidoConsigfacil,
  LinhaMatchContratoCompleta,
} from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";

export type AuditoriaConciliacaoConsigfacil = {
  /** ID do alvo (loan.id, base_conciliada.id, etc.). */
  alvo_id: string;
  alvo_tipo: "loan" | "base_conciliada" | "consigfacil";
  id_consignacao: string | null;
  campo_alterado: string;
  valor_anterior: string | number | null;
  valor_novo: string | number | null;
  origem: string;
  score: number | null;
  data: string;
  usuario: string;
  tipo: "correcao_automatica" | "confirmacao" | "divergencia" | "match";
  motivo: string;
};

export type EntradaAuditoriaConciliacao = {
  ajustes: ConsigfacilAjusteBase[];
  loansCorrigidos: LoanCorrigidoConsigfacil[];
  matches: LinhaMatchContratoCompleta[];
  usuario?: string;
};

export function montarAuditoriaConciliacaoConsigfacil(
  input: EntradaAuditoriaConciliacao,
): AuditoriaConciliacaoConsigfacil[] {
  const { ajustes, loansCorrigidos, matches, usuario = "sistema" } = input;
  const linhas: AuditoriaConciliacaoConsigfacil[] = [];
  const agora = new Date().toISOString();

  // Ajustes (confirmações + divergências)
  for (const a of ajustes) {
    linhas.push({
      alvo_id: a.alvo_id,
      alvo_tipo: a.alvo_tipo === "loan" ? "loan" : "base_conciliada",
      id_consignacao: a.id_consignacao,
      campo_alterado: a.campo,
      valor_anterior: a.valor_original,
      valor_novo: a.valor_oficial,
      origem: `${a.fonte_original} → ${a.fonte_oficial}`,
      score: a.diferenca_pct,
      data: a.registrado_em,
      usuario,
      tipo: a.tipo_ajuste === "confirmado" ? "confirmacao" : "divergencia",
      motivo: a.motivo_ajuste,
    });
  }

  // Correções automáticas (score >= 90)
  for (const lc of loansCorrigidos) {
    for (const campo of lc.campos_corrigidos) {
      const antes = lc.loan_original_snapshot[campo];
      const depois = lc[campo];
      linhas.push({
        alvo_id: lc.id,
        alvo_tipo: "loan",
        id_consignacao: lc.id_consignacao_origem,
        campo_alterado: String(campo),
        valor_anterior: antes != null ? String(antes) : null,
        valor_novo: depois != null ? String(depois) : null,
        origem: "consigfacil_oficial",
        score: lc.score_match,
        data: lc.corrigido_em,
        usuario,
        tipo: "correcao_automatica",
        motivo: `Correção automática (score ${lc.score_match}) — campo ${String(campo)} sobrescrito pelo ConsigFácil.`,
      });
    }
  }

  // Matches (para rastrear decisões de matching)
  for (const m of matches) {
    if (m.faixa === "sem_match") continue;
    linhas.push({
      alvo_id: m.loan_id ?? m.id_consignacao,
      alvo_tipo: m.loan_id ? "loan" : "consigfacil",
      id_consignacao: m.id_consignacao,
      campo_alterado: "match",
      valor_anterior: null,
      valor_novo: m.faixa,
      origem: "consigfacil_oficial",
      score: m.score,
      data: agora,
      usuario,
      tipo: "match",
      motivo: `Match ${m.faixa} (score ${m.score}) — ação: ${m.acao_aplicada}.`,
    });
  }

  linhas.sort((a, b) => a.data.localeCompare(b.data));
  return linhas;
}
