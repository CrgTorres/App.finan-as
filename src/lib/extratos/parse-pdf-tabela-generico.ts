/**
 * Parser genérico para PDF texto com layout próximo de:
 * Data | Descrição | Documento/ID | Valor | Saldo
 */

import type { TransacaoImportada } from "./extrato-parser-core";
import { VALOR_TRANSACAO_MAXIMO_BR, normalizarTexto, parseMoneyBR } from "./extrato-parser-core";
import {
  linhaPareceRodapeDocumentoBr,
  textoIndicaFaturaContaDeEnergia,
  truncarBlocoExtratoParaArmazenamento,
  truncarRodapeDocumentosBr,
} from "@/lib/extratos/pdf-descricao-truncar-rodape";

export const ORIGEM_PDF_TABELA_GENERICO = "pdf_tabela_generico";

/** Valores com R$, milhar '.' e vírgula decimal (comum nos extratos BR). */
const RE_MOEDA_BR = /\bR\$\s*(-?\s*\d{1,3}(?:\.\d{3})*,\d{2})\b/gi;

/** Remove padrões de cabeçalho/colunas ou rodapés (linha isolada). */
function linhaDeveSerIgnorada(linha: string): boolean {
  const u = normalizarTexto(linha);
  if (u.length < 3) return true;
  if (u.includes("pagina") && /\d\s*\/\s*\d/.test(linha)) return true;
  if (
    u.includes("data") &&
    (u.includes("descricao") || u.includes("historico")) &&
    (u.includes("valor") || u.includes("saldo"))
  )
    return true;
  return (
    u.includes("saldo inicial do periodo") ||
    /^sac\b/.test(u)
  );
}

function blocoDeveSerIgnorado(bloco: string): boolean {
  const u = normalizarTexto(bloco);
  if (/^\s*saldo\s+(final|disponivel)|^saldo\s+inicial\b/.test(u))
    return true;
  if (/\btota(l|is)\s+de\b/.test(u) && /\b(credito|debito|moviment)/.test(u))
    return true;
  if (/entrada\b.*saidas?\b|^entradas?:\s*$/im.test(u)) return true;
  return false;
}

/** Primeiros três grafemas latinos úteis (após tirar marcas combinantes). */
function prefixoAscii3(tok: string): string {
  return tok
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .slice(0, 3);
}

/** Mês por abrev pt de 3 letras (“março” → “mar”). */
function mesNomeParaMm(mesNome: string): string | null {
  const pref = prefixoAscii3(mesNome);
  const map: Record<string, string> = {
    jan: "01",
    fev: "02",
    mar: "03",
    abr: "04",
    mai: "05",
    jun: "06",
    jul: "07",
    ago: "08",
    set: "09",
    out: "10",
    nov: "11",
    dez: "12",
  };
  const hit = map[pref];
  if (hit) return hit;
  /** Nomes por extenso (normalizados). */
  const full = mesNome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const LONG: Record<string, string> = {
    janeiro: "01",
    fevereiro: "02",
    marco: "03",
    abril: "04",
    maio: "05",
    junho: "06",
    julho: "07",
    agosto: "08",
    setembro: "09",
    outubro: "10",
    novembro: "11",
    dezembro: "12",
  };
  return LONG[full] ?? null;
}

function doisDigitos(dd: string): string {
  return dd.padStart(2, "0");
}

/** Data apenas no prefixo já trimado pela esquerda. */
function extrairDataPrefixo(trimStartLinha: string): { iso: string; len: number } | null {
  let m = /^(\d{2})\/(\d{2})\/(\d{4})\b/.exec(trimStartLinha);
  if (m) return { iso: `${m[3]}-${m[2]}-${m[1]}`, len: m[0].length };

  m = /^(\d{2})-(\d{2})-(\d{4})\b/.exec(trimStartLinha);
  if (m) return { iso: `${m[3]}-${m[2]}-${m[1]}`, len: m[0].length };

  m = /^(\d{4})-(\d{2})-(\d{2})\b/.exec(trimStartLinha);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, len: m[0].length };

  m = /^(\d{1,2})\s+([a-zA-ZÀ-úçÇ]+)\s+(\d{4})\b/.exec(trimStartLinha);
  if (m) {
    const [, d, nomeMes, yyyy] = m;
    const mm = mesNomeParaMm(nomeMes);
    if (!mm) return null;
    return { iso: `${yyyy}-${mm}-${doisDigitos(d)}`, len: m[0].length };
  }

  return null;
}

/** Data na linha inteira — devolve índice até onde a data ocupou caracteres desde o início. */
export function extrairPrefixoDataNaLinha(linha: string): { iso: string; prefixLen: number } | null {
  const t = linha.trimStart();
  const skip = linha.length - t.length;
  const d = extrairDataPrefixo(t);
  if (!d) return null;
  return { iso: d.iso, prefixLen: skip + d.len };
}

function comNovaDataLinha(linha: string): boolean {
  return extrairPrefixoDataNaLinha(linha) !== null;
}

/** Junta linhas entre datas consecutivas. */
export function juntarLinhasEntreDatas(raw: string): string[] {
  const linhas = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  const blocos: string[] = [];
  let atual = "";
  let orfaAntesPrimeiraData = "";

  for (const linha of linhas) {
    if (linhaDeveSerIgnorada(linha)) continue;
    if (linhaPareceRodapeDocumentoBr(linha)) continue;

    if (comNovaDataLinha(linha)) {
      if (atual.trim()) blocos.push(atual.trim());

      atual = `${orfaAntesPrimeiraData ? `${orfaAntesPrimeiraData} ` : ""}${linha}`.trim();
      orfaAntesPrimeiraData = "";
      continue;
    }

    if (!atual && orfaAntesPrimeiraData === "") {
      orfaAntesPrimeiraData = linha;
      continue;
    }
    if (!atual) {
      orfaAntesPrimeiraData =
        `${orfaAntesPrimeiraData}${orfaAntesPrimeiraData ? " " : ""}${linha}`.trim();
      continue;
    }

    atual = `${atual} ${linha}`;
  }

  if (orfaAntesPrimeiraData && atual)
    atual = `${orfaAntesPrimeiraData} ${atual}`.trim();
  else if (orfaAntesPrimeiraData && !atual) atual = orfaAntesPrimeiraData.trim();

  if (atual.trim()) blocos.push(atual.trim());
  return blocos;
}

function capturarValoresRS(bloco: string): number[] {
  const vals: number[] = [];
  const re = new RegExp(RE_MOEDA_BR.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloco)) !== null) {
    vals.push(parseMoneyBR(`R$${m[1]!.replace(/\s/g, "")}`));
  }
  return vals;
}

function primeiraOcorrenciaRS(bloco: string): number {
  RE_MOEDA_BR.lastIndex = 0;
  const m = RE_MOEDA_BR.exec(bloco);
  return m?.index ?? -1;
}

/**
 * DANFEE / fatura: prioriza vencimento → emissão → mês (MM/AAAA) referência;
 * evita usar “data da leitura anterior” quando o PDF começa por esse campo.
 */
function extrairDataIsoFaturaDoPdf(textoCompleto: string, dataPrefixoBloco: string): string {
  const t = textoCompleto.normalize("NFC");
  const patterns: RegExp[] = [
    /\bVENCIMENTO\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\b/i,
    /\bVencimento\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\b/,
    /\bData\s+do\s+Vencimento\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\b/i,
    /\bEmiss[aã]o\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\b/i,
    /\bData\s+(?:da\s+)?Emiss[aã]o\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m) return `${m[3]!}-${m[2]!}-${m[1]!}`;
  }
  const ref = /\b(?:Refer[êe]ncia|Faturamento|M[eê]s\/Ano)\s*:?\s*(\d{2})\/(\d{4})\b/i.exec(
    t,
  );
  if (ref) return `${ref[2]!}-${ref[1]!}-15`;
  return dataPrefixoBloco;
}

/** Título curto para import genérica de fatura de energia (evita colar tabela de leitura). */
function sintetizarDescricaoFaturaEnergia(textoCompleto: string, descricaoAtual: string): string {
  const n = normalizarTexto(textoCompleto);
  let nome = "Conta de energia elétrica";
  if (n.includes("amazonas energia")) nome = "Amazonas Energia";
  const t = textoCompleto.normalize("NFC");
  const refM =
    /\b(?:Refer[êe]ncia|Faturamento|M[eê]s\/Ano)\s*:?\s*(\d{2})\/(\d{4})\b/i.exec(t) ||
    /\b(\d{2})\/(\d{4})\b/.exec(t);
  const refLabel = refM ? `${refM[1]}/${refM[2]}` : null;
  const base = refLabel ? `${nome} — ref. ${refLabel}` : nome;

  const limpa = descricaoAtual.normalize("NFC").trim();
  if (limpa.length < 3) return base;
  const pareceLixo =
    limpa.length > 110 ||
    /\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}/.test(limpa) ||
    /\b(Dias de consumo|Leit\.|Desc\.?\s*da\s+Grandeza|Constante\s+Registr|Apresenta[cç][aã]o)\b/i.test(
      limpa,
    );
  return pareceLixo ? base : truncarRodapeDocumentosBr(limpa);
}

/**
 * Extrai lançamentos de PDF texto tipo tabela sem parser de banco dedicado.
 */
export function parsePdfTabelaGenerico(textoBruto: string): TransacaoImportada[] {
  const texto = textoBruto.replace(/\r/g, "\n");
  const blocos = juntarLinhasEntreDatas(texto);
  const out: TransacaoImportada[] = [];
  const dup = new Set<string>();

  for (const bloco of blocos) {
    if (blocoDeveSerIgnorado(bloco)) continue;

    const dInfo = extrairPrefixoDataNaLinha(bloco);
    if (!dInfo) continue;

    const ixValor = primeiraOcorrenciaRS(bloco);
    if (ixValor < dInfo.prefixLen) continue;

    const vals = capturarValoresRS(bloco);
    if (vals.length === 0) continue;

    const v0 = vals[0]!;
    if (!Number.isFinite(v0) || v0 === 0) continue;

    let saldo: number | null = vals.length >= 2 ? vals[1]! : null;

    const trechoDescr = bloco.slice(dInfo.prefixLen, ixValor).trim();
    let documento: string | null = null;
    const tailIdMatch = /\b(\d{8,})\s*$/.exec(trechoDescr);
    if (tailIdMatch) documento = tailIdMatch[1]!;

    let descricao =
      tailIdMatch && typeof tailIdMatch.index === "number"
        ? trechoDescr.slice(0, tailIdMatch.index).trim()
        : trechoDescr;

    descricao = truncarRodapeDocumentosBr(
      descricao
        .replace(/\|\s+/g, " ")
        .replace(/\|/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    );

    if (documento && descricao.includes(documento))
      descricao = descricao.replace(new RegExp(`\\b${documento}\\b`, "g"), "").trim();

    const ctxFatura =
      textoIndicaFaturaContaDeEnergia(texto) || textoIndicaFaturaContaDeEnergia(bloco);

    if (ctxFatura) {
      descricao = sintetizarDescricaoFaturaEnergia(texto, descricao);
    }

    if (descricao.length < 2) continue;

    let tipo: "receita" | "despesa" = v0 >= 0 ? "receita" : "despesa";
    if (ctxFatura) tipo = "despesa";

    let dataIso = dInfo.iso;
    if (ctxFatura) dataIso = extrairDataIsoFaturaDoPdf(texto, dInfo.iso);

    const valorAbs = Math.abs(v0);

    const docDig = documento?.replace(/\D/g, "") ?? "";
    if (
      docDig.length >= 8 &&
      docDig === String(Math.round(valorAbs))
    )
      continue;

    if (valorAbs > VALOR_TRANSACAO_MAXIMO_BR) continue;

    /** Saldo igual ao movimento é provável erro de leitura da coluna Saldo. */
    if (saldo != null && Math.abs(saldo - valorAbs) < 1e-9) saldo = null;

    const tx: TransacaoImportada = {
      data: dataIso,
      descricao,
      descricaoOriginal: truncarBlocoExtratoParaArmazenamento(bloco),
      documento,
      tipo,
      valor: valorAbs,
      saldo,
      origem: ORIGEM_PDF_TABELA_GENERICO,
      confianca: "baixa",
      metadata: { parser: ORIGEM_PDF_TABELA_GENERICO },
    };

    const k = `${dataIso}|${descricao.toLowerCase()}|${valorAbs.toFixed(2)}|${documento ?? ""}`;
    if (dup.has(k)) continue;
    dup.add(k);

    out.push(tx);
  }

  return out;
}
