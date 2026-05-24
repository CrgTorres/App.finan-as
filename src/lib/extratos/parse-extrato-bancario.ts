/**
 * Extratos Bradesco Celular / Nubank (texto de PDF ou colado em CSV/TXT).
 * Crédito = receita; Débito = despesa. O último valor à direita costuma ser saldo, nunca lançado como movimento.
 */

import { limparDescricaoMovimentoNubank } from "@/lib/extratos/nubank-descricao-limpeza";

export type TransacaoImportada = {
  data: string;
  descricao: string;
  documento?: string | null;
  tipo: "receita" | "despesa";
  valor: number;
  saldo?: number | null;
  origem?: "bradesco" | "nubank" | "generico";
  confianca?: "alta" | "media" | "baixa";
};

type CalibracaoBradesco = {
  credInicio: number;
  debInicio: number;
  saldoInicio: number;
  headerLen: number;
};

const RE_VALOR_BR = /\d{1,3}(?:\.\d{3})*,\d{2}/g;

export function parseValorBR(valor: string): number {
  const n = valor
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const x = Number(n);
  return Number.isFinite(x) ? Math.abs(x) : 0;
}

function formatarDataBR(data: string): string {
  const [dia, mes, ano] = data.trim().split("/");
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

function ehDataBR(texto: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(texto.trim());
}

function extrairValoresBR(texto: string): string[] {
  return texto.match(RE_VALOR_BR)?.slice() ?? [];
}

function parseCabecalhoBradesco(header: string): Omit<CalibracaoBradesco, "headerLen"> | null {
  const h = header.normalize("NFC").replace(/\s+/g, " ");
  const mCred = /Cr[eé]dito\s*(?:\(R\$?\))?/i.exec(h);
  const mDeb = /D[eé]bito\s*(?:\(R\$?\))?/i.exec(h);
  const mSal = /\bSaldo\s*(?:\(R\$?\))?/i.exec(h);
  const iCred = mCred?.index ?? -1;
  const iDeb = mDeb?.index ?? -1;
  const iSal = mSal?.index ?? -1;
  if (iCred < 0 || iDeb < 0 || iSal < iDeb || iDeb <= iCred) return null;
  return { credInicio: iCred, debInicio: iDeb, saldoInicio: iSal };
}

function encontrarCalibBradesco(texto: string): CalibracaoBradesco | null {
  for (const ln of texto.split(/\r?\n/)) {
    const L = ln.trim();
    if (!L) continue;
    if (/Hist[oó]rico/i.test(L) && /Cr[eé]dito|D[eé]bito|Saldo/i.test(L)) {
      const c = parseCabecalhoBradesco(L);
      if (c) return { ...c, headerLen: Math.max(L.normalize("NFC").length, 48) };
    }
  }
  return null;
}

/** Usa proporção caracteres × cabeçalho quando a linha de movimento está truncada/recortada pelo PDF */
function tipoPorColunaBradesco(linhaValor: string, valorStr: string, cal: CalibracaoBradesco): "receita" | "despesa" {
  const L = linhaValor.normalize("NFC");
  let idx = L.indexOf(valorStr);
  if (idx < 0) {
    for (const tok of linhaValor.match(RE_VALOR_BR) ?? []) {
      if (tok === valorStr || parseValorBR(tok) === parseValorBR(valorStr)) {
        idx = linhaValor.indexOf(tok);
        break;
      }
    }
  }
  if (idx < 0) return "despesa";

  const lineLen = Math.max(L.trimEnd().length, 30);
  const scaled = idx * (cal.headerLen / lineLen);

  if (scaled >= cal.debInicio - 3 && scaled < cal.saldoInicio - 2) return "despesa";
  if (scaled >= cal.credInicio - 3 && scaled < cal.debInicio - 3) return "receita";

  const centroCredito = cal.credInicio + (cal.debInicio - cal.credInicio) / 2;
  const centroDebito = cal.debInicio + (cal.saldoInicio - cal.debInicio) / 2;
  return Math.abs(scaled - centroDebito) <= Math.abs(scaled - centroCredito) ? "despesa" : "receita";
}

/**
 * Extrai linha de fecho Bradesco com `movimento + saldo` no fim (último valor é sempre saldo).
 * Aceita formato com colunas zeradas antes do movimento: `..., 0,00 217,94 2.839,71`.
 */
function parseLinhaFechoBradesco(linha: string): {
  textoAntesValor: string;
  documento: string | null;
  valorStr: string;
  saldoStr: string;
} | null {
  const matches = [...linha.matchAll(new RegExp(RE_VALOR_BR.source, "g"))]
    .map((m) => ({ str: m[0], idx: m.index ?? 0 }))
    .filter((m) => m.str);
  if (matches.length < 2) return null;

  const saldoStr = matches[matches.length - 1].str;
  const iSal = matches[matches.length - 1].idx;

  let movMatch: { str: string; idx: number } | null = null;
  for (let i = matches.length - 2; i >= 0; i--) {
    if (parseValorBR(matches[i].str) > 0 && matches[i].idx < iSal) {
      movMatch = matches[i];
      break;
    }
  }
  if (!movMatch) return null;

  const valorStr = movMatch.str;
  let textoAntes = linha.slice(0, movMatch.idx).trimEnd();
  textoAntes = textoAntes.replace(/\s0,00\s*$/i, "").trimEnd();

  let documento: string | null = null;
  const docM = textoAntes.match(/(\d{6,})\s*$/);
  if (docM) {
    documento = docM[1];
    textoAntes = textoAntes.slice(0, textoAntes.length - docM[0].length).trimEnd();
  }

  return { textoAntesValor: textoAntes, documento, valorStr, saldoStr };
}

function montarDescricao(historicoLinhas: string[], complemento: string): string {
  const partes = [...historicoLinhas.filter((s) => s && !/^[\d\s,./]+$/.test(s)), complemento?.trim()].filter(
    Boolean
  ) as string[];
  let s = partes.join(" ").replace(/\s+/g, " ").trim();
  s = s.replace(/\s*[|]\s*$/, "").trim();
  return s.length >= 2 ? s : complemento.trim();
}

function tipoFallbackBradescoHistorico(desc: string): "receita" | "despesa" {
  const u = desc.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  if (
    /\bTED\s+R\b|CREDITO|RECEB|DEPOSITO\b|DEVOL|ESTORNO|JUROS\s+L[ií]Q|RENDER|RESGATE/.test(u) ||
    /\bTROCO\s+DE\s+PIX\b/.test(u)
  )
    return "receita";

  if (/PIX\s+QR|PIX\s+QRC|DES:|PAGAMENTO|DEBITO|COMPRA|ENVIAD|TARIFA|SAQUE|MULTA|SUCATA|MENSALID/.test(u))
    return "despesa";

  return "despesa";
}

export function parseBradesco(textoBruto: string): TransacaoImportada[] {
  const texto = textoBruto.normalize("NFC").replace(/\u00a0/g, " ");
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cal = encontrarCalibBradesco(texto);
  const out: TransacaoImportada[] = [];

  let dataAtual: string | null = null;
  let historico: string[] = [];
  let linhaDataOriginal = "";

  for (const linha of linhas) {
    if (
      /Bradesco\s+Celular|^Saldo dispon[ií]vel|^Ag[eê]ncia:|^Conta:?|CPF:|^Titular:|Tabelas de dom[ií]cilio|^Movimenta[cç][aã]o\s+Econ|^Total\s+/i.test(
        linha
      )
    )
      continue;

    if (
      /^Hist[oó]rico/i.test(linha) &&
      (/Cr[eé]dito|D[eé]bito|Docto/i.test(linha) || /\bData\b.*\bHist/i.test(linha))
    )
      continue;

    /** Data sozinha (PDF filtrado) ou seguida de texto na mesma linha. */
    const mData = linha.match(/^(\d{2}\/\d{2}\/\d{4})(?:\s+(.*))?$/);
    if (mData) {
      dataAtual = mData[1];
      linhaDataOriginal = linha;
      const resto = (mData[2] ?? "").trim();

      const fechoNoMesmoDia = parseLinhaFechoBradesco(resto);
      if (fechoNoMesmoDia) {
        const descricao = montarDescricao([], fechoNoMesmoDia.textoAntesValor);
        const valor = parseValorBR(fechoNoMesmoDia.valorStr);
        const saldo = parseValorBR(fechoNoMesmoDia.saldoStr);
        const tipo = cal
          ? tipoPorColunaBradesco(linha, fechoNoMesmoDia.valorStr, cal)
          : tipoFallbackBradescoHistorico(descricao);

        out.push({
          data: formatarDataBR(dataAtual),
          descricao: descricao || "(movimento)",
          documento: fechoNoMesmoDia.documento,
          tipo,
          valor,
          saldo,
          origem: "bradesco",
          confianca: cal ? "alta" : "media",
        });
        linhaDataOriginal = "";
        historico = [];
        continue;
      }

      historico = resto ? [resto] : [];
      continue;
    }

    if (!dataAtual) continue;

    const fecho = parseLinhaFechoBradesco(linha);
    if (fecho) {
      const descricao = montarDescricao(historico, fecho.textoAntesValor);
      const valor = parseValorBR(fecho.valorStr);
      const saldo = parseValorBR(fecho.saldoStr);

      const tipo = cal ? tipoPorColunaBradesco(linha, fecho.valorStr, cal) : tipoFallbackBradescoHistorico(descricao);

      out.push({
        data: formatarDataBR(dataAtual),
        descricao: descricao || "(movimento)",
        documento: fecho.documento,
        tipo,
        valor,
        saldo,
        origem: "bradesco",
        confianca: cal ? "alta" : "media",
      });
      historico = [];
      linhaDataOriginal = "";
      continue;
    }

    if (!/^[\d.,\sR$\-]+$/.test(linha)) historico.push(linha);
  }

  return out;
}

function tipoNubank(descricao: string, linha: string): "receita" | "despesa" {
  const d = `${descricao} ${linha}`.normalize("NFC").toLowerCase().replace(/\s+/g, " ");

  if (/\btransfer[eê]ncia\s+recebida\b|\bpix\s+recebido\b|\bpagamento\s+recebido\b/i.test(d)) return "receita";
  if (
    /\btransfer[eê]ncia\s+enviada\b|\bpagamento\s+de\s+fatura\b|\bcompra\s+no\s+d[eé]bito\b|\bpagamento\s+efetuado\b/i.test(
      d
    )
  )
    return "despesa";

  if (/^[-−–]/.test(linha.trim())) return "despesa";

  if (/\bdep[oó]sito\b|\bentrada\b|\brendimento\b|\bcashback\b/i.test(d)) return "receita";
  if (/\bpagamento\b|\bcompra\b|\bfatura\b|\bsaque\b|\bparcela\b|\bcart[aã]o\b/i.test(d)) return "despesa";

  return "despesa";
}

export function parseNubank(texto: string): TransacaoImportada[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const meses: Record<string, string> = {
    JAN: "01",
    FEV: "02",
    MAR: "03",
    ABR: "04",
    MAI: "05",
    JUN: "06",
    JUL: "07",
    AGO: "08",
    SET: "09",
    OUT: "10",
    NOV: "11",
    DEZ: "12",
  };

  let dataAtual: string | null = null;
  const buffer: string[] = [];
  const out: TransacaoImportada[] = [];

  for (const linha of linhas) {
    const m = linha.match(/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(20\d{2})/i);
    if (m) {
      dataAtual = `${m[3]}-${meses[m[2].toUpperCase()]}-${m[1]}`;
      buffer.length = 0;
      continue;
    }

    const dbr = linha.match(/^(\d{2}\/\d{2}\/\d{4})\s*(.*)$/);
    if (dbr && ehDataBR(dbr[1])) {
      dataAtual = formatarDataBR(dbr[1]);
      buffer.length = 0;
      if (dbr[2]?.trim()) buffer.push(dbr[2].trim());
      continue;
    }

    if (!dataAtual) continue;

    if (
      /^total\s+/i.test(linha) ||
      /^saldo\s+(final|inicial)/i.test(linha) ||
      /Extrato\s+gerado|d[uú]vida|responsabilizamos/i.test(linha) ||
      /Ouvidoria|nubank\.com\.br/i.test(linha) ||
      /4020\s*[-]?\s*0185|0800\s*591\s*2117|0800\s*887\s*0463/i.test(linha) ||
      /Metropolitanas\)\s*Ou\b/i.test(linha) ||
      /^\d+\s+de\s+\d+$/i.test(linha.trim())
    )
      continue;

    const vals = extrairValoresBR(linha);
    if (!vals.length) {
      buffer.push(linha);
      continue;
    }

    const valorTxt = vals[vals.length - 1];
    let descLinha = linha;
    for (const v of vals) descLinha = descLinha.replace(v, " ");
    descLinha = descLinha.replace(/^R\$/i, "").trim();

    const descricaoBruta = [...buffer, descLinha].join(" ").replace(/\s+/g, " ").trim();
    buffer.length = 0;

    const descricao =
      limparDescricaoMovimentoNubank(descricaoBruta) || descricaoBruta.replace(/\s+/g, " ").trim();

    const tipo = tipoNubank(descricaoBruta, linha);
    const valor = parseValorBR(valorTxt);

    if (descricao && valor > 0 && !/^\d+$/.test(descricao)) {
      out.push({
        data: dataAtual,
        descricao,
        documento: null,
        tipo,
        valor,
        saldo: null,
        origem: "nubank",
        confianca: "alta",
      });
    }
  }

  return out;
}

export function parseExtratoBancario(textoBruto: string): TransacaoImportada[] {
  const texto = textoBruto.normalize("NFC").replace(/\u00a0/g, " ");
  const head = texto.slice(0, 18_000);
  const brMarcas =
    /Bradesco\s+Celular|Bradesco\s+Internet|\bBradesco\b.*Extrato|PAGAMENTOS\s+E\s+RECEBIMENTOS/i.test(
      head
    );

  if (
    brMarcas ||
    (/\bBradesco\b/i.test(head) &&
      (/Hist[oó]rico|Movimento|Docto|Saldo|Mov\b/i.test(head) ||
        /Cr[eé]dito|D[eé]bito/i.test(texto.slice(0, 36_000))))
  ) {
    const u = parseBradesco(texto);
    if (u.length > 0) return u;
  }

  if (/Nu\s+Pagamentos|\bNubank\b|\bNu\s+Financeira|32322266|\bNu\s+Pague\b/i.test(head)) {
    return parseNubank(texto);
  }

  return [];
}
