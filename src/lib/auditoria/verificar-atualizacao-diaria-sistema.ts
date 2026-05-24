/**
 * Rotina diária: detecta documentos novos/alterados e marca necessidade de reprocessamento.
 */

import type { ConsigfacilSnapshot } from "@/types/consigfacil";
import type { Loan, Payslip } from "@/types/contracheque";
import type { LoanEvidence } from "@/types/loan-evidence";
import type { Transaction } from "@/types";
import { CATALOGO_PERGUNTAS_LEITURA_VERSION } from "@/lib/leitura-analise/catalogo-perguntas-leitura";
import { listarAtualizacoesJuridicas } from "@/lib/juridico/base-atualizacoes-juridicas";
import { carregarPerfilLeituraPersistido } from "@/lib/leitura-analise/perfil-leitura-storage";

export const STORAGE_ULTIMA_VERIFICACAO_DIARIA = "financa:ultima-verificacao-diaria:v1";

export type ItemVerificacaoDiaria = {
  tipo: string;
  descricao: string;
  data_referencia: string | null;
  precisa_reprocessar: boolean;
};

export type ResultadoVerificacaoDiaria = {
  verificado_em: string;
  itens: ItemVerificacaoDiaria[];
  precisa_reprocessar_global: boolean;
  avisos: string[];
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function maxIso(dates: (string | null | undefined)[]): string | null {
  let max: string | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!max || d > max) max = d;
  }
  return max;
}

export function lerUltimaVerificacaoDiaria(): string | null {
  return storage()?.getItem(STORAGE_ULTIMA_VERIFICACAO_DIARIA) ?? null;
}

export function gravarUltimaVerificacaoDiaria(iso: string): void {
  storage()?.setItem(STORAGE_ULTIMA_VERIFICACAO_DIARIA, iso);
}

export function verificarAtualizacaoDiariaSistema(input: {
  transactions: Transaction[];
  payslips: Payslip[];
  loans: Loan[];
  evidencias: LoanEvidence[];
  snapshotsConsigfacil: ConsigfacilSnapshot[];
  /** ISO da última verificação; se omitido, lê do localStorage. */
  ultimaVerificacao?: string | null;
}): ResultadoVerificacaoDiaria {
  const ultima = input.ultimaVerificacao ?? lerUltimaVerificacaoDiaria();
  const agora = new Date().toISOString();
  const itens: ItemVerificacaoDiaria[] = [];
  const avisos: string[] = [];

  /** Só compara após baseline; primeira visita apenas registra data sem marcar reprocessamento. */
  const depois = (iso: string | null) => !!ultima && iso != null && iso > ultima;

  const maxTx = maxIso(input.transactions.map((t) => t.created_at ?? t.date));
  if (input.transactions.length > 0 && depois(maxTx)) {
    itens.push({
      tipo: "transacoes",
      descricao: "Transações novas ou alteradas desde a última verificação.",
      data_referencia: maxTx,
      precisa_reprocessar: true,
    });
  }

  const maxPs = maxIso(
    input.payslips.map((p) => p.created_at ?? `${p.year}-${String(p.month).padStart(2, "0")}-01`),
  );
  if (input.payslips.length > 0 && depois(maxPs)) {
    itens.push({
      tipo: "payslips",
      descricao: "Contracheques ou fichas financeiras atualizados.",
      data_referencia: maxPs,
      precisa_reprocessar: true,
    });
  }

  const maxEv = maxIso(input.evidencias.map((e) => e.created_at));
  if (input.evidencias.length > 0 && depois(maxEv)) {
    itens.push({
      tipo: "evidencias",
      descricao: "Novas evidências/contratos anexados ou reprocessados.",
      data_referencia: maxEv,
      precisa_reprocessar: true,
    });
  }

  const maxSnap = maxIso(input.snapshotsConsigfacil.map((s) => s.capturado_em));
  if (input.snapshotsConsigfacil.length > 0 && depois(maxSnap)) {
    itens.push({
      tipo: "consigfacil",
      descricao: "Novo snapshot ConsigFácil capturado.",
      data_referencia: maxSnap,
      precisa_reprocessar: true,
    });
  }

  const maxLoan = maxIso(input.loans.map((l) => l.created_at ?? l.start_date));
  if (input.loans.length > 0 && depois(maxLoan)) {
    itens.push({
      tipo: "loans",
      descricao: "Cadastro de empréstimos alterado.",
      data_referencia: maxLoan,
      precisa_reprocessar: true,
    });
  }

  const perfil = carregarPerfilLeituraPersistido();
  if (perfil && perfil.catalogoVersion !== CATALOGO_PERGUNTAS_LEITURA_VERSION) {
    itens.push({
      tipo: "catalogo_perguntas",
      descricao: "Catálogo de perguntas do Perfil de Leitura desatualizado.",
      data_referencia: perfil.atualizadoEm,
      precisa_reprocessar: false,
    });
    avisos.push("Revise o Perfil de Leitura — há perguntas novas no catálogo.");
  }

  const juridicas = listarAtualizacoesJuridicas().filter((j) => j.ativo);
  const maxJur = maxIso(juridicas.map((j) => j.data));
  if (juridicas.length > 0 && depois(maxJur)) {
    itens.push({
      tipo: "atualizacao_juridica",
      descricao: "Lei, jurisprudência ou decisão judicial nova cadastrada.",
      data_referencia: maxJur,
      precisa_reprocessar: true,
    });
    avisos.push("Atualização jurídica pode impactar score e exportação.");
  }

  if (!ultima) {
    avisos.push("Primeira verificação diária — baseline registrado.");
  }

  gravarUltimaVerificacaoDiaria(agora);

  return {
    verificado_em: agora,
    itens,
    precisa_reprocessar_global: itens.some((i) => i.precisa_reprocessar),
    avisos,
  };
}
