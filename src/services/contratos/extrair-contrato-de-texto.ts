/**
 * Heurísticas de extração para propostas / contratos de crédito (layout tipo Daycoval, CCB genérico).
 * Depende só do texto já normalizado em linhas; não acede a Supabase nem altera rubrica.
 */

import { parseDataDocumentoCabecalho, parseDataPorExtensoBr } from "@/lib/contratos/datas-texto-br";
import { normalizarNomeBanco } from "@/lib/auditoria/normalizar-banco";
import type { ContratoExtraido } from "@/types/contrato-extraido";
import { textoMencionaTermosAcessoriosEmbutidos } from "@/services/contratos/termos-acessorios-embutidos-ocr";
import {
  parsePercentualBr,
  parseValorRealBr,
  primeiroValorRealNoTrecho,
  primeiroValorReaisComRSNoTrecho,
} from "@/services/contratos/parse-valores-brasil";

function uniqMoneyAfterLabel(flat: string, reLabel: RegExp, sliceLen = 140): number | undefined {
  const m = flat.match(reLabel);
  if (!m || m.index == null) return undefined;
  const slice = flat.slice(m.index, Math.min(flat.length, m.index + sliceLen));
  return primeiroValorReaisComRSNoTrecho(slice) ?? primeiroValorRealNoTrecho(slice);
}

function parseDataBr(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return undefined;
}

function linhas(texto: string): string[] {
  return texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
}

function cpfDigitos(cpf?: string): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? d : null;
}

function nomePareceInstituicao(n: string): boolean {
  return /\b(banco|daycoval|s\/a|financeira|correspondente)\b/i.test(n);
}

/** Nome em maiúsculas imediatamente antes do CPF do emitente (sec. II). */
function extrairUltimoNomeCapsAntesCpf(antes: string): string | null {
  const candidatos = [...antes.matchAll(/\b([A-ZÁÀÂÃÉÍÓÔÕÚÇ][A-ZÁÀÂÃÉÍÓÔÕÚÇ\s.'-]{10,72})\b/g)]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    .filter(
      (n) =>
        n.length >= 10 &&
        !nomePareceInstituicao(n) &&
        !/^(emitente|nome|mutu[aá]rio|consumidor|sec|item|cpf)\b/i.test(n),
    );
  return candidatos.length ? candidatos[candidatos.length - 1]! : null;
}

/** Rodapé / assinatura (secção G Daycoval) e dados do atendente para rastreio. */
function extrairAtendenteEAssinatura(out: ContratoExtraido, flat: string, L: string[]): void {
  const cpfCons = cpfDigitos(out.cpf);

  const blocosAtendente: RegExp[] = [
    /dados\s+do\s+(?:correspondente|atendente|agente\s+certificado)[\s\S]{0,520}/i,
    /correspondente\s+banc[aá]rio[\s\S]{0,520}/i,
    /agente\s+certificad[oa][\s\S]{0,480}/i,
    /atendente\s+(?:respons[aá]vel|da\s+opera[cç][aã]o)[\s\S]{0,420}/i,
    /certificad[oa]\s+pel[oa]\s+banco[\s\S]{0,420}/i,
    /promotor\s+(?:de\s+vendas|comercial)[\s\S]{0,420}/i,
  ];

  for (const re of blocosAtendente) {
    const m = flat.match(re);
    if (!m) continue;
    const b = m[0];
    if (!out.atendenteNome) {
      const nm =
        b.match(
          /(?:nome(?:\s+do)?\s+(?:correspondente|atendente|agente)|correspondente|atendente)\s*[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{6,64}?)(?=\s+(?:CPF|cpf|matr|Código|código|$))/i,
        ) ??
        b.match(/\b([A-ZÁÀÂÃÉÍÓÔÕÚÇ][A-ZÁÀÂÃÉÍÓÔÕÚÇ\s.'-]{8,56})\s+(?:CPF|cpf)/);
      if (nm && !nomePareceInstituicao(nm[1])) {
        out.atendenteNome = nm[1].replace(/\s+/g, " ").trim();
      }
    }
    if (!out.atendenteCpf) {
      for (const cm of b.matchAll(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/g)) {
        const d = cpfDigitos(cm[1]);
        if (d && d !== cpfCons) {
          out.atendenteCpf = cm[1];
          break;
        }
      }
    }
    if (!out.atendenteMatricula) {
      const mat = b.match(
        /(?:matr[ií]cula|c[oó]d(?:igo)?\.?\s*(?:do\s+)?(?:correspondente|atendente|agente))[\s:#]*(\d{4,14})/i,
      );
      if (mat) out.atendenteMatricula = mat[1].trim();
    }
    if (out.atendenteNome) break;
  }

  const tailStart = Math.max(0, Math.floor(L.length * 0.65));
  const tailLines = L.slice(tailStart);
  const tailFlat = tailLines.join(" ");

  const locDataTail = tailFlat.match(
    /local\s+e\s+data\s*[:\s]*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{2,48}?)\s*[,/-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (locDataTail) {
    out.localContratacao = locDataTail[1].replace(/\s+/g, " ").trim();
    out.dataAssinatura = parseDataBr(locDataTail[2]);
  }

  if (!out.dataAssinatura) {
    for (let i = L.length - 1; i >= Math.max(0, L.length - 28); i--) {
      const line = L[i] ?? "";
      if (
        !/assinatur|consumidor|mutu[aá]rio|contratante|local\s+e\s+data|correspondente|daycoval|testemunh|dealer|certificad/i.test(
          line,
        )
      ) {
        continue;
      }
      const cityDate = line.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{2,42}),\s*(\d{2}\/\d{2}\/\d{4})/);
      if (cityDate) {
        if (!out.localContratacao) out.localContratacao = cityDate[1].replace(/\s+/g, " ").trim();
        out.dataAssinatura = parseDataBr(cityDate[2]);
        break;
      }
      const dm = line.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
      if (dm) {
        out.dataAssinatura = parseDataBr(dm[1]);
        break;
      }
      const next = L[i + 1] ?? "";
      const dm2 = next.match(/^\s*(\d{2}\/\d{2}\/\d{4})\b/);
      if (dm2) {
        out.dataAssinatura = parseDataBr(dm2[1]);
        break;
      }
    }
  }

  const gRodape = flat.match(/\(G(?:\.\d+)?\)[\s\S]{0,220}/gi);
  if (gRodape && gRodape.length > 0) {
    const g = gRodape[gRodape.length - 1]!;
    const ld = g.match(
      /local\s+e\s+data[^0-9]{0,40}([A-Za-zÀ-ÿ][^\d]{2,40}?)\s*[,/-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
    );
    if (ld) {
      if (!out.localContratacao) out.localContratacao = ld[1].replace(/\s+/g, " ").trim();
      if (!out.dataAssinatura) out.dataAssinatura = parseDataBr(ld[2]);
    }
  }
}

export function extrairContratoDeTextoBruto(texto: string): ContratoExtraido {
  const raw = texto;
  const flat = texto.replace(/\s+/g, " ").trim();
  const L = linhas(texto);
  const out: ContratoExtraido = { textoExtraido: raw };

  const cnpjM = flat.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
  if (cnpjM) out.cnpj = cnpjM[1];

  const cpfM = flat.match(/\b(\d{3}[.\s]*\d{3}[.\s]*\d{3}[-.\s]?\d{2})\b/);
  if (cpfM) {
    const d = cpfM[1].replace(/\D/g, "");
    if (d.length === 11) out.cpf = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  const cpfFmt = flat.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
  if (cpfFmt && !out.cpf) out.cpf = cpfFmt[1];

  const propM = flat.match(
    /(?:n[ºo°\s.]*\s*(?:da\s*)?proposta|proposta\s+n[ºo°]?|orçamento\s+n[ºo°]?)[:\s]*(\d{6,14})\b/i,
  );
  if (propM) out.numeroProposta = propM[1];
  if (!out.numeroProposta) {
    const op = flat.match(/\bor[cç]amento\s+n[ºo°]?\s*proposta\s*[:\s]+(\d{6,14})\b/i);
    if (op) out.numeroProposta = op[1];
  }

  const bancoM = flat.match(
    /\b(Banco\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,48}(?:\s*S\/A|\s*S\.A\.?|\s*SA)?)\b/i,
  );
  if (bancoM) out.banco = normalizarNomeBanco(bancoM[1].replace(/\s+/g, " ").trim());

  const cabDoc = parseDataDocumentoCabecalho(flat);
  if (cabDoc) {
    out.dataDocumento = cabDoc.iso;
    if (cabDoc.local && !out.localContratacao) {
      out.localContratacao = cabDoc.uf ? `${cabDoc.local} - ${cabDoc.uf}` : cabDoc.local;
    }
  }
  if (!out.dataDocumento) {
    const ccb = flat.match(
      /c[eé]dula\s+de\s+cr[eé]dito[\s\S]{0,220}?(\d{1,2}\s+de\s+[A-Za-zÀ-ÿçÇ]+\s+de\s+\d{4})/i,
    );
    if (ccb) out.dataDocumento = parseDataPorExtensoBr(ccb[1]);
  }

  const emitenteInline = flat.match(
    /(?:II|2)\s*[-–.]?\s*(?:Emitente|EMITENTE)\s*[:\s-]*([A-ZÁÀÂÃÉÍÓÔÕÚÇ][A-ZÁÀÂÃÉÍÓÔÕÚÇ\s.'-]{10,72}?)\s+CPF\s*[:\s]*\d{3}/i,
  );
  if (emitenteInline && !nomePareceInstituicao(emitenteInline[1])) {
    out.cliente = emitenteInline[1].replace(/\s+/g, " ").trim();
  }

  const blocoEmitente =
    flat.match(/(?:II|2)\s*[-–.]?\s*(?:Emitente|EMITENTE)[\s\S]{0,900}/i) ??
    flat.match(/(?:Emitente|EMITENTE)\s*[\s\S]{0,750}?CPF\s*[:\s]*\d{3}\.\d{3}\.\d{3}-\d{2}/i);
  if (blocoEmitente) {
    const b = blocoEmitente[0];
    const cpfEm = b.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
    if (cpfEm) {
      const d = cpfEm[1].replace(/\D/g, "");
      if (d.length === 11) {
        const cpfFmt = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
        if (!out.cpf) out.cpf = cpfFmt;
        const idx = b.indexOf(cpfEm[0]);
        const antes = b.slice(0, idx);
        if (!out.cliente) {
          const nm = antes.match(
            /(?:nome|emitente)\s*[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{8,72}?)(?=\s+(?:CPF|RG|Dt|data|\d{3}\.))/i,
          );
          if (nm && !nomePareceInstituicao(nm[1])) {
            out.cliente = nm[1].replace(/\s+/g, " ").trim();
          } else {
            const caps = extrairUltimoNomeCapsAntesCpf(antes);
            if (caps) out.cliente = caps;
          }
        }
      }
    }
  }

  const nomeConsumidor = flat.match(
    /\b(?:nome\s+do\s+consumidor|consumidor\s*\(?\s*nome\s*\)?|A\.?\s*1\b[^\w]{0,12}nome)[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{6,72}?)(?=\s+(?:CPF|cpf|cnpj|nasc|data|\d{3}\.|\(|$))/i,
  );
  if (nomeConsumidor) out.cliente = nomeConsumidor[1].replace(/\s+/g, " ").trim();

  if (!out.cliente) {
    const blocoA = flat.match(/dados\s+do\s+consumidor[\s\S]{0,950}/i);
    if (blocoA) {
      const b = blocoA[0];
      const cpfA = b.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
      if (cpfA && cpfA.index != null) {
        const antes = b.slice(0, cpfA.index);
        const caps = antes.match(
          /\b([A-ZÁÀÂÃÉÍÓÔÕÚÇ][A-ZÁÀÂÃÉÍÓÔÕÚÇ\s.'-]{8,64})\s*$/,
        );
        if (caps) out.cliente = caps[1].replace(/\s+/g, " ").trim();
        if (!out.cliente) {
          const nl = antes.match(/\bnome\b[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{6,64})/i);
          if (nl) out.cliente = nl[1].replace(/\s+/g, " ").trim();
        }
      }
    }
  }

  if (!out.cliente) {
    const nomeAntesCpf = flat.match(
      /\b([A-ZÁÀÂÃÉÍÓÔÕÚÇ]{2,}(?:\s+[A-ZÁÀÂÃÉÍÓÔÕÚÇ]{1,}){2,8})\s+CPF\s*[:\s]*\d{3}/,
    );
    if (nomeAntesCpf) out.cliente = nomeAntesCpf[1].replace(/\s+/g, " ").trim();
  }

  if (!out.cliente) {
    const nomeLoose = flat.match(
      /\b(?:nome|consumidor)\s*[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{8,60}?)(?=\s+(?:CPF|cpf|nasc|\d{3}\.))/i,
    );
    if (nomeLoose) out.cliente = nomeLoose[1].replace(/\s+/g, " ").trim();
  }

  if (!out.cliente && out.cpf) {
    const esc = out.cpf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const comCpf = flat.match(
      new RegExp(
        `([A-ZÁÀÂÃÉÍÓÔÕÚÇ][A-ZÁÀÂÃÉÍÓÔÕÚÇa-záàâãéíóôõúç\\s.'-]{10,80}?)\\s+CPF\\s*[:\\s]*${esc}`,
        "i",
      ),
    );
    if (comCpf && !nomePareceInstituicao(comCpf[1])) {
      out.cliente = comCpf[1].replace(/\s+/g, " ").trim();
    }
    if (!out.cliente) {
      const idx = flat.search(new RegExp(esc));
      if (idx > 20) {
        const antes = flat.slice(Math.max(0, idx - 140), idx);
        const caps = antes.match(
          /([A-ZÁÀÂÃÉÍÓÔÕÚÇ][A-ZÁÀÂÃÉÍÓÔÕÚÇa-záàâãéíóôõúç\s.'-]{10,72})\s*$/,
        );
        if (caps && !nomePareceInstituicao(caps[1])) {
          const cand = caps[1].replace(/\s+/g, " ").trim();
          if (!out.atendenteNome || !cand.toLowerCase().includes(out.atendenteNome.split(" ")[0]!.toLowerCase())) {
            out.cliente = cand;
          }
        }
      }
    }
  }

  const vs = uniqMoneyAfterLabel(
    flat,
    /valor\s+solicitad[oa](?:\s+pel[oa]\s+consumid[oa])?/i,
  );
  if (vs != null) out.valorSolicitado = vs;

  const vf = uniqMoneyAfterLabel(
    flat,
    /valor\s+total\s+financiad[oa](?:\s+devido)?/i,
  );
  if (vf != null) out.valorFinanciado = vf;

  const sq = uniqMoneyAfterLabel(
    flat,
    /saldo\s+devedor|saldo\s+a\s+quitar|valor\s+do\s+saldo\s+devedor|quita[cç][aã]o\s+(?:de\s+)?saldo|liquida[cç][aã]o\s+(?:de\s+)?(?:contrato|d[ií]vida|opera[cç][aã]o)\s+anterior/i,
  );
  if (sq != null) out.saldoQuitado = sq;

  const troco = uniqMoneyAfterLabel(
    flat,
    /\btroco\b|valor\s+l[ií]quido\s+(?:liberado|creditado)|libera[cç][aã]o\s+ao\s+mutu[aá]rio/i,
  );
  if (troco != null) out.trocoLiberado = troco;

  const vt = uniqMoneyAfterLabel(flat, /somatório\s+das\s+parcelas|valor\s+total\s+pago|total\s+(?:das\s+)?parcelas/i);
  if (vt != null) out.valorTotalPago = vt;

  const iparc = flat.match(
    /n[úu]mero\s+de\s+parcelas\s+mensais|parcelas\s+mensais\s*(?:\(E\.3\))?/i,
  );
  if (iparc) {
    const slice = flat.slice(iparc.index!, Math.min(flat.length, iparc.index! + 160));
    const nm = slice.match(/\b(\d{1,4})\b/);
    if (nm) {
      const n = parseInt(nm[1], 10);
      if (n > 0 && n < 500) out.parcelas = n;
    }
  }
  if (out.parcelas == null) {
    const pm = flat.match(/(?:^|[\s;])(\d{2,3})\s*(?:parcelas?|meses?)(?:\s+mensais)?\b/i);
    if (pm) {
      const n = parseInt(pm[1], 10);
      if (n > 1 && n < 400) out.parcelas = n;
    }
  }
  const e3n = flat.match(/\(E\.3\)[^0-9]{0,20}(\d{2,4})\b/);
  if (e3n && out.parcelas == null) {
    const n = parseInt(e3n[1]!, 10);
    if (n > 1 && n < 500) out.parcelas = n;
  }

  const ivp = flat.match(/valor\s+de\s+cada\s+parcela|parcela\s+mensal\s*\(E\.5\)/i);
  if (ivp) {
    const slice = flat.slice(ivp.index!, Math.min(flat.length, ivp.index! + 100));
    const v =
      primeiroValorReaisComRSNoTrecho(slice) ?? primeiroValorRealNoTrecho(slice);
    if (v != null) out.parcela = v;
  }
  if (out.parcela == null) {
    const m = flat.match(/parcela[^R$]{0,40}R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    if (m) {
      const v = parseValorRealBr(m[1]);
      if (v != null) out.parcela = v;
    }
  }

  /** Daycoval E.4: mensal e anual na mesma linha («… 2,5000% a.m … 34,4889% a.a »). */
  const jurosPar = flat.match(
    /(?:\(E\.4\)|taxa\s+de\s+juros\s+prefixad[ao])[\s\S]{0,160}?(\d{1,2},\d{1,6})\s*%\s*a\.?\s*m[\s\S]{0,50}?(\d{1,2},\d{1,6})\s*%\s*a\.?\s*a/i,
  );
  if (jurosPar) {
    const pm = parsePercentualBr(`${jurosPar[1]}%`);
    const pa = parsePercentualBr(`${jurosPar[2]}%`);
    if (pm != null) out.jurosMensal = pm;
    if (pa != null) out.jurosAnual = pa;
  }
  const jurosEfet = flat.match(
    /efetiv[ao][\s\S]{0,80}?(\d{1,2},\d{1,6})\s*%\s*a\.?\s*m[\s\S]{0,45}?(\d{1,2},\d{1,6})\s*%\s*a\.?\s*a/i,
  );
  if (jurosEfet) {
    const pm = parsePercentualBr(`${jurosEfet[1]}%`);
    const pa = parsePercentualBr(`${jurosEfet[2]}%`);
    if (pm != null) out.jurosEfetivoMensal = pm;
    if (pa != null) out.jurosEfetivoAnual = pa;
  }
  if (out.jurosMensal == null) {
    const ijM = flat.match(/taxa\s+de\s+juros\s+prefixad[ao]\s+mensal[^%]{0,90}(\d{1,2},\d{1,6})\s*%/i);
    if (ijM) {
      const p = parsePercentualBr(`${ijM[1]}%`);
      if (p != null) out.jurosMensal = p;
    }
  }
  if (out.jurosAnual == null) {
    const ijA = flat.match(/taxa\s+de\s+juros\s+prefixad[ao]\s+anual[^%]{0,40}(\d{1,2},\d{1,6})\s*%/i);
    if (ijA) {
      const p = parsePercentualBr(`${ijA[1]}%`);
      if (p != null) out.jurosAnual = p;
    }
  }

  /** Resolução CMN 4.881: bloco «CÁLCULO DO … (CET) … 2,59 % a.m … 36,48 % a.a». */
  const cetPar = flat.match(
    /\(CET\)[\s\S]{0,260}?(\d{1,2},\d{1,6})\s*%\s*a\.?\s*m[\s\S]{0,55}?(\d{1,2},\d{1,6})\s*%\s*a\.?\s*a/i,
  );
  if (cetPar) {
    const pm = parsePercentualBr(`${cetPar[1]}%`);
    const pa = parsePercentualBr(`${cetPar[2]}%`);
    if (pm != null) out.cetMensal = pm;
    if (pa != null) out.cetAnual = pa;
  }
  if (out.cetMensal == null) {
    const cetM = flat.match(/CET\s+mensal[^%]{0,24}(\d{1,2},\d{1,6})\s*%/i);
    if (cetM) {
      const p = parsePercentualBr(`${cetM[1]}%`);
      if (p != null) out.cetMensal = p;
    }
  }
  if (out.cetAnual == null) {
    const cetA = flat.match(/CET\s+[Aa]nual[^%]{0,40}(\d{1,2},\d{1,6})\s*%/i);
    if (cetA) {
      const p = parsePercentualBr(`${cetA[1]}%`);
      if (p != null) out.cetAnual = p;
    }
  }
  if (out.cetAnual == null) {
    const cetA2 = flat.match(/CET[^%]{0,60}(\d{1,2},\d{1,4})\s*%\s*a\.?\s*a\.?/i);
    if (cetA2) {
      const p = parsePercentualBr(`${cetA2[1]}%`);
      if (p != null) out.cetAnual = p;
    }
  }

  /** Evitar apanhar «Alíquota: 0,00%» na primeira menção a IOF; preferir valores em R$. */
  let iofMelhor: number | undefined;
  for (const m of flat.matchAll(/\bIOF\b[\s\S]{0,58}?R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi)) {
    const v = parseValorRealBr(m[1]!);
    if (v != null && v >= 1) iofMelhor = iofMelhor == null || v > iofMelhor ? v : iofMelhor;
  }
  if (iofMelhor != null) out.iof = iofMelhor;

  const e2bloco = flat.match(/\(E\.2\)[\s\S]{0,280}/i);
  if (e2bloco) {
    const s = e2bloco[0];
    const dv1 = s.match(/(?:1[ºo°]?\s*vencimento|primeiro\s+vencimento)[^0-9]{0,24}(\d{2}\/\d{2}\/\d{4})/i);
    const dvU = s.match(/[uú]ltimo\s+vencimento[^0-9]{0,24}(\d{2}\/\d{2}\/\d{4})/i);
    if (dv1) out.primeiroVencimento = parseDataBr(dv1[1]);
    if (dvU) out.ultimoVencimento = parseDataBr(dvU[1]);
  }
  if (!out.primeiroVencimento) {
    const dv = flat.match(/\b(?:1[ºo°]?\s*vencimento|primeiro\s+vencimento)[^0-9]{0,20}(\d{2}\/\d{2}\/\d{4})/i);
    if (dv) out.primeiroVencimento = parseDataBr(dv[1]);
  }
  if (!out.ultimoVencimento) {
    const du = flat.match(/[uú]ltimo\s+vencimento[^0-9]{0,20}(\d{2}\/\d{2}\/\d{4})/i);
    if (du) out.ultimoVencimento = parseDataBr(du[1]);
  }

  const dc = flat.match(
    /(?:local\s+e\s+data|data\s+(?:do\s+)?(?:orçamento|contrato)|data\s*:\s*)([^\n]{0,40}(\d{2}\/\d{2}\/\d{4}))/i,
  );
  if (dc) {
    const d2 = dc[2] ?? dc[1].match(/(\d{2}\/\d{2}\/\d{4})/)?.[1];
    if (d2) out.dataContratacao = parseDataBr(d2);
  }
  if (!out.dataContratacao) {
    const gSec = flat.match(/\(G(?:\.\d+)?\)[^0-9]{0,100}(\d{2}\/\d{2}\/\d{4})/i);
    if (gSec) out.dataContratacao = parseDataBr(gSec[1]);
  }
  if (!out.dataContratacao) {
    const emi = flat.match(
      /(?:data\s+de\s+emiss[aã]o|emitid[oa]\s+em|assinatur[ao]\s+em)[^0-9]{0,24}(\d{2}\/\d{2}\/\d{4})/i,
    );
    if (emi) out.dataContratacao = parseDataBr(emi[1]);
  }
  if (!out.dataContratacao) {
    const vencIso = out.primeiroVencimento;
    for (let i = L.length - 1; i >= Math.max(0, L.length - 12); i--) {
      const dm = L[i].match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
      if (!dm) continue;
      const iso = parseDataBr(dm[1]);
      if (!iso || iso === vencIso || iso === out.dataAssinatura) continue;
      if (
        /Manaus|Bras[ií]lia|S[aã]o\s+Paulo|Rio\s+de\s+Janeiro|Belo\s+Horizonte|Curitiba|Recife|Fortaleza|Salvador|Porto\s+Alegre|Goi[aâ]nia|local|data|daycoval|assinatur/i.test(
          L[i] ?? "",
        )
      ) {
        out.dataContratacao = iso;
        break;
      }
    }
  }

  const refSlice = flat.match(/refinanciad[oa][^R$]{0,80}/i);
  if (refSlice && refSlice.index != null) {
    const s = flat.slice(refSlice.index, refSlice.index + 120);
    const v = primeiroValorRealNoTrecho(s);
    out.refinanciamento = v != null && v > 0.5;
  }
  const portSlice = flat.match(/portabilidade[^R$]{0,80}/i);
  if (portSlice && portSlice.index != null) {
    const s = flat.slice(portSlice.index, portSlice.index + 120);
    const v = primeiroValorRealNoTrecho(s);
    out.portabilidade = v != null && v > 0.5;
  }

  if (textoMencionaTermosAcessoriosEmbutidos(flat)) {
    out.seguroPrestamistaMencionado = true;
  }
  const segPres = flat.match(
    /seguro\s+prestamista[\s\S]{0,120}?R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i,
  );
  if (segPres) {
    const v = parseValorRealBr(segPres[1]!);
    if (v != null && v >= 1) out.seguro = v;
  }
  if (out.seguro == null) {
    const secC = flat.match(
      /(?:despesas\s+incidentes|despesas\s+do\s+financiamento|som[aá]rio\s+das\s+despesas|\(C\.)/i,
    );
    if (secC && secC.index != null) {
      const bloco = flat.slice(secC.index, Math.min(flat.length, secC.index + 900));
      const segC = bloco.match(/seguro[^R$]{0,80}?R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (segC) {
        const v = parseValorRealBr(segC[1]!);
        if (v != null && v >= 1) out.seguro = v;
      }
    }
  }
  if (out.seguro == null) {
    const seg = uniqMoneyAfterLabel(flat, /seguro/i, 120);
    if (seg != null && seg > 0) out.seguro = seg;
  }
  const tar = uniqMoneyAfterLabel(flat, /tarifas?/i, 120);
  if (tar != null && tar > 0) out.tarifas = tar;

  /** OCR costuma colar o somatório de parcelas em linhas de seguro/tarifas (Daycoval). */
  if (out.seguro != null && out.valorTotalPago != null && Math.abs(out.seguro - out.valorTotalPago) < 0.02) {
    delete out.seguro;
  }
  if (out.tarifas != null && out.valorTotalPago != null && Math.abs(out.tarifas - out.valorTotalPago) < 0.02) {
    delete out.tarifas;
  }

  /** Daycoval «Orçamento»: âncoras E.5 / E.10 evitam confundir parcela/CET. */
  const e5Anch = flat.match(/\(E\.5\)[^R$]{0,55}R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  if (e5Anch) {
    const v = parseValorRealBr(e5Anch[1]!);
    if (v != null && v >= 15) out.parcela = v;
  }
  const e10Anch = flat.match(/\(E\.10\)[^R$]{0,85}R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  if (e10Anch) {
    const v = parseValorRealBr(e10Anch[1]!);
    if (v != null && v >= 200) out.valorFinanciado = v;
  }

  if (
    (out.valorFinanciado != null && out.valorFinanciado < 150) ||
    out.valorFinanciado == null
  ) {
    if (/daycoval|or[cç]amento\s+da\s+opera[cç][aã]o/i.test(flat)) {
      const alt = flat.match(
        /(?:total|valor)[^0-9]{0,24}financiad[oa][^R$]{0,60}R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i,
      );
      if (alt) {
        const v = parseValorRealBr(alt[1]!);
        if (v != null && v >= 500) out.valorFinanciado = v;
      }
    }
  }
  if (out.parcela != null && out.parcela < 25 && /daycoval|or[cç]amento\s+da\s+opera[cç][aã]o/i.test(flat)) {
    const altP = flat.match(
      /(?:valor\s+)?(?:de\s+)?cada\s+parcela[^R$]{0,55}R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    );
    if (altP) {
      const v = parseValorRealBr(altP[1]!);
      if (v != null && v >= 25) out.parcela = v;
    }
  }

  if (/orçamento\s+da\s+operação/i.test(flat)) out.tipoContrato = "Orçamento / proposta";
  else if (/contrato\s+de\s+crédito|\bccb\b/i.test(flat)) out.tipoContrato = "Contrato de crédito";
  else if (/proposta\s+comercial/i.test(flat)) out.tipoContrato = "Proposta comercial";

  extrairAtendenteEAssinatura(out, flat, L);

  return out;
}
