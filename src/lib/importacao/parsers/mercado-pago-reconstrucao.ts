/**
 * NORMALIZAÇÃO DE LINHAS PDF — extratos Mercado Pago.
 * Reagrupa fragmentos por quebra de linha perdendo prefixos (“Pagamento com QR Pix …”).
 */

import type { Category } from "@/types";

const RE_RODAPE_RESUMO =
  /^Saldo final|^Saldo inicial|^Entradas:|^Saidas?:|^Data de gera|Mercado Pago\s+Institui|^Data\s+descri/i;

/** Linha já fechada com ID + valor + saldo (sufixo quebrado no PDF vem depois e deve ir antes do ID). */
const RE_FECHO_OPERACAO_MP = /(\d{8,})\s+R\$\s*-?\d[\d.,]*\s+R\$\s*-?\d[\d.,]*\s*$/;

/**
 * Insere texto (nome/continuação) imediatamente antes do ID da operação, preservando valor e saldo.
 */
export function inserirAntesDoIdMercadoPago(linha: string, inserir: string): string {
  const frag = inserir.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!frag) return linha;
  const m = /(\d{8,})(\s+R\$\s*-?\d)/.exec(linha);
  if (!m || m.index === undefined) return `${linha} ${frag}`.trim();
  const i = m.index;
  return `${linha.slice(0, i).trimEnd()} ${frag} ${linha.slice(i)}`.replace(/\s+/g, " ").trim();
}

/** Início reconhecível de descrição de movimento (ordem do mais específico ao menos). */
export const RE_INICIO_PRIMARIO_MP =
  /^(?:Pagamento\s+com\s+QR\s*(?:CODE\s*)?Pix|Pix\s+(?:enviado|recebido)|Transfer[eê]ncia|Pagamento\b|Rendimentos\b|Reembolso\b|D[eé]bito\s+por\s+d[ií]vida\b|Venda\s+de\b)/i;

const RE_CONTINUACAO_LEX =
  /\bLTDA\b|\bS\.?\s*A\.?\b|\bME\b|\bEIRELI\b|\bCOM[EÉ]RCIO\b|\bRESTAURANTE\b|\bTECNOLOGIA\b/i;

/** Fragmentos típicamente lixo OCR — não iniciam novo bloco sozinhos. */
function fragmentoIgnorarLinha(linha: string): boolean {
  const s = linha.normalize("NFC").trim();
  if (!s) return true;
  if (/^(por)$/iu.test(s)) return true;
  return false;
}

function linhasFragmento(fragmentoBruto: string): string[] {
  return fragmentoBruto
    .split(/\n/)
    .map((l) => l.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);
}

/**
 * Une linhas PDF semânticas antes da etapa orientada por `DD-MM-AAAA`.
 *
 * Regras: prefixos tipo “Pagamento com QR Pix” / “Pix enviado” são cabeça;
 * linhas seguintes sem data com LTDA/COMÉRCIO/… ou buffer ativo são continuação;
 * nunca mover continuação para substituir a cabeça.
 */
export function reconstruirDescricaoMercadoPago(fragmentoBruto: string): string {
  const lines = linhasFragmento(fragmentoBruto);
  /** Linhas já com data DD-MM-AAAA na cabeça, completas para o parser. */
  const out: string[] = [];
  /** Linhas sem data aguardando a próxima linha datada ou continuações. */
  let buf: string[] = [];

  const flushBuf = (): string =>
    buf.length ? buf.join(" ").replace(/\s+/g, " ").trim() : "";

  const juntarComAntesUltimaLinhaEmitida = (extra: string) => {
    if (!extra || !out.length) return;
    const ult = out[out.length - 1]!;
    out[out.length - 1] = `${ult} ${extra}`.trim();
  };

  for (const line of lines) {
    if (RE_RODAPE_RESUMO.test(line)) {
      buf = [];
      continue;
    }

    if (fragmentoIgnorarLinha(line)) continue;

    const dataNoInicio = /^(\d{2}-\d{2}-\d{4})\s+(.*)$/.exec(line);
    if (dataNoInicio) {
      const data = dataNoInicio[1]!;
      const restante = dataNoInicio[2] ?? "";
      let prefixo = flushBuf();

      /**
       * Sufixo (ex.: sobrenome) após valor/saldo: recuar para a transação anterior.
       * Nunca recuar um prefixo que já é cabeça de outro movimento («Pix recebido», etc.).
       */
      if (prefixo && out.length > 0 && !RE_INICIO_PRIMARIO_MP.test(prefixo)) {
        const prev = out[out.length - 1]!;
        if (RE_FECHO_OPERACAO_MP.test(prev)) {
          out[out.length - 1] = inserirAntesDoIdMercadoPago(prev, prefixo);
          prefixo = "";
        }
      }

      /** Data primeiro (formato do extrato MP); prefixo vai para o miolo da descrição. */
      const parteDesc = prefixo ? `${prefixo} ${restante}`.trim() : restante.trim();
      out.push(`${data} ${parteDesc}`.trim());
      buf = [];
      continue;
    }

    /** Linha sem data no início. */
    const temDataNoMeio = /\b\d{2}-\d{2}-\d{4}\b/.test(line);

    /** Novo núcleo semântico: fecha sufixos pendentes na linha datada anterior antes de iniciar outro movimento. */
    if (RE_INICIO_PRIMARIO_MP.test(line)) {
      if (buf.length && out.length) {
        const pending = flushBuf();
        const prev = out[out.length - 1]!;
        if (pending && RE_FECHO_OPERACAO_MP.test(prev) && !RE_INICIO_PRIMARIO_MP.test(pending)) {
          out[out.length - 1] = inserirAntesDoIdMercadoPago(prev, pending);
        } else if (pending) {
          juntarComAntesUltimaLinhaEmitida(pending);
        }
      }
      buf = [line];
      continue;
    }

    const ehContinuacao =
      Boolean(RE_CONTINUACAO_LEX.test(line)) ||
      Boolean(buf.length) ||
      (/^[A-Za-zÀ-ú0-9./\s\-–]+$/iu.test(line) && line.length < 120 && !temDataNoMeio);

    if (ehContinuacao) {
      buf.push(line);
      continue;
    }

    const tailBuf = flushBuf();
    buf = [line];
    if (tailBuf) juntarComAntesUltimaLinhaEmitida(tailBuf);
  }

  const sobra = flushBuf();
  if (sobra) juntarComAntesUltimaLinhaEmitida(sobra);

  return out.join("\n").replace(/\n+/g, "\n").trim();
}

export type HeuristicaMercadoPagoExtrato =
  | {
      kind: "categoria";
      categoria: Category;
      score: number;
      motivo: string;
      confianca: ResultadoTipoConf;
    }
  | null;

type ResultadoTipoConf = "alta" | "media";

/** Heurísticas de categoria apenas para texto completo pós-parser MP (CSV/OFX/outros intactos). */
export function aplicarHeuristicasCategoriaMercadoPago(
  descricao: string,
  tipo: "receita" | "despesa"
): HeuristicaMercadoPagoExtrato {
  const d = descricao.normalize("NFC").trim();
  const u = d.toUpperCase();

  if (/PIX\s+RECEBIDO\b/i.test(d) && tipo === "receita") {
    return {
      kind: "categoria",
      categoria: "Receita",
      score: 91,
      confianca: "alta",
      motivo: "Classificação heurística Mercado Pago — Pix recebido",
    };
  }

  if (/PIX\s+ENVIADO\b/i.test(d) && tipo === "despesa") {
    return {
      kind: "categoria",
      categoria: "Transferência para terceiros",
      score: 88,
      confianca: "alta",
      motivo: "Classificação heurística Mercado Pago — Pix enviado",
    };
  }

  if (/PAGAMENTO\s+COM\s+QR\s*(?:CODE\s*)?PIX\b/i.test(d) && /\bUBER\b/u.test(u)) {
    return {
      kind: "categoria",
      categoria: "Transporte",
      score: 92,
      confianca: "alta",
      motivo:
        'Classificação heurística Mercado Pago — "Pagamento com QR Pix … UBER"',
    };
  }

  if (/PAGAMENTO\s+COM\s+QR\s*(?:CODE\s*)?PIX\b/i.test(d) && /\bCLARO\b/u.test(u)) {
    return {
      kind: "categoria",
      categoria: "Conta de consumo",
      score: 90,
      confianca: "alta",
      motivo:
        'Classificação heurística Mercado Pago — "Pagamento com QR Pix … Claro"',
    };
  }

  return null;
}

/**
 * Divide título/subtítulo visual para prévia — sem alterar texto persistido na importação.
 */
export function tituloSubtituloVisualMercadoPago(
  descricao: string,
  categoriaGuess: Category | null
): { titulo: string; subtitulo: string } {
  const d = descricao.normalize("NFC").replace(/\s+/g, " ").trim();

  const qrUber =
    /^(Pagamento\s+com\s+QR\s*(?:CODE\s*)?Pix\s+UBER)\b([\s\S]*)$/iu.exec(d);
  if (qrUber) {
    const cabeca = qrUber[1]!.trim();
    const tail = qrUber[2]!.trim().replace(/^[\s.|–\-]+/, "").trim();
    const subt = [tail || null, categoriaGuess || "Transporte"].filter(Boolean).join(" • ");
    return {
      titulo: /[.!?]$/.test(cabeca) ? cabeca : `${cabeca}.`,
      subtitulo: subt,
    };
  }

  const qrClaro =
    /^(Pagamento\s+com\s+QR\s*(?:CODE\s*)?Pix\s+.+\bCLARO)\b([\s\S]*)$/iu.exec(
      d
    );
  if (qrClaro) {
    const cabeca = qrClaro[1]!.trim();
    const tail = qrClaro[2]!.trim().replace(/^[\s.|–\-]+/, "").trim();
    const cat = categoriaGuess || "Conta de consumo";
    const subt = [tail || null, cat].filter(Boolean).join(" • ");
    return {
      titulo: /[.!?]$/.test(cabeca) ? cabeca : `${cabeca}.`,
      subtitulo: subt,
    };
  }

  /** Pix nome longo → título quase inteiro + categoria só no subtítulo. */
  const pixRec = /^((?:Pix\s+recebido)\s+.+)/iu.exec(d);
  if (pixRec) {
    return {
      titulo: pixRec[1]!.trim(),
      subtitulo: "Receita",
    };
  }

  const pixEnv = /^((?:Pix\s+enviado)\s+.+)/iu.exec(d);
  if (pixEnv) {
    return {
      titulo: pixEnv[1]!.trim(),
      subtitulo: "Transferência para terceiros",
    };
  }

  return {
    titulo:
      (d.charAt(0).toUpperCase() + d.slice(1)).trim() ||
      "Transação Mercado Pago",
    subtitulo: [rotuloOuVazioInferior(d), categoriaGuess].filter(Boolean).join(" • "),
  };
}

function rotuloOuVazioInferior(full: string): string {
  const aposQr = /\bPagamento\s+com\s+QR\s*Pix\b\s+(.+)/iu.exec(full);
  if (!aposQr) return "";
  const rest = aposQr[1]!.trim();
  /** Primeira marca + restante como empresa. */
  const parts = /^([A-Za-zÀ-ú0-9]{2,30})\s+([\s\S]+)$/u.exec(rest);
  if (!parts) return "";
  const corp = parts[2]!.trim();
  return corp || "";
}
