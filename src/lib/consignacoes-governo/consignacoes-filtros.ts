/**
 * Filtros compartilhados pela página `/dashboard/consignacoes`.
 *
 * Vivem fora do componente para que filtros aplicados sejam reaproveitáveis em
 * todos os gráficos (linha do tempo, evolução mensal, total por banco, etc.).
 */

import type { ConsignacaoOrdenadaLinha } from "@/lib/consignacoes-governo/consolidar-consignacoes-ordenadas";
import type { ConsigfacilStatus } from "@/types/consigfacil";

export type FaixaRiscoFiltro = "todos" | "alto_confianca" | "baixa_confianca" | "sem_correspondencia";

export type FiltrosConsignacoes = {
  /** `null` = "todos". Lista de `instituicao_oficial`. */
  bancos: string[] | null;
  /** `null` = "todas". Lista de `grupo_canonico` ou `modalidade_oficial`. */
  modalidades: string[] | null;
  /** `null` = "todos". Lista de `ConsigfacilStatus`. */
  status: ConsigfacilStatus[] | null;
  /** Período em yyyy-mm; `null` = sem limite. */
  competencia_de: string | null;
  competencia_ate: string | null;
  /** Tipos de margem (filtros adicionais). */
  margens: Array<"margem_consignavel" | "margem_cartao" | "margem_cartao_beneficio" | "sem_margem"> | null;
  /** Faixa de confiança. */
  faixa_confianca: FaixaRiscoFiltro;
  /** true = somente confirmadas. */
  apenas_confirmado_consigfacil: boolean;
  /** true = somente com divergência. */
  apenas_divergencia: boolean;
};

export const FILTROS_VAZIOS: FiltrosConsignacoes = {
  bancos: null,
  modalidades: null,
  status: null,
  competencia_de: null,
  competencia_ate: null,
  margens: null,
  faixa_confianca: "todos",
  apenas_confirmado_consigfacil: false,
  apenas_divergencia: false,
};

function dentroDoPeriodo(linha: ConsignacaoOrdenadaLinha, de: string | null, ate: string | null): boolean {
  if (!de && !ate) return true;
  // Uma linha está dentro do período se HOUVER interseção entre [primeiro, ultimo]
  // e [de, ate]. Se a linha não tem primeiro_desconto, consideramos fora.
  const p = linha.primeiro_desconto;
  const u = linha.ultimo_desconto ?? p;
  if (!p || !u) return false;
  if (de && u < de) return false;
  if (ate && p > ate) return false;
  return true;
}

export function aplicarFiltrosConsignacoes(
  linhas: ConsignacaoOrdenadaLinha[],
  f: FiltrosConsignacoes,
): ConsignacaoOrdenadaLinha[] {
  return linhas.filter((l) => {
    if (f.bancos && !f.bancos.includes(l.instituicao_oficial)) return false;
    if (
      f.modalidades &&
      !f.modalidades.includes(l.grupo_canonico) &&
      !f.modalidades.includes(String(l.modalidade_oficial ?? ""))
    ) {
      return false;
    }
    if (f.status && !f.status.includes(l.status_oficial)) return false;
    if (!dentroDoPeriodo(l, f.competencia_de, f.competencia_ate)) return false;
    if (f.margens) {
      const tag: NonNullable<FiltrosConsignacoes["margens"]>[number] =
        l.tipo_margem == null
          ? "sem_margem"
          : l.tipo_margem === "margem_consignavel"
            ? "margem_consignavel"
            : l.tipo_margem === "margem_cartao"
              ? "margem_cartao"
              : l.tipo_margem === "margem_cartao_beneficio"
                ? "margem_cartao_beneficio"
                : "sem_margem";
      if (!f.margens.includes(tag)) return false;
    }
    if (f.faixa_confianca === "alto_confianca" && l.grau_confianca < 80) return false;
    if (f.faixa_confianca === "baixa_confianca" && l.grau_confianca >= 80) return false;
    if (
      f.faixa_confianca === "sem_correspondencia" &&
      l.fonte_principal !== "sem_correspondencia"
    ) {
      return false;
    }
    if (f.apenas_confirmado_consigfacil && !l.confirmado_consigfacil) return false;
    if (f.apenas_divergencia && !l.divergencia_consigfacil) return false;
    return true;
  });
}
