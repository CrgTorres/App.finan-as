import { digitosCnpjSaoValidos, digitosCpfSaoValidos } from "./validacao-documento-br";

const RE_CNPJ_FMT = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const RE_CPF_FMT = /\d{3}\.\d{3}\.\d{3}-\d{2}/;

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Primeiro documento **válido** (DV): CNPJ mascarado, CPF mascarado, ou sequência só dígitos.
 */
export function extrairDocumento(texto: string): string | null {
  const t = texto.normalize("NFC");

  for (const m of t.matchAll(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)) {
    const s = m[0];
    if (digitosCnpjSaoValidos(s)) return s;
  }
  for (const m of t.matchAll(/\d{3}\.\d{3}\.\d{3}-\d{2}/g)) {
    const s = m[0];
    if (digitosCpfSaoValidos(s)) return s;
  }

  const soNum = t.replace(/\s/g, "");
  const cnpjLimpo = soNum.match(/\b(\d{14})\b/);
  if (cnpjLimpo && digitosCnpjSaoValidos(cnpjLimpo[1]!)) {
    const d = cnpjLimpo[1]!;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
  }
  const cpfLimpo = t.match(/\b(\d{11})\b/);
  if (cpfLimpo && digitosCpfSaoValidos(cpfLimpo[1]!)) {
    const d = cpfLimpo[1]!;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  }

  return null;
}

/** Classifica documento já em formato mascarado (CNPJ contém `/` antes do dígito verificador). */
export function tipoDocumentoFmt(doc: string | null | undefined): "CNPJ" | "CPF" | null {
  if (doc == null || typeof doc !== "string" || !doc.trim()) return null;
  return doc.includes("/") ? "CNPJ" : "CPF";
}

export function rotuloDocumentoExibicao(doc: string | null | undefined): string | null {
  const tp = tipoDocumentoFmt(doc);
  if (!tp || !doc?.trim()) return null;
  return `${tp === "CNPJ" ? "CNPJ" : "CPF"} ${doc.trim()}`;
}

export { RE_CNPJ_FMT, RE_CPF_FMT };
