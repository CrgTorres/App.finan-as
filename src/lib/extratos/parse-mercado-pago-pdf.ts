import { transacaoImportadaCoreParaImportedRow } from "@/lib/import/map-transacao-importada";
import type { ImportedRow } from "@/lib/import/types";
import type { TransacaoImportada as TransacaoCore } from "@/lib/extratos/extrato-parser-core";
import { reconstruirDescricaoMercadoPago, inserirAntesDoIdMercadoPago, RE_INICIO_PRIMARIO_MP } from "@/lib/importacao/parsers/mercado-pago-reconstrucao";
import { extrairDocumentoFiscalAmpliadoExtrato } from "@/lib/extratos/extrato-enriquecimento-referencias";

export type TransacaoImportada = {
  data: string;
  descricao: string;
  /** CPF/CNPJ quando identificável na descrição/enunciado (crédito igual Nubank). */
  documento?: string | null;
  /** ID numérico “ID da operação” na coluna do extrato Mercado Pago. */
  idOperacaoMercadoPago?: string | null;
  tipo: "receita" | "despesa";
  valor: number;
  saldo?: number | null;
  origem: "mercado_pago";
};

function parseMoneyBR(input: string): number {
  const raw = input
    .replace(/\s/g, "")
    .replace(/^R\$/i, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function dataISO(data: string) {
  const [dia, mes, ano] = data.split("-");
  return `${ano}-${mes}-${dia}`;
}

function limparDescricao(desc: string) {
  return desc
    .replace(/\s+/g, " ")
    .replace(/^Data Descrição ID da operação Valor Saldo/i, "")
    .trim();
}

const RE_MP_INSTITUICAO =
  /\bMERCADO\s+PAGO\s+(?:IP\s+)?LTDA\.?\s*(?:\([^)]*\))?\s*/gi;
const RE_MP_AGENCIA = /\bAg[eê]ncia\s*:\s*\d+\s*/gi;
const RE_MP_CONTA = /\bConta\s*:\s*[\w.\-]+\s*/gi;

/** Linha já com ID da operação e os dois valores (movimento + saldo). */
const RE_FECHO_LINHA_MP =
  /(\d{8,})\s+R\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+R\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

const RE_IGNORAR_REPETICAO_PAGINA_MP =
  /^Saldo final|^Saldo inicial|^Entradas:|^Saidas?:|^Data de gera|Mercado Pago\s+Institui/i;

/**
 * Junta cabeçalhos repetidos em quebra de página e continuações que ficaram abaixo da linha de valores.
 */
function mergeMercadoPagoContinuacoesOrfas(texto: string): string {
  const lines = texto
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const ignorar = (l: string) =>
    RE_IGNORAR_REPETICAO_PAGINA_MP.test(l) ||
    (/^Data\s+Descri/i.test(l) && /ID\s+da\s+opera/i.test(l)) ||
    /^\d+\s*\/\s*\d+$/.test(l);

  const out: string[] = [];

  for (const line of lines) {
    if (ignorar(line)) continue;

    if (/^\d{2}-\d{2}-\d{4}\b/.test(line)) {
      out.push(line);
      continue;
    }

    if (out.length === 0) {
      out.push(line);
      continue;
    }

    const prev = out[out.length - 1]!;
    if (/^\d{2}-\d{2}-\d{4}\b/.test(prev)) {
      if (RE_FECHO_LINHA_MP.test(prev) && !RE_INICIO_PRIMARIO_MP.test(line)) {
        out[out.length - 1] = inserirAntesDoIdMercadoPago(prev, line);
      } else {
        out[out.length - 1] = `${prev} ${line}`.replace(/\s+/g, " ").trim();
      }
      continue;
    }

    out[out.length - 1] = `${prev} ${line}`.replace(/\s+/g, " ").trim();
  }

  return out.join("\n");
}

/** Une quebras de página/linha do PDF até cada linha iniciar nova data DD-MM-AAAA. */
export function juntarQuebrasLinhasExtratoMercadoPago(fragmentoBruto: string): string {
  const lines = fragmentoBruto
    .split(/\n/)
    .map((l) => l.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  const out: string[] = [];
  let linhaLeadingOrfa = "";

  for (const line of lines) {
    const ehRodapeOuResumo =
      /^Saldo final|^Saldo inicial|^Entradas:|^Saidas?:|^Data de gera|Mercado Pago\s+Institui/i.test(
        line
      );

    if (ehRodapeOuResumo) {
      linhaLeadingOrfa = "";
      continue;
    }

    if (/^\d{2}-\d{2}-\d{4}\b/.test(line)) {
      out.push(`${linhaLeadingOrfa}${linhaLeadingOrfa ? " " : ""}${line}`.trim());
      linhaLeadingOrfa = "";
      continue;
    }

    if (out.length === 0) {
      linhaLeadingOrfa = linhaLeadingOrfa ? `${linhaLeadingOrfa} ${line}` : line;
      continue;
    }

    /** Continuação do movimento iniciado pela linha anterior. */
    out[out.length - 1] += ` ${line}`;
  }

  return out.join("\n");
}

function normalizarDescricaoMercadoPago(desc: string, idOperacao: string): string {
  let s = limparDescricao(desc);

  const idDigitos = idOperacao.replace(/\D/g, "");
  if (idDigitos.length >= 8) {
    const ini = /^([\d.]+\s+|\d+\s+)/.exec(s);
    if (ini?.[1] && ini[1].trim().replace(/\D/g, "") === idDigitos) {
      s = s.slice(ini[0].length).trim();
    }
  }

  s = s.replace(RE_MP_INSTITUICAO, "").trim();
  s = s.replace(RE_MP_AGENCIA, "").replace(RE_MP_CONTA, "").trim();

  return s.replace(/\s+/g, " ").trim();
}

/** Detecção de extrato Mercado Pago antes de aplicar parsers genéricos/Nubank. */
export function isMercadoPagoExtratoText(text: string): boolean {
  const t = text.slice(0, 140_000);
  const mp = /Mercado\s+Pago/i.test(t);
  const extratoConta = /EXTRATO\s+DE\s+CONTA/i.test(t);
  const idOp = /ID\s*da\s*opera(?:ção|cao)?/i.test(t);
  if (!mp) return false;
  return extratoConta || idOp;
}

/**
 * Parser Mercado Pago (`valor` = 1.º `R$` após ID; `saldo` = 2.º `R$`).
 * Ancoragem pelo fim da linha para não confundir CNPJ fragmentado com ID da operação.
 */

function consumirTransacaoMpNoInicio(bloco: string): { tx: TransacaoImportada; avanco: number } | null {
  const t = bloco.trimStart();
  const leadSkip = bloco.length - t.length;
  const mDate = /^(\d{2}-\d{2}-\d{4})\s+/.exec(t);
  if (!mDate || mDate.index !== 0) return null;

  const dataRaw = mDate[1]!;
  const rest = t.slice(mDate[0].length);
  const mf = /(\d{8,})\s+R\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+R\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/.exec(rest);
  if (!mf || mf.index === undefined) return null;

  const idNumericoMp = mf[1]!;
  const descricaoBase = normalizarDescricaoMercadoPago(rest.slice(0, mf.index).trim(), idNumericoMp);
  const valor = parseMoneyBR(mf[2]!);
  const saldo = parseMoneyBR(mf[3]!);
  const documentoFiscal = extrairDocumentoFiscalAmpliadoExtrato(descricaoBase);

  if (!descricaoBase || valor === 0) return null;

  const tx: TransacaoImportada = {
    data: dataISO(dataRaw),
    descricao: descricaoBase,
    documento: documentoFiscal ?? null,
    idOperacaoMercadoPago: idNumericoMp,
    tipo: valor >= 0 ? "receita" : "despesa",
    valor: Math.abs(valor),
    saldo,
    origem: "mercado_pago",
  };
  const avanco = leadSkip + mDate[0].length + mf.index + mf[0].length;
  return { tx, avanco };
}

export function parseMercadoPagoPdf(texto: string): TransacaoImportada[] {
  const normalizado = texto
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n+/g, "\n");

  const marcador = /\bdetalhe\s+dos\s+movimentos\b/i;
  const hit = marcador.exec(normalizado);
  const somenteMovimentosRaw = hit
    ? normalizado.slice(hit.index + hit[0].length)
    : normalizado;

  const reconstructida = reconstruirDescricaoMercadoPago(somenteMovimentosRaw);
  const juntado = juntarQuebrasLinhasExtratoMercadoPago(reconstructida);
  const somenteMovimentos = mergeMercadoPagoContinuacoesOrfas(juntado);

  const blocos = somenteMovimentos
    .split(/(?=\d{2}-\d{2}-\d{4}\b)/g)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const transacoes: TransacaoImportada[] = [];

  for (const bloco of blocos) {
    if (
      /Saldo final|Saldo inicial|Entradas:|Saidas:|Data de geração|Mercado Pago Instituição/i.test(
        bloco
      )
    ) {
      continue;
    }

    let restante = bloco.trim();
    while (restante.length > 24) {
      const uma = consumirTransacaoMpNoInicio(restante);
      if (!uma) break;
      transacoes.push(uma.tx);
      restante = restante.slice(uma.avanco).trim();
    }
  }

  return transacoes;
}

/** Converte transações MP em linhas da tela de importação (dedupe + `idOperacao`). */
export function mercadoPagoTransacoesParaImportedRows(
  transacoes: TransacaoImportada[]
): ImportedRow[] {
  const seen = new Set<string>();
  const out: ImportedRow[] = [];

  for (const t of transacoes) {
    const core: TransacaoCore = {
      data: t.data,
      descricao: t.descricao,
      descricaoOriginal: t.descricao,
      documento: t.documento ?? null,
      tipo: t.tipo,
      valor: t.valor,
      saldo: t.saldo ?? null,
      origem: "mercado_pago",
      banco: "Mercado Pago",
      metadata: {
        parser: "mercado_pago",
        idOperacaoMercadoPago: t.idOperacaoMercadoPago ?? null,
      },
    };
    const row = transacaoImportadaCoreParaImportedRow(core);
    const key = `${row.date}|${row.idOperacao ?? ""}|${row.amount.toFixed(2)}|${row.description.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

/** Compatível com o fluxo de importação PDF (`ImportedRow`). */
export function parseMercadoPagoExtratoPdfText(fullText: string): ImportedRow[] {
  return mercadoPagoTransacoesParaImportedRows(parseMercadoPagoPdf(fullText));
}
