import { formatarIsoPtBr } from "@/lib/contratos/datas-texto-br";
import { gerarCronogramaContratoExtraido } from "@/services/contratos/cronograma-contrato-extraido";
import type {
  AlertaPlausibilidadeContrato,
  CampoAuditado,
  ConfiancaCampo,
  ContratoExtraido,
  NivelConfiancaLeitura,
  SinteseConfiabilidadeContrato,
  SituacaoSeguroAuditada,
} from "@/types/contrato-extraido";

export type {
  CampoAuditado,
  ConfiancaCampo,
  SinteseConfiabilidadeContrato,
  SituacaoSeguroAuditada,
} from "@/types/contrato-extraido";

const BLOQUEIO_TITULAR = /^(cpf_consumidor_terceiro|titular_no_campo_atendente|titular_como_atendente)$/;

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function auditarSeguro(e: ContratoExtraido): SinteseConfiabilidadeContrato["seguro"] {
  const principal = Math.max(e.valorFinanciado ?? 0, e.valorSolicitado ?? 0);
  const solicitado = e.valorSolicitado ?? 0;
  const financiado = e.valorFinanciado ?? 0;
  const iof = e.iof ?? 0;
  const delta = financiado > 0 && solicitado > 0 ? financiado - solicitado : 0;
  const residual = delta > 0 ? Math.max(0, delta - iof) : 0;
  const menciona = e.seguroPrestamistaMencionado === true;

  if (e.seguro != null && e.seguro > 0) {
    return {
      situacao: "premio_no_quadro",
      resumo: `Há valor de seguro/acessório no quadro: ${fmtBrl(e.seguro)} (~${principal > 0 ? ((e.seguro / principal) * 100).toFixed(1) : "?"}% do crédito). Confira sec. C e se foi opcional.`,
    };
  }

  if (menciona && delta > 0 && residual < 50) {
    return {
      situacao: "sem_premio_financiado",
      resumo: `O modelo cita seguro prestamista, mas financiado−solicitado (${fmtBrl(delta)}) explica-se pelo IOF (${fmtBrl(iof)}). Indício forte de que não há prémio de seguro embutido — só texto contratual.`,
    };
  }

  if (menciona) {
    return {
      situacao: "so_mencao_contratual",
      resumo:
        "Aparece a palavra «seguro prestamista» no OCR, sem valor em R$. Isso não prova contratação — veja sec. C do PDF.",
    };
  }

  return {
    situacao: "incerto",
    resumo: "Nenhuma menção clara nem valor de seguro lido. Se existir sec. C com seguro em R$, reforce o OCR.",
  };
}

function auditarDatas(e: ContratoExtraido): SinteseConfiabilidadeContrato["datas"] {
  const doc = e.dataDocumento;
  const v1 = e.primeiroVencimento;
  const ult = e.ultimoVencimento;
  const partes: string[] = [];

  if (doc) partes.push(`documento ${formatarIsoPtBr(doc)}`);
  if (v1) partes.push(`1º venc. ${formatarIsoPtBr(v1)}`);
  if (ult) partes.push(`último ${formatarIsoPtBr(ult)}`);

  if (doc && v1 && doc === v1) {
    return {
      coerentes: false,
      resumo: "Data do documento igual ao 1º vencimento — provável troca no OCR; confira cabeçalho CCB vs sec. E.2.",
    };
  }

  const cron = gerarCronogramaContratoExtraido(e);
  if (cron && !cron.coerenteComDocumento) {
    return {
      coerentes: false,
      resumo: `Último vencimento (${formatarIsoPtBr(ult)}) não fecha com ${e.parcelas} parcelas a partir do 1º vencimento.`,
    };
  }

  if (!doc && !v1) {
    return { coerentes: false, resumo: "Datas principais não lidas — reprocesse OCR ou confira PDF." };
  }

  return {
    coerentes: true,
    resumo: partes.length > 0 ? partes.join(" · ") : "Datas parciais — conferir PDF.",
  };
}

function confiancaCampo(
  e: ContratoExtraido,
  k: keyof ContratoExtraido,
  alertas: AlertaPlausibilidadeContrato[],
): { confianca: ConfiancaCampo; fonte: string } {
  const v = e[k];
  const vazio = v === undefined || v === null || (typeof v === "string" && !String(v).trim());

  if (k === "seguroPrestamistaMencionado") {
    return { confianca: "baixa", fonte: "Palavra-chave no texto (não é prémio em R$)" };
  }

  if (vazio) return { confianca: "ausente", fonte: "Não lido no OCR" };

  const crit = alertas.some((a) => a.severidade === "critico");
  if (k === "parcela" || k === "parcelas" || k === "valorFinanciado" || k === "cpf") {
    return { confianca: crit ? "media" : "alta", fonte: "Quadro / secção estruturada do documento" };
  }
  if (CHAVES_DATA.has(k)) {
    const d = e.datasExtraidas?.find((x) => x.data === v);
    if (d && d.confianca >= 75) return { confianca: "alta", fonte: d.origem.slice(0, 60) };
    if (d) return { confianca: "media", fonte: "Data inferida com contexto fraco" };
    return { confianca: "media", fonte: "Derivada de outro campo ou cálculo" };
  }
  if (k === "cliente") {
    return {
      confianca: String(v).length >= 10 ? "alta" : "media",
      fonte: "Emitente / consumidor (sec. II ou A)",
    };
  }
  return { confianca: "media", fonte: "Heurística OCR" };
}

const CHAVES_DATA = new Set<keyof ContratoExtraido>([
  "dataDocumento",
  "dataContratacao",
  "dataAssinatura",
  "primeiroVencimento",
  "ultimoVencimento",
]);

const ROTULOS: Partial<Record<keyof ContratoExtraido, string>> = {
  banco: "Banco",
  cliente: "Mutuário",
  cpf: "CPF consumidor",
  parcela: "Parcela",
  parcelas: "Prazo (meses)",
  valorFinanciado: "Valor financiado",
  valorSolicitado: "Valor solicitado",
  iof: "IOF",
  dataDocumento: "Data do documento",
  primeiroVencimento: "1º vencimento",
  ultimoVencimento: "Último vencimento",
  cetAnual: "CET anual",
  atendenteNome: "Atendente",
};

function valorExibicaoCampo(e: ContratoExtraido, k: keyof ContratoExtraido): string {
  const v = e[k];
  if (v == null) return "—";
  if (k === "seguroPrestamistaMencionado") return "Termo no texto (ver síntese de seguro)";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (CHAVES_DATA.has(k) && typeof v === "string") return formatarIsoPtBr(v);
  if (
    k === "parcela" ||
    k === "valorFinanciado" ||
    k === "valorSolicitado" ||
    k === "iof"
  ) {
    if (typeof v === "number") return fmtBrl(v);
  }
  return String(v);
}

/**
 * Auditoria final: síntese honesta, bloqueios de confirmação e confiança por campo.
 */
export function auditarConfiabilidadeContrato(
  e: ContratoExtraido,
  opts?: { parcelaOkCadastro?: boolean; parcelaDivergeCadastro?: boolean },
): SinteseConfiabilidadeContrato {
  const alertas = e.alertasPlausibilidade ?? [];
  const seguro = auditarSeguro(e);
  const datas = auditarDatas(e);
  const bloqueios: string[] = [];
  const pendencias: string[] = [];
  const pontosFortes: string[] = [];

  for (const al of alertas) {
    if (al.severidade === "critico" && BLOQUEIO_TITULAR.test(al.codigo)) {
      bloqueios.push(al.mensagem);
    } else if (al.severidade === "critico") {
      pendencias.push(al.mensagem);
    }
  }

  if (opts?.parcelaDivergeCadastro) {
    bloqueios.push("Parcela do documento não coincide com o empréstimo selecionado no cadastro.");
  }

  if (!e.cliente?.trim()) pendencias.push("Nome do mutuário (cliente/emitente) não foi lido — preencha ou reprocesse OCR.");
  if (!e.cpf?.trim()) pendencias.push("CPF do consumidor ausente no OCR.");
  if (e.parcela == null || e.parcela <= 0) bloqueios.push("Valor da parcela não identificado.");
  if (e.parcelas == null || e.parcelas <= 0) bloqueios.push("Quantidade de parcelas não identificada.");

  if (e.banco && e.parcela && e.parcelas && e.valorFinanciado) {
    pontosFortes.push(
      `Crédito ${e.banco}: ${fmtBrl(e.parcela)} × ${e.parcelas} (${fmtBrl(e.valorFinanciado)} financiado).`,
    );
  }
  if (datas.coerentes && e.dataDocumento && e.primeiroVencimento) {
    pontosFortes.push(`Datas coerentes: documento ${formatarIsoPtBr(e.dataDocumento)}, 1º venc. ${formatarIsoPtBr(e.primeiroVencimento)}.`);
  }
  if (seguro.situacao === "sem_premio_financiado") {
    pontosFortes.push(seguro.resumo);
  }
  if (opts?.parcelaOkCadastro) pontosFortes.push("Parcela alinhada ao cadastro selecionado.");

  const camposChave: (keyof ContratoExtraido)[] = [
    "banco",
    "cliente",
    "cpf",
    "parcela",
    "parcelas",
    "valorFinanciado",
    "iof",
    "dataDocumento",
    "primeiroVencimento",
    "ultimoVencimento",
    "cetAnual",
    "atendenteNome",
  ];

  const campos: CampoAuditado[] = camposChave.map((k) => {
    const { confianca, fonte } = confiancaCampo(e, k, alertas);
    return {
      chave: k,
      rotulo: ROTULOS[k] ?? k,
      valorExibicao: valorExibicaoCampo(e, k),
      confianca,
      fonte,
    };
  });

  campos.push({
    chave: "seguroInterpretado",
    rotulo: "Seguro (interpretação)",
    valorExibicao:
      seguro.situacao === "premio_no_quadro"
        ? "Prémio no quadro"
        : seguro.situacao === "sem_premio_financiado"
          ? "Sem prémio embutido"
          : seguro.situacao === "so_mencao_contratual"
            ? "Só menção no texto"
            : "Incerto",
    confianca: seguro.situacao === "sem_premio_financiado" ? "alta" : seguro.situacao === "incerto" ? "baixa" : "media",
    fonte: seguro.resumo,
  });

  let score = e.scoreConfianca ?? 50;
  const ausentes = campos.filter((c) => c.confianca === "ausente").length;
  score -= ausentes * 4;
  score -= bloqueios.length * 15;
  score -= pendencias.length * 6;
  if (datas.coerentes) score += 5;
  if (seguro.situacao === "sem_premio_financiado" || seguro.situacao === "premio_no_quadro") score += 3;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const nivelGeral: NivelConfiancaLeitura =
    score >= 82 && bloqueios.length === 0 ? "alta" : score >= 55 ? "media" : "baixa";

  const podeConfirmar = bloqueios.length === 0 && e.parcela != null && e.parcelas != null;

  let veredito: string;
  if (bloqueios.length > 0) {
    veredito =
      "Não confirme como definitivo: há bloqueio crítico (titular, parcela ou dados essenciais). Revise o PDF e o cadastro antes de gravar.";
  } else if (nivelGeral === "alta") {
    veredito =
      "Leitura consistente com o PDF neste ecrã: valores, prazo e datas batem entre si. Confirme visualmente a sec. A (mutuário) e E.2 (vencimentos) no original.";
  } else if (nivelGeral === "media") {
    veredito =
      "Leitura utilizável com ressalvas: conferir campos em amarelo e pendências abaixo antes de usar em reclamação ou sync do cadastro.";
  } else {
    veredito =
      "Leitura fraca: reprocesse o OCR (PDF com texto selecionável ajuda) ou corrija manualmente os campos essenciais.";
  }

  return {
    nivelGeral,
    scoreAjustado: score,
    veredito,
    pontosFortes,
    pendencias,
    bloqueiosConfirmacao: bloqueios,
    podeConfirmar,
    seguro,
    datas,
    campos,
  };
}
