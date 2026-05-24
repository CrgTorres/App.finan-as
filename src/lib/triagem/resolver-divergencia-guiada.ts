/**
 * Motor de resolução guiada — 5 etapas antes de manter divergência como erro.
 */

import { validarDescontoFracionadoPorMargem } from "@/lib/consignacoes-governo/validar-desconto-fracionado-margem";
import {
  detectarDescontoFracionadoPorMargem,
  linhaFolhaMesDeBaseConciliada,
  MENSAGEM_DESCONTO_FRACIONADO_MARGEM,
} from "@/lib/contratos/detectar-desconto-fracionado-margem";
import {
  buscarAprendizadoParaDivergencia,
  type RegistroAprendizadoDivergencia,
} from "@/lib/triagem/aprendizado-divergencias";
import type {
  ClassificacaoResolucaoDivergencia,
  ContextoDivergenciaGuiada,
  DivergenciaTriagemEntrada,
  EtapaMotorResolucao,
  NivelRiscoResolucao,
  PerguntaResolutivaDivergencia,
  ResultadoResolucaoGuiada,
} from "@/lib/triagem/triagem-resolutiva-tipos";

function resultadoBase(parcial: Partial<ResultadoResolucaoGuiada>): ResultadoResolucaoGuiada {
  return {
    resolvido: false,
    remover_conferencia: false,
    classificacao: "pendente_usuario",
    explicacao: "",
    origem: "nao_resolvido",
    etapa_aplicada: null,
    etapas_verificadas: [],
    nivel_risco: "medio",
    acao_tomada: "aguardar",
    aprendizado_sugerido: false,
    perguntas_pendentes: [],
    campos_aplicados: {},
    confianca: 0.3,
    ...parcial,
  };
}

function resolvidoAuto(
  classificacao: ClassificacaoResolucaoDivergencia,
  etapa: EtapaMotorResolucao,
  explicacao: string,
  opts: {
    remover?: boolean;
    risco?: NivelRiscoResolucao;
    campos?: Record<string, unknown>;
    confianca?: number;
    origem?: ResultadoResolucaoGuiada["origem"];
    aprendizado?: boolean;
  } = {},
): ResultadoResolucaoGuiada {
  return resultadoBase({
    resolvido: true,
    remover_conferencia: opts.remover ?? true,
    classificacao,
    explicacao,
    origem: opts.origem ?? "automatica_motor",
    etapa_aplicada: etapa,
    nivel_risco: opts.risco ?? "baixo",
    acao_tomada: "classificar_e_remover_conferencia",
    campos_aplicados: opts.campos ?? {},
    confianca: opts.confianca ?? 0.88,
    aprendizado_sugerido: opts.aprendizado ?? false,
  });
}

function etapa1EventoOperacional(ctx: ContextoDivergenciaGuiada): ResultadoResolucaoGuiada | null {
  const evs = ctx.eventos_competencia.length > 0 ? ctx.eventos_competencia : ctx.eventos_operacionais;
  if (evs.length === 0) return null;

  const suspensao = evs.find((e) => e.tipo === "suspensao");
  if (suspensao) {
    return resolvidoAuto("suspensao_operacional", "evento_operacional", suspensao.justificativa ?? "Suspensão operacional oficial.", {
      campos: { evento: suspensao.tipo },
    });
  }

  const bloqueio = evs.find((e) => e.tipo === "bloqueio");
  if (bloqueio) {
    return resolvidoAuto("bloqueio_governo", "evento_operacional", bloqueio.justificativa ?? "Bloqueio governamental.", {
      campos: { evento: bloqueio.tipo },
    });
  }

  const inad = evs.find((e) => e.tipo === "inadimplencia");
  if (inad) {
    return resolvidoAuto("divergencia_operacional", "evento_operacional", inad.justificativa ?? "Inadimplência registrada — não é refin falso.", {
      campos: { evento: inad.tipo },
    });
  }

  const recuperado = evs.find((e) => e.tipo === "desconto_recuperado");
  if (recuperado) {
    return resolvidoAuto("desconto_recuperado", "evento_operacional", recuperado.justificativa ?? "Desconto recuperado na competência.", {
      campos: { evento: recuperado.tipo, valor: recuperado.valor_descontado },
    });
  }

  const quebra = evs.find((e) => e.tipo === "quebra_temporaria" || e.tipo === "desconto_nao_processado");
  if (quebra) {
    return resolvidoAuto("divergencia_operacional", "evento_operacional", quebra.justificativa ?? "Quebra operacional temporária.", {
      campos: { evento: quebra.tipo },
    });
  }

  return null;
}

function etapa2DescontoFracionado(ctx: ContextoDivergenciaGuiada): ResultadoResolucaoGuiada | null {
  if (!ctx.consigfacil) return null;

  const competencia = ctx.divergencia.competencia ?? "";
  const linhasMes = ctx.linhas_folha_competencia.map(linhaFolhaMesDeBaseConciliada);

  const deteccao =
    ctx.fragmentos_desconto.length >= 1
      ? validarDescontoFracionadoPorMargem({
          descontosFolha: ctx.fragmentos_desconto.map((f) => ({
            valor: f.valor,
            descricao: f.descricao,
            linha_id: f.linha_id,
          })),
          contratoConsigfacil: ctx.consigfacil,
          competencia,
          config: ctx.perfil_leitura.configAuditoria,
        })
      : null;

  const fracionadoDireto =
    !deteccao?.conciliado && linhasMes.length > 0
      ? detectarDescontoFracionadoPorMargem({
          competencia,
          banco: ctx.consigfacil.instituicao,
          codigo_rubrica: ctx.consigfacil.codigo_instituicao,
          contrato_id: ctx.consigfacil.id_consignacao,
          valor_oficial_parcela: ctx.consigfacil.valor_parcela,
          linhas_folha_mes: linhasMes,
          config: ctx.perfil_leitura.configAuditoria,
        })
      : null;

  if (deteccao?.conciliado || fracionadoDireto?.fracionado) {
    const soma =
      deteccao?.soma_descontos_folha ??
      (fracionadoDireto?.fracionado ? fracionadoDireto.soma_descontos : 0);
    const oficial =
      deteccao?.valor_parcela_oficial ??
      (fracionadoDireto?.fracionado ? fracionadoDireto.valor_oficial : 0);
    const diferenca =
      deteccao?.diferenca ?? (fracionadoDireto?.fracionado ? fracionadoDireto.diferenca : 0);
    const pct =
      deteccao?.percentual_diferenca ??
      (fracionadoDireto?.fracionado ? fracionadoDireto.percentual_diferenca : 0);

    return resolvidoAuto(
      "desconto_fracionado",
      "desconto_fracionado",
      MENSAGEM_DESCONTO_FRACIONADO_MARGEM,
      {
        campos: {
          desconto_fracionado_conciliado: true,
          desconto_fracionado_por_margem: true,
          soma_descontos_folha: soma,
          soma_descontos_mes: soma,
          valor_parcela_oficial: oficial,
          diferenca,
          percentual_diferenca: pct,
          linhas_compensatorias: fracionadoDireto?.fracionado
            ? fracionadoDireto.linhas_compensatorias.map((l) => l.id).filter(Boolean).join(", ")
            : deteccao?.linhas_compensatorias,
          margem_reduzida_detectada: fracionadoDireto?.fracionado
            ? fracionadoDireto.margem_reduzida_detectada
            : deteccao?.margem_reduzida_detectada,
          removido_da_conferencia: true,
        },
        confianca: 0.92,
      },
    );
  }

  return null;
}

function etapa3Aprendizado(
  ctx: ContextoDivergenciaGuiada,
): { resultado: ResultadoResolucaoGuiada | null; aprendizado: RegistroAprendizadoDivergencia | null } {
  const aprendido = buscarAprendizadoParaDivergencia({
    banco: ctx.divergencia.banco,
    tipo_divergencia: ctx.divergencia.tipo_pendencia,
    percentual_divergencia: ctx.divergencia.percentual_divergencia,
  });

  if (!aprendido) return { resultado: null, aprendizado: null };

  const r = resolvidoAuto(aprendido.classificacao, "comportamento_recorrente", `Padrão aprendido (${aprendido.frequencia}×, confiança ${Math.round(aprendido.nivel_confianca * 100)}%).`, {
    origem: "aprendizado",
    confianca: aprendido.nivel_confianca,
    campos: {
      resposta_aprendida: aprendido.resposta_usuario,
      aplicar_automaticamente_futuro: true,
    },
  });
  return { resultado: r, aprendizado: aprendido };
}

function etapa4QuebraMargem(ctx: ContextoDivergenciaGuiada): ResultadoResolucaoGuiada | null {
  if (ctx.margem_ultrapassada || ctx.margem_consignavel != null && ctx.margem_consignavel > 30) {
    if (ctx.compensacao_mes_seguinte) {
      return resolvidoAuto(
        "quebra_temporaria",
        "quebra_margem",
        "Margem ultrapassada neste mês com compensação no mês seguinte — quebra temporária.",
        { risco: "medio", confianca: 0.8 },
      );
    }
    if (ctx.divergencia.motivo_quebra_desconto === "margem_insuficiente") {
      return resolvidoAuto(
        "margem_insuficiente",
        "quebra_margem",
        "Quebra explicada por margem consignável insuficiente.",
        { confianca: 0.85 },
      );
    }
  }
  return null;
}

function etapa5RiscoReal(ctx: ContextoDivergenciaGuiada): ResultadoResolucaoGuiada | null {
  const riscoAlto = ctx.riscos_refin.some((r) => r.nivel === "alto" || r.nivel === "critico");
  if (riscoAlto) {
    return resultadoBase({
      resolvido: false,
      remover_conferencia: false,
      classificacao: "risco_refin_induzido",
      explicacao: ctx.riscos_refin[0]?.recomendacao ?? "Padrão de refin induzido — manter em conferência.",
      origem: "automatica_motor",
      etapa_aplicada: "risco_real",
      etapas_verificadas: ["risco_real"],
      nivel_risco: "alto",
      acao_tomada: "manter_conferencia",
      confianca: 0.75,
    });
  }

  if (ctx.refin_detectado) {
    return resultadoBase({
      resolvido: false,
      remover_conferencia: false,
      classificacao: "refinanciamento_real",
      explicacao: "Refinanciamento/portabilidade detectado — divergência pode ser legítima.",
      origem: "automatica_motor",
      etapa_aplicada: "risco_real",
      nivel_risco: "medio",
      acao_tomada: "manter_conferencia",
      confianca: 0.7,
    });
  }

  if (ctx.parcela_mudou || ctx.prazo_aumentou || ctx.novo_contrato_mesmo_banco) {
    return resultadoBase({
      resolvido: false,
      remover_conferencia: false,
      classificacao: "revisar_manual",
      explicacao:
        "Mudança material de parcela, prazo ou novo contrato no mesmo banco — conferência manual necessária.",
      origem: "automatica_motor",
      etapa_aplicada: "risco_real",
      nivel_risco: "alto",
      acao_tomada: "manter_conferencia",
      confianca: 0.65,
    });
  }

  return null;
}

export function gerarPerguntasResolutivas(ctx: ContextoDivergenciaGuiada): PerguntaResolutivaDivergencia[] {
  const perguntas: PerguntaResolutivaDivergencia[] = [];

  if (ctx.comportamento_recorrente) {
    perguntas.push({
      id: "rec_quebra_margem",
      etapa: "comportamento_recorrente",
      pergunta: `O banco ${ctx.divergencia.banco ?? "deste contrato"} costuma quebrar parcelas por margem?`,
      ajuda: `Quebra histórica típica: ~${ctx.percentual_quebra_recorrente?.toFixed(1) ?? "?"}%.`,
      opcoes: [
        { id: "sempre_fraciona", label: "Sim, sempre" },
        { id: "ocasionalmente_fraciona", label: "Sim, ocasionalmente" },
        { id: "nao_fraciona", label: "Não" },
        { id: "revisar_manual", label: "Revisar manualmente" },
      ],
      obrigatoria: false,
    });
  }

  perguntas.push(
    {
      id: "div_frac_1",
      etapa: "perguntas_guiadas",
      pergunta: "Esse desconto costuma vir dividido em mais de uma rubrica na folha?",
      opcoes: [
        { id: "sim", label: "Sim" },
        { id: "nao", label: "Não" },
        { id: "nao_sei", label: "Não sei" },
      ],
      obrigatoria: true,
    },
    {
      id: "div_frac_2",
      etapa: "perguntas_guiadas",
      pergunta: "A soma dos descontos na folha fecha com a parcela ConsigFácil?",
      ajuda: `Folha: ${ctx.soma_fragmentos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · Oficial: ${ctx.divergencia.valor_previsto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      opcoes: [
        { id: "sim", label: "Sim, fecha" },
        { id: "nao", label: "Não fecha" },
        { id: "nao_sei", label: "Não sei" },
      ],
      obrigatoria: true,
    },
    {
      id: "div_reconhece",
      etapa: "perguntas_guiadas",
      pergunta: "Você reconhece este contrato/desconto como válido?",
      opcoes: [
        { id: "sim", label: "Sim, contrato reconhecido" },
        { id: "nao", label: "Não / suspeito" },
        { id: "nao_sei", label: "Não sei" },
      ],
      obrigatoria: true,
    },
    {
      id: "div_refin",
      etapa: "perguntas_guiadas",
      pergunta: "Você considera que isso é refinanciamento (substituição de contrato)?",
      opcoes: [
        { id: "sim", label: "Sim, refinanciamento" },
        { id: "nao", label: "Não, é o mesmo contrato" },
        { id: "nao_sei", label: "Não sei" },
      ],
      obrigatoria: false,
    },
    {
      id: "div_ignorar_futuro",
      etapa: "perguntas_guiadas",
      pergunta: "O sistema deve ignorar esse padrão automaticamente no futuro (mesmo banco e %)?",
      opcoes: [
        { id: "sim", label: "Sim, aplicar automaticamente" },
        { id: "nao", label: "Não" },
      ],
      obrigatoria: false,
    },
  );

  if (ctx.eventos_competencia.some((e) => e.tipo === "desconto_recuperado")) {
    perguntas.push({
      id: "div_recuperado",
      etapa: "perguntas_guiadas",
      pergunta: "O valor total foi recuperado depois (desconto recuperado)?",
      opcoes: [
        { id: "sim", label: "Sim" },
        { id: "nao", label: "Não" },
      ],
      obrigatoria: false,
    });
  }

  return perguntas;
}

/** Motor principal — executa etapas 1–5 e devolve perguntas se necessário. */
export function resolverDivergenciaGuiada(
  divergencia: DivergenciaTriagemEntrada,
  contexto: ContextoDivergenciaGuiada,
): ResultadoResolucaoGuiada {
  const etapas: EtapaMotorResolucao[] = [];

  const e1 = etapa1EventoOperacional(contexto);
  etapas.push("evento_operacional");
  if (e1?.resolvido) return { ...e1, etapas_verificadas: etapas };

  const e2 = etapa2DescontoFracionado(contexto);
  etapas.push("desconto_fracionado");
  if (e2?.resolvido) return { ...e2, etapas_verificadas: etapas };

  const { resultado: e3, aprendizado: regAp } = etapa3Aprendizado(contexto);
  etapas.push("comportamento_recorrente");
  if (e3?.resolvido) {
    return {
      ...e3,
      etapas_verificadas: etapas,
      campos_aplicados: { ...e3.campos_aplicados, aprendizado_id: regAp?.id },
    };
  }

  const e4 = etapa4QuebraMargem(contexto);
  etapas.push("quebra_margem");
  if (e4?.resolvido) return { ...e4, etapas_verificadas: etapas };

  const e5 = etapa5RiscoReal(contexto);
  etapas.push("risco_real");
  if (e5) {
    return { ...e5, etapas_verificadas: etapas, perguntas_pendentes: gerarPerguntasResolutivas(contexto) };
  }

  const perguntas = gerarPerguntasResolutivas(contexto);
  etapas.push("perguntas_guiadas");

  return resultadoBase({
    explicacao:
      "Nenhuma etapa automática fechou a divergência — responda às perguntas para classificar e, se aplicável, remover da conferência.",
    etapas_verificadas: etapas,
    etapa_aplicada: "perguntas_guiadas",
    perguntas_pendentes: perguntas,
    nivel_risco: "medio",
    acao_tomada: "perguntas_guiadas",
  });
}

/** Converte respostas do painel em classificação final. */
export function resolverComRespostasUsuario(
  contexto: ContextoDivergenciaGuiada,
  respostas: Record<string, string>,
): ResultadoResolucaoGuiada {
  const r = (id: string) => (respostas[id] ?? "").toLowerCase();

  if (r("rec_quebra_margem") === "sempre_fraciona" || r("rec_quebra_margem") === "ocasionalmente_fraciona") {
    return resolvidoAuto("desconto_fracionado", "comportamento_recorrente", "Comportamento recorrente confirmado pelo usuário.", {
      origem: "pergunta_usuario",
      aprendizado: true,
    });
  }

  if (r("div_frac_1") === "sim" && r("div_frac_2") === "sim") {
    return resolvidoAuto("desconto_fracionado", "perguntas_guiadas", "Usuário confirmou desconto fracionado com soma compatível.", {
      origem: "pergunta_usuario",
      campos: { desconto_fracionado_conciliado: true },
      aprendizado: true,
    });
  }

  if (r("div_refin") === "sim") {
    return resultadoBase({
      classificacao: "refinanciamento_real",
      explicacao: "Usuário classificou como refinanciamento.",
      origem: "pergunta_usuario",
      etapa_aplicada: "perguntas_guiadas",
      nivel_risco: "medio",
      acao_tomada: "manter_conferencia",
    });
  }

  if (r("div_reconhece") === "sim") {
    return resolvidoAuto("divergencia_operacional", "perguntas_guiadas", "Contrato reconhecido — divergência aceita.", {
      origem: "pergunta_usuario",
      confianca: 0.72,
    });
  }

  if (r("div_recuperado") === "sim") {
    return resolvidoAuto("desconto_recuperado", "perguntas_guiadas", "Desconto recuperado confirmado.", {
      origem: "pergunta_usuario",
    });
  }

  return resultadoBase({
    classificacao: "revisar_manual",
    explicacao: "Respostas não fecharam a divergência — mantida para revisão.",
    origem: "pergunta_usuario",
    etapa_aplicada: "perguntas_guiadas",
    nivel_risco: "medio",
    acao_tomada: "manter_conferencia",
  });
}
