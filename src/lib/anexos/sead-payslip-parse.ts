import type { PayslipItem, PayslipItemType } from "@/types/contracheque";
import type { AnaliseCartaoSaqueContracheque } from "@/types/cartao-saque-embutido";
import { extrairParcelaConsignado } from "@/lib/anexos/parcela-consignado";
import {
  confirmacaoBancoCurado,
  detectarInstituicaoNaDescricao,
  listarInstituicoesNoTexto,
  preprocessDescricaoParaDetecaoBanco,
  textoContemIndicioEmprestimoConsignado,
  textoTemCaixaOuCefOuCompe104,
  type InstituicaoResumo,
} from "@/lib/reading/instituicoes-financeiras";
import { rubricaEhExcluidaDeEmprestimo } from "@/lib/anexos/payslip-desconto-historico";

export interface ParsedPayslipPayload {
  grossSalary: number;
  netSalary: number;
  totalDiscounts: number;
  items: PayslipItem[];
  rawText: string;
  instituicoesDetectadas: InstituicaoResumo[];
  /**
   * OCR leu só parte do PDF (ex.: só SOLDO em folha mensal) ou há totais de desconto no texto
   * sem rubricas correspondentes — vale conferir o PDF antes de gravar.
   */
  leituraPossivelmenteIncompleta?: boolean;
  /** Preenchido após parse + competência (rubricas de desconto com termos cartão/RMC/RCC). */
  cartaoSaqueContracheque?: AnaliseCartaoSaqueContracheque;
}

function parseBRL(s: string): number {
  const clean = s.replace(/[^\d,.-]/g, "");
  if (clean.includes(",") && clean.includes("."))
    return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
  if (clean.includes(",")) return parseFloat(clean.replace(",", ".")) || 0;
  return parseFloat(clean) || 0;
}

/** Hífen «típico» em OCR/PDF (não só ASCII). */
const OCR_HYPHENS = String.raw`[\u2010\u2011\u2012\u2013\u2014\u2015\u2212-]`;

/** Remove artefactos típicos de OCR em rubricas (|, colchetes, lixo nas pontas). */
export function sanitizePayslipLineDescription(raw: string): string {
  let s = raw.replace(/\|/g, " ");
  // OCR: rubrica BB-EMP (Banco do Brasil consignado) lida como "as-emP", "8b-emp" (hífen Unicode)
  s = s.replace(new RegExp(`\\b(as|8b|8s)${OCR_HYPHENS}+(emp)\\b`, "gi"), "BB-EMP");
  s = s.replace(/[\[\]{}]/g, " ");
  s = s.replace(/\s*\(\s*/g, " ");
  s = s.replace(/\s*\)\s*/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  while (s.length > 0 && /[.,;:\-+*/\\]$/.test(s)) s = s.slice(0, -1).trim();
  while (s.length > 0 && /^[.,;:\-+*/\\]/.test(s)) s = s.slice(1).trim();
  return s.slice(0, 240);
}

/**
 * Remove da rubrica montantes colados que não são o valor da linha
 * (ex.: base 4.326,83 e valor líquido da rubrica 220,00).
 */
function stripSpuriousTrailingAmounts(desc: string, itemValue: number): string {
  let s = desc.replace(/\s+/g, " ").trim();
  const reBr = /\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
  /** OCR usa por vezes 4326.83 (ponto = decimal) em vez de 4.326,83 */
  const reDotDec = /\s+(\d{1,4}\.\d{2})\s*$/;
  for (let i = 0; i < 8; i++) {
    let m = s.match(reBr);
    let parsed = m ? parseBRL(m[1]) : NaN;
    if (!m || Number.isNaN(parsed)) {
      m = s.match(reDotDec);
      parsed = m ? parseFloat(m[1].replace(",", ".")) : NaN;
    }
    if (!m || Number.isNaN(parsed)) break;
    if (Math.abs(parsed - itemValue) < 0.02) break;
    s = s.slice(0, -m[0].length).trim();
  }
  return s;
}

/** Remove marcadores de colunas do contracheque oficial SEAD (INF.: H/V/P/Q) que vêm junto da descrição no PDF. */
function stripSeadRubricaColumnMarkers(desc: string): string {
  let s = desc.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const next = s.replace(/\s+\b[HVPQDR]\b\s*$/i, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Corrige nomes muito frequentes em folha PM/SEAD com OCR fraco. */
function normalizeRubricaNomesFolha(desc: string): string {
  let s = desc;
  s = s.replace(/\b(s[o0]l[d0][o0]{1,2}|s[o0]ld[o0]|s[o0]l[o0]{2,}|s0[lL]00|s0l00)\b/gi, "SOLDO");
  s = s.replace(/\b(venc[i1]mento)\b/gi, "VENCIMENTO");
  return s;
}

function slugForDedup(desc: string): string {
  return desc
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 72);
}

/** Junta linhas repetidas vindas de regex diferentes (mesmo tipo, valor e texto essencial). */
/** Evita que «DESC.…» tenha sido classificado como vantagem por ordem antiga ou regex duplicada. */
function corrigirTipoDescPrefixEmItens(items: PayslipItem[]): PayslipItem[] {
  return items.map((it) => {
    if (it.type !== "vantagem") return it;
    if (!isColunaDescontoPrefixoDesc(it.description)) return it;
    return { ...it, type: "desconto" as PayslipItemType };
  });
}

/** Tenta ler «TOTAL DE DESCONTOS» mesmo com OCR irregular. */
function inferTotalDescontosDeclaradoNoTexto(rawText: string): number {
  const patterns = [
    /total\s*de\s*descontos?\s*\(d\)\s*[*\s]*([\d.,]+)/gi,
    /total\s*de\s*descontos?\s*[:\-*\s]+([\d.,]+)/gi,
    /descontos\s+total\s*[:\s]*([\d.,]+)/gi,
  ];
  let max = 0;
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(rawText)) !== null) {
      const v = parseBRL(m[1]);
      if (v > max) max = v;
    }
  }
  return max;
}

function detectarLeituraPossivelmenteIncompleta(
  rawText: string,
  items: PayslipItem[],
  totalDiscountsHeader: number
): boolean {
  const sumDItens = items.filter((i) => i.type === "desconto").reduce((s, i) => s + i.value, 0);
  const nDesc = items.filter((i) => i.type === "desconto").length;
  const discDeclared = inferTotalDescontosDeclaradoNoTexto(rawText);

  if (discDeclared > 150 && sumDItens < discDeclared * 0.35 && nDesc <= 2) return true;
  if (totalDiscountsHeader > 150 && sumDItens < totalDiscountsHeader * 0.35 && nDesc <= 2) return true;
  if (/\bC[OÓ]DIGO\s+DESCRI/i.test(rawText) && items.length < 4 && rawText.length > 600) return true;

  const vantagens = items.filter((i) => i.type === "vantagem");
  const sóSoldoOuVenc =
    items.length <= 3 &&
    nDesc === 0 &&
    vantagens.length > 0 &&
    vantagens.every((i) => /soldo|venciment/i.test(i.description)) &&
    totalDiscountsHeader < 1;

  if (sóSoldoOuVenc && rawText.length > 350) return true;

  return false;
}

function dedupePayslipItems(items: PayslipItem[]): PayslipItem[] {
  const rank = (it: PayslipItem) =>
    (it.code && /^\d{3,4}$/.test(it.code) ? 80 : 0) + Math.min(it.description.length, 100);

  const byKey = new Map<string, PayslipItem>();
  const order: string[] = [];

  for (const it of items) {
    const slug = slugForDedup(it.description);
    const key =
      slug.length >= 3
        ? `${it.type}|${it.value.toFixed(2)}|${slug}`
        : `raw|${it.code ?? ""}|${it.value.toFixed(2)}|${slug}`;

    const prev = byKey.get(key);
    if (!prev) order.push(key);
    if (!prev || rank(it) > rank(prev)) byKey.set(key, it);
  }

  return order.map((k) => byKey.get(k)!);
}

/**
 * Pode haver mais de um bloco (ex.: ficha com continuação na folha seguinte repete cabeçalho e totais).
 * Usa o **último** bloco coerente — costuma ser o rodapé definitivo do mês.
 */
function parseOfficialTotalsLine(rawText: string): { gross: number; discounts: number; net: number } | null {
  const re =
    /TOTAL\s*DE\s*GANHOS[\s\S]{0,280}?TOTAL\s*DE\s*DESCONTOS[\s\S]{0,280}?LIQUIDO[\s\S]{0,120}/gi;
  let last: { gross: number; discounts: number; net: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawText)) !== null) {
    const nums = [...m[0].matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map((x) => parseBRL(x[1]));
    if (nums.length < 3) continue;
    const gross = nums[0] || 0;
    const discounts = nums[1] || 0;
    const net = nums[2] || Math.max(0, gross - discounts);
    if (gross <= 0 && discounts <= 0 && net <= 0) continue;
    last = { gross, discounts, net };
  }
  return last;
}

const DESCONTO_HINTS = [
  "inss",
  "previdencia",
  "irrf",
  "irpf",
  "imposto",
  "renda",
  "emprestimo",
  "empréstimo",
  "consig",
  "pensao",
  "pensão",
  "manut.famil",
  "manutencao famil",
  "manutenção famil",
  "plano saude",
  "sindicato",
  "amazonprev",
  "desconto",
  "milicred",
  "saque",
  "credic",
  "margem",
  "financiamento",
  "financi",
  "quita",
  "liquida",
  "parcela",
  "divida",
  "dívida",
  "cef",
  "sicoob",
  "bancoob",
  "bancoob emp",
  "bb-emp",
  "bb emp",
];

const VANTAGEM_HINTS = [
  "soldo",
  "vencimento",
  "salário",
  "salario",
  "gratif",
  "gratificação",
  "adicional",
  "hora extra",
  "etapas",
  "serv.extra",
  "abono",
  "insalubridade",
  "cargo",
  "auxilio",
  "auxílio",
  "indeniz",
  "antec 13",
  "13o sal",
];

/**
 * Abate do adiantamento da 1.ª parcela do 13º na liquidação de dezembro (coluna **descontos**).
 * Não confundir com «13.SALARIO ADIANTADO» em **ganhos** (junho).
 */
function isAbateAdiantamento13Integral(description: string): boolean {
  const n = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\bdesc\.?\s*13\b.*\badiant/i.test(n)) return true;
  if (/\bdesc\s*13\.?\s*sal.*adiant/i.test(n)) return true;
  if (/\bdec\.?\s*13\.?\s*sal.*adiant/i.test(n)) return true;
  return false;
}

/**
 * Rubricas de empréstimo/consignado/banco — devem ganhar de hints genéricos
 * (ex.: «CAIXA EMPO2» OCR de empréstimo Caixa).
 */
function isEmprestimoOuBancoLinha(description: string): boolean {
  if (rubricaEhExcluidaDeEmprestimo(description)) return false;

  const n = preprocessDescricaoParaDetecaoBanco(description).replace(/\s+/g, " ");

  if (textoTemCaixaOuCefOuCompe104(n) && textoContemIndicioEmprestimoConsignado(n)) {
    return true;
  }

  return /\b(bb-emp|bb\s*emp|bancoob|sicoob|panamericano|credcesta|credicesta|credic\b|consig\b|emprestim\w*|empo\d|(?<=^|[^a-z0-9])emp(?:0\d{1,5}|\d{2,6})(?![a-z0-9])|^emp\s|emp\s+\d|parcela\s*\d|[a-z]{2}-\s*emp\b)/i.test(
    n
  );
}

/** Rubrica da **coluna de descontos** SEAD: texto começa por «DESC.» / «DEC.» (inclui DESC.13…SALAD.COMIS etc.). */
function isColunaDescontoPrefixoDesc(description: string): boolean {
  const n = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (/^(desc|dec|desce|descg)\./.test(n)) return true;
  if (/^(desc|dec)\s+13\b/.test(n)) return true;
  return false;
}

/** Adiantamento de 13º em **ganhos** (ex.: junho — 13.SALARIO ADIANTADO, ANTEC 13º). */
function isRendimento13OuAdiantamento(description: string): boolean {
  if (isAbateAdiantamento13Integral(description)) return false;
  const n = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  /** Coluna de descontos nunca é rendimento bruto. */
  if (/^(desc|dec)\./.test(n.trim())) return false;
  /** Abate/comissão 13º (DESC.13…COMIS) — não confundir com antecipação em ganhos. */
  if (/\bdesc\.?\s*13\b.*\bcomis/i.test(n)) return false;
  return (
    /\b13\.?\s*salario\s*adiant|\b13\.?\s*sal\s*adiant\b|\bantec\s*13o|\bantec\s*13\b|\b13o\.?\s*sal\s*media|\b13\.?\s*sal\s*media\b/.test(
      n
    ) || /\bsal\.?\s*adiant\b/.test(n)
  );
}

function guessTipoLinha(description: string, code?: string): PayslipItemType {
  if (isAbateAdiantamento13Integral(description)) return "desconto";
  if (isColunaDescontoPrefixoDesc(description)) return "desconto";
  if (isRendimento13OuAdiantamento(description)) return "vantagem";
  if (isEmprestimoOuBancoLinha(description)) return "desconto";

  const cod4 = (code ?? "").replace(/\D/g, "").slice(0, 4);
  if (/^[56]\d{3}$/.test(cod4)) return "desconto";
  if (/^[01]\d{3}$/.test(cod4)) return "vantagem";

  const n = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (DESCONTO_HINTS.some((h) => n.includes(h))) return "desconto";

  if (VANTAGEM_HINTS.some((h) => n.includes(h))) return "vantagem";

  return "vantagem";
}

/** Rodapé / totais que o OCR às vezes junta como rubrica (ex.: «LIQUIDO 5.530,43»). */
function isDescricaoRodapeOuTotalFolha(desc: string): boolean {
  const d = desc
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/^liquido\b/.test(d)) return true;
  if (/^total\s+de\s+(ganhos|descontos)\b/.test(d)) return true;
  if (/^total\s+bruto\b/.test(d)) return true;
  if (/^total\s+de\s+ganhos\s*\(/.test(d)) return true;
  return false;
}

function ruimComoDescricao(desc: string): boolean {
  const d = desc.trim();
  if (isDescricaoRodapeOuTotalFolha(d)) return true;
  if (d.length < 3 || d.length > 100) return true;
  if (
    /^(GOVERNO|SECRETARIA|SEAD|CONTRACHEQUE|CARGO|CLASSE|VINCULO|CODIGO|DESCRICAO|GANHOS|DESCONTOS|TOTAL|FICHA|MATRICULA|PARC\b)/i.test(
      d
    )
  ) {
    return true;
  }
  const letters = (d.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
  const alnum = (d.match(/[a-zA-ZÀ-ÿ0-9]/g) ?? []).length;
  if (d.length > 6 && letters > 0 && alnum / d.length < 0.28) return true;
  return false;
}

function toItem(code: string, desc: string, val: number): PayslipItem {
  let cleaned = sanitizePayslipLineDescription(desc);
  cleaned = normalizeRubricaNomesFolha(cleaned);
  cleaned = stripSpuriousTrailingAmounts(cleaned, val);
  cleaned = stripSeadRubricaColumnMarkers(cleaned);
  cleaned = cleaned.replace(/\s+/g, " ").trim().slice(0, 240);

  const par = extrairParcelaConsignado(cleaned);
  const textoTipo = par.baseDescription.length >= 3 ? par.baseDescription : cleaned;
  const type = guessTipoLinha(textoTipo, code);

  let description = cleaned;
  let parcelaAtual: number | undefined;
  let parcelaTotal: number | undefined;
  if (par.parcelaAtual != null && par.parcelaTotal != null) {
    parcelaAtual = par.parcelaAtual;
    parcelaTotal = par.parcelaTotal;
    description = par.baseDescription.replace(/\s+/g, " ").trim().slice(0, 240);
  }

  const banco = detectarInstituicaoNaDescricao(par.baseDescription.length >= 3 ? par.baseDescription : cleaned);
  const baseParaConf = par.baseDescription.length >= 3 ? par.baseDescription : cleaned;
  const bancoConfirmacao = confirmacaoBancoCurado(baseParaConf);
  return {
    description,
    value: val,
    type,
    code: code || undefined,
    parcelaAtual,
    parcelaTotal,
    banco: banco
      ? { compe: banco.compe, nome: banco.nome, matchedToken: banco.matchedToken }
      : undefined,
    bancoConfirmacao: bancoConfirmacao ?? undefined,
  };
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * PDFs oficiais SEAD por vezes extraem a tabela como `5 7 5 4 ... 0 0 4 | 0 7 2 V 320,00`.
 * Normaliza só o formato de linha de rubrica para reaproveitar os parsers existentes.
 */
function normalizeSeadOfficialContrachequeRows(rawText: string): string {
  return rawText
    .split(/\r?\n/)
    .map((line) => {
      let s = line;
      s = s.replace(/^\s*((?:\d\s+){3}\d)(?=\s+[A-ZÀ-Ÿa-zà-ÿ])/u, (m) => {
        const code = digitsOnly(m);
        return code.length === 4 ? `${code} ` : m;
      });
      s = s.replace(/\b((?:\d\s+){2}\d)\s*\|\s*((?:\d\s+){2}\d)\b/g, (_m, a: string, b: string) => {
        const atual = digitsOnly(a);
        const total = digitsOnly(b);
        return atual.length === 3 && total.length === 3 ? `${atual}/${total}` : _m;
      });
      return s;
    })
    .join("\n");
}

/**
 * Contracheque/ficha onde o texto vem «partido»: vários montantes na mesma linha (bases, %) —
 * usa o **último** `x.xxx,xx` como valor da rubrica (coluna habitual de ganho/desconto).
 * Ex.: `0059 ETAPAS 31,00 * 77,50` · `5245 AMAZONPREV  1.234,56`.
 */
function parseLinhasCodigoDescUltimoValor(
  rawText: string,
  items: PayslipItem[],
  seen: Set<string>
): void {
  const lines = rawText.split(/\r?\n/);
  const valRe = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!/^\d{3,4}\b/.test(trimmed)) continue;
    const mCode = trimmed.match(/^(\d{3,4})\s+(.+)$/);
    if (!mCode) continue;
    const code = mCode[1];
    const rest = mCode[2].trim();
    const vals = [...rest.matchAll(valRe)].map((x) => parseBRL(x[0]));
    const val = vals.filter((v) => v > 0 && v <= 500_000).pop();
    if (!val) continue;
    let desc = rest.replace(valRe, " ").replace(/\*/g, " ").replace(/\s+/g, " ").trim();
    if (desc.length > 100) desc = desc.slice(0, 100);
    desc = sanitizePayslipLineDescription(desc);
    if (ruimComoDescricao(desc)) continue;
    const tipo = guessTipoLinha(desc, code);
    const key = `${tipo}|${val.toFixed(2)}|${slugForDedup(desc)}|${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(toItem(code, desc, val));
  }
}

function parseLinhasPm(rawText: string, items: PayslipItem[], seen: Set<string>): void {
  const lines = rawText.split(/\r?\n/);
  /** Ficha SEAD: `0059 ETAPAS   31,00   *   77,50` — usa o último valor (coluna ganho). */
  const reGanho = /^\s*(\d{3,4})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+\*\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
  const reSimples = /^\s*(\d{3,4})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
  for (const line of lines) {
    let m = line.match(reGanho);
    let code: string;
    let desc: string;
    let val: number;
    if (m) {
      code = m[1];
      desc = sanitizePayslipLineDescription(m[2]);
      val = parseBRL(m[4]);
    } else {
      m = line.match(reSimples);
      if (!m) continue;
      code = m[1];
      desc = sanitizePayslipLineDescription(m[2]);
      val = parseBRL(m[3]);
    }
    if (!val || val > 500_000) continue;
    if (ruimComoDescricao(desc)) continue;
    const tipo = guessTipoLinha(desc, code);
    const key = `${tipo}|${val.toFixed(2)}|${slugForDedup(desc)}|${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(toItem(code, desc, val));
  }
}

/**
 * Alguns PDFs/OCR de folha especial separam «código + descrição» e «valores» em colunas/linhas distintas.
 * Esta rotina tenta recompor a secção de rubricas por ordem visual (topo -> base).
 */
function parseSecaoRubricasPorColuna(rawText: string, items: PayslipItem[], seen: Set<string>): void {
  const start = rawText.search(/\bCOD(?:IGO)?\s+DESCRI/i);
  if (start < 0) return;
  const tail = rawText.slice(start);
  const relEnd = tail.search(/\bTOTAL\s+DE\s+GANHOS|\bTOTAL\s+DE\s+DESCONTOS|\bLIQUIDO\b/i);
  const section = relEnd > 0 ? tail.slice(0, relEnd) : tail.slice(0, Math.min(tail.length, 3200));
  const lines = section.split(/\r?\n/);

  const coded: Array<{ code: string; desc: string }> = [];
  const values: number[] = [];
  const reCodeDesc = /^\s*(\d{3,4})\s+([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ0-9 .\-/|ºª]+?)\s*$/;
  const reOnlyVal = /^\s*[*xX#\s]*([\d]{1,3}(?:\.\d{3})*,\d{2})\s*[*xX#\s]*$/;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const mv = t.match(reOnlyVal);
    if (mv) {
      const v = parseBRL(mv[1]);
      if (v > 0 && v <= 500_000) values.push(v);
      continue;
    }
    const mc = t.match(reCodeDesc);
    if (!mc) continue;
    // Ignora linha já com valor no fim; outras rotinas já cobrem isso.
    if (/\d{1,3}(?:\.\d{3})*,\d{2}\s*$/.test(t)) continue;
    const desc = sanitizePayslipLineDescription(mc[2]);
    if (ruimComoDescricao(desc)) continue;
    coded.push({ code: mc[1], desc });
  }

  if (coded.length < 1 || values.length < coded.length) return;
  for (let i = 0; i < coded.length; i++) {
    const row = coded[i]!;
    const val = values[i]!;
    const tipo = guessTipoLinha(row.desc, row.code);
    const key = `${tipo}|${val.toFixed(2)}|${slugForDedup(row.desc)}|${row.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(toItem(row.code, row.desc, val));
  }
}

function repairTotals(p: ParsedPayslipPayload): ParsedPayslipPayload {
  const items = corrigirTipoDescPrefixEmItens(dedupePayslipItems(p.items ?? []));
  const sumV = items.filter((i) => i.type === "vantagem").reduce((s, i) => s + i.value, 0);
  const sumD = items.filter((i) => i.type === "desconto").reduce((s, i) => s + i.value, 0);

  let gross = p.grossSalary;
  let disc = p.totalDiscounts;
  let net = p.netSalary;

  /** Rubrica de desconto somou mais que ganhos nas linhas lidas, mas o cabeçalho tem totais oficiais — alinha líquido. */
  if (gross > 100 && disc > 50 && sumV > 50 && sumD > 50 && sumV - sumD < -50) {
    net = Math.max(0, gross - disc);
  }

  if (sumD < 80) {
    const incomplete = detectarLeituraPossivelmenteIncompleta(p.rawText, items, disc);
    return { ...p, items, netSalary: net, leituraPossivelmenteIncompleta: incomplete || p.leituraPossivelmenteIncompleta };
  }

  const headerDivergeDasRubricas =
    sumV > 500 &&
    sumD > 200 &&
    (gross < sumV * 0.88 || Math.abs(gross - sumV) > Math.max(600, sumV * 0.1));
  if (headerDivergeDasRubricas) {
    gross = sumV;
    disc = sumD;
    net = Math.max(0, gross - disc);
    const incomplete = detectarLeituraPossivelmenteIncompleta(p.rawText, items, disc);
    return {
      ...p,
      items,
      grossSalary: gross,
      totalDiscounts: disc,
      netSalary: net,
      leituraPossivelmenteIncompleta: true,
    };
  }

  const garbageDiscount = disc >= 0 && disc < Math.min(150, sumD * 0.08) && sumD > 300;
  if (!garbageDiscount) {
    const incomplete = detectarLeituraPossivelmenteIncompleta(p.rawText, items, disc);
    return { ...p, items, netSalary: net, leituraPossivelmenteIncompleta: incomplete || p.leituraPossivelmenteIncompleta };
  }

  disc = sumD;
  const implied = sumV - sumD;
  if (sumV > 100 && implied > 50) {
    gross = sumV;
    net = implied;
  } else {
    const r = gross - disc;
    if (r > 50) net = r;
  }
  const incomplete = detectarLeituraPossivelmenteIncompleta(p.rawText, items, disc);
  return {
    ...p,
    items,
    grossSalary: gross,
    totalDiscounts: disc,
    netSalary: net,
    leituraPossivelmenteIncompleta: incomplete || p.leituraPossivelmenteIncompleta,
  };
}

/**
 * Extrai totais e rubricas de texto SEAD/contracheque (PDF textual ou OCR).
 */
export function parseSeadPayslipText(rawText: string): ParsedPayslipPayload {
  let grossSalary = 0;
  let netSalary = 0;
  let totalDiscounts = 0;

  /** Ficha financeira PM/SEAD: `LIQUIDO:  net  bruto  desconto` numa linha. */
  const liquidoTres = rawText.match(
    /\bLIQUIDO\s*:\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i
  );
  if (liquidoTres) {
    netSalary = parseBRL(liquidoTres[1]);
    grossSalary = parseBRL(liquidoTres[2]);
    totalDiscounts = parseBRL(liquidoTres[3]);
  }

  const grossPatterns = [
    /total\s*de\s*ganhos?\s*\(p\+v\)\s*[*\s]*([\d.,]+)/i,
    /total\s*(?:de\s*)?vantagens?\s*[:\-]?\s*([\d.,]+)/i,
    /total\s*bruto\s*[:\-]?\s*([\d.,]+)/i,
  ];
  if (!grossSalary) {
    for (const p of grossPatterns) {
      const m = rawText.match(p);
      if (m) {
        grossSalary = parseBRL(m[1]);
        break;
      }
    }
  }

  const netPatterns = [
    /\bliquido\s*[*\s]*([\d.,]+)/i,
    /l[ií]quido\s*(?:final|total|a\s*receber)?\s*[:\-]?\s*([\d.,]+)/i,
  ];
  if (!netSalary) {
    for (const p of netPatterns) {
      const m = rawText.match(p);
      if (m) {
        netSalary = parseBRL(m[1]);
        break;
      }
    }
  }

  const discPatterns = [
    /total\s*de\s*descontos?\s*\(d\)\s*[*\s]*([\d.,]+)/i,
    /total\s*(?:de\s*)?descontos?\s*[:\-]?\s*([\d.,]+)/i,
    /total\s+de\s+descontos?\s+([\d.,]+)/i,
  ];
  if (!totalDiscounts) {
    for (const p of discPatterns) {
      const m = rawText.match(p);
      if (m) {
        totalDiscounts = parseBRL(m[1]);
        break;
      }
    }
  }

  if (!totalDiscounts && grossSalary && netSalary)
    totalDiscounts = Math.max(0, grossSalary - netSalary);

  const official = parseOfficialTotalsLine(rawText);
  if (official) {
    grossSalary = official.gross;
    totalDiscounts = official.discounts;
    netSalary = official.net;
  }

  const items: PayslipItem[] = [];
  const seen = new Set<string>();
  const normalizedOfficialText = normalizeSeadOfficialContrachequeRows(rawText);

  parseLinhasCodigoDescUltimoValor(normalizedOfficialText, items, seen);
  parseLinhasPm(normalizedOfficialText, items, seen);
  parseSecaoRubricasPorColuna(normalizedOfficialText, items, seen);
  parseLinhasCodigoDescUltimoValor(rawText, items, seen);
  parseLinhasPm(rawText, items, seen);
  parseSecaoRubricasPorColuna(rawText, items, seen);

  const linePattern =
    /(?:^|\n)\s*(\d{3,4})?\s*([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ0-9 .\-/|]+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?=$|\n)/gm;
  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(rawText)) !== null) {
    const code = match[1]?.trim() ?? "";
    const desc = sanitizePayslipLineDescription(match[2]);
    const val = parseBRL(match[3]);
    if (!val || val > 500_000) continue;
    if (ruimComoDescricao(desc)) continue;
    const tipo = guessTipoLinha(desc, code);
    const key = `${tipo}|${val.toFixed(2)}|${slugForDedup(desc)}|${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(toItem(code, desc, val));
  }

  const mergedItems = corrigirTipoDescPrefixEmItens(dedupePayslipItems(items)).filter(
    (i) => !isDescricaoRodapeOuTotalFolha(i.description),
  );

  if (!grossSalary)
    grossSalary = mergedItems.filter((i) => i.type === "vantagem").reduce((s, i) => s + i.value, 0);
  if (!totalDiscounts)
    totalDiscounts = mergedItems.filter((i) => i.type === "desconto").reduce((s, i) => s + i.value, 0);
  if (!netSalary) netSalary = Math.max(0, grossSalary - totalDiscounts);

  const base: ParsedPayslipPayload = {
    grossSalary,
    netSalary,
    totalDiscounts,
    items: mergedItems,
    rawText,
    instituicoesDetectadas: listarInstituicoesNoTexto(rawText),
  };
  return repairTotals(base);
}

function mergeInstituicoesResumo(
  listas: readonly InstituicaoResumo[],
): InstituicaoResumo[] {
  const map = new Map<string, InstituicaoResumo>();
  for (const x of listas) {
    const k = `${x.compe}|${x.nome}`;
    if (!map.has(k)) map.set(k, x);
  }
  return [...map.values()];
}

/**
 * Soma totais e une rubricas quando a ficha tem **dois extratos distintos** no mesmo mês
 * (ex.: 13º em «folha especial» + «folha mensal»). Evita perder o segundo bloco ao juntar texto
 * (o parser costuma ficar só com o primeiro `LIQUIDO`).
 */
export function mergeParsedPayslipPayloads(
  partes: ParsedPayslipPayload[],
): ParsedPayslipPayload {
  const ok = partes.filter(
    (p) =>
      p &&
      (p.items.length > 0 || p.grossSalary > 0 || p.netSalary > 0 || p.totalDiscounts > 0),
  );
  if (ok.length === 0) {
    return (
      partes[0] ?? {
        grossSalary: 0,
        netSalary: 0,
        totalDiscounts: 0,
        items: [],
        rawText: "",
        instituicoesDetectadas: [],
      }
    );
  }
  if (ok.length === 1) return { ...ok[0]! };
  const items = corrigirTipoDescPrefixEmItens(dedupePayslipItems(ok.flatMap((p) => p.items)));
  const grossSalary = ok.reduce((s, p) => s + p.grossSalary, 0);
  const totalDiscounts = ok.reduce((s, p) => s + p.totalDiscounts, 0);
  const netSalary = ok.reduce((s, p) => s + p.netSalary, 0);
  const rawText = ok.map((p) => p.rawText).join("\n\n---\n\n");
  const instituicoesDetectadas = mergeInstituicoesResumo(
    ok.flatMap((p) => p.instituicoesDetectadas ?? []),
  );
  const leituraPossivelmenteIncompleta = ok.some((p) => p.leituraPossivelmenteIncompleta);
  return repairTotals({
    grossSalary,
    netSalary,
    totalDiscounts,
    items,
    rawText,
    instituicoesDetectadas,
    leituraPossivelmenteIncompleta,
  });
}
