/**
 * Senha automática para PDFs protegidos na importação de extrato (apenas no cliente).
 *
 * - `NEXT_PUBLIC_IMPORT_PDF_AUTO_PASSWORD` em `.env.local`: tentada assim que o PDF pede senha.
 * - `localStorage`: preenchido quando o utilizador marca "Lembrar neste dispositivo" após sucesso.
 *
 * Não coloque senhas reais no código-fonte versionado; use variáveis de ambiente locais.
 */

export const IMPORT_PDF_PASSWORD_STORAGE_KEY = "financa_pessoal_import_pdf_password_v1";

/** Ordem: variável de ambiente, depois valor guardado no dispositivo. */
export function getImportPdfAutoPasswordCandidates(): string[] {
  const out: string[] = [];
  const env = (process.env.NEXT_PUBLIC_IMPORT_PDF_AUTO_PASSWORD ?? "").trim();
  if (env) out.push(env);
  if (typeof window !== "undefined") {
    try {
      const s = localStorage.getItem(IMPORT_PDF_PASSWORD_STORAGE_KEY)?.trim();
      if (s) out.push(s);
    } catch {
      /* modo privado / bloqueio */
    }
  }
  return [...new Set(out)];
}

export function rememberImportPdfPasswordForDevice(password: string): void {
  const p = password.trim();
  if (!p || typeof window === "undefined") return;
  try {
    localStorage.setItem(IMPORT_PDF_PASSWORD_STORAGE_KEY, p);
  } catch {
    /* ignore */
  }
}

/**
 * Candidatos extra do CPF (ex.: Daycoval costuma usar os 5 primeiros dígitos como senha do PDF).
 * Defina `NEXT_PUBLIC_USER_CPF_DIGITS_FOR_PDF` com 11 dígitos só em `.env.local` (não versionar).
 */
export function getCpfDerivedPdfPasswordCandidates(): string[] {
  const raw = (process.env.NEXT_PUBLIC_USER_CPF_DIGITS_FOR_PDF ?? "").replace(/\D/g, "");
  if (raw.length < 5) return [];
  const out: string[] = [raw.slice(0, 5)];
  if (raw.length >= 11) {
    out.push(raw.slice(-4));
    out.push(raw);
  }
  return [...new Set(out)];
}

/** Extrato + contratos: env, localStorage e variantes de CPF configuradas. */
export function getTodosCandidatosSenhaPdfDocumento(): string[] {
  return [...new Set([...getImportPdfAutoPasswordCandidates(), ...getCpfDerivedPdfPasswordCandidates()])];
}
