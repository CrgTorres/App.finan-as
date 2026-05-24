import type { AlertaPlausibilidadeContrato, ContratoExtraido } from "@/types/contrato-extraido";

export type PapelDataContrato =
  | "assinatura_contrato"
  | "data_contrato"
  | "data_documento"
  | "primeiro_vencimento"
  | "ultimo_vencimento"
  | "validade_proposta"
  | "nascimento"
  | "outra";

export type DataExtraidaComContexto = {
  iso: string;
  br: string;
  papel: PapelDataContrato;
  confianca: number;
  origem: string;
  linha?: number;
};

const MIN_CONF_ASSINATURA = 68;
const MIN_CONF_CONTRATACAO = 65;
const MIN_CONF_VENCIMENTO = 72;

function parseDataBr(s: string): string | undefined {
  const br = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return undefined;
}

function ordIso(iso: string): number {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 0;
  return parseInt(m[1]!, 10) * 10000 + parseInt(m[2]!, 10) * 100 + parseInt(m[3]!, 10);
}

function classificarPapel(linha: string, flatNear: string): { papel: PapelDataContrato; score: number } {
  const t = `${linha} ${flatNear}`.toLowerCase();
  if (/\b[uú]ltimo\s+vencimento\b/i.test(t)) {
    return { papel: "ultimo_vencimento", score: 91 };
  }
  if (/\b(1[ºo°]?\s*vencimento|primeiro\s+vencimento|\(E\.2\)|vencimento\s+inicial)\b/i.test(t)) {
    return { papel: "primeiro_vencimento", score: 92 };
  }
  if (/\b(c[eé]dula\s+de\s+cr[eé]dito|divin[oó]polis|cabecalho)\b/i.test(t) && /\bde\s+[A-Za-z]+\s+de\s+\d{4}\b/i.test(t)) {
    return { papel: "data_documento", score: 86 };
  }
  if (/\b(\d{1,2}\s+de\s+(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4})\b/i.test(t)) {
    return { papel: "data_documento", score: 78 };
  }
  if (/\b(local\s+e\s+data|assinatur|consumidor|mutu[aá]rio|contratante|\(G\.|sec[cç][aã]o\s+g)\b/i.test(t)) {
    return { papel: "assinatura_contrato", score: 88 };
  }
  if (
    /\b(emiss[aã]o|emitid[oa]|or[cç]amento\s+da\s+opera|data\s+do\s+(?:contrato|or[cç]amento)|data\s+(?:do\s+)?documento)\b/i.test(
      t,
    )
  ) {
    return { papel: "data_contrato", score: 74 };
  }
  if (/\b(validade|proposta\s+v[aá]lida)\b/i.test(t)) {
    return { papel: "validade_proposta", score: 75 };
  }
  if (/\b(nascimento|data\s+de\s+nasc)\b/i.test(t)) {
    return { papel: "nascimento", score: 40 };
  }
  return { papel: "outra", score: 25 };
}

/** Varre o texto e recolhe todas as datas com contexto (linha + vizinhança). */
export function extrairTodasDatasDoTexto(texto: string): DataExtraidaComContexto[] {
  const L = texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
  const flat = texto.replace(/\s+/g, " ");
  const vistos = new Set<string>();
  const out: DataExtraidaComContexto[] = [];

  for (let i = 0; i < L.length; i++) {
    const linha = L[i] ?? "";
    for (const m of linha.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)) {
      const iso = parseDataBr(m[1]!);
      if (!iso || vistos.has(`${iso}:${i}`)) continue;
      vistos.add(`${iso}:${i}`);
      const viz = [L[i - 1], linha, L[i + 1]].filter(Boolean).join(" ");
      const { papel, score } = classificarPapel(linha, viz);
      const y = parseInt(iso.slice(0, 4), 10);
      if (y < 1995 || y > 2042) continue;
      out.push({
        iso,
        br: m[1]!,
        papel,
        confianca: score,
        origem: linha.slice(0, 120) || "linha",
        linha: i,
      });
    }
  }

  for (const m of flat.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)) {
    const iso = parseDataBr(m[1]!);
    if (!iso || out.some((d) => d.iso === iso && d.papel !== "outra")) continue;
    const idx = m.index ?? 0;
    const viz = flat.slice(Math.max(0, idx - 80), Math.min(flat.length, idx + 80));
    const { papel, score } = classificarPapel(viz, viz);
    const y = parseInt(iso.slice(0, 4), 10);
    if (y < 1995 || y > 2042) continue;
    out.push({
      iso,
      br: m[1]!,
      papel,
      confianca: Math.max(20, score - 10),
      origem: "texto corrido",
    });
  }

  return out.sort((a, b) => b.confianca - a.confianca);
}

function melhorPorPapel(lista: DataExtraidaComContexto[], papel: PapelDataContrato): DataExtraidaComContexto | null {
  const cand = lista.filter((d) => d.papel === papel);
  if (cand.length === 0) return null;
  return [...cand].sort((a, b) => b.confianca - a.confianca)[0]!;
}

function candidatoCampoPrevio(
  iso: string | undefined,
  papel: PapelDataContrato,
  confianca: number,
): DataExtraidaComContexto | null {
  if (!iso?.trim()) return null;
  return { iso, br: "", papel, confianca, origem: "extração heurística anterior" };
}

export type ResultadoConvergenciaDatas = {
  extraido: ContratoExtraido;
  datas: DataExtraidaComContexto[];
  alertas: AlertaPlausibilidadeContrato[];
};

/**
 * Infere datas por papel distinto. Não replica a mesma data em contrato, assinatura e vencimento
 * sem contexto próprio no OCR.
 */
export function convergirDatasContrato(extraido: ContratoExtraido, textoBruto: string): ResultadoConvergenciaDatas {
  const alertas: AlertaPlausibilidadeContrato[] = [];
  const out: ContratoExtraido = { ...extraido };
  const todas = extrairTodasDatasDoTexto(textoBruto);

  let ass: DataExtraidaComContexto | null =
    melhorPorPapel(todas, "assinatura_contrato") ??
    candidatoCampoPrevio(out.dataAssinatura, "assinatura_contrato", 62);

  let contr: DataExtraidaComContexto | null =
    melhorPorPapel(todas, "data_contrato") ??
    candidatoCampoPrevio(out.dataContratacao, "data_contrato", 58);

  let venc: DataExtraidaComContexto | null =
    melhorPorPapel(todas, "primeiro_vencimento") ??
    candidatoCampoPrevio(out.primeiroVencimento, "primeiro_vencimento", 60);

  let ultimoV: DataExtraidaComContexto | null =
    melhorPorPapel(todas, "ultimo_vencimento") ??
    candidatoCampoPrevio(out.ultimoVencimento, "ultimo_vencimento", 60);

  let doc: DataExtraidaComContexto | null =
    melhorPorPapel(todas, "data_documento") ??
    candidatoCampoPrevio(out.dataDocumento, "data_documento", 70);

  const ultimas = [...todas]
    .filter((d) => d.papel !== "nascimento" && d.papel !== "outra")
    .sort((a, b) => ordIso(a.iso) - ordIso(b.iso));

  if (!ass && ultimas.length > 0) {
    const rodape = ultimas.filter(
      (d) => d.confianca >= 55 && (d.papel === "assinatura_contrato" || /local|assinatur|sec[cç][aã]o\s+g/i.test(d.origem)),
    );
    const pick = rodape.sort((a, b) => b.confianca - a.confianca)[0] ?? null;
    if (pick) {
      ass = pick;
      alertas.push({
        severidade: "aviso",
        codigo: "data_assinatura_inferida_rodape",
        mensagem: `Data de assinatura inferida no rodapé (${pick.br || pick.iso}), sem «local e data» explícito — data do contrato não foi preenchida automaticamente.`,
      });
    }
  }

  if (ass && ass.confianca < MIN_CONF_ASSINATURA) ass = null;
  if (contr && contr.confianca < MIN_CONF_CONTRATACAO) contr = null;
  if (venc && venc.confianca < MIN_CONF_VENCIMENTO) venc = null;
  if (ultimoV && ultimoV.confianca < MIN_CONF_VENCIMENTO) ultimoV = null;
  if (doc && doc.confianca < MIN_CONF_CONTRATACAO) doc = null;

  if (doc && venc && doc.iso === venc.iso) {
    alertas.push({
      severidade: "aviso",
      codigo: "data_documento_igual_vencimento",
      mensagem: `Data do documento e 1º vencimento iguais (${doc.br || doc.iso}) — data do documento não foi preenchida; confira cabeçalho CCB vs sec. E.2.`,
    });
    doc = null;
  }

  if (venc && ass && venc.iso === ass.iso) {
    alertas.push({
      severidade: "aviso",
      codigo: "vencimento_igual_assinatura",
      mensagem: `1º vencimento e data de assinatura com a mesma data (${venc.br || venc.iso}) sem rótulo claro de vencimento — 1º vencimento não foi preenchido; confira sec. E.2 no PDF.`,
    });
    venc = null;
  }

  if (contr && ass && contr.iso === ass.iso) {
    const contrProprio = contr.papel === "data_contrato" && contr.confianca >= MIN_CONF_CONTRATACAO;
    const assProprio = ass.papel === "assinatura_contrato" && ass.confianca >= MIN_CONF_ASSINATURA;
    if (!contrProprio || !assProprio) {
      if (assProprio && !contrProprio) {
        contr = null;
        alertas.push({
          severidade: "aviso",
          codigo: "data_contrato_omitida_igual_assinatura",
          mensagem: `Data do contrato/documento não foi definida: só há evidência de assinatura (${ass.br || ass.iso}). Não se duplica a mesma data em dois campos.`,
        });
      } else if (contrProprio && !assProprio) {
        ass = null;
      } else {
        contr = null;
        ass = null;
        alertas.push({
          severidade: "aviso",
          codigo: "datas_contrato_assinatura_ambiguas",
          mensagem:
            "Uma única data ambígua no OCR — contrato e assinatura ficaram vazios até haver contexto distinto (emissão vs local e data).",
        });
      }
    }
  }

  delete out.dataAssinatura;
  delete out.dataContratacao;
  delete out.dataDocumento;
  delete out.primeiroVencimento;
  delete out.ultimoVencimento;

  if (ass) out.dataAssinatura = ass.iso;
  if (contr) out.dataContratacao = contr.iso;
  if (doc) out.dataDocumento = doc.iso;
  if (venc) out.primeiroVencimento = venc.iso;
  if (ultimoV) out.ultimoVencimento = ultimoV.iso;

  if (ass && venc) {
    const oa = ordIso(ass.iso);
    const ov = ordIso(venc.iso);
    if (ov < oa) {
      alertas.push({
        severidade: "critico",
        codigo: "vencimento_antes_contratacao",
        mensagem: `1º vencimento (${venc.br || venc.iso}) é anterior à data de assinatura (${ass.br || ass.iso}) — revisar OCR ou PDF.`,
      });
    } else {
      const d1 = new Date(`${ass.iso}T12:00:00`);
      const d2 = new Date(`${venc.iso}T12:00:00`);
      const dias = Math.round((d2.getTime() - d1.getTime()) / 86400000);
      if (dias > 0 && dias < 400) {
        alertas.push({
          severidade: "aviso",
          codigo: "prazo_ate_primeiro_vencimento",
          mensagem: `Entre assinatura (${ass.br || ass.iso}) e 1º vencimento (${venc.br || venc.iso}) há cerca de ${dias} dia(s) — confira no PDF.`,
        });
      }
    }
  }

  const validade = melhorPorPapel(todas, "validade_proposta");
  if (validade && ass && ordIso(validade.iso) < ordIso(ass.iso)) {
    alertas.push({
      severidade: "aviso",
      codigo: "validade_antes_assinatura",
      mensagem: `Validade da proposta (${validade.br}) anterior à data de assinatura inferida — pode ser campo distinto.`,
    });
  }

  if (todas.length === 0) {
    alertas.push({
      severidade: "critico",
      codigo: "nenhuma_data_no_ocr",
      mensagem:
        "Nenhuma data legível no texto do documento. Reprocesse o OCR ou use PDF com camada de texto.",
    });
  } else if (!ass && !contr && !venc && !doc) {
    alertas.push({
      severidade: "aviso",
      codigo: "data_contratacao_nao_inferida",
      mensagem: `Foram encontradas ${todas.length} data(s), mas sem contexto suficiente para contrato, assinatura ou 1º vencimento. Confira o PDF.`,
    });
  }

  out.datasExtraidas = todas.slice(0, 24).map((d) => ({
    papel: d.papel,
    data: d.iso,
    confianca: d.confianca,
    origem: d.origem.slice(0, 80),
  }));

  return { extraido: out, datas: todas, alertas };
}
