/**
 * Padronização de grafias OCR vs. nomes usados em documentos oficiais.
 * As chaves de análise (código + valor + slug) usam o texto **após** esta etapa para
 * unificar variantes (ex.: CREDICESTA / CREDCESTA → credcesta).
 *
 * Referências públicas para conferência de rubricas e consignado (revisão manual):
 * - Bacen (IF / estabilidade financeira) — https://www.bcb.gov.br/estabilidadefinanceira
 * - Caixa Econômica Federal — https://www.caixa.gov.br
 * - Banco do Brasil — https://www.bb.com.br
 * - Gov.br — https://www.gov.br
 */
export const REFERENCIAS_RUBRICAS_OFICIAIS: ReadonlyArray<{ instituicao: string; url: string }> = [
  { instituicao: "Banco Central (IF / COMPE)", url: "https://www.bcb.gov.br/estabilidadefinanceira" },
  { instituicao: "Caixa Econômica Federal", url: "https://www.caixa.gov.br" },
  { instituicao: "Banco do Brasil", url: "https://www.bb.com.br" },
  { instituicao: "Gov.br", url: "https://www.gov.br/pt-br" },
];

/**
 * Expande siglas/abreviações de IF que aparecem assim na folha e no cadastro com grafias diferentes,
 * para alinhar detecção de instituição e o slug de cruzamento folha × empréstimo.
 */
export function expandirSiglasInstituicaoEmTexto(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  // BIB = Banco Industrial do Brasil (mesma IF; rubrica pode trazer só «BIB» ou nome por extenso).
  t = t.replace(/\bBIB\b/gi, "Banco Industrial do Brasil");
  // Daycoval com «B» ou «Banco» colado ao nome (OCR / abreviação em contracheque).
  t = t.replace(/\bB\s+DAYCOVAL\b/gi, "Daycoval");
  t = t.replace(/([^A-ZÀ-Ü0-9]|^)B(DAYCOVAL)\b/gi, "$1Daycoval");
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Unifica variantes OCR de CrediCesta / CredCesta (Banco Master / consignado comum em folhas federais).
 */
export function padronizarTokensRubricaOficiais(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  t = expandirSiglasInstituicaoEmTexto(t);
  t = t.replace(/\bcred\s*ic\s*esta\b/gi, "credcesta");
  t = t.replace(/\bcred\s*icesta\b/gi, "credcesta");
  t = t.replace(/\bcred\s*i\s*cesta\b/gi, "credcesta");
  t = t.replace(/\bcredce\s*sta\b/gi, "credcesta");
  t = t.replace(/\bcredicesta\b/gi, "credcesta");
  t = t.replace(/\bcredcesta\b/gi, "credcesta");
  t = t.replace(/\bcredi\s+cesta\b/gi, "credcesta");
  t = t.replace(/\bcred\s+cesta\b/gi, "credcesta");
  return t;
}
