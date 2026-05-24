/**
 * Sugere novas perguntas ao catálogo do Perfil de Leitura quando padrões se repetem.
 */

import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import { CATALOGO_PERGUNTAS_LEITURA_VERSION } from "@/lib/leitura-analise/catalogo-perguntas-leitura";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import { listarAtualizacoesJuridicas } from "@/lib/juridico/base-atualizacoes-juridicas";

export type NivelPerguntaSugerida =
  | "basico"
  | "padrao"
  | "consignado"
  | "auditoria_oficial"
  | "avancado";

export type PerguntaSugeridaDinamica = {
  pergunta_sugerida: string;
  motivo: string;
  tipo_problema: string;
  nivel: NivelPerguntaSugerida;
  parametro_afetado: string;
  /** Evita duplicar sugestão na mesma sessão. */
  chave: string;
};

export type EntradaSugerirPerguntas = {
  base: BaseFinanceiraNormalizada;
  perfilLeitura?: ResultadoResolucaoPerfil;
  catalogoVersion?: string;
};

export function sugerirPerguntasDinamicas(input: EntradaSugerirPerguntas): PerguntaSugeridaDinamica[] {
  const { base } = input;
  const sugestoes: PerguntaSugeridaDinamica[] = [];
  const push = (s: PerguntaSugeridaDinamica) => {
    if (!sugestoes.some((x) => x.chave === s.chave)) sugestoes.push(s);
  };

  if (base.descontosFracionadosConciliados.length >= 2) {
    push({
      chave: "desconto_fracionado_recorrente",
      pergunta_sugerida:
        "Quando há dois ou mais descontos menores no mesmo mês para o mesmo banco, devo sempre tratar como desconto fracionado por margem?",
      motivo: `${base.descontosFracionadosConciliados.length} desconto(s) fracionado(s) conciliado(s) na base.`,
      tipo_problema: "desconto_fracionado",
      nivel: "consignado",
      parametro_afetado: "configAuditoria.conciliacao.aceitar_desconto_fracionado",
    });
  }

  if (base.refinanciamentosDescartados.length >= 1) {
    push({
      chave: "falso_refin_recorrente",
      pergunta_sugerida:
        "Devo exigir confirmação manual antes de marcar refinanciamento quando o ConsigFácil mostra contratos únicos no mesmo banco?",
      motivo: `${base.refinanciamentosDescartados.length} refinanciamento(s) descartado(s) por contrato único.`,
      tipo_problema: "falso_refinanciamento",
      nivel: "auditoria_oficial",
      parametro_afetado: "configAuditoria.refinanciamento.minimo_indicios",
    });
  }

  const margemAlta = base.margemHistorica.filter((m) => m.percentual_comprometido >= 35);
  if (margemAlta.length >= 2) {
    push({
      chave: "margem_ultrapassada",
      pergunta_sugerida:
        "Qual percentual de margem consignável deve disparar alerta crítico na análise?",
      motivo: `Margem comprometida em ${margemAlta.length} competência(s) (≥ 35%).`,
      tipo_problema: "margem_ultrapassada",
      nivel: "consignado",
      parametro_afetado: "limiar_margem_consignavel_pct",
    });
  }

  const loansSemEvidencia = base.contratosAnexados.filter(
    (c) => (c.evidencias_vinculadas as number) === 0,
  );
  if (loansSemEvidencia.length >= 2) {
    push({
      chave: "contrato_sem_anexo",
      pergunta_sugerida:
        "Contratos ativos sem PDF anexado devem bloquear análise jurídica ou apenas gerar pendência?",
      motivo: `${loansSemEvidencia.length} contrato(s) sem evidência vinculada.`,
      tipo_problema: "contrato_sem_anexo",
      nivel: "padrao",
      parametro_afetado: "exigir_contrato_formal",
    });
  }

  if (base.seguroVendaCasada.length >= 1) {
    push({
      chave: "seguro_embutido",
      pergunta_sugerida:
        "Rubricas de seguro/tarifa no contracheque devem ser sempre classificadas como venda casada?",
      motivo: `${base.seguroVendaCasada.length} linha(s) com indício de seguro embutido.`,
      tipo_problema: "seguro_embutido",
      nivel: "avancado",
      parametro_afetado: "classificacao_seguro_venda_casada",
    });
  }

  const decisoes = base.contratosAnexados;
  const juridicasNovas = listarAtualizacoesJuridicas().filter(
    (a) => a.tipo === "decisao_pessoal" && a.ativo,
  );
  if (juridicasNovas.length >= 1) {
    push({
      chave: "decisao_judicial_nova",
      pergunta_sugerida:
        "Há decisão judicial cadastrada que altera o peso do score jurídico — devo priorizar folha ou decisão?",
      motivo: `${juridicasNovas.length} decisão(ões) judicial(is) ativa(s) no cadastro.`,
      tipo_problema: "decisao_judicial",
      nivel: "auditoria_oficial",
      parametro_afetado: "peso_decisao_judicial_score",
    });
  }

  const divExtrato = base.conciliacaoFolhaExtrato.filter((c) => c.status !== "conciliado");
  if (divExtrato.length >= 3) {
    push({
      chave: "extrato_contraditorio",
      pergunta_sugerida:
        "Quando folha e extrato divergem em 3+ competências, qual fonte prevalece na conferência?",
      motivo: `${divExtrato.length} competência(s) com divergência folha × extrato.`,
      tipo_problema: "extrato_contraditorio",
      nivel: "padrao",
      parametro_afetado: "hierarquia_fontes.folha_vs_extrato",
    });
  }

  if (base.eventosOperacionaisConsignado.length >= 2) {
    push({
      chave: "evento_operacional_repetido",
      pergunta_sugerida:
        "Suspensão ou bloqueio no ConsigFácil deve impedir automaticamente inferência de refinanciamento?",
      motivo: `${base.eventosOperacionaisConsignado.length} evento(s) operacional(is) detectado(s).`,
      tipo_problema: "suspensao_operacional",
      nivel: "auditoria_oficial",
      parametro_afetado: "eventos_operacionais.suprimir_refin",
    });
  }

  if (base.riscoRefinForcado.some((r) => r.nivel === "alto" || r.nivel === "critico")) {
    push({
      chave: "refin_forcado",
      pergunta_sugerida:
        "Devo alertar o usuário quando detectar padrão de refinanciamento induzido após bloqueio de desconto?",
      motivo: "Risco alto/crítico de refinanciamento forçado na trilha operacional.",
      tipo_problema: "refinanciamento_induzido",
      nivel: "auditoria_oficial",
      parametro_afetado: "alerta_risco_refin_forcado",
    });
  }

  const catalogo = input.catalogoVersion ?? CATALOGO_PERGUNTAS_LEITURA_VERSION;
  const perfilCat = input.perfilLeitura?.catalogoVersion;
  if (perfilCat && perfilCat !== catalogo) {
    push({
      chave: "catalogo_desatualizado",
      pergunta_sugerida:
        "O catálogo de perguntas foi atualizado — deseja revisar respostas do Perfil de Leitura?",
      motivo: `Catálogo ${catalogo} vs perfil salvo ${perfilCat}.`,
      tipo_problema: "perfil_desatualizado",
      nivel: "basico",
      parametro_afetado: "catalogo_perguntas_version",
    });
  }

  return sugestoes;
}
