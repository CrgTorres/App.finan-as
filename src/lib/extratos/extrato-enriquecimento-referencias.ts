/**
 * Enriquecimento de descrições de extrato (qualquer banco): CPF/CNPJ e favorecido
 * alinhados ao mesmo pipeline usado pelo Nubank (`extrairFavorecido`).
 */

import type { TransacaoImportada } from "@/lib/extratos/extrato-parser-core";
import { extrairDocumento } from "@/lib/transacoes/extrair-documento";
import { extrairFavorecido } from "@/lib/transacoes/extrair-referencia-transacao";

function normalizarEspacos(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

const RE_CPF_FORMATADO = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
const RE_CNPJ_FORMATADO = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;

function textoPareceDocumentoFiscalFormatado(doc: string): boolean {
  const t = doc.trim();
  return RE_CPF_FORMATADO.test(t) || RE_CNPJ_FORMATADO.test(t);
}

/**
 * Documento fiscal com rótulos típicos do extrato (CPF:, CNPJ:).
 */
export function extrairDocumentoFiscalAmpliadoExtrato(texto: string): string | null {
  const t = texto.normalize("NFC");
  const direto = extrairDocumento(t);
  if (direto) return direto;

  const cnpjLbl = /\bCNPJ[:\s/T]+([\d.\s/•-]{14,22})/i.exec(t);
  if (cnpjLbl?.[1]) {
    const cand = normalizarEspacos(cnpjLbl[1].replace(/[•]/g, ""));
    return extrairDocumento(cand) ?? extrairDocumento(cand.replace(/\s/g, ""));
  }

  const cpfLbl = /\bCPF[:\s/T]+([\d.\s/•-]{11,17})/i.exec(t);
  if (cpfLbl?.[1]) {
    const cand = normalizarEspacos(cpfLbl[1].replace(/[•]/g, ""));
    return extrairDocumento(cand) ?? extrairDocumento(cand.replace(/\s/g, ""));
  }

  return null;
}

/**
 * Injeta na descrição CPF/CNPJ e, se fizer sentido, o favorecido extraído pelo mesmo pipeline do Nubank.
 */
export function enriquecerDescricaoExtratoReferencias(descricao: string): string {
  let d = normalizarEspacos(descricao);
  if (!d) return d;

  const doc = extrairDocumentoFiscalAmpliadoExtrato(d);

  const textoParaFav = doc && !d.includes(doc) ? `${d} ${doc}` : d;
  const fav = extrairFavorecido(textoParaFav) ?? extrairFavorecido(d);

  if (doc && !d.includes(doc)) {
    d = `${d} (${doc})`.trim();
  }

  if (fav) {
    const favEsc = normalizarEspacos(fav);
    if (favEsc.length >= 6) {
      const dLow = d.toLowerCase();
      const alvo = favEsc.slice(0, Math.min(28, favEsc.length)).toLowerCase();
      if (alvo.length >= 6 && !dLow.includes(alvo)) {
        d = `${d} · ${favEsc}`.trim();
      }
    }
  }

  return normalizarEspacos(d);
}

/**
 * Aplica enriquecimento na transação antes de montar {@link ImportedRow}.
 * Não substitui `documento` quando já existe código operacional (ex.: Bradesco);
 * só preenche ou mantém texto já fiscalmente formatado.
 */
export function aplicarEnriquecimentoReferenciasExtrato<
  T extends Pick<TransacaoImportada, "descricao" | "documento" | "descricaoOriginal">,
>(t: T): T {
  const cru = String(t.descricaoOriginal ?? t.descricao).normalize("NFC").trim();
  if (!cru) return t;

  const descEnriquecida = enriquecerDescricaoExtratoReferencias(cru);

  const docExtraido =
    extrairDocumentoFiscalAmpliadoExtrato(descEnriquecida) ??
    extrairDocumentoFiscalAmpliadoExtrato(cru);

  const docAtualRaw = t.documento != null ? String(t.documento).trim() : "";
  let documentoOut: string | null = docAtualRaw || null;

  if (docExtraido) {
    if (!docAtualRaw) {
      documentoOut = docExtraido;
    } else if (!textoPareceDocumentoFiscalFormatado(docAtualRaw)) {
      documentoOut = docAtualRaw;
    }
  }

  if (descEnriquecida === cru && documentoOut === (docAtualRaw || null)) {
    return t;
  }

  return {
    ...t,
    descricao: descEnriquecida,
    descricaoOriginal: t.descricaoOriginal ?? cru,
    documento: documentoOut,
  };
}
