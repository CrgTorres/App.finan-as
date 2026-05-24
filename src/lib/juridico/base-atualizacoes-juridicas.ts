/**
 * Cadastro de leis, jurisprudências e decisões que impactam scores e perguntas.
 */

export type TipoAtualizacaoJuridica =
  | "lei"
  | "jurisprudencia"
  | "decisao_pessoal"
  | "tese"
  | "sumula";

export type ImpactoAtualizacaoJuridica =
  | "novo_alerta"
  | "aumenta_score"
  | "reduz_score"
  | "nova_pergunta"
  | "nova_exportacao";

export type AtualizacaoJuridica = {
  id: string;
  tipo: TipoAtualizacaoJuridica;
  tema: string;
  tribunal?: string;
  processo?: string;
  data: string;
  resumo: string;
  regra_afetada: string;
  impacto_no_sistema: ImpactoAtualizacaoJuridica;
  fonte: string;
  ativo: boolean;
};

export const STORAGE_ATUALIZACOES_JURIDICAS = "financa:atualizacoes-juridicas:v1";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function listarAtualizacoesJuridicas(): AtualizacaoJuridica[] {
  const ls = storage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(STORAGE_ATUALIZACOES_JURIDICAS);
    if (!raw) return [];
    return JSON.parse(raw) as AtualizacaoJuridica[];
  } catch {
    return [];
  }
}

export function salvarAtualizacoesJuridicas(itens: AtualizacaoJuridica[]): void {
  const ls = storage();
  if (!ls) return;
  ls.setItem(STORAGE_ATUALIZACOES_JURIDICAS, JSON.stringify(itens));
}

export function registrarAtualizacaoJuridica(item: Omit<AtualizacaoJuridica, "id"> & { id?: string }): AtualizacaoJuridica {
  const lista = listarAtualizacoesJuridicas();
  const novo: AtualizacaoJuridica = {
    ...item,
    id: item.id ?? `jur-${Date.now()}`,
    ativo: item.ativo ?? true,
  };
  const idx = lista.findIndex((x) => x.id === novo.id);
  if (idx >= 0) lista[idx] = novo;
  else lista.unshift(novo);
  salvarAtualizacoesJuridicas(lista);
  return novo;
}

/** Linhas para exportação `Jurisprudencia_Aplicada` / `Atualizacoes_Juridicas`. */
export function linhasExportacaoAtualizacoesJuridicas(): Array<Record<string, string | boolean>> {
  return listarAtualizacoesJuridicas()
    .filter((a) => a.ativo)
    .map((a) => ({
      id: a.id,
      tipo: a.tipo,
      tema: a.tema,
      tribunal: a.tribunal ?? "",
      processo: a.processo ?? "",
      data: a.data,
      resumo: a.resumo,
      regra_afetada: a.regra_afetada,
      impacto_no_sistema: a.impacto_no_sistema,
      fonte: a.fonte,
      ativo: a.ativo,
    }));
}

/** Registra decisão judicial de evidência como atualização aplicável. */
export function registrarDecisaoJudicialDeEvidencia(input: {
  processo?: string;
  resumo: string;
  data: string;
  fonte: string;
}): AtualizacaoJuridica {
  return registrarAtualizacaoJuridica({
    tipo: "decisao_pessoal",
    tema: "decisao_judicial_consignado",
    processo: input.processo,
    data: input.data,
    resumo: input.resumo,
    regra_afetada: "score_juridico_consignado",
    impacto_no_sistema: "aumenta_score",
    fonte: input.fonte,
    ativo: true,
  });
}
