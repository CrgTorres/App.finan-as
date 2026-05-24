/**
 * Núcleo plugável para parsers de extrato: tipos, utilitários e validação.
 */

export type TipoTransacao = "receita" | "despesa";

export type TransacaoImportada = {
  data: string;
  descricao: string;
  descricaoOriginal?: string;
  documento?: string | null;
  tipo: TipoTransacao;
  /** Sempre positivo; o `tipo` indica receita ou despesa. */
  valor: number;
  saldo?: number | null;
  origem: string;
  banco?: string;
  categoria?: string;
  confianca?: "alta" | "media" | "baixa";
  metadata?: Record<string, unknown>;
};

export type ExtratoParser = {
  id: string;
  nome: string;
  prioridade: number;
  detectar: (texto: string, fileName?: string) => boolean;
  parse: (texto: string, fileName?: string) => TransacaoImportada[];
};

/** Limite absoluto para evitar confusão de escala / colunas trocadas (erro de parser). */
export const VALOR_TRANSACAO_MAXIMO_BR = 1_000_000;

export class ValidacaoTransacaoError extends Error {
  readonly erros: readonly string[];

  constructor(erros: readonly string[]) {
    super(erros.join("; "));
    this.name = "ValidacaoTransacaoError";
    this.erros = erros;
  }
}

/**
 * Converte string em valor numérico (formato BR: milhar com ponto, decimal com vírgula).
 */
export function parseMoneyBR(input: unknown): number {
  const raw = String(input ?? "").trim();
  if (!raw) return 0;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/^R\$/i, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

/** Texto para comparação / detecção (minúsculas, sem acentos, espaços colapsados). */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converte `DD/MM/AAAA` ou `DD-MM-AAAA` para `AAAA-MM-DD`.
 * Se já for prefixo ISO `AAAA-MM-DD`, devolve os 10 primeiros caracteres normalizados.
 */
export function formatarDataISO(data: string): string {
  const s = data.trim();
  const br = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/.exec(s);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return `${yyyy}-${mm}-${dd}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  throw new Error(`Data em formato não suportado: ${data}`);
}

/**
 * Remove ruído comum de colunas operacionais (não substitui parser específico de banco).
 */
export function limparDescricaoOperacional(desc: string): string {
  return desc
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/^Data\s+Descri[cç][aã]o\s+ID\s+da\s+opera[cç][aã]o\s+Valor\s+Saldo\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Garante regras de negócio do extrato. Lança {@link ValidacaoTransacaoError} se inválido.
 *
 * - `valor` deve ser finito, **estritamente positivo** e ≤ {@link VALOR_TRANSACAO_MAXIMO_BR}.
 * - `tipo` deve ser coerente com o sinal do valor **bruto** opcional em `metadata.valorAssinado`.
 *   Se `valorAssinado` existir, ele vence para inferir `tipo` e o `valor` armazenado é `abs(...)`.
 *   Caso contrário, espera-se `valor` já positivo e `tipo` explícito.
 * - Documento/id numérico longo igual ao montante sugere troca coluna/id↔valor.
 * - `saldo` numérico igual ao `valor` da linha sugere uso incorreto de saldo como movimento.
 */
export function validarTransacao(t: TransacaoImportada): TransacaoImportada {
  const erros: string[] = [];

  let valorFinal: number;
  let tipoFinal: TipoTransacao;

  const assinado = t.metadata?.valorAssinado;
  if (typeof assinado === "number" && Number.isFinite(assinado) && assinado !== 0) {
    valorFinal = Math.abs(assinado);
    tipoFinal = assinado < 0 ? "despesa" : "receita";
    if (t.tipo && t.tipo !== tipoFinal)
      erros.push("tipo informado diverge do sinal em metadata.valorAssinado");
  } else {
    valorFinal = t.valor;
    tipoFinal = t.tipo;
    if (!Number.isFinite(valorFinal) || valorFinal <= 0) {
      erros.push(
        "valor deve ser finito e > 0 (ou use metadata.valorAssinado com sinal para derivar tipo)"
      );
    }
    if (tipoFinal !== "receita" && tipoFinal !== "despesa") {
      erros.push('tipo deve ser "receita" ou "despesa"');
    }
  }

  if (!t.data?.trim()) erros.push("data vazia");
  if (!t.descricao?.trim()) erros.push("descrição vazia");
  if (!t.origem?.trim()) erros.push("origem vazia");

  if (Number.isFinite(valorFinal) && valorFinal > VALOR_TRANSACAO_MAXIMO_BR) {
    erros.push(
      `valor ${valorFinal} acima do limite ${VALOR_TRANSACAO_MAXIMO_BR} (possível erro de parser)`
    );
  }

  const doc = t.documento != null ? somenteDigitos(String(t.documento)) : "";
  if (
    doc.length >= 8 &&
    Number.isFinite(valorFinal) &&
    valorFinal > 0 &&
    doc === String(Math.round(valorFinal))
  ) {
    erros.push("documento/id coincide com o valor (id não pode ser usado como valor da transação)");
  }

  if (
    t.saldo != null &&
    Number.isFinite(Number(t.saldo)) &&
    Number.isFinite(valorFinal) &&
    Math.abs(Number(t.saldo) - valorFinal) < 1e-9
  ) {
    erros.push("saldo não pode ser igual ao valor do movimento (possível confusão de colunas)");
  }

  if (erros.length) throw new ValidacaoTransacaoError(erros);

  return {
    ...t,
    data: t.data.trim(),
    descricao: t.descricao.trim(),
    tipo: tipoFinal,
    valor: Math.abs(valorFinal),
    documento: t.documento ?? null,
  };
}
