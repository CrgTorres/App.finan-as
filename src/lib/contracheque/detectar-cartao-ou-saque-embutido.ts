import { detectarCartaoSaqueEmRubricasContracheque } from "@/lib/contracheque/detectar-cartao-saque-em-rubricas-contracheque";
import {
  BANCOS_CARTAO_SAQUE,
  TERMOS_CARTAO_ALTO_RISCO,
  TERMOS_CARTAO_SAQUE_EMBUTIDO,
} from "@/lib/contracheque/termos-cartao-saque-embutido";
import type { PayslipItem } from "@/types/contracheque";
import type {
  CamposCartaoSaqueEmbutidoPayslip,
  ContextoDeteccaoCartaoSaqueEmbutido,
  LancamentoContrachequeDeteccao,
  NivelRiscoCartaoSaqueEmbutido,
  ResultadoDeteccaoCartaoSaqueEmbutido,
  StatusConferenciaCartaoSaqueEmbutido,
  TipoCartaoSaqueDetectado,
} from "@/types/cartao-saque-embutido";
import {
  AVISO_CARTAO_SAQUE_EMBUTIDO,
  TEXTO_ALERTA_CARTAO_SAQUE_EMBUTIDO,
} from "@/types/cartao-saque-embutido";

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function escRegexLiteral(termo: string): string {
  return termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termoPresente(textoNorm: string, termo: string): boolean {
  const t = normalizarTexto(termo);
  if (t.length <= 3) {
    return new RegExp(`\\b${escRegexLiteral(t)}\\b`).test(textoNorm);
  }
  return textoNorm.includes(t);
}

function coletarTermosNoTexto(textoNorm: string): string[] {
  const found: string[] = [];
  for (const termo of TERMOS_CARTAO_SAQUE_EMBUTIDO) {
    if (termoPresente(textoNorm, termo)) found.push(termo);
  }
  return [...new Set(found)];
}

function extrairLinhasSuspeitas(textoBruto: string, termos: string[]): string[] {
  if (!textoBruto.trim() || termos.length === 0) return [];
  const normTermos = termos.map((t) => normalizarTexto(t));
  const linhas: string[] = [];
  for (const linha of textoBruto.split(/\r?\n/)) {
    const ln = linha.trim();
    if (ln.length < 4) continue;
    const n = normalizarTexto(ln);
    if (normTermos.some((t) => n.includes(t) || termoPresente(n, t))) {
      linhas.push(ln.slice(0, 220));
    }
  }
  return [...new Set(linhas)].slice(0, 12);
}

function inferirTipo(termos: string[], linhas: string[] = []): TipoCartaoSaqueDetectado {
  const u = [...termos, ...linhas].map((t) => normalizarTexto(t)).join(" ");
  if (/\bRMC\b/.test(u) || u.includes("RESERVA DE MARGEM") || u.includes("RESERVA MARGEM")) return "rmc";
  if (/\bRCC\b/.test(u)) return "rcc";
  if (/\bSAQUE\b/.test(u) || u.includes("SAQUE COMPLEMENTAR") || u.includes("SAQUE CARTAO") || u.includes("SAQUE CARTÃO"))
    return "saque_complementar";
  if (u.includes("BENEFICIO") || u.includes("BENEFÍCIO")) return "cartao_beneficio";
  if (u.includes("CARTAO") || u.includes("CARTÃO") || u.includes("CRED CARTAO") || u.includes("CREDCESTA"))
    return "cartao_consignado";
  return "desconhecido";
}

function inferirBanco(textoNorm: string): string | null {
  for (const b of BANCOS_CARTAO_SAQUE) {
    for (const rot of b.rotulos) {
      const r = normalizarTexto(rot);
      if (r.length <= 3) {
        if (new RegExp(`\\b${escRegexLiteral(r)}\\b`).test(textoNorm)) return b.nome;
      } else if (textoNorm.includes(r)) return b.nome;
    }
  }
  return null;
}

function lancamentoCombinaCartao(descNorm: string, termos: string[]): boolean {
  if (termos.some((t) => termoPresente(descNorm, t))) return true;
  return /\bCART[AÃ]O\b|\bRMC\b|\bRCC\b|CREDCESTA|CRED\s*CESTA|SAQUE\s*COMP/i.test(descNorm);
}

function valorMensalDeLancamentos(
  lancamentos: LancamentoContrachequeDeteccao[],
  termos: string[],
): number | null {
  let maior = 0;
  for (const l of lancamentos) {
    const tipo = (l.tipo ?? "desconto").toLowerCase();
    if (tipo !== "desconto") continue;
    const descNorm = normalizarTexto(l.descricao);
    if (!lancamentoCombinaCartao(descNorm, termos)) continue;
    const v = l.valor ?? 0;
    if (v > 0 && v < 500_000) maior = Math.max(maior, v);
  }
  return maior > 0 ? Math.round(maior * 100) / 100 : null;
}

function ordComp(ano: number, mes: number): number {
  return ano * 12 + (mes - 1);
}

function mesesConsecutivosComTermos(
  historico: NonNullable<ContextoDeteccaoCartaoSaqueEmbutido["payslipsHistorico"]>,
  competenciaAtual: { mes: number; ano: number },
  assinaturaTermos: string[],
): number {
  if (assinaturaTermos.length === 0) return 0;
  const porOrd = new Map<number, boolean>();
  const atualOrd = ordComp(competenciaAtual.ano, competenciaAtual.mes);
  porOrd.set(atualOrd, true);

  for (const p of historico) {
    const texto = [p.raw_text ?? "", ...(p.items ?? []).map((i) => i.description)].join("\n");
    const termos = coletarTermosNoTexto(normalizarTexto(texto));
    const bate = assinaturaTermos.some((t) => termos.includes(t));
    if (bate) porOrd.set(ordComp(p.ano, p.mes), true);
  }

  let count = 1;
  let o = atualOrd - 1;
  while (porOrd.get(o)) {
    count++;
    o--;
  }
  o = atualOrd + 1;
  while (porOrd.get(o)) {
    count++;
    o++;
  }
  return count;
}

function temTermoAltoRisco(termos: string[]): boolean {
  return termos.some((t) =>
    TERMOS_CARTAO_ALTO_RISCO.some((a) => normalizarTexto(a) === normalizarTexto(t) || normalizarTexto(t).includes(normalizarTexto(a))),
  );
}

function classificarRisco(params: {
  termos: string[];
  valorMensal: number | null;
  descontoRecorrente: boolean;
  semContrato: boolean;
  contratoIncompleto: boolean;
}): NivelRiscoCartaoSaqueEmbutido {
  const { termos, valorMensal, descontoRecorrente, semContrato, contratoIncompleto } = params;
  const altoTermo = temTermoAltoRisco(termos);

  if (
    altoTermo ||
    (descontoRecorrente && semContrato) ||
    (valorMensal != null && valorMensal > 0 && semContrato && descontoRecorrente) ||
    (contratoIncompleto && valorMensal != null && valorMensal > 0 && (altoTermo || descontoRecorrente))
  ) {
    return "alto";
  }
  if (valorMensal != null && valorMensal > 0 && (termos.some((t) => /\bRMC\b|\bRCC\b|CARTAO|CARTÃO/i.test(t)) || descontoRecorrente)) {
    return "medio";
  }
  if (termos.length > 0) return "baixo";
  return "baixo";
}

function montarRecomendacao(risco: NivelRiscoCartaoSaqueEmbutido, ctx: {
  semContrato: boolean;
  descontoRecorrente: boolean;
  banco: string | null;
}): string {
  const parts: string[] = [];
  if (ctx.semContrato && ctx.descontoRecorrente) {
    parts.push("Desconto recorrente sem contrato vinculado — anexe CCB, extrato e autorização de desconto.");
  }
  if (risco === "alto") {
    parts.push("Priorize revisão jurídica ou negociação com prova do período (holerites + faturas).");
  } else if (risco === "medio") {
    parts.push("Compare desconto mensal com contrato e extrato do cartão/saque.");
  } else {
    parts.push("Confira se a menção é apenas informativa ou gera desconto efetivo.");
  }
  if (ctx.banco) parts.push(`Instituição provável: ${ctx.banco}.`);
  return parts.join(" ");
}

/**
 * Detecta indícios de cartão consignado, RMC, RCC, saque complementar ou parcela embutida.
 * Busca no OCR, lançamentos do contracheque, textos de contratos (via contexto) e recorrência mensal.
 */
export function detectarCartaoOuSaqueEmbutido(
  textoOCR: string,
  lancamentosContracheque: LancamentoContrachequeDeteccao[],
  opts?: ContextoDeteccaoCartaoSaqueEmbutido,
): ResultadoDeteccaoCartaoSaqueEmbutido {
  if (opts?.competencia) {
    const items: PayslipItem[] = lancamentosContracheque
      .filter((l) => (l.tipo ?? "desconto") === "desconto")
      .map((l) => ({
        description: l.descricao,
        value: l.valor ?? 0,
        type: "desconto" as const,
        code: l.codigo,
      }));
    const historico =
      opts.payslipsHistorico?.map((p) => ({
        mes: p.mes,
        ano: p.ano,
        items: (p.items ?? []).map((it) => ({
          description: it.description,
          value: it.value,
          type: (it.type === "desconto" ? "desconto" : "vantagem") as PayslipItem["type"],
          code: it.code,
        })),
      })) ?? [];
    const analise = detectarCartaoSaqueEmRubricasContracheque(items, opts.competencia, historico);
    const descontoRecorrente = analise.rubricas.some((r) => r.descontoRecorrente);
    const semContrato = opts.temContratoFormalVinculado === false;
    const mesesRecorrencia = analise.rubricas.length
      ? Math.max(...analise.rubricas.map((r) => r.mesesRecorrencia))
      : 0;
    const recomendacao = [
      analise.recomendacao ?? "",
      descontoRecorrente && semContrato
        ? "Desconto de cartão/saque localizado no contracheque sem contrato vinculado."
        : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      versao: 1,
      encontrado: analise.encontrado,
      nivel_risco: analise.nivel_risco_global,
      tipo_detectado: inferirTipo(
        analise.rubricas.map((r) => r.termoEncontrado),
        analise.rubricas.map((r) => r.nomeRubrica),
      ),
      termos_encontrados: [...new Set(analise.rubricas.map((r) => r.termoEncontrado))],
      linhas_suspeitas: analise.rubricas.map((r) => r.nomeRubrica),
      valor_mensal_estimado: analise.rubricas.reduce((s, r) => s + r.valorDescontado, 0) || null,
      banco_possivel: analise.rubricas.find((r) => r.bancoPossivel)?.bancoPossivel ?? null,
      justificativa: analise.alerta ?? "",
      recomendacao,
      desconto_recorrente: descontoRecorrente,
      meses_consecutivos_com_termo: mesesRecorrencia,
      sem_contrato_vinculado: semContrato,
      competencia: opts.competencia,
      aviso_legal: AVISO_CARTAO_SAQUE_EMBUTIDO,
      analiseContracheque: analise,
    };
  }

  const textosExtras = opts?.textosContratosAnexados ?? [];
  const blob = [textoOCR, ...textosExtras, ...lancamentosContracheque.map((l) => l.descricao)].join("\n");
  const textoNorm = normalizarTexto(blob);

  const termosOcr = coletarTermosNoTexto(normalizarTexto(textoOCR));
  const termosLanc = lancamentosContracheque.flatMap((l) =>
    coletarTermosNoTexto(normalizarTexto(l.descricao)),
  );
  const termosContratos = textosExtras.flatMap((t) => coletarTermosNoTexto(normalizarTexto(t)));
  const termos_encontrados = [...new Set([...termosOcr, ...termosLanc, ...termosContratos])];

  const linhas_suspeitas = [
    ...extrairLinhasSuspeitas(textoOCR, termos_encontrados),
    ...lancamentosContracheque
      .filter((l) => lancamentoCombinaCartao(normalizarTexto(l.descricao), termos_encontrados))
      .map((l) => {
        const v = l.valor != null ? ` — R$ ${l.valor.toFixed(2).replace(".", ",")}` : "";
        return `${l.descricao}${v}`.slice(0, 220);
      }),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 14);

  const encontrado = termos_encontrados.length > 0 || linhas_suspeitas.length > 0;
  const tipo_detectado = inferirTipo(termos_encontrados);
  const valor_mensal_estimado = valorMensalDeLancamentos(lancamentosContracheque, termos_encontrados);
  const banco_possivel = inferirBanco(textoNorm);

  const competencia = opts?.competencia ?? null;
  const meses_consecutivos =
    competencia && opts?.payslipsHistorico?.length
      ? mesesConsecutivosComTermos(opts.payslipsHistorico, competencia, termos_encontrados.slice(0, 5))
      : encontrado
        ? 1
        : 0;
  const desconto_recorrente = meses_consecutivos >= 2;
  const sem_contrato_vinculado = opts?.temContratoFormalVinculado === false;
  const contratoIncompleto = opts?.contratoComDadosEssenciais === false;

  const nivel_risco = encontrado
    ? classificarRisco({
        termos: termos_encontrados,
        valorMensal: valor_mensal_estimado,
        descontoRecorrente: desconto_recorrente,
        semContrato: sem_contrato_vinculado,
        contratoIncompleto,
      })
    : "baixo";

  let justificativa = "Nenhum termo compatível com cartão/RMC/RCC/saque embutido.";
  if (encontrado) {
    const partes = [`Termos: ${termos_encontrados.slice(0, 8).join(", ")}${termos_encontrados.length > 8 ? "…" : ""}.`];
    if (valor_mensal_estimado != null) partes.push(`Desconto estimado ${valor_mensal_estimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
    if (desconto_recorrente) partes.push(`Padrão em ${meses_consecutivos} competência(s) com o mesmo indício.`);
    if (sem_contrato_vinculado) partes.push("Sem contrato formal vinculado na base.");
    if (contratoIncompleto) partes.push("Contrato anexo sem CET, parcelas ou valor liberado claros.");
    justificativa = partes.join(" ");
  }

  const recomendacao = encontrado
    ? montarRecomendacao(nivel_risco, {
        semContrato: sem_contrato_vinculado,
        descontoRecorrente: desconto_recorrente,
        banco: banco_possivel,
      })
    : "Nenhuma ação necessária para este recorte.";

  return {
    encontrado,
    nivel_risco,
    tipo_detectado,
    termos_encontrados,
    linhas_suspeitas,
    valor_mensal_estimado,
    banco_possivel,
    justificativa,
    recomendacao,
    desconto_recorrente,
    meses_consecutivos_com_termo: meses_consecutivos,
    sem_contrato_vinculado,
    competencia,
    aviso_legal: AVISO_CARTAO_SAQUE_EMBUTIDO,
  };
}

export function montarLinhasAnalisaveisDePayslipItems(
  items: {
    description: string;
    value: number;
    type: string;
    code?: string;
    banco?: { nome?: string | null } | null;
    bancoConfirmacao?: { nome?: string | null } | null;
    parcelaAtual?: number;
    parcelaTotal?: number;
  }[],
  competencia: { mes: number; ano: number },
): LancamentoContrachequeDeteccao[] {
  return items.map((it) => ({
    descricao: it.description,
    valor: it.value,
    codigo: it.code,
    banco: it.banco?.nome ?? it.bancoConfirmacao?.nome ?? null,
    mes: competencia.mes,
    ano: competencia.ano,
    tipo: it.type === "desconto" ? "desconto" : "ganho",
    parcelaAtual: it.parcelaAtual ?? null,
    parcelaTotal: it.parcelaTotal ?? null,
  }));
}

export const lancamentosDePayslipItems = montarLinhasAnalisaveisDePayslipItems;

export function resultadoParaCamposPayslip(
  r: ResultadoDeteccaoCartaoSaqueEmbutido,
  statusConferencia: StatusConferenciaCartaoSaqueEmbutido = "pendente_conferencia",
): CamposCartaoSaqueEmbutidoPayslip {
  return {
    cartao_saque_embutido_detectado: r.encontrado,
    cartao_saque_tipo: r.encontrado ? r.tipo_detectado : null,
    cartao_saque_risco: r.encontrado ? r.nivel_risco : null,
    cartao_saque_termos: r.termos_encontrados.length ? r.termos_encontrados : null,
    cartao_saque_linhas: r.linhas_suspeitas.length ? r.linhas_suspeitas : null,
    cartao_saque_valor_mensal: r.valor_mensal_estimado,
    cartao_saque_banco_possivel: r.banco_possivel,
    cartao_saque_observacao: r.encontrado ? TEXTO_ALERTA_CARTAO_SAQUE_EMBUTIDO : null,
    cartao_saque_status_conferencia: r.encontrado ? statusConferencia : null,
    cartao_saque_analise_json: r.encontrado ? r : null,
  };
}
