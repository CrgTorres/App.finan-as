import type { ContratoEmprestimoAnalise } from "@/lib/anexos/emprestimos-analise-from-payslips";

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

/** Estado da triagem manual no painel (não altera parsers nem dados brutos). */
export type PendenciaRevisaoStatus =
  | "confirmado"
  | "problema_confirmado"
  | "marcado_ocr"
  | "contrato_diferente"
  | "mesmo_contrato"
  | "eh_refinanciamento"
  | "ignorado"
  | "resolvido"
  | "revisao_pendente";

export type PendenciaImpactoUi = "baixo" | "medio" | "alto";

export type PendenciaTipoUi =
  | "ocr"
  | "ausencia_folha"
  | "possivel_refinanciamento"
  | "parcela_ausente"
  | "continuidade"
  | "duplicidade";

export type PendenciaAnaliseEnriquecida = {
  id: string;
  raw: string;
  grupoLabel: string;
  contratoChave: string | null;
  descricaoLinha: string;
  detalheImpacto: string;
  impacto: PendenciaImpactoUi;
  tipo: PendenciaTipoUi;
  /** Heurística só para ordenação na revisão guiada (texto da pendência). */
  guiadaParcelaForaSequencia: boolean;
};

export type PendenciaRevisaoStoreV1 = {
  version: 1;
  byId: Record<string, PendenciaRevisaoStatus>;
};

export type PendenciaRevisaoStore = {
  version: 2;
  byId: Record<string, PendenciaRevisaoStatus>;
  observacoes: Record<string, string>;
};

export const LS_PENDENCIAS_REVISAO = "financaPendenciasAnaliseRevisaoV1";

function competenciaOrdem(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function mesLabel(year: number, month: number): string {
  return `${MESES_ABREV[month - 1]}/${String(year).slice(-2)}`;
}

/** Hash estável (djb2) — id deriva só do texto bruto da pendência. */
export function pendenciaStableId(raw: string): string {
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = (h * 33) ^ raw.charCodeAt(i);
  }
  return `p${(h >>> 0).toString(36)}`;
}

function tipoFromText(text: string): PendenciaTipoUi {
  const t = text.toLowerCase();
  if (/mais de um lançamento|duplicidade|fundir anexos da competência/i.test(text)) return "duplicidade";
  if (/sem par parcela|progresso e saldo devedor|n\/m confiável|parcela atual\/total/i.test(t)) return "parcela_ausente";
  if (
    /01\/01|marcador fraco|reforço de ocr|pelo ocr|rubrica renomeada pelo ocr|limite de rubricas no ocr|credicesta vs credcesta|tokens/i.test(
      t,
    )
  ) {
    return "ocr";
  }
  if (
    /renegocia|amortiza|difere da mediana|troca de contrato|valor .* difere/i.test(t)
  ) {
    return "possivel_refinanciamento";
  }
  if (
    /sem nenhum anexo gravado|mês\(es\) sem nenhum|inferida\(s\) só pela sequência|pdf?s desses meses|buracos|série temporal/i.test(
      t,
    ) ||
    /folha gravada mas sem rubrica reconhecida/i.test(t) ||
    /competência\(s\) inferida/i.test(t)
  ) {
    return "ausencia_folha";
  }
  return "continuidade";
}

function impactoFromText(text: string, tipo: PendenciaTipoUi): PendenciaImpactoUi {
  const t = text.toLowerCase();
  if (/para análise mais assertiva|gov\.br|portais oficiais|adiantamento parcial|foram ignoradas automaticamente/i.test(t)) {
    return "baixo";
  }
  if (tipo === "duplicidade" || tipo === "parcela_ausente") return "alto";
  if (tipo === "ocr" && /marcador fraco|01\/01/i.test(t)) return "alto";
  if (/aparece em apenas uma competência|não dá para validar continuidade/i.test(t)) return "alto";
  if (/difere da mediana/i.test(t)) return "alto";
  if (tipo === "possivel_refinanciamento") return "medio";
  if (tipo === "ausencia_folha") return "medio";
  if (/intervalo de \d+ competência/i.test(t)) return "medio";
  return "medio";
}

export const LABEL_TIPO_PENDENCIA: Record<PendenciaTipoUi, string> = {
  ocr: "OCR",
  ausencia_folha: "Ausência de folha",
  possivel_refinanciamento: "Possível refinanciamento",
  parcela_ausente: "Parcela ausente",
  continuidade: "Continuidade",
  duplicidade: "Duplicidade",
};

export const LABEL_IMPACTO_PENDENCIA: Record<PendenciaImpactoUi, string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
};

function parseCorpoPortugues(raw: string): { grupoLabel: string; corpo: string } {
  const m = raw.match(/^«([^»]+)»\s*:\s*([\s\S]*)$/);
  if (m) {
    return { grupoLabel: m[1]!.trim(), corpo: m[2]!.trim() };
  }
  return { grupoLabel: "Geral", corpo: raw.trim() };
}

function splitDescricaoDetalhe(corpo: string): { descricaoLinha: string; detalheImpacto: string } {
  const idx = corpo.indexOf(" — ");
  if (idx >= 0) {
    return {
      descricaoLinha: corpo.slice(0, idx).trim(),
      detalheImpacto: corpo.slice(idx + 3).trim(),
    };
  }
  return { descricaoLinha: corpo, detalheImpacto: "" };
}

export function encontrarContratoPorLabel(label: string, contratos: ContratoEmprestimoAnalise[]): ContratoEmprestimoAnalise | null {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
  const n = norm(label);
  const exato = contratos.find((c) => norm(c.label) === n);
  if (exato) return exato;
  return (
    contratos.find((c) => {
      const cn = norm(c.label);
      return cn.includes(n) || n.includes(cn);
    }) ?? null
  );
}

/** Última competência com folha real (não só inferida). */
export function periodoDetectadoContrato(c: ContratoEmprestimoAnalise): {
  primeira: { year: number; month: number } | null;
  ultima: { year: number; month: number } | null;
} {
  const occReais = c.ocorrencias.filter((o) => !o.inferidoSemFolha);
  if (occReais.length === 0) return { primeira: null, ultima: null };
  const sorted = [...occReais].sort(
    (a, b) => competenciaOrdem(a.year, a.month) - competenciaOrdem(b.year, b.month),
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return {
    primeira: { year: first.year, month: first.month },
    ultima: { year: last.year, month: last.month },
  };
}

export function formatarPeriodoContrato(c: ContratoEmprestimoAnalise): string | null {
  const { primeira, ultima } = periodoDetectadoContrato(c);
  if (!primeira || !ultima) return null;
  return `${mesLabel(primeira.year, primeira.month)} – ${mesLabel(ultima.year, ultima.month)}`;
}

export function situacaoContratoNaBase(
  c: ContratoEmprestimoAnalise,
  ultimaCompetenciaGlobal: { year: number; month: number } | null,
): "ativo" | "finalizado" {
  const up = c.ultimaParcela;
  if (up && up.total > 0 && up.atual >= up.total) return "finalizado";

  const occReais = c.ocorrencias.filter((o) => !o.inferidoSemFolha);
  if (occReais.length === 0) return "ativo";

  let last = occReais[0]!;
  for (const o of occReais) {
    if (competenciaOrdem(o.year, o.month) > competenciaOrdem(last.year, last.month)) last = o;
  }

  if (!ultimaCompetenciaGlobal) return "ativo";
  const ordLast = competenciaOrdem(last.year, last.month);
  const ordBase = competenciaOrdem(ultimaCompetenciaGlobal.year, ultimaCompetenciaGlobal.month);
  if (ordBase - ordLast <= 1) return "ativo";
  return "finalizado";
}

export function enriquecerPendenciasAnalise(
  pendencias: string[],
  contratos: ContratoEmprestimoAnalise[],
): PendenciaAnaliseEnriquecida[] {
  return pendencias.map((raw) => {
    const { grupoLabel, corpo } = parseCorpoPortugues(raw);
    const { descricaoLinha, detalheImpacto } = splitDescricaoDetalhe(corpo);
    const contrato = grupoLabel !== "Geral" ? encontrarContratoPorLabel(grupoLabel, contratos) : null;
    const tipo = tipoFromText(raw);
    const impacto = impactoFromText(raw, tipo);
    const guiadaParcelaForaSequencia =
      /quebra|fora de sequência|fora de sequencia|sequ(ê|e)ncia|at[ií]pica|incoerente|parcela[s]?\s+fora/i.test(
        raw,
      );
    return {
      id: pendenciaStableId(raw),
      raw,
      grupoLabel,
      contratoChave: contrato?.chave ?? null,
      descricaoLinha: descricaoLinha || corpo.slice(0, 160),
      detalheImpacto,
      impacto,
      tipo,
      guiadaParcelaForaSequencia,
    };
  });
}

function storeV2Vazio(): PendenciaRevisaoStore {
  return { version: 2, byId: {}, observacoes: {} };
}

function normalizarStoreCarregado(parsed: unknown): PendenciaRevisaoStore {
  if (!parsed || typeof parsed !== "object") return storeV2Vazio();
  const p = parsed as Partial<PendenciaRevisaoStore> & Partial<PendenciaRevisaoStoreV1>;
  if (p.version === 2 && p.byId && typeof p.byId === "object") {
    return {
      version: 2,
      byId: { ...(p.byId as Record<string, PendenciaRevisaoStatus>) },
      observacoes:
        p.observacoes && typeof p.observacoes === "object" ? { ...p.observacoes } : {},
    };
  }
  if (p.version === 1 && p.byId && typeof p.byId === "object") {
    return { version: 2, byId: { ...(p.byId as Record<string, PendenciaRevisaoStatus>) }, observacoes: {} };
  }
  return storeV2Vazio();
}

export function carregarRevisaoPendenciasLocal(): PendenciaRevisaoStore {
  if (typeof window === "undefined") return storeV2Vazio();
  try {
    const raw = localStorage.getItem(LS_PENDENCIAS_REVISAO);
    if (!raw) return storeV2Vazio();
    return normalizarStoreCarregado(JSON.parse(raw));
  } catch {
    return storeV2Vazio();
  }
}

export function salvarRevisaoPendenciasLocal(store: PendenciaRevisaoStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_PENDENCIAS_REVISAO, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export type ResumoRevisaoPendencias = {
  total: number;
  abertas: number;
  confirmadas: number;
  ignoradas: number;
  resolvidas: number;
  revisaoPendente: number;
  contratosAfetados: number;
  /** Pendências de alto impacto ainda em aberto (não resolvida nem ignorada). */
  altoImpactoAbertas: number;
  /** Contratos distintos (rótulo «…», exc. Geral) com ≥1 pendência alta aberta. */
  contratosComAltoImpactoAberto: number;
  /** Triagem marcou explicitamente «É refinanciamento» (decisão humana, não inferência da engine). */
  refinanciamentoConfirmadoTriagem: number;
};

/** Pacote emitido para sincronizar painéis do dashboard com a revisão de pendências da folha. */
export type PendenciasRevisaoSyncSnapshot = {
  resumo: ResumoRevisaoPendencias;
  /** Contagem de pendências altas abertas por grupo (inclui «Geral» quando aplicável). */
  altoAbertoPorGrupo: Record<string, number>;
  /** Pendências em aberto por tipo (só totais agregados; UI não repete a engine). */
  abertosPorTipo: Record<PendenciaTipoUi, number>;
};

export function pendenciaStatusEmAbertoParaSync(st: PendenciaRevisaoStatus | undefined): boolean {
  return st !== "resolvido" && st !== "ignorado";
}

export function pendenciaConfirmadaParaResumo(st: PendenciaRevisaoStatus | undefined): boolean {
  return st === "confirmado" || st === "problema_confirmado";
}

/** Ordenação revisão guiada: menor tupla = revisar antes. */
export function chaveOrdenacaoGuiada(
  it: PendenciaAnaliseEnriquecida,
  contratos: ContratoEmprestimoAnalise[],
  ultimaCompetenciaGlobal: { year: number; month: number } | null,
): [number, number, number, number, number, number] {
  const imp = it.impacto === "alto" ? 0 : it.impacto === "medio" ? 1 : 2;
  let ativ = 2;
  if (it.grupoLabel !== "Geral") {
    const c = encontrarContratoPorLabel(it.grupoLabel, contratos);
    if (c) ativ = situacaoContratoNaBase(c, ultimaCompetenciaGlobal) === "ativo" ? 0 : 1;
  }
  const dup = it.tipo === "duplicidade" ? 0 : 1;
  const ref = it.tipo === "possivel_refinanciamento" ? 0 : 1;
  const pfs = it.guiadaParcelaForaSequencia ? 0 : 1;
  const ocr = it.tipo === "ocr" ? 0 : 1;
  return [imp, ativ, dup, ref, pfs, ocr];
}

export function compararPendenciasGuiada(
  a: PendenciaAnaliseEnriquecida,
  b: PendenciaAnaliseEnriquecida,
  contratos: ContratoEmprestimoAnalise[],
  ultimaCompetenciaGlobal: { year: number; month: number } | null,
): number {
  const ka = chaveOrdenacaoGuiada(a, contratos, ultimaCompetenciaGlobal);
  const kb = chaveOrdenacaoGuiada(b, contratos, ultimaCompetenciaGlobal);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  const cmpG = a.grupoLabel.localeCompare(b.grupoLabel, "pt-BR", { sensitivity: "base", numeric: true });
  if (cmpG !== 0) return cmpG;
  return a.id.localeCompare(b.id);
}

export type ResumoPainelGuiada = {
  criticasAbertas: number;
  resolvidas: number;
  contratosPrecisamDocumento: number;
  contratosValidacaoManual: number;
};

export function calcularResumoPainelGuiada(
  items: PendenciaAnaliseEnriquecida[],
  byId: Record<string, PendenciaRevisaoStatus | undefined>,
): ResumoPainelGuiada {
  let criticasAbertas = 0;
  let resolvidas = 0;
  const docGrupos = new Set<string>();
  const manualGrupos = new Set<string>();

  for (const it of items) {
    const st = byId[it.id];
    if (st === "resolvido") resolvidas++;
    if (pendenciaStatusEmAbertoParaSync(st) && it.impacto === "alto") criticasAbertas++;

    if (it.grupoLabel === "Geral") continue;
    if (!pendenciaStatusEmAbertoParaSync(st)) continue;

    const precisaDoc =
      it.tipo === "ausencia_folha" ||
      /inferid|pdf|anexe|buracos|sem nenhum anexo|folha gravada mas sem rubrica/i.test(it.raw);
    if (precisaDoc) docGrupos.add(it.grupoLabel);

    const validManual =
      it.tipo === "duplicidade" ||
      it.tipo === "possivel_refinanciamento" ||
      it.tipo === "ocr" ||
      it.tipo === "parcela_ausente" ||
      it.guiadaParcelaForaSequencia ||
      it.impacto === "alto" ||
      st === "revisao_pendente" ||
      pendenciaConfirmadaParaResumo(st) ||
      st === "marcado_ocr" ||
      st === "contrato_diferente" ||
      st === "mesmo_contrato" ||
      st === "eh_refinanciamento";
    if (validManual) manualGrupos.add(it.grupoLabel);
  }

  return {
    criticasAbertas,
    resolvidas,
    contratosPrecisamDocumento: docGrupos.size,
    contratosValidacaoManual: manualGrupos.size,
  };
}

export function calcularResumoRevisao(
  items: PendenciaAnaliseEnriquecida[],
  byId: Record<string, PendenciaRevisaoStatus | undefined>,
): ResumoRevisaoPendencias {
  let confirmadas = 0;
  let ignoradas = 0;
  let resolvidas = 0;
  let revisaoPendente = 0;
  let abertas = 0;
  const grupos = new Set<string>();
  let altoImpactoAbertas = 0;
  const gruposAlto = new Set<string>();
  let refinanciamentoConfirmadoTriagem = 0;

  for (const it of items) {
    const st = byId[it.id];
    if (st === "eh_refinanciamento") refinanciamentoConfirmadoTriagem++;
    if (pendenciaConfirmadaParaResumo(st)) confirmadas++;
    else if (st === "ignorado") ignoradas++;
    else if (st === "resolvido") resolvidas++;
    else if (st === "revisao_pendente") revisaoPendente++;
    else abertas++;

    if (it.grupoLabel !== "Geral") grupos.add(it.grupoLabel);

    if (it.impacto === "alto" && pendenciaStatusEmAbertoParaSync(st)) {
      altoImpactoAbertas++;
      gruposAlto.add(it.grupoLabel);
    }
  }

  const contratosComAltoImpactoAberto = [...gruposAlto].filter((g) => g !== "Geral").length;

  return {
    total: items.length,
    abertas,
    confirmadas,
    ignoradas,
    resolvidas,
    revisaoPendente,
    contratosAfetados: grupos.size,
    altoImpactoAbertas,
    contratosComAltoImpactoAberto,
    refinanciamentoConfirmadoTriagem,
  };
}

/** Agrega contagens para o dashboard (evento + hidratação na página de análise). */
export function montarSnapshotRevisaoParaDashboard(
  items: PendenciaAnaliseEnriquecida[],
  byId: Record<string, PendenciaRevisaoStatus | undefined>,
): PendenciasRevisaoSyncSnapshot {
  const resumo = calcularResumoRevisao(items, byId);
  const altoAbertoPorGrupo: Record<string, number> = {};
  const abertosPorTipo: Record<PendenciaTipoUi, number> = {
    ocr: 0,
    ausencia_folha: 0,
    possivel_refinanciamento: 0,
    parcela_ausente: 0,
    continuidade: 0,
    duplicidade: 0,
  };

  for (const it of items) {
    const st = byId[it.id];
    if (pendenciaStatusEmAbertoParaSync(st)) {
      if (st === "marcado_ocr") {
        abertosPorTipo.ocr++;
      } else {
        abertosPorTipo[it.tipo]++;
      }
      if (it.impacto === "alto") {
        altoAbertoPorGrupo[it.grupoLabel] = (altoAbertoPorGrupo[it.grupoLabel] ?? 0) + 1;
      }
    }
  }

  return { resumo, altoAbertoPorGrupo, abertosPorTipo };
}
