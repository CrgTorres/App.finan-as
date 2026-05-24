/**
 * Aplica resultado da triagem: localStorage, padrões aprendidos e status manual.
 */

import type { StatusManualUsuario } from "@/lib/conciliacao/conciliacao-financeira";
import type {
  ContextoTriagem,
  PadraoAprendidoTriagem,
  RespostasTriagem,
  ResultadoResolucaoTriagem,
  TriagemResolvidaLocal,
  TipoProblemaTriagem,
} from "@/lib/triagem/triagem-inteligente-tipos";

export const STORAGE_TRIAGEM_RESOLVIDAS = "financaTriagemResolvidasV1";
export const STORAGE_TRIAGEM_PADROES = "financaTriagemPadroesAprendidosV1";
export const TRIAGEM_ATUALIZADA = "financa:triagem-atualizada";

export type ResultadoAplicacaoTriagem = {
  ok: boolean;
  mensagem: string;
  remover_pendencia: boolean;
  status_manual_sugerido?: StatusManualUsuario;
  entidade_id: string;
};

type StoreResolvidas = {
  version: 1;
  byEntidadeId: Record<string, TriagemResolvidaLocal>;
};

type StorePadroes = {
  version: 1;
  padroes: PadraoAprendidoTriagem[];
};

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function emitAtualizada(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TRIAGEM_ATUALIZADA));
}

export function carregarTriagensResolvidas(): Record<string, TriagemResolvidaLocal> {
  const storage = ls();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_TRIAGEM_RESOLVIDAS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoreResolvidas;
    return parsed.byEntidadeId ?? {};
  } catch {
    return {};
  }
}

export function carregarPadroesAprendidos(): PadraoAprendidoTriagem[] {
  const storage = ls();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_TRIAGEM_PADROES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StorePadroes;
    return parsed.padroes ?? [];
  } catch {
    return [];
  }
}

function statusManualDeClassificacao(classificacao: string): StatusManualUsuario | undefined {
  switch (classificacao) {
    case "salario_liquido_conciliado":
      return "salario";
    case "transferencia_propria":
      return "transferencia_propria";
    case "emprestimo_creditado_extrato":
    case "emprestimo_confirmado":
      return "emprestimo_pessoal";
    case "possivel_duplicidade":
      return "duplicidade_contracheque";
    case "desconto_fracionado_por_margem":
    case "nao_refinanciamento_confirmado":
    case "conciliado":
    case "conciliado_com_documento":
    case "confirmado_consigfacil":
    case "cartao_consignado_confirmado":
      return undefined;
    default:
      if (classificacao.includes("pendencia") || classificacao === "pendencia_mantida") {
        return undefined;
      }
      return undefined;
  }
}

function registrarPadraoAprendido(
  tipo: TipoProblemaTriagem,
  respostas: RespostasTriagem,
  resultado: ResultadoResolucaoTriagem,
): void {
  if (!resultado.registrar_padrao || !resultado.resolvido) return;
  const storage = ls();
  if (!storage) return;

  const padroes = carregarPadroesAprendidos();
  const novo: PadraoAprendidoTriagem = {
    id: `pad_${tipo}_${Date.now()}`,
    tipo_problema: tipo,
    condicoes: { ...respostas },
    acao_recomendada: resultado.nova_classificacao,
    nivel_confianca: resultado.nivel_confianca,
    ativo: true,
    criado_em: new Date().toISOString(),
  };
  padroes.push(novo);
  const payload: StorePadroes = { version: 1, padroes: padroes.slice(-200) };
  storage.setItem(STORAGE_TRIAGEM_PADROES, JSON.stringify(payload));
}

/** Verifica se há padrão aprendido que sugere resolução automática. */
export function buscarPadraoAprendido(
  tipo: TipoProblemaTriagem,
  respostasParciais: RespostasTriagem,
): PadraoAprendidoTriagem | null {
  const padroes = carregarPadroesAprendidos().filter(
    (p) => p.ativo && p.tipo_problema === tipo && p.nivel_confianca >= 0.75,
  );
  for (const p of padroes) {
    const cond = p.condicoes as Record<string, string>;
    const match = Object.keys(cond).every((k) => respostasParciais[k] === cond[k]);
    if (match) return p;
  }
  return null;
}

export function entidadeTriagemResolvida(entidadeId: string): TriagemResolvidaLocal | null {
  return carregarTriagensResolvidas()[entidadeId] ?? null;
}

export function pendenciaOcultaPorTriagem(entidadeId: string): boolean {
  const r = entidadeTriagemResolvida(entidadeId);
  return !!r?.resultado.remover_pendencia;
}

export function aplicarRespostasTriagem(input: {
  contexto: ContextoTriagem;
  respostas: RespostasTriagem;
  resultado: ResultadoResolucaoTriagem;
}): ResultadoAplicacaoTriagem {
  const { contexto, respostas, resultado } = input;
  const storage = ls();

  const registro: TriagemResolvidaLocal = {
    entidade_id: contexto.entidade_id,
    tipo_problema: contexto.tipo_problema,
    resultado,
    respostas,
    atualizado_em: new Date().toISOString(),
  };

  if (storage) {
    const atual = carregarTriagensResolvidas();
    atual[contexto.entidade_id] = registro;
    const payload: StoreResolvidas = { version: 1, byEntidadeId: atual };
    storage.setItem(STORAGE_TRIAGEM_RESOLVIDAS, JSON.stringify(payload));
    registrarPadraoAprendido(contexto.tipo_problema, respostas, resultado);
    emitAtualizada();
  }

  const status_manual_sugerido = statusManualDeClassificacao(resultado.nova_classificacao);

  let mensagem = resultado.motivo;
  if (resultado.remover_pendencia) {
    mensagem = `${mensagem} Pendência removida da conferência.`;
  } else if (resultado.manter_pendencia) {
    mensagem = `${mensagem} Pendência mantida.`;
  }
  if (resultado.proxima_acao === "pedir_contrato") {
    mensagem += " Anexe o contrato na aba de empréstimos.";
  }
  if (resultado.proxima_acao === "revisao_especialista") {
    mensagem += " Recomendada revisão especialista.";
  }

  return {
    ok: resultado.resolvido || resultado.remover_pendencia,
    mensagem,
    remover_pendencia: resultado.remover_pendencia,
    status_manual_sugerido,
    entidade_id: contexto.entidade_id,
  };
}
