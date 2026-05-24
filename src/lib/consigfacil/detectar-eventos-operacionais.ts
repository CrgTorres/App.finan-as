/**
 * Camada de eventos operacionais do consignado (ConsigFácil, folha, e-mail).
 *
 * Objetivo: distinguir quebra operacional oficial (suspensão, bloqueio, inadimplência)
 * de falso positivo de refinanciamento / encerramento / fraude.
 */

import type {
  ConsigfacilContrato,
  ConsigfacilHistorico,
  ConsigfacilSnapshot,
} from "@/types/consigfacil";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type MotivoQuebraDesconto =
  | "margem_insuficiente"
  | "suspensao_operacional"
  | "inadimplencia"
  | "bloqueio_governo"
  | "nao_processado"
  | "desconto_fracionado"
  | "erro_operacional"
  | "desconhecido";

export type EventoOperacionalConsignado = {
  tipo:
    | "suspensao"
    | "inadimplencia"
    | "bloqueio"
    | "desconto_nao_processado"
    | "desconto_recuperado"
    | "quebra_temporaria"
    | "retorno_operacional";

  banco: string | null;
  contrato: string | null;

  competencia: string | null;

  parcela_numero: number | null;

  valor_previsto: number | null;
  valor_descontado: number | null;

  origem: "consigfacil" | "contracheque" | "extrato" | "email" | "manual";

  justificativa: string | null;

  afeta_conferencia_refinanciamento: boolean;

  remover_falso_positivo_refin: boolean;

  score_confianca: number;
};

export type DescontoRecuperadoConsigfacil = {
  folha: string | null;
  competencia: string;
  parcela_numero: number | null;
  verba: string | null;
  retorno: string;
  valor_desconto: number;
};

export type EmailOperacionalConsignado = {
  banco: string | null;
  contrato: string | null;
  cpf?: string | null;
  tipo: "suspensao" | "bloqueio" | "inadimplencia" | "outro";
  texto: string;
  data?: string | null;
};

export type EntradaDetectarEventosOperacionais = {
  contratos: ConsigfacilContrato[];
  historico?: ConsigfacilHistorico[];
  descontosRecuperados?: DescontoRecuperadoConsigfacil[];
  emailsOperacionais?: EmailOperacionalConsignado[];
  divergenciasFolhaExtrato?: Array<{
    id_consignacao: string;
    instituicao: string;
    competencia: string;
    valor_consigfacil: number;
    valor_observado: number;
    motivo?: string;
  }>;
  baseConciliada?: BaseConciliadaLinha[];
  /** Texto bruto de snapshots — extrai tabela "Descontos Recuperados" quando presente. */
  textosBrutosConsigfacil?: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIPOS_SUPRIMEM_REFIN: ReadonlySet<EventoOperacionalConsignado["tipo"]> = new Set([
  "suspensao",
  "inadimplencia",
  "bloqueio",
  "desconto_recuperado",
]);

export function normalizarTextoConsig(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Alias exportado para cruzamento com módulo jurídico. */
export function chaveBanco(instituicao: string): string {
  return normalizarTextoConsig(
    resolverInstituicaoOficial(instituicao)?.nome_normalizado ?? instituicao,
  );
}

function normalizarTexto(s: string): string {
  return normalizarTextoConsig(s);
}

function idEvento(parts: string[]): string {
  return parts.filter(Boolean).join("__");
}

function parseValorBrlLinha(texto: string): number {
  const m = /R\$\s*([\d.]+,\d{2})/.exec(texto);
  if (!m) return 0;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseCompetenciaMesAno(mes: string, ano: string): string | null {
  const MESES: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    março: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };
  const m = MESES[mes.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
  if (!m) return null;
  return `${ano}-${String(m).padStart(2, "0")}`;
}

/** Extrai linhas da tela "Descontos Recuperados" do portal ConsigFácil. */
export function extrairDescontosRecuperadosDoTexto(texto: string): DescontoRecuperadoConsigfacil[] {
  const norm = texto.replace(/\u00a0/g, " ");
  if (!/descontos?\s+recuperados/i.test(norm)) return [];

  const linhas = norm.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
  const saida: DescontoRecuperadoConsigfacil[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const periodoMatch =
      /(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i.exec(
        linha,
      );
    if (!periodoMatch) continue;

    const competencia = parseCompetenciaMesAno(periodoMatch[1], periodoMatch[2]);
    if (!competencia) continue;

    const parcelaMatch = /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/.exec(linha);
    const parcela_numero = parcelaMatch ? Number(parcelaMatch[1]) : null;

    const verbaMatch = /\b(\d{3,5})\b/.exec(linha);
    const verba = verbaMatch?.[1] ?? null;

    const retorno =
      linhas
        .slice(i, i + 4)
        .find((l) => /descontado|bloqueado|nao descontado|não descontado|recuperado|processado/i.test(l)) ??
      linha;

    const valor_desconto = parseValorBrlLinha(
      linhas.slice(i, i + 3).join(" ") || linha,
    );

    saida.push({
      folha: /governo|amazonas|estado/i.test(linha) ? linha : null,
      competencia,
      parcela_numero: Number.isFinite(parcela_numero) ? parcela_numero : null,
      verba,
      retorno,
      valor_desconto,
    });
  }

  return saida;
}

export function extrairDescontosRecuperadosDeSnapshots(
  snapshots: ConsigfacilSnapshot[],
): DescontoRecuperadoConsigfacil[] {
  const map = new Map<string, DescontoRecuperadoConsigfacil>();
  for (const s of snapshots) {
    for (const d of extrairDescontosRecuperadosDoTexto(s.bruto)) {
      const key = `${d.competencia}__${d.parcela_numero ?? ""}__${d.verba ?? ""}`;
      map.set(key, d);
    }
  }
  return Array.from(map.values());
}

function contratoPorChave(
  contratos: ConsigfacilContrato[],
): {
  porId: Map<string, ConsigfacilContrato>;
  porCodigo: Map<string, ConsigfacilContrato>;
  porBanco: Map<string, ConsigfacilContrato[]>;
} {
  const porId = new Map<string, ConsigfacilContrato>();
  const porCodigo = new Map<string, ConsigfacilContrato>();
  const porBanco = new Map<string, ConsigfacilContrato[]>();

  for (const c of contratos) {
    porId.set(c.id_consignacao, c);
    if (c.codigo_instituicao) {
      porCodigo.set(normalizarTexto(c.codigo_instituicao), c);
      porCodigo.set(c.codigo_instituicao, c);
    }
    const bk = chaveBanco(c.instituicao);
    const arr = porBanco.get(bk) ?? [];
    arr.push(c);
    porBanco.set(bk, arr);
  }
  return { porId, porCodigo, porBanco };
}

function resolverContrato(
  refs: ReturnType<typeof contratoPorChave>,
  opts: { id?: string | null; codigo?: string | null; banco?: string | null },
): ConsigfacilContrato | null {
  if (opts.id) {
    const c = refs.porId.get(opts.id);
    if (c) return c;
  }
  if (opts.codigo) {
    const c =
      refs.porCodigo.get(opts.codigo) ??
      refs.porCodigo.get(normalizarTexto(opts.codigo));
    if (c) return c;
  }
  if (opts.banco) {
    const lista = refs.porBanco.get(chaveBanco(opts.banco));
    if (lista?.length === 1) return lista[0];
  }
  return null;
}

function classificarRetornoDesconto(retorno: string): {
  tipo: EventoOperacionalConsignado["tipo"];
  motivo: MotivoQuebraDesconto;
  score: number;
} {
  const t = normalizarTexto(retorno);
  if (/bloqueado/.test(t)) {
    return { tipo: "bloqueio", motivo: "bloqueio_governo", score: 0.92 };
  }
  if (/nao descontado|não descontado|nao processado|não processado/.test(t)) {
    return { tipo: "desconto_nao_processado", motivo: "nao_processado", score: 0.9 };
  }
  if (/foi descontado|descontado com sucesso|valor enviado foi descontado/.test(t)) {
    return { tipo: "desconto_recuperado", motivo: "desconhecido", score: 0.85 };
  }
  if (/recuperado/.test(t)) {
    return { tipo: "desconto_recuperado", motivo: "desconhecido", score: 0.8 };
  }
  if (/margem/.test(t)) {
    return { tipo: "retorno_operacional", motivo: "margem_insuficiente", score: 0.75 };
  }
  return { tipo: "retorno_operacional", motivo: "erro_operacional", score: 0.5 };
}

function pushEvento(
  lista: EventoOperacionalConsignado[],
  ev: Omit<EventoOperacionalConsignado, "afeta_conferencia_refinanciamento" | "remover_falso_positivo_refin">,
): void {
  const suprime = TIPOS_SUPRIMEM_REFIN.has(ev.tipo);
  lista.push({
    ...ev,
    afeta_conferencia_refinanciamento: suprime,
    remover_falso_positivo_refin: suprime,
  });
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

export function detectarEventosOperacionais(
  input: EntradaDetectarEventosOperacionais,
): EventoOperacionalConsignado[] {
  const eventos: EventoOperacionalConsignado[] = [];
  const refs = contratoPorChave(input.contratos);

  let descontosRecuperados = input.descontosRecuperados ?? [];
  if (input.textosBrutosConsigfacil?.length) {
    for (const t of input.textosBrutosConsigfacil) {
      descontosRecuperados = descontosRecuperados.concat(extrairDescontosRecuperadosDoTexto(t));
    }
  }

  // ---- Contratos: suspensão / inadimplência no texto --------------------------------
  for (const c of input.contratos) {
    const banco = resolverInstituicaoOficial(c.instituicao)?.nome_normalizado ?? c.instituicao;
    const contratoRef = c.codigo_instituicao ?? c.id_consignacao;
    const texto = [c.observacao, c.situacao_importacao, c.texto_bruto].filter(Boolean).join(" ");

    if (c.status === "suspenso" || /suspenso|suspensao|suspensão/i.test(texto)) {
      pushEvento(eventos, {
        tipo: "suspensao",
        banco,
        contrato: contratoRef,
        competencia: c.competencia,
        parcela_numero:
          c.parcela_atual != null && c.parcela_atual > 0 ? c.parcela_atual : null,
        valor_previsto: c.valor_parcela,
        valor_descontado: null,
        origem: "consigfacil",
        justificativa:
          c.status === "suspenso"
            ? "Status oficial SUSPENSO no ConsigFácil."
            : "Indício textual de suspensão no portal.",
        score_confianca: c.status === "suspenso" ? 0.95 : 0.75,
      });
    }

    if (/inadimpl|gestao inadimplencia|gestão inadimplência/i.test(texto)) {
      pushEvento(eventos, {
        tipo: "inadimplencia",
        banco,
        contrato: contratoRef,
        competencia: c.competencia,
        parcela_numero:
          c.parcela_atual != null && c.parcela_atual > 0 ? c.parcela_atual : null,
        valor_previsto: c.valor_parcela,
        valor_descontado: null,
        origem: "consigfacil",
        justificativa: "Setor ou menção de inadimplência consignada no registro oficial.",
        score_confianca: 0.88,
      });
    }
  }

  // ---- Histórico portal -----------------------------------------------------------
  for (const h of input.historico ?? []) {
    const c = refs.porId.get(h.id_consignacao);
    const banco = c
      ? (resolverInstituicaoOficial(c.instituicao)?.nome_normalizado ?? c.instituicao)
      : null;
    const contratoRef = c?.codigo_instituicao ?? h.id_consignacao;

    if (h.evento === "suspensao") {
      pushEvento(eventos, {
        tipo: "suspensao",
        banco,
        contrato: contratoRef,
        competencia: h.competencia,
        parcela_numero: c?.parcela_atual ?? null,
        valor_previsto: c?.valor_parcela ?? null,
        valor_descontado: null,
        origem: "consigfacil",
        justificativa: h.detalhe || "Evento de suspensão no histórico ConsigFácil.",
        score_confianca: 0.93,
      });
    }
  }

  // ---- Descontos recuperados (tela governo) -----------------------------------------
  const porContratoCompetencia = new Map<string, DescontoRecuperadoConsigfacil[]>();
  for (const d of descontosRecuperados) {
    const candidatos = input.contratos.filter((c) => {
      if (d.verba && c.codigo_instituicao?.includes(d.verba)) return true;
      if (d.parcela_numero != null && c.parcela_atual === d.parcela_numero) return true;
      return false;
    });
    const c = candidatos.length === 1 ? candidatos[0] : candidatos[0] ?? null;
    const chave = `${c?.id_consignacao ?? "avulso"}__${d.competencia}`;
    const arr = porContratoCompetencia.get(chave) ?? [];
    arr.push(d);
    porContratoCompetencia.set(chave, arr);
  }

  for (const d of descontosRecuperados) {
    const c =
      input.contratos.find(
        (x) =>
          (d.verba && x.codigo_instituicao?.includes(d.verba)) ||
          (d.parcela_numero != null && x.parcela_atual === d.parcela_numero),
      ) ?? null;
    const banco = c
      ? (resolverInstituicaoOficial(c.instituicao)?.nome_normalizado ?? c.instituicao)
      : null;
    const contratoRef = c?.codigo_instituicao ?? c?.id_consignacao ?? null;
    const valorPrevisto = c?.valor_parcela ?? null;
    const { tipo, motivo, score } = classificarRetornoDesconto(d.retorno);

    pushEvento(eventos, {
      tipo,
      banco,
      contrato: contratoRef,
      competencia: d.competencia,
      parcela_numero: d.parcela_numero,
      valor_previsto: valorPrevisto,
      valor_descontado: d.valor_desconto,
      origem: "consigfacil",
      justificativa: `${d.retorno}${motivo !== "desconhecido" ? ` (${motivo})` : ""}`,
      score_confianca: d.valor_desconto === 0 && valorPrevisto && valorPrevisto > 0 ? Math.max(score, 0.9) : score,
    });
  }

  // Quebra temporária: sequência desconto ok → bloqueio/não processado
  for (const [, regs] of porContratoCompetencia) {
    if (regs.length < 2) continue;
    const ordenados = regs.slice().sort((a, b) => a.competencia.localeCompare(b.competencia));
    for (let i = 1; i < ordenados.length; i++) {
      const ant = ordenados[i - 1];
      const atu = ordenados[i];
      const antOk = ant.valor_desconto > 0 || /foi descontado/i.test(ant.retorno);
      const atuQuebra =
        atu.valor_desconto === 0 ||
        /bloqueado|nao descontado|não descontado/i.test(atu.retorno);
      if (!antOk || !atuQuebra) continue;

      const cMatch =
        input.contratos.find(
          (x) =>
            atu.parcela_numero != null &&
            (x.parcela_atual === atu.parcela_numero ||
              (atu.verba != null && x.codigo_instituicao?.includes(atu.verba))),
        ) ?? input.contratos[0] ?? null;
      const contratoRef = cMatch?.codigo_instituicao ?? cMatch?.id_consignacao ?? null;
      const banco = cMatch
        ? (resolverInstituicaoOficial(cMatch.instituicao)?.nome_normalizado ?? cMatch.instituicao)
        : null;

      pushEvento(eventos, {
        tipo: "quebra_temporaria",
        banco: banco ? (resolverInstituicaoOficial(banco)?.nome_normalizado ?? banco) : null,
        contrato: contratoRef,
        competencia: atu.competencia,
        parcela_numero: atu.parcela_numero,
        valor_previsto: null,
        valor_descontado: atu.valor_desconto,
        origem: "consigfacil",
        justificativa: `Quebra entre ${ant.competencia} (desconto ok) e ${atu.competencia} (${atu.retorno}).`,
        score_confianca: 0.87,
      });
    }
  }

  // ---- E-mails operacionais (ex.: PAN — suspensão) ----------------------------------
  for (const em of input.emailsOperacionais ?? []) {
    const c = resolverContrato(refs, {
      codigo: em.contrato,
      banco: em.banco,
    });
    const banco =
      em.banco ??
      (c ? (resolverInstituicaoOficial(c.instituicao)?.nome_normalizado ?? c.instituicao) : null);
    const contratoRef = em.contrato ?? c?.codigo_instituicao ?? c?.id_consignacao ?? null;

    const tipo: EventoOperacionalConsignado["tipo"] =
      em.tipo === "suspensao"
        ? "suspensao"
        : em.tipo === "bloqueio"
          ? "bloqueio"
          : em.tipo === "inadimplencia"
            ? "inadimplencia"
            : "retorno_operacional";

    pushEvento(eventos, {
      tipo,
      banco,
      contrato: contratoRef,
      competencia: c?.competencia ?? null,
      parcela_numero: c?.parcela_atual ?? null,
      valor_previsto: c?.valor_parcela ?? null,
      valor_descontado: null,
      origem: "email",
      justificativa: em.texto.slice(0, 500),
      score_confianca: 0.9,
    });
  }

  // ---- Divergências folha × ConsigFácil (valor zero com parcela ativa) --------------
  for (const d of input.divergenciasFolhaExtrato ?? []) {
    const c = refs.porId.get(d.id_consignacao);
    if (!c) continue;
    if (d.valor_observado > 0) continue;

    const evs = eventos.filter(
      (e) =>
        e.remover_falso_positivo_refin &&
        (e.contrato === c.codigo_instituicao ||
          e.contrato === c.id_consignacao ||
          chaveBanco(e.banco ?? "") === chaveBanco(c.instituicao)),
    );
    if (evs.length > 0) continue;

    pushEvento(eventos, {
      tipo: "desconto_nao_processado",
      banco: d.instituicao,
      contrato: c.codigo_instituicao ?? c.id_consignacao,
      competencia: d.competencia,
      parcela_numero:
        c.parcela_atual != null && c.parcela_atual > 0 ? c.parcela_atual : null,
      valor_previsto: d.valor_consigfacil,
      valor_descontado: d.valor_observado,
      origem: "contracheque",
      justificativa:
        d.motivo ??
        "Parcela oficial ativa sem desconto observado na folha (divergência ConsigFácil × contracheque).",
      score_confianca: 0.7,
    });
  }

  // ---- Base conciliada: desconto ausente com contrato ativo já justificado ----------
  for (const l of input.baseConciliada ?? []) {
    if (l.origem !== "contracheque") continue;
    if (Math.abs(l.valor) > 0) continue;
    const c = input.contratos.find(
      (x) =>
        chaveBanco(x.instituicao) === chaveBanco(l.banco_origem || "") &&
        (x.status === "suspenso" || x.status === "ativo"),
    );
    if (!c || c.status !== "suspenso") continue;

    const jaTem = eventos.some(
      (e) =>
        e.competencia === l.competencia &&
        e.tipo === "suspensao" &&
        chaveBanco(e.banco ?? "") === chaveBanco(c.instituicao),
    );
    if (jaTem) continue;

    pushEvento(eventos, {
      tipo: "desconto_nao_processado",
      banco: l.banco_origem,
      contrato: c.codigo_instituicao ?? c.id_consignacao,
      competencia: l.competencia,
      parcela_numero:
        c.parcela_atual != null && c.parcela_atual > 0 ? c.parcela_atual : null,
      valor_previsto: c.valor_parcela,
      valor_descontado: 0,
      origem: "contracheque",
      justificativa: "Desconto zero em folha com contrato suspenso no ConsigFácil.",
      score_confianca: 0.82,
    });
  }

  return deduplicarEventos(eventos);
}

function deduplicarEventos(eventos: EventoOperacionalConsignado[]): EventoOperacionalConsignado[] {
  const map = new Map<string, EventoOperacionalConsignado>();
  for (const e of eventos) {
    const key = idEvento([
      e.tipo,
      e.banco ?? "",
      e.contrato ?? "",
      e.competencia ?? "",
      String(e.parcela_numero ?? ""),
      e.origem,
    ]);
    const prev = map.get(key);
    if (!prev || e.score_confianca > prev.score_confianca) {
      map.set(key, e);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ca = a.competencia ?? "";
    const cb = b.competencia ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return (b.score_confianca ?? 0) - (a.score_confianca ?? 0);
  });
}

/** Eventos que impedem inferência automática de refinanciamento / encerramento. */
export function eventoSuprimeInferenciaRefin(e: EventoOperacionalConsignado): boolean {
  return e.remover_falso_positivo_refin;
}

export function contratoTemJustificativaOperacional(
  eventos: EventoOperacionalConsignado[],
  contrato: ConsigfacilContrato,
): boolean {
  const cod = contrato.codigo_instituicao ?? contrato.id_consignacao;
  const bk = chaveBanco(contrato.instituicao);
  return eventos.some(
    (e) =>
      e.remover_falso_positivo_refin &&
      (e.contrato === cod ||
        e.contrato === contrato.id_consignacao ||
        (e.banco != null && chaveBanco(e.banco) === bk)),
  );
}

export function resolverMotivoQuebraDesconto(
  eventos: EventoOperacionalConsignado[],
  contrato: ConsigfacilContrato,
  competencia?: string | null,
): MotivoQuebraDesconto {
  const cod = contrato.codigo_instituicao ?? contrato.id_consignacao;
  const bk = chaveBanco(contrato.instituicao);

  const relevantes = eventos.filter((e) => {
    const matchContrato =
      e.contrato === cod ||
      e.contrato === contrato.id_consignacao ||
      (e.banco != null && chaveBanco(e.banco) === bk);
    if (!matchContrato) return false;
    if (competencia && e.competencia && e.competencia !== competencia) return false;
    return true;
  });

  if (relevantes.some((e) => e.tipo === "suspensao")) return "suspensao_operacional";
  if (relevantes.some((e) => e.tipo === "inadimplencia")) return "inadimplencia";
  if (relevantes.some((e) => e.tipo === "bloqueio")) return "bloqueio_governo";
  if (relevantes.some((e) => e.tipo === "desconto_nao_processado")) return "nao_processado";
  if (relevantes.some((e) => e.tipo === "quebra_temporaria")) return "erro_operacional";

  const j = normalizarTexto(
    [contrato.observacao, contrato.situacao_importacao].filter(Boolean).join(" "),
  );
  if (/margem/.test(j)) return "margem_insuficiente";
  if (contrato.status === "suspenso") return "suspensao_operacional";

  return "desconhecido";
}

export type LinhaTimelineContrato = {
  competencia: string;
  evento: string;
  tipo: EventoOperacionalConsignado["tipo"] | "desconto_normal";
  valor_previsto: number | null;
  valor_descontado: number | null;
  origem: EventoOperacionalConsignado["origem"] | "inferencia";
};

/** Linha do tempo operacional por contrato (competência × evento). */
export function montarLinhaDoTempoContrato(
  contrato: ConsigfacilContrato,
  eventos: EventoOperacionalConsignado[],
  descontosRecuperados?: DescontoRecuperadoConsigfacil[],
): LinhaTimelineContrato[] {
  const cod = contrato.codigo_instituicao ?? contrato.id_consignacao;
  const bk = chaveBanco(contrato.instituicao);
  const linhas: LinhaTimelineContrato[] = [];

  const dr =
    descontosRecuperados?.filter(
      (d) =>
        (d.verba && contrato.codigo_instituicao?.includes(d.verba)) ||
        (d.parcela_numero != null && d.parcela_numero === contrato.parcela_atual),
    ) ?? [];

  for (const d of dr) {
    const { tipo } = classificarRetornoDesconto(d.retorno);
    linhas.push({
      competencia: d.competencia,
      evento:
        d.valor_desconto > 0
          ? "Desconto processado"
          : /bloqueado/i.test(d.retorno)
            ? "Bloqueado — não descontado"
            : "Não descontado",
      tipo: d.valor_desconto > 0 ? "desconto_recuperado" : tipo,
      valor_previsto: contrato.valor_parcela,
      valor_descontado: d.valor_desconto,
      origem: "consigfacil",
    });
  }

  for (const e of eventos) {
    const match =
      e.contrato === cod ||
      e.contrato === contrato.id_consignacao ||
      (e.banco != null && chaveBanco(e.banco) === bk);
    if (!match || !e.competencia) continue;
    linhas.push({
      competencia: e.competencia,
      evento: e.justificativa ?? e.tipo,
      tipo: e.tipo,
      valor_previsto: e.valor_previsto,
      valor_descontado: e.valor_descontado,
      origem: e.origem,
    });
  }

  const porComp = new Map<string, LinhaTimelineContrato>();
  for (const l of linhas) {
    const prev = porComp.get(l.competencia);
    if (!prev || l.tipo !== "desconto_recuperado") {
      porComp.set(l.competencia, l);
    }
  }

  return Array.from(porComp.values()).sort((a, b) => a.competencia.localeCompare(b.competencia));
}
