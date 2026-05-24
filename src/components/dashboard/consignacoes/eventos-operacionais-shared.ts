import type {
  EventoOperacionalConsignado,
  MotivoQuebraDesconto,
} from "@/lib/consigfacil/detectar-eventos-operacionais";
import type { RiscoRefinForcado } from "@/lib/juridico/detectar-risco-refin-forcado";
import type { ConsigfacilContrato, ConsigfacilStatus } from "@/types/consigfacil";
import type { ContratoComAuditoria } from "@/lib/consignacoes-governo/auditoria-contratos-unicos";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";
import { instituicaoEhRotuloInvalido } from "@/lib/consignacoes-governo/parser-consigfacil-print";
import { detectarInstituicaoNaDescricao } from "@/lib/reading/instituicoes-financeiras";
import type { LinhaTimelineContrato } from "@/lib/consigfacil/detectar-eventos-operacionais";

export type FiltrosEventosOperacionais = {
  banco: string | null;
  contrato: string | null;
  competencia: string | null;
  tipo_evento: EventoOperacionalConsignado["tipo"] | null;
  origem: EventoOperacionalConsignado["origem"] | null;
  nivel_risco: RiscoRefinForcado["nivel"] | null;
  somente_removidos_conferencia: boolean;
  somente_risco_alto_critico: boolean;
};

export const FILTROS_EVENTOS_VAZIOS: FiltrosEventosOperacionais = {
  banco: null,
  contrato: null,
  competencia: null,
  tipo_evento: null,
  origem: null,
  nivel_risco: null,
  somente_removidos_conferencia: false,
  somente_risco_alto_critico: false,
};

export type LinhaEventoOperacionalUI = EventoOperacionalConsignado & {
  motivo_quebra_desconto: MotivoQuebraDesconto;
  diferenca: number | null;
  removido_da_conferencia: boolean;
};

const MOTIVO_POR_TIPO: Partial<
  Record<EventoOperacionalConsignado["tipo"], MotivoQuebraDesconto>
> = {
  suspensao: "suspensao_operacional",
  inadimplencia: "inadimplencia",
  bloqueio: "bloqueio_governo",
  desconto_nao_processado: "nao_processado",
  quebra_temporaria: "erro_operacional",
  retorno_operacional: "erro_operacional",
  desconto_recuperado: "desconhecido",
};

export function motivoQuebraDeEvento(e: EventoOperacionalConsignado): MotivoQuebraDesconto {
  return MOTIVO_POR_TIPO[e.tipo] ?? "desconhecido";
}

export function enriquecerLinhaEvento(e: EventoOperacionalConsignado): LinhaEventoOperacionalUI {
  const prev = e.valor_previsto ?? 0;
  const desc = e.valor_descontado ?? 0;
  const diferenca =
    e.valor_previsto != null && e.valor_descontado != null ? desc - prev : null;
  return {
    ...e,
    motivo_quebra_desconto: motivoQuebraDeEvento(e),
    diferenca,
    removido_da_conferencia: e.remover_falso_positivo_refin,
  };
}

export function aplicarFiltrosEventos(
  eventos: EventoOperacionalConsignado[],
  filtros: FiltrosEventosOperacionais,
): EventoOperacionalConsignado[] {
  return eventos.filter((e) => {
    if (filtros.banco && e.banco !== filtros.banco) return false;
    if (filtros.contrato && e.contrato !== filtros.contrato) return false;
    if (filtros.competencia && e.competencia !== filtros.competencia) return false;
    if (filtros.tipo_evento && e.tipo !== filtros.tipo_evento) return false;
    if (filtros.origem && e.origem !== filtros.origem) return false;
    if (filtros.somente_removidos_conferencia && !e.remover_falso_positivo_refin) {
      return false;
    }
    return true;
  });
}

export function filtrarRiscos(
  riscos: RiscoRefinForcado[],
  filtros: FiltrosEventosOperacionais,
): RiscoRefinForcado[] {
  return riscos.filter((r) => {
    if (filtros.somente_risco_alto_critico && r.nivel !== "alto" && r.nivel !== "critico") {
      return false;
    }
    if (filtros.nivel_risco && r.nivel !== filtros.nivel_risco) return false;
    if (filtros.banco && r.banco !== filtros.banco) return false;
    if (
      filtros.contrato &&
      r.contrato_origem !== filtros.contrato &&
      r.contrato_destino !== filtros.contrato
    ) {
      return false;
    }
    if (r.nivel === "baixo") return false;
    return true;
  });
}

export type CorEventoOperacional = "verde" | "amarelo" | "vermelho" | "roxo" | "cinza";

export function corPorTipoEvento(
  tipo: EventoOperacionalConsignado["tipo"] | "desconto_normal",
): CorEventoOperacional {
  switch (tipo) {
    case "desconto_recuperado":
    case "desconto_normal":
      return "verde";
    case "quebra_temporaria":
    case "retorno_operacional":
      return "amarelo";
    case "suspensao":
    case "bloqueio":
    case "inadimplencia":
    case "desconto_nao_processado":
      return "vermelho";
    default:
      return "cinza";
  }
}

export const CLASSE_COR: Record<CorEventoOperacional, string> = {
  verde:
    "border-emerald-300/70 bg-emerald-50/80 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100",
  amarelo:
    "border-amber-300/70 bg-amber-50/80 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100",
  vermelho:
    "border-red-300/70 bg-red-50/80 text-red-950 dark:bg-red-950/30 dark:text-red-100",
  roxo: "border-violet-400/70 bg-violet-50/80 text-violet-950 dark:bg-violet-950/30 dark:text-violet-100",
  cinza: "border-border bg-muted/50 text-muted-foreground",
};

export const LABEL_TIPO_EVENTO: Record<EventoOperacionalConsignado["tipo"], string> = {
  suspensao: "Suspensão",
  inadimplencia: "Inadimplência",
  bloqueio: "Bloqueio",
  desconto_nao_processado: "Desconto não processado",
  desconto_recuperado: "Desconto recuperado",
  quebra_temporaria: "Quebra temporária",
  retorno_operacional: "Retorno operacional",
};

export const LABEL_MOTIVO_QUEBRA: Record<MotivoQuebraDesconto, string> = {
  margem_insuficiente: "Margem insuficiente",
  suspensao_operacional: "Suspensão operacional",
  inadimplencia: "Inadimplência",
  bloqueio_governo: "Bloqueio governo",
  nao_processado: "Não processado",
  desconto_fracionado: "Desconto fracionado",
  erro_operacional: "Erro operacional",
  desconhecido: "Desconhecido",
};

export const LABEL_ORIGEM: Record<EventoOperacionalConsignado["origem"], string> = {
  consigfacil: "ConsigFácil",
  contracheque: "Contracheque",
  extrato: "Extrato",
  email: "E-mail",
  manual: "Manual",
};

export function fmtBrl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MESES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export function formatCompetenciaPt(competencia: string | null | undefined): string {
  if (!competencia) return "—";
  const m = /^(\d{4})-(\d{2})$/.exec(competencia.trim());
  if (!m) return competencia;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return competencia;
  return `${MESES_PT[mes - 1]} de ${m[1]}`;
}

export const LABEL_STATUS_CONTRATO: Record<ConsigfacilStatus, string> = {
  ativo: "Ativo no portal",
  suspenso: "Suspenso no portal",
  importado: "Importado",
  quitado: "Quitado",
  refinanciado: "Refinanciado",
  substituido: "Substituído",
  cartao_beneficio: "Cartão benefício",
  rmc: "RMC",
  rcc: "RCC",
  em_averbacao: "Em averbação",
  desconhecido: "Situação não informada",
  nao_refinanciamento_confirmado: "Não é refinanciamento (confirmado)",
};

export function rotuloSituacaoImportacao(
  situacao: string | null | undefined,
): string | null {
  if (!situacao?.trim()) return null;
  const chave = situacao.trim().toLowerCase();
  const map: Record<string, string> = {
    importado: "Dados importados de outro sistema",
    importado_suspenso: "Importado e já suspenso no portal",
    suspenso: "Marcado como suspenso na importação",
    manual: "Cadastro manual no portal",
  };
  return map[chave] ?? null;
}

/** Nome de banco/financeira — nunca usa data/status do portal como instituição. */
export function nomeInstituicaoContrato(contrato: ConsigfacilContrato): string {
  const candidatos = [
    contrato.classificacao?.instituicao_oficial,
    resolverInstituicaoOficial(contrato.instituicao)?.nome_oficial,
    contrato.banco_atual,
    contrato.averbado_por,
    contrato.instituicao,
  ];

  for (const raw of candidatos) {
    const t = raw?.trim();
    if (!t || instituicaoEhRotuloInvalido(t)) continue;
    const oficial = resolverInstituicaoOficial(t)?.nome_oficial;
    if (oficial && !instituicaoEhRotuloInvalido(oficial)) return oficial;
    if (!instituicaoEhRotuloInvalido(t)) return t;
  }

  const texto = [contrato.texto_bruto, contrato.observacao, contrato.averbado_por]
    .filter(Boolean)
    .join(" ");
  const detect = detectarInstituicaoNaDescricao(texto);
  if (detect?.nome) {
    const via = resolverInstituicaoOficial(detect.nome)?.nome_oficial ?? detect.nome;
    if (!instituicaoEhRotuloInvalido(via)) return via;
  }

  return "Instituição a confirmar na folha";
}

export function rotuloParcelaContrato(contrato: ConsigfacilContrato): string {
  const total = contrato.parcelas_total;
  const atual = contrato.parcela_atual;
  if (!total || total <= 0) return "Prazo não informado no portal";
  if (atual == null || atual <= 0) {
    return `Parcela atual não informada · prazo ${total}x`;
  }
  return `Parcela ${atual} de ${total}`;
}

export function rotuloContratoOperacional(contrato: ConsigfacilContrato): string {
  const banco = nomeInstituicaoContrato(contrato);
  const codigo = contrato.codigo_instituicao ?? contrato.id_consignacao;
  const status = LABEL_STATUS_CONTRATO[contrato.status] ?? contrato.status;
  return `${banco} · contrato ${codigo} · ${status}`;
}

export type TextoTimelineAssertivo = {
  titulo: string;
  detalhe: string;
  impacto: string;
};

export function textoTimelineAssertivo(
  linha: LinhaTimelineContrato,
  contrato: ConsigfacilContrato,
): TextoTimelineAssertivo {
  const comp = formatCompetenciaPt(linha.competencia);
  const parcela = rotuloParcelaContrato(contrato);
  const previsto = linha.valor_previsto;
  const descontado = linha.valor_descontado;
  const semDesconto =
    descontado == null || descontado === 0 || (previsto != null && previsto > 0 && descontado === 0);

  switch (linha.tipo) {
    case "suspensao":
      return {
        titulo: "Desconto interrompido — contrato suspenso",
        detalhe: `Na competência ${comp}, o ConsigFácil registra este contrato como SUSPENSO (${parcela}).`,
        impacto: semDesconto
          ? "Não conte com desconto na folha até a situação ser regularizada no portal ou nova averbação."
          : "Há valor na folha apesar da suspensão — confira divergência antes de tratar como refinanciamento.",
      };
    case "bloqueio":
      return {
        titulo: "Bloqueio operacional",
        detalhe: `Bloqueio registrado em ${comp} no fluxo oficial.`,
        impacto: "O desconto pode não ser processado pela folha nesta competência.",
      };
    case "inadimplencia":
      return {
        titulo: "Inadimplência consignada",
        detalhe: `Indício de inadimplência em ${comp}.`,
        impacto: "Risco de cobrança retroativa ou suspensão — documente antes de encerrar o contrato na análise.",
      };
    case "desconto_nao_processado":
      return {
        titulo: "Parcela prevista, desconto não veio na folha",
        detalhe: `Em ${comp}, a parcela oficial era ${fmtBrl(previsto)}, mas o desconto observado foi zero.`,
        impacto: "Trate como quebra operacional, não como refinanciamento automático.",
      };
    case "desconto_recuperado":
    case "desconto_normal":
      return {
        titulo: "Desconto processado na folha",
        detalhe: `Em ${comp}, o desconto foi ${fmtBrl(descontado)} (previsto ${fmtBrl(previsto)}).`,
        impacto: "Fluxo normal — use para validar continuidade do contrato.",
      };
    case "quebra_temporaria":
      return {
        titulo: "Quebra temporária entre competências",
        detalhe: linha.evento || `Interrupção detectada em ${comp}.`,
        impacto: "Verifique se há suspensão/bloqueio no portal antes de inferir encerramento.",
      };
    case "retorno_operacional":
      return {
        titulo: "Retorno após interrupção",
        detalhe: linha.evento || `Desconto retomado em ${comp}.`,
        impacto: "Confirme se a parcela voltou ao valor oficial do contrato.",
      };
    default:
      return {
        titulo: LABEL_TIPO_EVENTO[linha.tipo as keyof typeof LABEL_TIPO_EVENTO] ?? linha.tipo,
        detalhe: linha.evento || `Evento operacional em ${comp}.`,
        impacto: semDesconto
          ? "Sem desconto na folha nesta competência."
          : "Revise valores previstos × descontados.",
      };
  }
}

export function contratosComEventos(
  eventos: EventoOperacionalConsignado[],
  contratos: ConsigfacilContrato[],
): ConsigfacilContrato[] {
  const chaves = new Set<string>();
  for (const e of eventos) {
    if (e.contrato) chaves.add(e.contrato);
  }
  const lista = contratos.filter(
    (c) =>
      chaves.has(c.id_consignacao) ||
      (c.codigo_instituicao != null && chaves.has(c.codigo_instituicao)),
  );
  return lista.length > 0 ? lista : contratos.filter((c) => c.status === "suspenso").slice(0, 8);
}

export function contarFalsosRefinRemovidos(
  eventos: EventoOperacionalConsignado[],
  contratosAuditoria: ContratoComAuditoria[],
): number {
  const ids = new Set<string>();
  for (const e of eventos) {
    if (e.remover_falso_positivo_refin && e.contrato) ids.add(e.contrato);
  }
  for (const c of contratosAuditoria) {
    if (c.justificativa_operacional_oficial) {
      ids.add(c.codigo_instituicao ?? c.id_consignacao);
    }
  }
  return ids.size;
}
