import type { Payslip, PayslipItem } from "@/types/contracheque";
import { rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";
import {
  descontoVisaoGastosExcluindoIrEAmazonPrev,
  rubricaEhImpostoRendaOuIrrf,
  rubricaEhAmazonPrevFppm,
  rubricaEhPensaoAlimenticia,
  descontoClassificadoComoEmprestimoNaFolha,
} from "@/lib/anexos/payslip-desconto-historico";
import { confirmacaoBancoCurado } from "@/lib/reading/instituicoes-financeiras";
import { padronizarTokensRubricaOficiais } from "@/lib/anexos/rubrica-nomes-oficiais";
import { inferirParcelasPorVizinhancaMeses, type MesItensParaParcela } from "@/lib/anexos/parcela-vizinhanca";
import { filtrarPayslipsAnaliseSemAdiantamentoParcial130 } from "@/lib/anexos/decimo-terceiro-coerencia";

/** Aplica primeira/última parcela e interpolação entre meses vizinhos (mesma chave código + valor + base). */
function aplicarInferenciaParcelasEmPayslips(deduped: Payslip[]): Payslip[] {
  if (deduped.length === 0) return deduped;
  const meses: MesItensParaParcela[] = deduped.map((p) => ({
    month: p.month,
    year: p.year,
    items: (p.items ?? []).map((it) => ({ ...it })),
  }));
  const inferidos = inferirParcelasPorVizinhancaMeses(meses);
  const mapa = new Map<string, PayslipItem[]>();
  for (const m of inferidos) {
    mapa.set(`${m.year}-${m.month}`, m.items);
  }
  return deduped.map((p) => {
    const items = mapa.get(`${p.year}-${p.month}`);
    if (!items) return p;
    return { ...p, items };
  });
}

/** Mesmo pipeline do painel de empréstimos (fundir anexos por mês + inferência de parcelas). */
export function prepararFolhaParaAnaliseGrafico(payslips: Payslip[]): Payslip[] {
  return aplicarInferenciaParcelasEmPayslips(
    mergePayslipsPorCompetenciaItens(filtrarPayslipsAnaliseSemAdiantamentoParcial130(payslips))
  );
}

function normalizarSlugDescricao(description: string): string {
  const base = padronizarTokensRubricaOficiais(rubricaSemParcelaParaChave(description));
  return base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/([a-z])\1{2,}/g, "$1$1")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .slice(0, 72);
}

/**
 * Identifica o mesmo contrato entre meses (ignora N/M na descrição).
 * BB-EMP com mesmo texto no PDF: separar por **código da rubrica** + **valor da parcela**; parcelas N/M são
 * alinhadas por `inferirParcelasPorVizinhancaMeses` antes desta análise (primeira/última ocorrência e meses vizinhos).
 */
export function chaveContratoEmprestimo(it: PayslipItem): string {
  const c = (it.code ?? "").replace(/\D/g, "").slice(0, 6);
  const v = (Math.round(it.value * 100) / 100).toFixed(2);
  const slug = normalizarSlugDescricao(it.description);
  return `${c}|v:${v}|${slug}`;
}

/** Índice linear do mês (diferença entre dois valores = meses civis entre eles). Evita `year*12+month` com mês 1–12, que salta 13 unidades entre dez e jan. */
function competenciaOrdem(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/** Evita somar duas vezes o mesmo mês quando há folha especial + mensal: prefere mensal principal. */
export function dedupePayslipsPorCompetencia(payslips: Payslip[]): Payslip[] {
  const map = new Map<number, Payslip>();
  const rank = (p: Payslip) => {
    const e = String(p.folha_emit_kind ?? "mensal_principal");
    if (e === "mensal_principal") return 0;
    if (e === "folha_especial") return 1;
    return 2;
  };
  for (const p of filtrarPayslipsAnaliseSemAdiantamentoParcial130(payslips)) {
    const k = competenciaOrdem(p.year, p.month);
    const cur = map.get(k);
    if (!cur || rank(p) < rank(cur)) map.set(k, p);
  }
  return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

const rankEmit = (p: Payslip) => {
  const e = String(p.folha_emit_kind ?? "mensal_principal");
  if (e === "mensal_principal") return 0;
  if (e === "folha_especial") return 1;
  return 2;
};

function assinaturaItemParaFusao(it: PayslipItem): string {
  const d = it.description.trim().toLowerCase().replace(/\s+/g, " ");
  const code = (it.code ?? "").replace(/\s/g, "");
  const v = Number.isFinite(it.value) ? (Math.round(it.value * 100) / 100).toFixed(2) : "0.00";
  return `${it.type}|${code}|${v}|${d.slice(0, 220)}`;
}

/**
 * Mesma competência (mês/ano) pode ter **mensal + ficha financeira + especial**. Antes só se usava um PDF
 * (prioridade mensal), o que **omitia** rubricas que só existiam na ficha (ex.: Caixa). Aqui unimos todas as linhas.
 */
export function mergePayslipsPorCompetenciaItens(payslips: Payslip[]): Payslip[] {
  const groups = new Map<number, Payslip[]>();
  for (const p of payslips) {
    const k = competenciaOrdem(p.year, p.month);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  const merged: Payslip[] = [];
  for (const [, arr] of groups) {
    arr.sort((a, b) => {
      const rk = rankEmit(a) - rankEmit(b);
      if (rk !== 0) return rk;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const base = arr[0]!;
    const seen = new Set<string>();
    const items: PayslipItem[] = [];
    for (const p of arr) {
      for (const it of p.items ?? []) {
        const sig = assinaturaItemParaFusao(it);
        if (seen.has(sig)) continue;
        seen.add(sig);
        items.push({ ...it });
      }
    }
    const multi = arr.length > 1;
    merged.push({
      ...base,
      items,
      folha_emit_kind: multi ? "merged_multi_anexo" : base.folha_emit_kind,
    });
  }
  return merged.sort((a, b) => a.year - b.year || a.month - b.month);
}

function countCompetenciasComVariosAnexos(payslips: Payslip[]): number {
  const g = new Map<number, number>();
  for (const p of payslips) {
    const k = competenciaOrdem(p.year, p.month);
    g.set(k, (g.get(k) ?? 0) + 1);
  }
  let n = 0;
  for (const c of g.values()) {
    if (c > 1) n++;
  }
  return n;
}

export type OcorrenciaEmprestimo = {
  year: number;
  month: number;
  value: number;
  parcelaAtual?: number;
  parcelaTotal?: number;
  folhaEmitKind: string;
  description: string;
  /** Competência preenchida só pela lógica de parcelas (ex.: 05/48 → 06/48) sem PDF desse mês. */
  inferidoSemFolha?: boolean;
};

export type ContratoEmprestimoAnalise = {
  chave: string;
  label: string;
  code?: string;
  /** Texto normalizado (sem N/M) para cruzar rubricas parecidas entre chaves. */
  slugBase: string;
  ocorrencias: OcorrenciaEmprestimo[];
  totalPago: number;
  valorMediano: number;
  /** Última competência com parcela plausível (não só 1/1). */
  ultimaParcela?: { atual: number; total: number };
  fracParcela01: number;
  /** Parcela atual aumenta de 1 em meses consecutivos com folha, mesmo total de parcelas. */
  sequenciaParcelaCoerente: boolean;
  /** Desvio típico da parcela baixo em relação à mediana (≥3 meses). */
  valorRelativamenteEstavel: boolean;
  confianca: "alta" | "media" | "baixa";
  /** COMPE + nome curados e links Bacen / portal da IF (validação manual). */
  confirmacaoInstituicao?: {
    compe: string;
    nome: string;
    confiancaRef: "alta" | "media";
    urlsReferencia: readonly string[];
  };
};

export type PadraoDetectado = {
  mensagem: string;
  contratos?: string[];
};

export type SugestaoResolucao = {
  prioridade: "alta" | "media" | "baixa";
  titulo: string;
  detalhe: string;
};

export type EmprestimosAnaliseFromPayslips = {
  competenciasProcessadas: number;
  primeiraCompetencia: { year: number; month: number } | null;
  ultimaCompetencia: { year: number; month: number } | null;
  contratos: ContratoEmprestimoAnalise[];
  /** Soma de todos os descontos classificados como empréstimo/consignado por competência. */
  serieMensalTotal: Array<{
    key: string;
    label: string;
    /** Descontos classificados como empréstimo/consignado. */
    total: number;
    year: number;
    month: number;
    /** Todos os descontos exceto IR e Amazon Prev (inclui empréstimos + demais rubricas). */
    totalExcIrAmazon: number;
    /** Parte de `totalExcIrAmazon` que não foi classificada como empréstimo pelo heurístico. */
    outrosNaoEmprestimo: number;
    /** Soma mensal de IR / IRRF (para ajuste opcional no gráfico). */
    irMensal: number;
    /** Soma mensal só Amazon Prev (não outras previdências). */
    amazonPrevMensal: number;
    /** Pensão alimentícia estimada na folha (heurística). */
    pensaoAlimenticiaMensal: number;
  }>;
  kpis: {
    nContratosDistintos: number;
    totalHistoricoDescontado: number;
    mediaMensalNoPeriodo: number;
    parcelaNoUltimoMes: number;
    progressoMedioPonderadoPct: number | null;
    /** Soma no período: descontos exc. IR e Amazon Prev. */
    totalHistoricoDescontosExcIrAmazon: number;
    mediaMensalDescontosExcIrAmazon: number;
    totalHistoricoOutrosNaoEmprestimo: number;
    /** Última competência: descontos exc. IR/Amazon (parcelas + outros). */
    descontosExcIrAmazonNoUltimoMes: number;
    outrosNaoEmprestimoNoUltimoMes: number;
  };
  porFaixaProgresso: Array<{ faixa: string; count: number; pct: number }>;
  pendencias: string[];
  padroesDetectados: PadraoDetectado[];
  sugestoesResolucao: SugestaoResolucao[];
  /** Competências inferidas pela sequência N/M (sem PDF); não entram no total pago nem na parcela do último mês. */
  mesesInferidosParcela: number;
};

function mediana(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function mesLabel(year: number, month: number): string {
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[month - 1]}/${String(year).slice(-2)}`;
}

function ocorrenciaParcelaPlausivel(o: OcorrenciaEmprestimo): boolean {
  const a = o.parcelaAtual;
  const t = o.parcelaTotal;
  return a != null && t != null && a >= 1 && t >= 1 && a <= t && !(a === 1 && t === 1);
}

/** Meses civis estritamente entre (y0,m0) e (y1,m1), exclusivos dos extremos. */
function mesesInteriorExclusivo(y0: number, m0: number, y1: number, m1: number): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let y = y0;
  let m = m0;
  for (;;) {
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (competenciaOrdem(y, m) >= competenciaOrdem(y1, m1)) break;
    out.push({ year: y, month: m });
  }
  return out;
}

/** Um único lançamento por competência: evita duplicar o mesmo mês após fundir anexos. */
function deduplicarOcorrenciasPorMes(ocorrencias: OcorrenciaEmprestimo[]): OcorrenciaEmprestimo[] {
  const by = new Map<string, OcorrenciaEmprestimo[]>();
  for (const o of ocorrencias) {
    const k = `${o.year}-${o.month}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(o);
  }
  const merged: OcorrenciaEmprestimo[] = [];
  for (const [, arr] of by) {
    if (arr.length === 1) {
      merged.push({ ...arr[0]! });
      continue;
    }
    const comParc = arr.filter(ocorrenciaParcelaPlausivel);
    const pool = comParc.length > 0 ? comParc : arr;
    const best = pool.reduce((a, b) => {
      if (ocorrenciaParcelaPlausivel(a) && !ocorrenciaParcelaPlausivel(b)) return a;
      if (!ocorrenciaParcelaPlausivel(a) && ocorrenciaParcelaPlausivel(b)) return b;
      return a.value >= b.value ? a : b;
    });
    merged.push({ ...best });
  }
  merged.sort((a, b) => competenciaOrdem(a.year, a.month) - competenciaOrdem(b.year, b.month));
  return merged;
}

/**
 * Quando há salto de meses sem folha mas a parcela avança 1 a 1 com o mesmo total (ex.: 05/48 … 08/48),
 * insere ocorrências sintéticas para leitura da continuidade (valores não entram no total pago).
 */
function preencherLacunasParcelares(ocorrencias: OcorrenciaEmprestimo[], labelCurto: string): OcorrenciaEmprestimo[] {
  const base = ocorrencias.filter((o) => !o.inferidoSemFolha);
  const sorted = [...base].sort(
    (a, b) => competenciaOrdem(a.year, a.month) - competenciaOrdem(b.year, b.month)
  );
  if (sorted.length < 2) return ocorrencias;

  const extras: OcorrenciaEmprestimo[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const A = sorted[i]!;
    const B = sorted[i + 1]!;
    if (!ocorrenciaParcelaPlausivel(A) || !ocorrenciaParcelaPlausivel(B)) continue;
    if (A.parcelaTotal !== B.parcelaTotal) continue;
    const aP = A.parcelaAtual!;
    const aT = A.parcelaTotal!;
    const bP = B.parcelaAtual!;
    const interior = mesesInteriorExclusivo(A.year, A.month, B.year, B.month);
    if (interior.length === 0) continue;
    if (bP - aP !== interior.length + 1) continue;
    const midVal = Math.round(((A.value + B.value) / 2) * 100) / 100;
    let k = 0;
    for (const { year, month } of interior) {
      k++;
      extras.push({
        year,
        month,
        value: midVal,
        parcelaAtual: aP + k,
        parcelaTotal: aT,
        folhaEmitKind: "inferido_sem_folha",
        description: `${labelCurto} — competência inferida (${String(month).padStart(2, "0")}/${year}); anexe o PDF deste mês para validar.`,
        inferidoSemFolha: true,
      });
    }
  }
  if (extras.length === 0) return ocorrencias;
  return deduplicarOcorrenciasPorMes([...base, ...extras]);
}

function parcelaIgnorarContagem(a?: number, b?: number): boolean {
  return a === 1 && b === 1;
}

function coeficienteVariacao(vals: number[]): number {
  if (vals.length < 2) return 1;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (m <= 0) return 1;
  const sd = Math.sqrt(vals.reduce((s, x) => s + (x - m) ** 2, 0) / vals.length);
  return sd / m;
}

/** Meses consecutivos com folha: parcela atual +1 e mesmo total. */
function sequenciaParcelaCoerente(ocorrencias: OcorrenciaEmprestimo[]): boolean {
  const sorted = [...ocorrencias].sort(
    (a, b) => competenciaOrdem(a.year, a.month) - competenciaOrdem(b.year, b.month)
  );
  const withP = sorted.filter((o) => {
    const a = o.parcelaAtual;
    const t = o.parcelaTotal;
    return (
      a != null &&
      t != null &&
      a >= 1 &&
      t >= 1 &&
      a <= t &&
      !(a === 1 && t === 1)
    );
  });
  if (withP.length < 2) return false;
  let steps = 0;
  let okSteps = 0;
  for (let i = 1; i < withP.length; i++) {
    const prev = withP[i - 1]!;
    const cur = withP[i]!;
    const dMes = competenciaOrdem(cur.year, cur.month) - competenciaOrdem(prev.year, prev.month);
    if (dMes !== 1) continue;
    steps++;
    if (
      cur.parcelaTotal === prev.parcelaTotal &&
      cur.parcelaAtual === (prev.parcelaAtual ?? 0) + 1
    ) {
      okSteps++;
    }
  }
  return steps >= 2 && okSteps === steps;
}

function chaveSlugCodigo(code: string | undefined, slugBase: string): string {
  const c = (code ?? "").replace(/\D/g, "").slice(0, 6);
  return `${c}|${slugBase}`;
}

function existeOutroEmprestimoNaCompetencia(
  payslipsDedup: Payslip[],
  year: number,
  month: number,
  excluirChave: string
): boolean {
  const p = payslipsDedup.find((x) => x.year === year && x.month === month);
  if (!p?.items?.length) return false;
  for (const it of p.items) {
    if (it.type !== "desconto" || it.value <= 0) continue;
    if (!descontoClassificadoComoEmprestimoNaFolha(it)) continue;
    if (chaveContratoEmprestimo(it) === excluirChave) continue;
    return true;
  }
  return false;
}

function computarPadroesESugestoes(
  contratos: ContratoEmprestimoAnalise[],
  payslipsDedup: Payslip[],
  payslipsBrutos: Payslip[],
  missingMesesEntreExtremos: number
): { padroes: PadraoDetectado[]; sugestoes: SugestaoResolucao[] } {
  const padroes: PadraoDetectado[] = [];
  const sugestoes: SugestaoResolucao[] = [];

  const nAltaConf = contratos.filter((c) => c.confianca === "alta").length;
  if (contratos.length > 0 && nAltaConf > 0) {
    padroes.push({
      mensagem: `${nAltaConf} contrato(s) com leitura estável ou sequência de parcelas coerente — use estes como âncora para comparar rubricas duvidosas.`,
      contratos: contratos.filter((c) => c.confianca === "alta").map((c) => c.label),
    });
  }

  const slugMap = new Map<string, ContratoEmprestimoAnalise[]>();
  for (const c of contratos) {
    const k = chaveSlugCodigo(c.code, c.slugBase);
    if (!slugMap.has(k)) slugMap.set(k, []);
    slugMap.get(k)!.push(c);
  }
  for (const [, arr] of slugMap) {
    if (arr.length < 2) continue;
    const medianas = arr.map((c) => c.valorMediano).sort((a, b) => a - b);
    const spread = medianas[medianas.length - 1]! - medianas[0]!;
    const ref = medianas[0]! > 0 ? medianas[0]! : 1;
    const rel = spread / ref;
    if (rel < 0.08 || spread < 12) {
      padroes.push({
        mensagem: `Padrão: mesma rubrica (texto + código) aparece em ${arr.length} chaves de valor com mediana próxima (variação relativa ≈ ${(rel * 100).toFixed(1)}%). Pode ser o mesmo contrato com ruído de OCR nos centavos — unifique a leitura conferindo o PDF.`,
        contratos: arr.map((c) => c.label),
      });
      sugestoes.push({
        prioridade: "media",
        titulo: "Conferir possíveis duplicatas de leitura (mesmo texto, valores quase iguais)",
        detalhe: `Compare lado a lado as linhas: ${arr.map((c) => `"${c.label}" (${c.valorMediano.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`).join(" · ")}. Se for um só contrato, padronize código e valor na importação.`,
      });
    } else {
      padroes.push({
        mensagem: `Mesma rubrica normalizada com ${arr.length} valores de parcela bem diferentes — padrão típico de dois contratos no mesmo banco OU renegociação forte; não fundir automaticamente.`,
        contratos: arr.map((c) => c.label),
      });
    }
  }

  for (const c of contratos) {
    if (c.ocorrencias.length < 2) continue;
    const keys = [...new Set(c.ocorrencias.map((o) => `${o.year}-${o.month}`))].sort((a, b) => {
      const [ya, ma] = a.split("-").map(Number);
      const [yb, mb] = b.split("-").map(Number);
      return competenciaOrdem(ya!, ma!) - competenciaOrdem(yb!, mb!);
    });
    for (let i = 1; i < keys.length; i++) {
      const [y0, m0] = keys[i - 1]!.split("-").map(Number);
      const [y1, m1] = keys[i]!.split("-").map(Number);
      const gap = competenciaOrdem(y1!, m1!) - competenciaOrdem(y0!, m0!);
      if (gap <= 1) continue;
      let y = y0!;
      let m = m0!;
      let interior = 0;
      let comFolhaEOutroEmp = 0;
      for (let s = 0; s < gap - 1; s++) {
        m++;
        if (m > 12) {
          m = 1;
          y++;
        }
        interior++;
        if (existeOutroEmprestimoNaCompetencia(payslipsDedup, y, m, c.chave)) comFolhaEOutroEmp++;
      }
      if (interior > 0 && comFolhaEOutroEmp === interior) {
        padroes.push({
          mensagem: `«${c.label}»: nos meses entre ${mesLabel(y0!, m0!)} e ${mesLabel(y1!, m1!)} existia folha com outros empréstimos/consignados — o hiato desta linha tende a quitação, portabilidade, troca de rubrica no OCR ou contrato suspenso, e não só «falta de PDF».`,
          contratos: [c.label],
        });
      }
      break;
    }
  }

  if (missingMesesEntreExtremos > 0) {
    sugestoes.push({
      prioridade: "alta",
      titulo: "Fechar lacunas da série temporal",
      detalhe: `Há ${missingMesesEntreExtremos} competência(s) sem anexo entre a primeira e a última folha. Anexe nessa ordem em «Anexos (folha)» para o gráfico mensal e as pendências refletirem todos os meses.`,
    });
  }

  const fracos01 = contratos.filter((c) => c.fracParcela01 > 0.4);
  if (fracos01.length > 0) {
    sugestoes.push({
      prioridade: "media",
      titulo: "Melhorar leitura de parcela (01/01 ou N/M ausente)",
      detalhe: `${fracos01.length} contrato(s) com parcela 01/01 ou sem par confiável em boa parte dos meses. Reimporte PDF em melhor qualidade ou use reforço de OCR na tela de contracheque; sem N/M assertivo não há saldo nem prazo fiáveis.`,
    });
  }

  if (payslipsBrutos.length > payslipsDedup.length) {
    sugestoes.push({
      prioridade: "baixa",
      titulo: "Vários PDFs no mesmo mês",
      detalhe:
        "Quando existir mensal + ficha financeira e/ou folha especial na mesma competência, o painel de empréstimos funde as rubricas numa só série por mês (sem duplicar linhas iguais), para não omitir descontos que só constam num dos anexos.",
    });
  }

  sugestoes.push({
    prioridade: "media",
    titulo: "Cruzamento fora da folha",
    detalhe:
      "Guarde PDF do contrato (CET, parcelas, seguros) e, se possível, importe extrato bancário: a folha prova desconto na margem, não o saldo devedor contratual nem taxa efetiva.",
  });

  const seen = new Set<string>();
  const dedupSug = sugestoes.filter((s) => {
    const k = s.titulo;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const pri = { alta: 0, media: 1, baixa: 2 };
  dedupSug.sort((a, b) => pri[a.prioridade] - pri[b.prioridade]);

  return { padroes, sugestoes: dedupSug };
}

export type BuildEmprestimosFolhaContexto = {
  nAdiantamentosParciaisIgnorados?: number;
  /** Lista filtrada (sem adiantamento parcial 13º) para pendências de múltiplos anexos. */
  payslipsFiltrados?: Payslip[];
};

/** Folha já passou por filtro 13º, merge por competência e inferência de parcelas. */
export function buildEmprestimosAnaliseFromFolhaPreparada(
  folha: Payslip[],
  ctx: BuildEmprestimosFolhaContexto = {},
): EmprestimosAnaliseFromPayslips {
  const pendencias: string[] = [];
  const nAdiantamentosParciaisIgnorados = ctx.nAdiantamentosParciaisIgnorados ?? 0;
  const payslipsAnalise = ctx.payslipsFiltrados ?? folha;

  if (folha.length === 0) {
    return {
      competenciasProcessadas: 0,
      primeiraCompetencia: null,
      ultimaCompetencia: null,
      contratos: [],
      serieMensalTotal: [],
      kpis: {
        nContratosDistintos: 0,
        totalHistoricoDescontado: 0,
        mediaMensalNoPeriodo: 0,
        parcelaNoUltimoMes: 0,
        progressoMedioPonderadoPct: null,
        totalHistoricoDescontosExcIrAmazon: 0,
        mediaMensalDescontosExcIrAmazon: 0,
        totalHistoricoOutrosNaoEmprestimo: 0,
        descontosExcIrAmazonNoUltimoMes: 0,
        outrosNaoEmprestimoNoUltimoMes: 0,
      },
      porFaixaProgresso: [],
      pendencias: [
        "Nenhum contracheque gravado na base. Anexe folhas em «Anexos (folha)» para montar o painel de empréstimos.",
      ],
      padroesDetectados: [],
      sugestoesResolucao: [
        {
          prioridade: "alta",
          titulo: "Começar pela base de dados",
          detalhe:
            "Anexe primeiro a folha mensal principal de cada competência em «Anexos (folha)». Depois volte a «Análise IA» para o painel recalcular padrões e pendências.",
        },
      ],
      mesesInferidosParcela: 0,
    };
  }

  const primeira = folha[0]!;
  const ultima = folha[folha.length - 1]!;

  const mapContratos = new Map<string, ContratoEmprestimoAnalise>();
  const serieMap = new Map<
    number,
    {
      year: number;
      month: number;
      total: number;
      totalExcIrAmazon: number;
      outrosNaoEmprestimo: number;
      irMensal: number;
      amazonPrevMensal: number;
      pensaoAlimenticiaMensal: number;
    }
  >();

  for (const p of folha) {
    const ord = competenciaOrdem(p.year, p.month);
    let mesTotal = 0;
    let mesExcIrAmz = 0;
    let irM = 0;
    let amz = 0;
    let pensao = 0;

    for (const it of p.items ?? []) {
      if (it.type !== "desconto" || it.value <= 0) continue;
      if (rubricaEhImpostoRendaOuIrrf(it.description)) irM += it.value;
      if (rubricaEhAmazonPrevFppm(it.description)) amz += it.value;
      if (rubricaEhPensaoAlimenticia(it.description)) pensao += it.value;
      if (descontoVisaoGastosExcluindoIrEAmazonPrev(it)) mesExcIrAmz += it.value;
      if (!descontoClassificadoComoEmprestimoNaFolha(it)) continue;

      mesTotal += it.value;
      const chave = chaveContratoEmprestimo(it);
      let row = mapContratos.get(chave);
      if (!row) {
        const baseLabel = rubricaSemParcelaParaChave(it.description).replace(/\s+/g, " ").trim();
        row = {
          chave,
          label: baseLabel.length > 72 ? `${baseLabel.slice(0, 70)}…` : baseLabel,
          code: it.code,
          slugBase: normalizarSlugDescricao(it.description),
          ocorrencias: [],
          totalPago: 0,
          valorMediano: 0,
          fracParcela01: 0,
          sequenciaParcelaCoerente: false,
          valorRelativamenteEstavel: false,
          confianca: "baixa",
        };
        mapContratos.set(chave, row);
      }
      row.ocorrencias.push({
        year: p.year,
        month: p.month,
        value: it.value,
        parcelaAtual: it.parcelaAtual,
        parcelaTotal: it.parcelaTotal,
        folhaEmitKind: String(p.folha_emit_kind ?? "mensal_principal"),
        description: it.description,
      });
    }

    serieMap.set(ord, {
      year: p.year,
      month: p.month,
      total: mesTotal,
      totalExcIrAmazon: mesExcIrAmz,
      outrosNaoEmprestimo: Math.max(0, mesExcIrAmz - mesTotal),
      irMensal: irM,
      amazonPrevMensal: amz,
      pensaoAlimenticiaMensal: pensao,
    });
  }

  for (const row of mapContratos.values()) {
    row.ocorrencias = deduplicarOcorrenciasPorMes(row.ocorrencias);
  }

  const contratos = [...mapContratos.values()].map((c) => {
    c.ocorrencias = preencherLacunasParcelares(c.ocorrencias, c.label);
    const occReais = c.ocorrencias.filter((o) => !o.inferidoSemFolha);
    const vals = occReais.map((o) => o.value);
    c.totalPago = vals.reduce((s, v) => s + v, 0);
    c.valorMediano = mediana(vals.length > 0 ? vals : c.ocorrencias.map((o) => o.value));

    let n01 = 0;
    for (const o of occReais) {
      if (parcelaIgnorarContagem(o.parcelaAtual, o.parcelaTotal)) n01++;
    }
    c.fracParcela01 = occReais.length ? n01 / occReais.length : 0;

    const ordSorted = [...occReais].sort(
      (a, b) => competenciaOrdem(a.year, a.month) - competenciaOrdem(b.year, b.month)
    );
    for (let i = ordSorted.length - 1; i >= 0; i--) {
      const o = ordSorted[i]!;
      const a = o.parcelaAtual;
      const t = o.parcelaTotal;
      if (a != null && t != null && a >= 1 && t >= 1 && a <= t && !(a === 1 && t === 1)) {
        c.ultimaParcela = { atual: a, total: t };
        break;
      }
    }

    c.sequenciaParcelaCoerente = sequenciaParcelaCoerente(occReais);
    c.valorRelativamenteEstavel = vals.length >= 3 && coeficienteVariacao(vals) < 0.12;
    if (c.sequenciaParcelaCoerente && c.valorRelativamenteEstavel && c.fracParcela01 < 0.2) {
      c.confianca = "alta";
    } else if (c.fracParcela01 > 0.5 || !c.ultimaParcela) {
      c.confianca = "baixa";
    } else {
      c.confianca = "media";
    }

    return c;
  });

  contratos.sort((a, b) => b.totalPago - a.totalPago);

  for (const c of contratos) {
    const refDesc = (c.ocorrencias.find((o) => !o.inferidoSemFolha) ?? c.ocorrencias[0])?.description ?? c.label;
    c.confirmacaoInstituicao = confirmacaoBancoCurado(refDesc);
    const nReais = c.ocorrencias.filter((o) => !o.inferidoSemFolha).length;
    if (
      c.confianca === "baixa" &&
      c.confirmacaoInstituicao?.confiancaRef === "alta" &&
      nReais >= 3 &&
      c.valorRelativamenteEstavel
    ) {
      c.confianca = "media";
    }
  }

  const serieMensalTotal = [...serieMap.entries()]
    .sort(([ka], [kb]) => ka - kb)
    .map(([_, v]) => ({
      key: `${v.year}-${v.month}`,
      label: mesLabel(v.year, v.month),
      total: v.total,
      year: v.year,
      month: v.month,
      totalExcIrAmazon: v.totalExcIrAmazon,
      outrosNaoEmprestimo: v.outrosNaoEmprestimo,
      irMensal: v.irMensal,
      amazonPrevMensal: v.amazonPrevMensal,
      pensaoAlimenticiaMensal: v.pensaoAlimenticiaMensal,
    }));

  const totalHistorico = contratos.reduce((s, c) => s + c.totalPago, 0);
  const nMeses = serieMensalTotal.length;
  const mediaMensal = nMeses > 0 ? totalHistorico / nMeses : 0;

  const totalHistoricoDescontosExcIrAmazon = serieMensalTotal.reduce((s, r) => s + r.totalExcIrAmazon, 0);
  const totalHistoricoOutrosNaoEmprestimo = serieMensalTotal.reduce((s, r) => s + r.outrosNaoEmprestimo, 0);
  const mediaMensalDescontosExcIrAmazon = nMeses > 0 ? totalHistoricoDescontosExcIrAmazon / nMeses : 0;

  let parcelaNoUltimoMes = 0;
  const lastKey = competenciaOrdem(ultima.year, ultima.month);
  for (const c of contratos) {
    for (const o of c.ocorrencias) {
      if (o.inferidoSemFolha) continue;
      if (competenciaOrdem(o.year, o.month) === lastKey) parcelaNoUltimoMes += o.value;
    }
  }

  const ultimaSerie = serieMap.get(lastKey);
  const descontosExcIrAmazonNoUltimoMes = ultimaSerie?.totalExcIrAmazon ?? 0;
  const outrosNaoEmprestimoNoUltimoMes = ultimaSerie?.outrosNaoEmprestimo ?? 0;

  let somaPeso = 0;
  let somaProg = 0;
  for (const c of contratos) {
    const u = c.ultimaParcela;
    if (u && u.total > 0) {
      const pct = Math.min(100, (u.atual / u.total) * 100);
      somaPeso += c.totalPago;
      somaProg += pct * c.totalPago;
    }
  }
  const progressoMedioPonderadoPct = somaPeso > 0 ? somaProg / somaPeso : null;

  const faixas = [
    { faixa: "0–25%", min: 0, max: 25 },
    { faixa: "26–50%", min: 26, max: 50 },
    { faixa: "51–75%", min: 51, max: 75 },
    { faixa: "76–99%", min: 76, max: 99 },
    { faixa: "100%", min: 100, max: 100 },
    { faixa: "Sem parcela", min: -1, max: -1 },
  ];
  const withPct = contratos.map((c) => {
    const u = c.ultimaParcela;
    const pct =
      u && u.total > 0 ? Math.min(100, Math.round((u.atual / u.total) * 1000) / 10) : null;
    return { c, pct };
  });
  const porFaixaProgresso = faixas.map((f) => {
    const count = withPct.filter(({ pct }) => {
      if (f.faixa === "Sem parcela") return pct == null;
      if (pct == null) return false;
      return pct >= f.min && pct <= f.max;
    }).length;
    const denom = contratos.length || 1;
    return { faixa: f.faixa, count, pct: Math.round((count / denom) * 1000) / 10 };
  });

  if (contratos.length === 0) {
    pendencias.push(
      "Nenhuma rubrica de desconto foi classificada como empréstimo/consignado. Confira se o texto contém termos como EMPRÉSTIMO, CONSIG ou o nome do banco; o OCR pode ter lido a linha de forma truncada."
    );
  }

  const mesesFolha = new Set(folha.map((p) => `${p.year}-${p.month}`));

  for (const c of contratos) {
    const occReais = c.ocorrencias.filter((o) => !o.inferidoSemFolha);
    const keys = [...new Set(occReais.map((o) => `${o.year}-${o.month}`))].sort((a, b) => {
      const [ya, ma] = a.split("-").map(Number);
      const [yb, mb] = b.split("-").map(Number);
      return competenciaOrdem(ya!, ma!) - competenciaOrdem(yb!, mb!);
    });
    if (occReais.length === 1) {
      pendencias.push(
        `«${c.label}»: aparece em apenas uma competência — não dá para validar continuidade nem tendência.`
      );
    }
    if (!c.ultimaParcela) {
      if (c.fracParcela01 > 0.5) {
        pendencias.push(
          `«${c.label}»: na maioria dos meses a parcela veio como 01/01 (marcador fraco). Inclua PDF com N/M legível ou use reforço de OCR para estimar prazo e saldo.`
        );
      } else {
        pendencias.push(
          `«${c.label}»: sem par parcela atual/total confiável — progresso e saldo devedor não são estimáveis só pela folha.`
        );
      }
    }

    for (let i = 1; i < keys.length; i++) {
      const [y0, m0] = keys[i - 1]!.split("-").map(Number);
      const [y1, m1] = keys[i]!.split("-").map(Number);
      const gap = competenciaOrdem(y1!, m1!) - competenciaOrdem(y0!, m0!);
      if (gap > 1) {
        pendencias.push(
          `«${c.label}»: intervalo de ${gap - 1} competência(s) sem este desconto entre ${mesLabel(y0!, m0!)} e ${mesLabel(y1!, m1!)} — pode ser troca de contrato, folha ausente ou rubrica renomeada pelo OCR.`
        );
      }
    }

    const byMes = new Map<string, number[]>();
    for (const o of occReais) {
      const k = `${o.year}-${o.month}`;
      if (!byMes.has(k)) byMes.set(k, []);
      byMes.get(k)!.push(o.value);
    }
    for (const [, arr] of byMes) {
      if (arr.length > 1) {
        pendencias.push(
          `«${c.label}»: mais de um lançamento no mesmo mês após fundir anexos da competência — revise duplicidade ou consolidação.`
        );
        break;
      }
    }

    const ref = c.valorMediano;
    if (ref > 0 && occReais.length >= 2) {
      for (const o of occReais) {
        if (Math.abs(o.value - ref) > Math.max(0.2 * ref, 50)) {
          pendencias.push(
            `«${c.label}»: valor ${o.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em ${mesLabel(o.year, o.month)} difere da mediana (${ref.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Pode ser renegociação, amortização ou erro de leitura.`
          );
          break;
        }
      }
    }
  }

  for (const c of contratos) {
    const nInf = c.ocorrencias.filter((o) => o.inferidoSemFolha).length;
    if (nInf > 0) {
      pendencias.push(
        `«${c.label}»: ${nInf} competência(s) inferida(s) só pela sequência de parcelas (ex.: 05/48→08/48) — anexe os PDFs desses meses em «Contracheque» para validar valores e fechar lacunas.`
      );
    }
  }

  if (nAdiantamentosParciaisIgnorados > 0) {
    pendencias.push(
      `${nAdiantamentosParciaisIgnorados} folha(s) especial(is) de junho foram ignoradas automaticamente na análise por serem apenas adiantamento parcial do 13º sem descontos. A quitação completa entra em dezembro, quando há abate/descontos.`
    );
  }

  const nCompMultiAnexo = countCompetenciasComVariosAnexos(payslipsAnalise);
  if (nCompMultiAnexo > 0) {
    pendencias.push(
      `Em ${nCompMultiAnexo} competência(s) há mais de um PDF (mensal, ficha financeira e/ou folha especial). As rubricas foram fundidas numa só série por mês, sem duplicar linhas idênticas, para incluir descontos que só constavam num dos anexos (ex.: Caixa na ficha).`
    );
  }

  let yGap = primeira.year;
  let mGap = primeira.month;
  let missing = 0;
  while (competenciaOrdem(yGap, mGap) <= competenciaOrdem(ultima.year, ultima.month)) {
    if (!mesesFolha.has(`${yGap}-${mGap}`)) missing++;
    mGap++;
    if (mGap > 12) {
      mGap = 1;
      yGap++;
    }
  }
  if (missing > 0) {
    pendencias.push(
      `Entre a primeira e a última competência há ${missing} mês(es) sem nenhum anexo gravado — a série temporal fica com buracos; anexe todos os meses desejados.`
    );
  }

  const mesesSemLinhaEmprestimo = folha.filter((p) => {
    const has = (p.items ?? []).some(
      (it) =>
        it.type === "desconto" &&
        it.value > 0 &&
        descontoClassificadoComoEmprestimoNaFolha(it)
    );
    return !has;
  }).length;
  if (mesesSemLinhaEmprestimo > 0 && contratos.length > 0) {
    pendencias.push(
      `${mesesSemLinhaEmprestimo} competência(s) com folha gravada mas sem rubrica reconhecida como empréstimo — pode ser mês só com vencimentos ou limite de rubricas no OCR.`
    );
  }

  pendencias.push(
    "Para análise mais assertiva: cadastre ou confira o contrato (CET, taxa, IOF, seguros), datas de contratação e quitação, e cruzamento com extrato bancário; a folha só mostra desconto na margem. Revise **todos** os descontos no PDF e compare nomenclaturas com portais oficiais (Caixa: https://www.caixa.gov.br; BB: https://www.bb.com.br; Gov.br: https://www.gov.br) — o OCR costuma omitir ou colar tokens (ex.: Caixa+EMP, CREDICESTA vs CREDCESTA); no app CREDICESTA/CREDCESTA unificam-se na chave como credcesta e Milicred não entra como empréstimo (associação/integralização)."
  );

  const { padroes, sugestoes } = computarPadroesESugestoes(contratos, folha, payslipsAnalise, missing);

  const mesesInferidosParcela = contratos.reduce(
    (s, c) => s + c.ocorrencias.filter((o) => o.inferidoSemFolha).length,
    0
  );

  return {
    competenciasProcessadas: folha.length,
    primeiraCompetencia: { year: primeira.year, month: primeira.month },
    ultimaCompetencia: { year: ultima.year, month: ultima.month },
    contratos,
    serieMensalTotal,
    kpis: {
      nContratosDistintos: contratos.length,
      totalHistoricoDescontado: totalHistorico,
      mediaMensalNoPeriodo: mediaMensal,
      parcelaNoUltimoMes,
      progressoMedioPonderadoPct:
        progressoMedioPonderadoPct != null ? Math.round(progressoMedioPonderadoPct * 10) / 10 : null,
      totalHistoricoDescontosExcIrAmazon,
      mediaMensalDescontosExcIrAmazon,
      totalHistoricoOutrosNaoEmprestimo,
      descontosExcIrAmazonNoUltimoMes,
      outrosNaoEmprestimoNoUltimoMes,
    },
    porFaixaProgresso,
    pendencias: [...new Set(pendencias)],
    padroesDetectados: padroes,
    sugestoesResolucao: sugestoes,
    mesesInferidosParcela,
  };
}

export function buildEmprestimosAnaliseFromPayslips(payslips: Payslip[]): EmprestimosAnaliseFromPayslips {
  const payslipsFiltrados = filtrarPayslipsAnaliseSemAdiantamentoParcial130(payslips);
  const folha = prepararFolhaParaAnaliseGrafico(payslips);
  return buildEmprestimosAnaliseFromFolhaPreparada(folha, {
    nAdiantamentosParciaisIgnorados: payslips.length - payslipsFiltrados.length,
    payslipsFiltrados,
  });
}
