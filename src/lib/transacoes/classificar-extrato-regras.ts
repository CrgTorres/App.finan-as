import type { ImportedRow } from "@/lib/import/types";
import type { Category } from "@/types";
import type { ImportAutoClassification } from "@/lib/import/types";
import type { TransactionClassificationRuleRow } from "./classification-rules-service";
import {
  classificarReceitaExtrato,
  classificarDespesaExtratoKeywords,
} from "./classificador-palavras-chave";
import { extrairReferenciaTransacao } from "./extrair-referencia-transacao";

function normalizeMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function somenteDigitosDoc(s: string): string {
  return s.replace(/\D/g, "");
}

export type ExtratoClassificacaoRegras = {
  category: Category;
  autoClass: ImportAutoClassification;
};

function refsFromDesc(desc: string) {
  const ref = extrairReferenciaTransacao(desc.normalize("NFC").trim());
  return {
    documentoDetectado: ref.documento,
    favorecidoDetectado: ref.favorecido,
    referenciaDetectada: ref.subtituloVisual,
  };
}

function buildResult(
  category: Category,
  confianca: number,
  motivo: string,
  refs: Pick<
    ImportAutoClassification,
    "documentoDetectado" | "favorecidoDetectado" | "referenciaDetectada"
  >
): ExtratoClassificacaoRegras {
  return {
    category,
    autoClass: {
      categoriaSugerida: category,
      confianca,
      motivo,
      ...refs,
    },
  };
}

function tentarRegrasSalvas(
  desc: string,
  rules: TransactionClassificationRuleRow[],
  refs: ReturnType<typeof refsFromDesc>
): ExtratoClassificacaoRegras | null {
  const hay = normalizeMatch(desc);

  const docRules = rules.filter(
    (r) => r.rule_type === "documento" && r.document_ref?.trim()
  );
  const favRules = rules.filter(
    (r) => r.rule_type === "favorecido" && r.payee_name?.trim()
  );
  const kwRules = rules
    .filter((r) => r.rule_type === "palavra_chave" && r.keyword?.trim())
    .sort((a, b) => (b.keyword!.length) - (a.keyword!.length));

  const documentoDetectado = refs.documentoDetectado;
  if (documentoDetectado) {
    const dk = somenteDigitosDoc(documentoDetectado);
    const hit = docRules.find((r) => somenteDigitosDoc(r.document_ref!) === dk);
    if (hit) {
      return buildResult(hit.category, 95, `Regra pelo CPF/CNPJ salvo (${documentoDetectado}).`, refs);
    }
  }

  const favorecidoDetectado = refs.favorecidoDetectado;
  if (favorecidoDetectado) {
    const nf = normalizeMatch(favorecidoDetectado);
    if (nf.length >= 2) {
      const hit = favRules.find((r) => normalizeMatch(r.payee_name!) === nf);
      if (hit) {
        return buildResult(
          hit.category,
          82,
          `Regra pelo favorecido salvo («${hit.payee_name}»).`,
          refs
        );
      }
    }
  }

  for (const r of kwRules) {
    const kw = normalizeMatch(r.keyword!);
    if (kw.length >= 2 && hay.includes(kw)) {
      const boost = Math.min(kw.length * 2, 22);
      return buildResult(
        r.category,
        Math.min(66 + boost, 88),
        `Regra por palavra-chave salva («${r.keyword}»).`,
        refs
      );
    }
  }

  return null;
}

/**
 * Classificação da linha na importação: receitas sempre categoria Receita;
 * despesas: regras salvas (documento → favorecido → kw) → palavras-chave fortes/médias → Outros.
 */
export function classificarLinhaImportacaoExtrato(
  row: Pick<ImportedRow, "description" | "type">,
  rules: TransactionClassificationRuleRow[]
): ExtratoClassificacaoRegras {
  const desc = row.description;
  const refs = refsFromDesc(desc);

  if (row.type === "receita") {
    const r = classificarReceitaExtrato(desc);
    return buildResult(r.category, r.confiancaPct, r.motivo, refs);
  }

  const salva = tentarRegrasSalvas(desc, rules, refs);
  if (salva) return salva;

  const h = classificarDespesaExtratoKeywords(desc);
  if (h.intensidade !== "baixa") {
    return buildResult(h.category, h.confiancaPct, h.motivo, refs);
  }

  return buildResult(
    "Outros",
    Math.min(h.confiancaPct, 30),
    h.motivo,
    refs
  );
}
