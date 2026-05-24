import type { Payslip, PayslipItem } from "@/types/contracheque";
import { extrairParcelaConsignado, rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";
import { padronizarTokensRubricaOficiais } from "@/lib/anexos/rubrica-nomes-oficiais";
import {
  preprocessDescricaoParaDetecaoBanco,
  textoContemIndicioEmprestimoConsignado,
  textoTemCaixaOuCefOuCompe104,
} from "@/lib/reading/instituicoes-financeiras";

function normalizarDescricaoAgressiva(description: string): string {
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

function parcelaItemParaChave(
  it: Pick<PayslipItem, "description" | "parcelaAtual" | "parcelaTotal">,
): { parcelaAtual?: number; parcelaTotal?: number } {
  if (it.parcelaAtual != null && it.parcelaTotal != null) {
    return { parcelaAtual: it.parcelaAtual, parcelaTotal: it.parcelaTotal };
  }
  const ext = extrairParcelaConsignado(it.description);
  return { parcelaAtual: ext.parcelaAtual, parcelaTotal: ext.parcelaTotal };
}

function codigoRubrica4(code: string | undefined): string {
  return (code ?? "").replace(/\D/g, "").slice(0, 6);
}

/** Chaves alternativas (código SEAD + total de parcelas) para cruzar ficha × mensal com OCR diferente. */
export function chavesDescontoHistoricoLookup(
  code: string | undefined,
  description: string,
  opts?: { value?: number; parcelaAtual?: number; parcelaTotal?: number },
): string[] {
  const keys = new Set<string>();
  keys.add(
    chaveDescontoRecorrente(code, description, {
      value: opts?.value,
      parcelaAtual: opts?.parcelaAtual,
      parcelaTotal: opts?.parcelaTotal,
    }),
  );
  const c = codigoRubrica4(code);
  if (c) {
    const t =
      opts?.parcelaTotal != null && opts.parcelaTotal >= 1
        ? String(opts.parcelaTotal).padStart(3, "0")
        : null;
    if (t) keys.add(`${c}|t:${t}`);
    keys.add(c);
  }
  return [...keys];
}

/** Chave estável para cruzar a mesma rubrica entre meses (código + texto normalizado). */
export function chaveDescontoRecorrente(
  code: string | undefined,
  description: string,
  opts?: { value?: number; parcelaAtual?: number; parcelaTotal?: number }
): string {
  const c = codigoRubrica4(code);
  const valor = Number.isFinite(opts?.value) ? opts!.value!.toFixed(2) : "0.00";
  const parcA = opts?.parcelaAtual;
  const parcT = opts?.parcelaTotal;
  const totalParcelasKey = parcT != null && parcT >= 1 ? String(parcT).padStart(3, "0") : "---";

  // A parcela atual muda mês a mês; a chave ignora o contador atual e mantém só o total quando disponível.
  if (parcA === 1 && parcT === 1) {
    return `${c}|v:${valor}|t:${totalParcelasKey}`;
  }
  const slug = normalizarDescricaoAgressiva(description);
  return `${c}|v:${valor}|t:${totalParcelasKey}|${slug}`;
}

function mediana(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ficha importada + mensais entram no histórico de rubricas (descontos e ganhos). */
export function payslipContribuiHistoricoRubricas(p: Payslip): boolean {
  const emit = (p.folha_emit_kind ?? "mensal_principal") as string;
  if (emit === "folha_especial" || emit === "merged_multi_anexo") return false;
  if (emit === "mensal_principal" || emit === "ficha_import") return true;
  const dk = String(p.document_kind ?? "").toLowerCase();
  return dk === "ficha_financeira";
}

function pushHistorico(map: Map<string, number[]>, chave: string, valor: number): void {
  if (!map.has(chave)) map.set(chave, []);
  map.get(chave)!.push(valor);
}

function valoresHistoricoDesconto(
  historico: Map<string, number[]>,
  it: PayslipItem,
): number[] {
  const parc = parcelaItemParaChave(it);
  const chaves = chavesDescontoHistoricoLookup(it.code, it.description, {
    value: it.value,
    parcelaAtual: parc.parcelaAtual,
    parcelaTotal: parc.parcelaTotal,
  });
  const vals: number[] = [];
  for (const k of chaves) {
    const v = historico.get(k);
    if (v?.length) vals.push(...v);
  }
  return vals;
}

/**
 * Agrega descontos da ficha financeira e contracheques mensais já gravados
 * (exclui a competência em edição).
 */
export function historicoDescontosPorChave(
  payslips: Payslip[],
  opts: { mes: number; ano: number }
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const p of payslips) {
    if (!payslipContribuiHistoricoRubricas(p)) continue;
    if (p.month === opts.mes && p.year === opts.ano) continue;

    for (const it of p.items ?? []) {
      if (it.type !== "desconto" || it.value <= 0) continue;
      const parc = parcelaItemParaChave(it);
      const chaves = chavesDescontoHistoricoLookup(it.code, it.description, {
        value: it.value,
        parcelaAtual: parc.parcelaAtual,
        parcelaTotal: parc.parcelaTotal,
      });
      for (const k of chaves) pushHistorico(map, k, it.value);
    }
  }
  return map;
}

export type AlertaDescontoNivel = "ok" | "desvio" | "incerto";

export type AlertaDescontoLinha = {
  idx: number;
  chave: string;
  rubrica: string;
  valor: number;
  referenciaMediana?: number;
  amostras: number;
  nivel: AlertaDescontoNivel;
  mensagem: string;
};

const DESVIO_FRAC = 0.2;
const DESVIO_MIN_BR = 50;

/**
 * Desconto de **13.º salário** na folha (adiantamento / liquidação), em que o PDF pode agregar **IR** e
 * **previdência complementar** (ex.: Amazon Prev) numa só rubrica — **não** é empréstimo consignado.
 * Ex.: «DESC.13.SAL.ADIANT», «DESCONTO 13 SALARIO ADIANTAMENTO».
 */
export function rubricaEhDescontoDecimoTerceiroSalarioAdiantamento(description: string): boolean {
  const n = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/(\bdesc\b|\bdesconto\b)[^a-z0-9]*13\b/i.test(n) && /\b(sal|salario)\b/i.test(n) && /\b(adiant|ad\.?\s*comis)\b/i.test(n))
    return true;
  if (
    /\b13\b[^a-z0-9]{0,6}(o|º|°)?\s*(sal|salario)\b/i.test(n) &&
    /\b(adiant|ad\.?\s*comis)\b/i.test(n)
  )
    return true;
  if (/decimo\s+terceiro/i.test(n) && /\b(adiant|ad\.?\s*comis)\b/i.test(n)) return true;
  if (/\b13\s*\/\s*12\b/i.test(n)) return true;
  return false;
}

/**
 * Amazon Prev (previdência complementar) e rubricas de previdência não entram como empréstimo/consignado.
 * BB-EMP continua: o mesmo nome no PDF é separado por **código** + **valor da parcela** + vizinhança de parcelas.
 */
export function rubricaEhExcluidaDeEmprestimo(description: string): boolean {
  const n = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  if (rubricaEhDescontoDecimoTerceiroSalarioAdiantamento(description)) return true;
  if (rubricaEhPensaoAlimenticia(description)) return true;
  if (/amazonprev/i.test(n)) return true;
  if (/\bamazon\s*prev\b/i.test(n)) return true;
  if (/\bprevidenci/i.test(n)) return true;
  if (/\brpps\b|\brgps\b/i.test(n)) return true;
  if (/\bfundo\s+de\s+prev/i.test(n)) return true;
  if (/\bprev\s+compl/i.test(n)) return true;
  if (/\bcontrib(u(i(cao)?)?)?\s+(do\s+)?inss\b/i.test(n)) return true;
  /** Milicred: cooperativa / integralização — não empréstimo consignado neste módulo. */
  if (/\bmilicred\b/i.test(n)) return true;
  return false;
}

/** IR / IRRF — não entram como «empréstimo», mas entram na visão ampla de descontos (exceto IR/Amazon). */
export function rubricaEhImpostoRendaOuIrrf(description: string): boolean {
  const n = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  if (/\b(irrf|irpf|ir\s*pf|ir\s*pj|ir\s*fonte)\b/.test(n)) return true;
  if (/\bimposto\s+(de\s+)?renda\b/.test(n)) return true;
  if (/\bimposto\s+sobre\s+proventos\b/.test(n)) return true;
  if (/\bir\s+retido\b/.test(n)) return true;
  if (/\bimposto\b.*\b(renda|ir)\b/.test(n) && !/\bemprest/.test(n)) return true;
  /** «IMP.DE RENDA» abreviado (sem a palavra «imposto» inteira). */
  if (/\bimp\.?\s*de\s*renda\b/i.test(n) && !/\bimposto\b/.test(n) && !/\bemprest/.test(n)) return true;
  /** «IMP.DE RENDA 13.SAL», IR sobre 13.º etc. */
  if (/\bimp(?:osto)?\.?\s*de\s*renda\b/i.test(n) && /\b(13|13\.?\s*sal|decimo\s+terceiro|13\s*\/\s*12)\b/i.test(n)) return true;
  if (rubricaEhDescontoDecimoTerceiroSalarioAdiantamento(description)) return true;
  return false;
}

/** Só Amazon Prev (FPPM etc.) — não inclui outras previdências. */
export function rubricaEhAmazonPrevFppm(description: string): boolean {
  const n = description.toLowerCase();
  if (/amazonprev/i.test(n)) return true;
  if (/\bamazon\s*prev\b/i.test(n)) return true;
  return false;
}

/** Pensão alimentícia / pensão judicial (heurística conservadora). */
export function rubricaEhPensaoAlimenticia(description: string): boolean {
  const n = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  if (/\bman\.?\s*fam\b/i.test(n)) return true;
  if (/\bmanut\.?\s*fam/i.test(n)) return true;
  if (/\bmanutencao\s+famil/i.test(n)) return true;
  if (/\bmanut\.?\s*familiar\b/i.test(n)) return true;
  if (/\bfamil\.?\s*s\/?i\.?r\.?/i.test(n)) return true;
  if (/pensao\s+aliment/i.test(n)) return true;
  if (/pen\.?\s*alim/i.test(n)) return true;
  if (/\bp\.?\s*a\.?\b.*\b(alim|aliment)/i.test(n)) return true;
  if (/\bpensao\b.*\b(judicial|familia|familiar)\b/i.test(n)) return true;
  if (/\bdesignac(ao|ao)\s+judicial\b/i.test(n) && /aliment/i.test(n)) return true;
  return false;
}

/**
 * Rubricas que **não** entram na lista de classificação manual do painel de empréstimos (IR e Amazon Prev;
 * descontos de 13.º já cobertos pelos toggles da série temporal).
 *
 * Pensão alimentícia **entra** na lista (pode haver mais do que uma rubrica/código no mesmo mês).
 */
export function rubricaForaDaListaClassificacaoFocoEmprestimos(description: string): boolean {
  if (rubricaEhImpostoRendaOuIrrf(description)) return true;
  if (rubricaEhAmazonPrevFppm(description)) return true;
  return false;
}

/** Descontos para visão «gastos na folha» excluindo IR e Amazon Prev (não exclui Milicred/previdência aqui). */
export function descontoVisaoGastosExcluindoIrEAmazonPrev(it: PayslipItem): boolean {
  if (it.type !== "desconto" || it.value <= 0) return false;
  if (rubricaEhDescontoDecimoTerceiroSalarioAdiantamento(it.description)) return false;
  if (rubricaEhImpostoRendaOuIrrf(it.description)) return false;
  const n = it.description.toLowerCase();
  if (/amazonprev/i.test(n)) return false;
  if (/\bamazon\s*prev\b/i.test(n)) return false;
  return true;
}

/** SEAD/AM: códigos de rubrica frequentes para consignado Caixa (reforço quando o OCR trunca o nome do banco). */
const CODIGOS_FOLHA_SEAD_AM_CAIXA_CONSIGNADO = new Set(["5842", "5900"]);

export function rubricaPareceConsignadoEmprestimo(description: string, opts?: { code?: string }): boolean {
  if (rubricaEhExcluidaDeEmprestimo(description)) return false;
  const n = preprocessDescricaoParaDetecaoBanco(description).replace(/\s+/g, " ");
  const cod4 = (opts?.code ?? "").replace(/\D/g, "").slice(0, 4);
  if (CODIGOS_FOLHA_SEAD_AM_CAIXA_CONSIGNADO.has(cod4) && textoContemIndicioEmprestimoConsignado(n)) {
    return true;
  }
  if (textoTemCaixaOuCefOuCompe104(n) && textoContemIndicioEmprestimoConsignado(n)) {
    return true;
  }
  return /\b(emprestim\w*|empo\d+|(?<=^|[^a-z0-9])emp(?:0\d{1,5}|\d{2,6})(?![a-z0-9])|consig|bb-emp|bb\s*emp|bancoob|panameric|credcesta|credicesta|credic\b|financi|margem|saque)\b/i.test(
    n
  );
}

/**
 * Desconto com parcela atual/total plausível (ex.: 048/072) costuma ser consignado mesmo quando o OCR corta o nome do banco.
 * Exclui rubricas típicas de sindicato, saúde, IR, previdência, pensão alimentícia, etc.
 */
const EXCLUI_HEURISTICA_PARCELA_NAO_CONSIG = new RegExp(
  [
    "sindicato",
    "sindical",
    "associac",
    "associa",
    "integraliz",
    "milicred",
    "plano\\s+de\\s+saude",
    "unimed",
    "\\bamil\\b",
    "hapvida",
    "odont",
    "tributo",
    "\\bfedera\\w*",
    "\\bcivil\\b",
    "imposto",
    "irrf",
    "\\bir\\s*pf\\b",
    "amazonprev",
    "\\binss\\b",
    "rgps",
    "fgts",
    "\\bman\\.?\\s*fam\\b",
    "manut\\.?\\s*fam",
    "manutencao\\s+famil",
    "famil\\.?\\s*s\\/?i\\.?r",
    "pensao\\s+aliment",
    "pen\\.?\\s*alim",
    "decimo\\s+terceiro",
    "13\\s*\\/\\s*12",
    "desc\\.?\\s*13",
    "13\\s*sal\\.?\\s*adiant",
    "funfin",
    "funpresp",
    "vale\\s+transport",
    "vt\\s+desc",
  ].join("|"),
  "i"
);

export function descontoParcelaSugereConsignado(it: PayslipItem): boolean {
  if (it.type !== "desconto" || it.value <= 0) return false;
  if (rubricaEhDescontoDecimoTerceiroSalarioAdiantamento(it.description)) return false;
  if (rubricaEhExcluidaDeEmprestimo(it.description)) return false;
  if (rubricaEhImpostoRendaOuIrrf(it.description)) return false;
  if (rubricaEhAmazonPrevFppm(it.description)) return false;
  if (rubricaEhPensaoAlimenticia(it.description)) return false;
  const n = preprocessDescricaoParaDetecaoBanco(it.description).replace(/\s+/g, " ");
  if (EXCLUI_HEURISTICA_PARCELA_NAO_CONSIG.test(n)) return false;
  const a = it.parcelaAtual;
  const b = it.parcelaTotal;
  if (a == null || b == null) return false;
  if (a < 1 || b < 2 || a > b) return false;
  if (a === 1 && b === 1) return false;
  return true;
}

/** Texto + código + parcela: uso no painel de empréstimos e inferência de parcelas. */
export function descontoClassificadoComoEmprestimoNaFolha(it: PayslipItem): boolean {
  if (it.type !== "desconto" || it.value <= 0) return false;
  if (rubricaEhDescontoDecimoTerceiroSalarioAdiantamento(it.description)) return false;
  if (rubricaPareceConsignadoEmprestimo(it.description, { code: it.code })) return true;
  return descontoParcelaSugereConsignado(it);
}

/**
 * Compara cada desconto do extrato atual ao histórico: rubricas “fixas” devem manter valores próximos;
 * desvios fortes ou falta de histórico pedem revisão manual.
 */
export function compararDescontosComHistorico(
  items: PayslipItem[],
  historico: Map<string, number[]>
): { alertas: AlertaDescontoLinha[]; bloqueiaSemConfirmacao: boolean } {
  const alertas: AlertaDescontoLinha[] = [];
  let bloqueia = false;

  items.forEach((it, idx) => {
    if (it.type !== "desconto") return;
    if (/^liquido\b/i.test(it.description.trim())) return;
    if (rubricaEhImpostoRendaOuIrrf(it.description)) return;
    if (rubricaEhAmazonPrevFppm(it.description)) return;
    if (rubricaEhPensaoAlimenticia(it.description)) return;

    const parc = parcelaItemParaChave(it);
    const k = chaveDescontoRecorrente(it.code, it.description, {
      value: it.value,
      parcelaAtual: parc.parcelaAtual,
      parcelaTotal: parc.parcelaTotal,
    });
    const vals = valoresHistoricoDesconto(historico, it);
    const n = vals.length;

    if (n === 0) {
      const parcEmp =
        parc.parcelaAtual != null &&
        parc.parcelaTotal != null &&
        descontoClassificadoComoEmprestimoNaFolha(it);
      const parcUnica = parc.parcelaAtual === 1 && parc.parcelaTotal === 1;
      alertas.push({
        idx,
        chave: k,
        rubrica: it.description,
        valor: it.value,
        amostras: 0,
        nivel: "incerto",
        mensagem: parcUnica
          ? "1.ª incidência deste desconto fixo (código + valor). O app passa a recalcular por incidência nos próximos documentos."
          : parcEmp
          ? `1.ª vez no histórico com este contrato (parcela ${String(parc.parcelaAtual).padStart(2, "0")}/${String(parc.parcelaTotal).padStart(2, "0")}). É comum em novo consignado ou 1.º mês após contratar — confira no PDF. O app cruza meses seguintes pela mesma rubrica sem o sufixo de parcela.`
          : "Sem referência no histórico gravado (ficha ou mensais). Confira no PDF se o valor está correto.",
      });
      return;
    }

    const ref = mediana(vals);
    const lim = Math.max(DESVIO_FRAC * ref, DESVIO_MIN_BR);
    const delta = Math.abs(it.value - ref);

    if (n >= 2 && delta > lim) {
      alertas.push({
        idx,
        chave: k,
        rubrica: it.description,
        valor: it.value,
        referenciaMediana: ref,
        amostras: n,
        nivel: "desvio",
        mensagem: `Bem acima/abaixo do habitual: mediana ≈ ${ref.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em ${n} meses com esta rubrica.`,
      });
      bloqueia = true;
      return;
    }

    if (n === 1 && delta > Math.max(0.3 * ref, 95)) {
      alertas.push({
        idx,
        chave: k,
        rubrica: it.description,
        valor: it.value,
        referenciaMediana: ref,
        amostras: 1,
        nivel: "desvio",
        mensagem: `Só existe 1 mês anterior (${ref.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}); diferença grande — confirme.`,
      });
      bloqueia = true;
      return;
    }
  });

  return { alertas, bloqueiaSemConfirmacao: bloqueia };
}

export function alertaPorIndiceDesconto(alertas: AlertaDescontoLinha[]): Map<number, AlertaDescontoLinha> {
  const m = new Map<number, AlertaDescontoLinha>();
  for (const a of alertas) m.set(a.idx, a);
  return m;
}

// ---- Ganhos (receitas / vantagens na folha) ----

const DESVIO_FRAC_GANHO = 0.28;
const DESVIO_MIN_BR_GANHO = 90;

/** Chave de ganho: código + descrição (valor muda com reajuste — não entra na chave). */
export function chaveGanhoRecorrente(code: string | undefined, description: string): string {
  const c = codigoRubrica4(code);
  const slug = normalizarDescricaoAgressiva(description);
  return `${c}|${slug}`;
}

export function chavesGanhoHistoricoLookup(code: string | undefined, description: string): string[] {
  const keys = new Set<string>();
  keys.add(chaveGanhoRecorrente(code, description));
  const c = codigoRubrica4(code);
  if (c) keys.add(c);
  return [...keys];
}

function valoresHistoricoGanho(historico: Map<string, number[]>, it: PayslipItem): number[] {
  const chaves = chavesGanhoHistoricoLookup(it.code, it.description);
  const vals: number[] = [];
  for (const k of chaves) {
    const v = historico.get(k);
    if (v?.length) vals.push(...v);
  }
  return vals;
}

/** Ganhos eventuais (13º adiantamento, diferença de reajuste pontual) não exigem histórico mensal. */
export function rubricaEhGanhoEventualSemHistorico(description: string): boolean {
  if (rubricaEhDescontoDecimoTerceiroSalarioAdiantamento(description)) return true;
  const n = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  if (/\bdif\.?\s*de\s*reaj/i.test(n)) return true;
  if (/\breaj\.?\s*sal/i.test(n) && /\bdif/i.test(n)) return true;
  if (/\b13\b.*\b(sal|salario)\b/i.test(n) && /\b(adiant|antec)\b/i.test(n)) return true;
  if (/\bantec\b.*\b13\b/i.test(n)) return true;
  if (/\bgratificacao\b.*\b(ferias|licenca)\b/i.test(n)) return true;
  return false;
}

export function historicoGanhosPorChave(
  payslips: Payslip[],
  opts: { mes: number; ano: number },
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const p of payslips) {
    if (!payslipContribuiHistoricoRubricas(p)) continue;
    if (p.month === opts.mes && p.year === opts.ano) continue;

    for (const it of p.items ?? []) {
      if (it.type !== "vantagem" || it.value <= 0) continue;
      if (rubricaEhGanhoEventualSemHistorico(it.description)) continue;
      for (const k of chavesGanhoHistoricoLookup(it.code, it.description)) {
        pushHistorico(map, k, it.value);
      }
    }
  }
  return map;
}

export function compararGanhosComHistorico(
  items: PayslipItem[],
  historico: Map<string, number[]>,
): { alertas: AlertaDescontoLinha[]; bloqueiaSemConfirmacao: boolean } {
  const alertas: AlertaDescontoLinha[] = [];
  let bloqueia = false;

  items.forEach((it, idx) => {
    if (it.type !== "vantagem" || it.value <= 0) return;
    if (/^liquido\b/i.test(it.description.trim())) return;
    if (rubricaEhGanhoEventualSemHistorico(it.description)) return;

    const k = chaveGanhoRecorrente(it.code, it.description);
    const vals = valoresHistoricoGanho(historico, it);
    const n = vals.length;

    if (n === 0) {
      alertas.push({
        idx,
        chave: k,
        rubrica: it.description,
        valor: it.value,
        amostras: 0,
        nivel: "incerto",
        mensagem:
          "Sem referência no histórico gravado (ficha ou mensais). Pode ser rubrica nova ou OCR diferente — confira no PDF.",
      });
      return;
    }

    const ref = mediana(vals);
    const lim = Math.max(DESVIO_FRAC_GANHO * ref, DESVIO_MIN_BR_GANHO);
    const delta = Math.abs(it.value - ref);

    if (n >= 2 && delta > lim) {
      if (it.value > ref) {
        alertas.push({
          idx,
          chave: k,
          rubrica: it.description,
          valor: it.value,
          referenciaMediana: ref,
          amostras: n,
          nivel: "incerto",
          mensagem: `Acima da mediana histórica (≈ ${ref.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em ${n} meses) — comum após reajuste; confira no PDF.`,
        });
        return;
      }
      alertas.push({
        idx,
        chave: k,
        rubrica: it.description,
        valor: it.value,
        referenciaMediana: ref,
        amostras: n,
        nivel: "desvio",
        mensagem: `Receita/ganho abaixo do habitual: mediana ≈ ${ref.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em ${n} meses — confira OCR.`,
      });
      bloqueia = true;
      return;
    }

    if (n === 1 && delta > Math.max(0.35 * ref, 120)) {
      alertas.push({
        idx,
        chave: k,
        rubrica: it.description,
        valor: it.value,
        referenciaMediana: ref,
        amostras: 1,
        nivel: "desvio",
        mensagem: `Receita/ganho diferente do único mês anterior (${ref.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Confira reajuste ou OCR.`,
      });
      bloqueia = true;
    }
  });

  return { alertas, bloqueiaSemConfirmacao: bloqueia };
}

/** Índice de alerta por linha da tabela (ganhos ou descontos). */
export function alertaPorIndiceRubrica(alertas: AlertaDescontoLinha[]): Map<number, AlertaDescontoLinha> {
  return alertaPorIndiceDesconto(alertas);
}
