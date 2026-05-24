/**
 * Histórico de eventos por CONTRATO (loan / consigfacil) — derivado de:
 *
 *   - ConsigfacilContrato.status / situacao_importacao
 *   - ConsigfacilRefinanciamento (tipo_refinanciamento)
 *   - ConsigfacilAjusteBase (confirmações / divergências)
 *   - LoanComConfirmacao (cadastro)
 *
 * Cada linha vira "histórico financeiro reconstruído" que vai para:
 *   - Painel `Histórico de eventos` em /dashboard/consignacoes.
 *   - Aba `Historico_Contrato_Eventos` da exportação.
 *   - Trilha de auditoria (não-destrutiva).
 */

import type {
  ConsigfacilAjusteBase,
  ConsigfacilContrato,
  ConsigfacilRefinanciamento,
} from "@/types/consigfacil";
import type { LoanComConfirmacao } from "@/lib/consignacoes-governo/atualizar-base-com-consigfacil";
import type { Loan } from "@/types/contracheque";
import type { EventoOperacionalConsignado } from "@/lib/consigfacil/detectar-eventos-operacionais";

export type TipoEventoContrato =
  | "criado"
  | "importado"
  | "confirmado"
  | "refinanciado"
  | "portabilidade"
  | "renegociacao"
  | "migracao_cartao"
  | "quitado"
  | "suspenso"
  | "divergencia"
  | "cartao_detectado"
  | "rmc_detectado"
  | "rcc_detectado"
  | "margem_alterada"
  | "valor_corrigido"
  | "instituicao_corrigida"
  | "status_corrigido"
  | "bloqueio_operacional"
  | "inadimplencia_operacional"
  | "desconto_operacional";

export type HistoricoContratoEvento = {
  /** Identificador do contrato — pode ser `loan_id` ou `id_consignacao`. */
  contrato_id: string;
  /** `loan` ou `consigfacil`. */
  origem_contrato: "loan" | "consigfacil";
  /** ISO-8601. Para refinanciamentos usamos a data do contrato substituído. */
  data: string;
  tipo_evento: TipoEventoContrato;
  /** Texto curto para mostrar na UI / planilha. */
  descricao: string;
  /** Banco oficial (sempre canônico). */
  instituicao_oficial: string;
  /** Fonte que ORIGINOU o evento (consigfacil, contracheque, etc). */
  fonte: "consigfacil" | "contracheque" | "extrato_bancario" | "manual" | "ocr" | "inferencia";
  /** Campo afetado, quando aplicável. */
  campo: string | null;
  /** Valor anterior (texto). */
  valor_anterior: string | null;
  /** Valor novo (texto). */
  valor_novo: string | null;
  /** ID do contrato relacionado (origem de um refin, por exemplo). */
  contrato_relacionado_id: string | null;
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

function tipoEventoDoRefinanciamento(
  r: ConsigfacilRefinanciamento,
): TipoEventoContrato {
  switch (r.tipo_refinanciamento) {
    case "portabilidade":
      return "portabilidade";
    case "renegociacao":
      return "renegociacao";
    case "refinanciamento_novo_credito":
      return "refinanciado";
    default:
      return "refinanciado";
  }
}

export type EntradaHistoricoContratoEventos = {
  loans: Loan[];
  loansComConfirmacao: LoanComConfirmacao[];
  contratosConsigfacil: ConsigfacilContrato[];
  refinanciamentosConsigfacil: ConsigfacilRefinanciamento[];
  ajustes: ConsigfacilAjusteBase[];
  /** Mapa: id_consignacao → instituicao_oficial (resolvido pelo catálogo). */
  instituicaoOficialPorIdConsignacao: Map<string, string>;
  eventosOperacionais?: EventoOperacionalConsignado[];
};

export function montarHistoricoContratoEventos(
  input: EntradaHistoricoContratoEventos,
): HistoricoContratoEvento[] {
  const {
    loans,
    loansComConfirmacao,
    contratosConsigfacil,
    refinanciamentosConsigfacil,
    ajustes,
    instituicaoOficialPorIdConsignacao,
  } = input;

  const eventos: HistoricoContratoEvento[] = [];
  const oficialDoContrato = (c: ConsigfacilContrato): string =>
    instituicaoOficialPorIdConsignacao.get(c.id_consignacao) ?? c.instituicao;

  // -----------------------------------------------------------------
  // Eventos vindos dos LOANS (criação cadastral)
  // -----------------------------------------------------------------
  for (const l of loans) {
    eventos.push({
      contrato_id: l.id,
      origem_contrato: "loan",
      data: (l.start_date ?? l.created_at ?? new Date().toISOString()).slice(0, 10),
      tipo_evento: "criado",
      descricao: `Contrato cadastrado: ${l.description ?? l.institution_name ?? "—"}`,
      instituicao_oficial: l.institution_name ?? l.description ?? "—",
      fonte:
        l.origem === "ocr"
          ? "ocr"
          : l.origem === "consigfacil"
            ? "consigfacil"
            : l.origem === "anexo"
              ? "contracheque"
              : "manual",
      campo: null,
      valor_anterior: null,
      valor_novo: null,
      contrato_relacionado_id: null,
    });
  }

  // -----------------------------------------------------------------
  // Eventos vindos dos CONTRATOS ConsigFácil (importação oficial)
  // -----------------------------------------------------------------
  for (const c of contratosConsigfacil) {
    const inst = oficialDoContrato(c);
    eventos.push({
      contrato_id: c.id_consignacao,
      origem_contrato: "consigfacil",
      data: (c.data_contrato || c.competencia + "-01").slice(0, 10),
      tipo_evento: "importado",
      descricao: `Importado do ConsigFácil oficial · ${c.parcela_atual}/${c.parcelas_total} parcelas · ${fmtBrl(c.valor_parcela)}`,
      instituicao_oficial: inst,
      fonte: "consigfacil",
      campo: null,
      valor_anterior: null,
      valor_novo: null,
      contrato_relacionado_id: null,
    });
    if (c.eh_cartao_beneficio) {
      eventos.push({
        contrato_id: c.id_consignacao,
        origem_contrato: "consigfacil",
        data: (c.data_contrato || c.competencia + "-01").slice(0, 10),
        tipo_evento: "cartao_detectado",
        descricao: "Cartão Benefício detectado pelo ConsigFácil.",
        instituicao_oficial: inst,
        fonte: "consigfacil",
        campo: "tipo_contrato",
        valor_anterior: null,
        valor_novo: "cartao_beneficio",
        contrato_relacionado_id: null,
      });
    }
    if (c.eh_rmc) {
      eventos.push({
        contrato_id: c.id_consignacao,
        origem_contrato: "consigfacil",
        data: (c.data_contrato || c.competencia + "-01").slice(0, 10),
        tipo_evento: "rmc_detectado",
        descricao: "RMC (Reserva de Margem Cartão) detectada pelo ConsigFácil.",
        instituicao_oficial: inst,
        fonte: "consigfacil",
        campo: null,
        valor_anterior: null,
        valor_novo: "rmc",
        contrato_relacionado_id: null,
      });
    }
    if (c.eh_rcc) {
      eventos.push({
        contrato_id: c.id_consignacao,
        origem_contrato: "consigfacil",
        data: (c.data_contrato || c.competencia + "-01").slice(0, 10),
        tipo_evento: "rcc_detectado",
        descricao: "RCC detectado pelo ConsigFácil.",
        instituicao_oficial: inst,
        fonte: "consigfacil",
        campo: null,
        valor_anterior: null,
        valor_novo: "rcc",
        contrato_relacionado_id: null,
      });
    }
    if (c.status === "suspenso") {
      eventos.push({
        contrato_id: c.id_consignacao,
        origem_contrato: "consigfacil",
        data: (c.data_contrato || c.competencia + "-01").slice(0, 10),
        tipo_evento: "suspenso",
        descricao: "Contrato marcado como SUSPENSO no ConsigFácil.",
        instituicao_oficial: inst,
        fonte: "consigfacil",
        campo: "status",
        valor_anterior: null,
        valor_novo: "suspenso",
        contrato_relacionado_id: null,
      });
    }
    if (c.status === "quitado") {
      eventos.push({
        contrato_id: c.id_consignacao,
        origem_contrato: "consigfacil",
        data: (c.data_contrato || c.competencia + "-01").slice(0, 10),
        tipo_evento: "quitado",
        descricao: "Contrato marcado como QUITADO no ConsigFácil.",
        instituicao_oficial: inst,
        fonte: "consigfacil",
        campo: "status",
        valor_anterior: null,
        valor_novo: "quitado",
        contrato_relacionado_id: null,
      });
    }
  }

  // -----------------------------------------------------------------
  // Refinanciamentos (gera evento no contrato_destino + relação)
  // -----------------------------------------------------------------
  const contratoPorId = new Map(contratosConsigfacil.map((c) => [c.id_consignacao, c]));
  for (const r of refinanciamentosConsigfacil) {
    const destino = contratoPorId.get(r.contrato_destino);
    const inst = destino
      ? oficialDoContrato(destino)
      : instituicaoOficialPorIdConsignacao.get(r.contrato_destino) ?? r.banco;
    eventos.push({
      contrato_id: r.contrato_destino,
      origem_contrato: "consigfacil",
      data: (destino?.data_contrato || new Date().toISOString()).slice(0, 10),
      tipo_evento: tipoEventoDoRefinanciamento(r),
      descricao: `${r.tipo_refinanciamento.replace(/_/g, " ")} a partir de ${r.contrato_origem} (Δ ${r.distancia_dias}d, confiança ${r.grau_confianca}).`,
      instituicao_oficial: inst,
      fonte: "consigfacil",
      campo: null,
      valor_anterior: null,
      valor_novo: null,
      contrato_relacionado_id: r.contrato_origem,
    });
  }

  // -----------------------------------------------------------------
  // Ajustes — confirmações e divergências viram eventos
  // -----------------------------------------------------------------
  for (const a of ajustes) {
    if (a.alvo_tipo !== "loan" && a.alvo_tipo !== "base_conciliada") continue;
    eventos.push({
      contrato_id: a.alvo_id,
      origem_contrato: a.alvo_tipo === "loan" ? "loan" : "consigfacil",
      data: a.registrado_em.slice(0, 10),
      tipo_evento:
        a.tipo_ajuste === "confirmado"
          ? "confirmado"
          : a.campo === "valor_parcela"
            ? "valor_corrigido"
            : a.campo === "instituicao"
              ? "instituicao_corrigida"
              : a.campo === "status"
                ? "status_corrigido"
                : "divergencia",
      descricao: a.motivo_ajuste,
      instituicao_oficial:
        instituicaoOficialPorIdConsignacao.get(a.id_consignacao) ?? "—",
      fonte: a.fonte_original === "consigfacil_oficial" ? "consigfacil" : (a.fonte_original as HistoricoContratoEvento["fonte"]),
      campo: a.campo,
      valor_anterior: a.valor_original != null ? String(a.valor_original) : null,
      valor_novo: a.valor_oficial != null ? String(a.valor_oficial) : null,
      contrato_relacionado_id: a.id_consignacao,
    });
  }

  // -----------------------------------------------------------------
  // Loans com confirmação — destaca quem foi confirmado oficialmente
  // -----------------------------------------------------------------
  for (const l of loansComConfirmacao) {
    if (!l.confirmacao_consigfacil.confirmado_consigfacil) continue;
    eventos.push({
      contrato_id: l.id,
      origem_contrato: "loan",
      data: new Date().toISOString().slice(0, 10),
      tipo_evento: "confirmado",
      descricao: `Loan confirmado pelo ConsigFácil ${l.confirmacao_consigfacil.id_consignacao_confirmada ?? "—"} (${l.confirmacao_consigfacil.campos_confirmados.join(", ")}).`,
      instituicao_oficial: l.institution_name ?? l.description ?? "—",
      fonte: "consigfacil",
      campo: null,
      valor_anterior: null,
      valor_novo: null,
      contrato_relacionado_id:
        l.confirmacao_consigfacil.id_consignacao_confirmada ?? null,
    });
  }

  // -----------------------------------------------------------------
  // Eventos operacionais (suspensão, bloqueio, inadimplência, descontos)
  // -----------------------------------------------------------------
  const porCodigo = new Map(
    contratosConsigfacil.map((c) => [c.codigo_instituicao ?? c.id_consignacao, c.id_consignacao]),
  );
  for (const ev of input.eventosOperacionais ?? []) {
    const contratoId =
      (ev.contrato && porCodigo.get(ev.contrato)) ??
      contratosConsigfacil.find(
        (c) =>
          ev.contrato === c.codigo_instituicao ||
          ev.contrato === c.id_consignacao,
      )?.id_consignacao;
    if (!contratoId) continue;

    const tipoMap: Partial<Record<EventoOperacionalConsignado["tipo"], TipoEventoContrato>> = {
      suspensao: "suspenso",
      inadimplencia: "inadimplencia_operacional",
      bloqueio: "bloqueio_operacional",
      desconto_nao_processado: "desconto_operacional",
      desconto_recuperado: "desconto_operacional",
      quebra_temporaria: "desconto_operacional",
      retorno_operacional: "desconto_operacional",
    };

    eventos.push({
      contrato_id: contratoId,
      origem_contrato: "consigfacil",
      data: (ev.competencia ? `${ev.competencia}-01` : new Date().toISOString()).slice(0, 10),
      tipo_evento: tipoMap[ev.tipo] ?? "desconto_operacional",
      descricao: ev.justificativa ?? ev.tipo,
      instituicao_oficial:
        ev.banco ??
        (() => {
          const c = contratosConsigfacil.find((x) => x.id_consignacao === contratoId);
          return c ? oficialDoContrato(c) : "—";
        })(),
      fonte:
        ev.origem === "email"
          ? "manual"
          : ev.origem === "extrato"
            ? "extrato_bancario"
            : ev.origem === "contracheque"
              ? "contracheque"
              : "consigfacil",
      campo: "desconto_folha",
      valor_anterior:
        ev.valor_previsto != null ? fmtBrl(ev.valor_previsto) : null,
      valor_novo:
        ev.valor_descontado != null ? fmtBrl(ev.valor_descontado) : null,
      contrato_relacionado_id: null,
    });
  }

  // Ordena cronologicamente.
  eventos.sort((a, b) => a.data.localeCompare(b.data));
  return eventos;
}
