import {
  CATALOGO_PERGUNTAS_LEITURA_VERSION,
  respostasPadraoFormulario,
} from "@/lib/leitura-analise/catalogo-perguntas-leitura";
import {
  parametrosLeituraPadrao,
  resolverPerfilLeitura,
  type ResultadoResolucaoPerfil,
} from "@/lib/leitura-analise/resolver-perfil-leitura";
import type {
  PerfilLeituraPersistido,
  RespostasFormularioLeitura,
} from "@/lib/leitura-analise/types-perfil-leitura";

export const STORAGE_KEY_PERFIL_LEITURA = "financaPerfilLeituraAnaliseV1";
export const PERFIL_LEITURA_ATUALIZADO = "financa:perfil-leitura-atualizado";

const PERSIST_VERSION = 1;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function carregarPerfilLeituraPersistido(): PerfilLeituraPersistido | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(STORAGE_KEY_PERFIL_LEITURA);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PerfilLeituraPersistido;
    if (parsed.version !== PERSIST_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function salvarPerfilLeitura(respostas: RespostasFormularioLeitura): ResultadoResolucaoPerfil {
  const resolvido = resolverPerfilLeitura(respostas);
  const payload: PerfilLeituraPersistido = {
    version: PERSIST_VERSION,
    catalogoVersion: CATALOGO_PERGUNTAS_LEITURA_VERSION,
    respostas,
    atualizadoEm: new Date().toISOString(),
    nivelResolvido: resolvido.nivel,
  };
  const ls = storage();
  if (ls) {
    ls.setItem(STORAGE_KEY_PERFIL_LEITURA, JSON.stringify(payload));
    window.dispatchEvent(
      new CustomEvent(PERFIL_LEITURA_ATUALIZADO, { detail: { perfil: resolvido } }),
    );
  }
  return resolvido;
}

export function carregarRespostasFormulario(): RespostasFormularioLeitura {
  const salvo = carregarPerfilLeituraPersistido();
  if (salvo?.respostas) {
    const padrao = respostasPadraoFormulario();
    return { ...padrao, ...salvo.respostas };
  }
  return respostasPadraoFormulario();
}

/** Parâmetros ativos para pipelines (conciliação / ConsigFácil). */
export function obterParametrosLeituraAtivos(): ResultadoResolucaoPerfil {
  const salvo = carregarPerfilLeituraPersistido();
  if (!salvo) return parametrosLeituraPadrao();
  if (salvo.catalogoVersion !== CATALOGO_PERGUNTAS_LEITURA_VERSION) {
    const mesclado = { ...respostasPadraoFormulario(), ...salvo.respostas };
    return resolverPerfilLeitura(mesclado);
  }
  return resolverPerfilLeitura(salvo.respostas);
}

export function limparPerfilLeitura(): void {
  const ls = storage();
  ls?.removeItem(STORAGE_KEY_PERFIL_LEITURA);
  window.dispatchEvent(new CustomEvent(PERFIL_LEITURA_ATUALIZADO));
}

export function catalogoDesatualizado(): boolean {
  const salvo = carregarPerfilLeituraPersistido();
  return !!salvo && salvo.catalogoVersion !== CATALOGO_PERGUNTAS_LEITURA_VERSION;
}

/** Atualiza preferência de visualização consolidada na triagem (perfil de leitura). */
export function salvarPreferenciaVisualizacaoConsolidada(ativa: boolean): ResultadoResolucaoPerfil {
  const respostas = carregarRespostasFormulario();
  respostas.visualizacao_triagem_consolidada = ativa ? "sim" : "nao";
  return salvarPerfilLeitura(respostas);
}
