/**
 * Catálogo de perguntas de triagem — atualize PERGUNTAS_TRIAGEM_VERSION ao incluir novas.
 * Perguntas derivadas de dificuldades reais do projeto (desconto fracionado, falso refin, etc.).
 */

import type { NivelLeitura, PerguntaTriagem, TipoProblemaTriagem } from "@/lib/triagem/triagem-inteligente-tipos";

export const PERGUNTAS_TRIAGEM_VERSION = 2;

function simNao(
  base: Omit<PerguntaTriagem, "tipo_resposta" | "opcoes"> & { proxima_sim?: string; proxima_nao?: string; proxima_nao_sei?: string },
): PerguntaTriagem {
  return {
    ...base,
    tipo_resposta: "sim_nao",
    opcoes: ["sim", "nao", "nao_sei"],
    proxima_pergunta_se: {
      sim: base.proxima_sim ?? "",
      nao: base.proxima_nao ?? "",
      nao_sei: base.proxima_nao_sei ?? "",
    },
  };
}

// ---------------------------------------------------------------------------
// A) Desconto fracionado
// ---------------------------------------------------------------------------
const DESCONTO_FRACIONADO: PerguntaTriagem[] = [
  simNao({
    id: "df_1",
    tipo_problema: "desconto_fracionado",
    nivel: "basico",
    pergunta: "Estes descontos pequenos pertencem ao mesmo banco/contrato?",
    ajuda: "Mesma instituição e mesma competência no contracheque.",
    efeito_resposta: "Confirma agrupamento para soma.",
    proxima_sim: "df_2",
    proxima_nao: "df_fim_nao",
    proxima_nao_sei: "df_fim_pendencia",
  }),
  simNao({
    id: "df_2",
    tipo_problema: "desconto_fracionado",
    nivel: "intermediario",
    pergunta: "A soma dos descontos pequenos fecha com o valor oficial da parcela?",
    ajuda: "Compare com ConsigFácil ou contrato. Tolerância usual: R$ 2 ou 1%.",
    efeito_resposta: "Base para conciliar desconto fracionado por margem.",
    proxima_sim: "df_3",
    proxima_nao: "df_fim_pendencia",
    proxima_nao_sei: "df_fim_pendencia",
  }),
  simNao({
    id: "df_3",
    tipo_problema: "desconto_fracionado",
    nivel: "avancado",
    pergunta: "Esse contrato aparece no ConsigFácil com parcela oficial?",
    efeito_resposta: "Vincula à fonte oficial.",
    proxima_sim: "df_4",
    proxima_nao: "df_4",
    proxima_nao_sei: "df_4",
  }),
  simNao({
    id: "df_4",
    tipo_problema: "desconto_fracionado",
    nivel: "avancado",
    pergunta: "O valor total descontado ficou diferente por causa de margem ultrapassada (>30%)?",
    efeito_resposta: "Explica quebra operacional.",
    proxima_sim: "df_5",
    proxima_nao: "df_5",
    proxima_nao_sei: "df_5",
  }),
  simNao({
    id: "df_5",
    tipo_problema: "desconto_fracionado",
    nivel: "intermediario",
    pergunta: "O desconto voltou ao valor normal no mês seguinte?",
    efeito_resposta: "Indica ajuste temporário, não novo contrato.",
    proxima_sim: "df_6",
    proxima_nao: "df_6",
    proxima_nao_sei: "df_6",
  }),
  simNao({
    id: "df_6",
    tipo_problema: "desconto_fracionado",
    nivel: "basico",
    pergunta: "O código/rubrica é o mesmo ou muito parecido?",
    efeito_resposta: "Descarta duplicidade falsa.",
    proxima_sim: "df_fim_ok",
    proxima_nao: "df_fim_pendencia",
    proxima_nao_sei: "df_fim_pendencia",
  }),
];

// ---------------------------------------------------------------------------
// B) Possível refinanciamento
// ---------------------------------------------------------------------------
const POSSIVEL_REFIN: PerguntaTriagem[] = [
  simNao({
    id: "ref_1",
    tipo_problema: "possivel_refinanciamento",
    nivel: "avancado",
    pergunta:
      "O ConsigFácil informa expressamente refinanciamento, portabilidade ou substituição?",
    ajuda: "Texto oficial no portal ou status refinanciado/substituido.",
    efeito_resposta: "Indício forte de refin real.",
    proxima_sim: "ref_fim_refin",
    proxima_nao: "ref_2",
    proxima_nao_sei: "ref_2",
  }),
  simNao({
    id: "ref_2",
    tipo_problema: "possivel_refinanciamento",
    nivel: "avancado",
    pergunta: "O contrato anterior foi suspenso, quitado ou desapareceu do portal?",
    proxima_sim: "ref_3",
    proxima_nao: "ref_3",
    proxima_nao_sei: "ref_3",
    efeito_resposta: "Indício de substituição.",
  }),
  simNao({
    id: "ref_3",
    tipo_problema: "possivel_refinanciamento",
    nivel: "intermediario",
    pergunta: "O novo contrato tem código oficial diferente do anterior?",
    proxima_sim: "ref_4",
    proxima_nao: "ref_fim_refin",
    proxima_nao_sei: "ref_4",
    efeito_resposta: "Códigos distintos sugerem contratos únicos.",
  }),
  simNao({
    id: "ref_4",
    tipo_problema: "possivel_refinanciamento",
    nivel: "intermediario",
    pergunta: "O número de parcelas (total ou atual) é diferente entre os contratos?",
    proxima_sim: "ref_5",
    proxima_nao: "ref_fim_pendencia",
    proxima_nao_sei: "ref_5",
    efeito_resposta: "Sequências próprias = operações independentes.",
  }),
  simNao({
    id: "ref_5",
    tipo_problema: "possivel_refinanciamento",
    nivel: "intermediario",
    pergunta: "O valor da parcela é claramente diferente (>5%) entre os contratos?",
    proxima_sim: "ref_6",
    proxima_nao: "ref_fim_unico",
    proxima_nao_sei: "ref_6",
    efeito_resposta: "Parcelas parecidas reforçam suspeita de refin.",
  }),
  simNao({
    id: "ref_6",
    tipo_problema: "possivel_refinanciamento",
    nivel: "basico",
    pergunta: "O contrato antigo continuou ATIVO junto com o novo no ConsigFácil?",
    proxima_sim: "ref_fim_unico",
    proxima_nao: "ref_fim_refin",
    proxima_nao_sei: "ref_fim_pendencia",
    efeito_resposta: "Dois ativos = contratos únicos, não refin.",
  }),
];

// ---------------------------------------------------------------------------
// C) Contrato duplicado
// ---------------------------------------------------------------------------
const CONTRATO_DUPLICADO: PerguntaTriagem[] = [
  simNao({
    id: "dup_1",
    tipo_problema: "contrato_duplicado",
    nivel: "basico",
    pergunta: "Existem dois registros com o mesmo banco e valor parecido?",
    proxima_sim: "dup_2",
    proxima_nao: "dup_fim_ok",
    proxima_nao_sei: "dup_fim_pendencia",
    efeito_resposta: "Inicia análise de duplicidade.",
  }),
  simNao({
    id: "dup_2",
    tipo_problema: "contrato_duplicado",
    nivel: "intermediario",
    pergunta: "Eles possuem o mesmo código oficial (ConsigFácil)?",
    proxima_sim: "dup_fim_dup",
    proxima_nao: "dup_3",
    proxima_nao_sei: "dup_3",
    efeito_resposta: "Mesmo código = duplicidade real.",
  }),
  simNao({
    id: "dup_3",
    tipo_problema: "contrato_duplicado",
    nivel: "basico",
    pergunta: "Estão na mesma competência (mês de folha)?",
    proxima_sim: "dup_4",
    proxima_nao: "dup_fim_ok",
    proxima_nao_sei: "dup_4",
    efeito_resposta: "Mesma competência aumenta chance de fração.",
  }),
  simNao({
    id: "dup_4",
    tipo_problema: "contrato_duplicado",
    nivel: "intermediario",
    pergunta: "A soma dos valores é igual à parcela oficial?",
    proxima_sim: "dup_5",
    proxima_nao: "dup_fim_dup",
    proxima_nao_sei: "dup_fim_pendencia",
    efeito_resposta: "Soma = parcela oficial → fracionado.",
  }),
  simNao({
    id: "dup_5",
    tipo_problema: "contrato_duplicado",
    nivel: "basico",
    pergunta: "Um deles é apenas fração de desconto (valor menor)?",
    proxima_sim: "dup_fim_fracionado",
    proxima_nao: "dup_fim_dup",
    proxima_nao_sei: "dup_fim_pendencia",
    efeito_resposta: "Fração → desconto fracionado, não duplicado.",
  }),
];

// ---------------------------------------------------------------------------
// D) Cartão / saque embutido
// ---------------------------------------------------------------------------
const CARTAO_SAQUE: PerguntaTriagem[] = [
  simNao({
    id: "cart_1",
    tipo_problema: "cartao_saque_embutido",
    nivel: "basico",
    pergunta: "A rubrica contém CARTÃO, CREDCESTA, RMC, RCC ou SAQUE?",
    proxima_sim: "cart_2",
    proxima_nao: "cart_fim_ok",
    proxima_nao_sei: "cart_2",
    efeito_resposta: "Identifica modalidade cartão.",
  }),
  simNao({
    id: "cart_2",
    tipo_problema: "cartao_saque_embutido",
    nivel: "intermediario",
    pergunta: "Existe contrato específico anexado (PDF/CCB)?",
    proxima_sim: "cart_3",
    proxima_nao: "cart_fim_pendencia",
    proxima_nao_sei: "cart_fim_pendencia",
    efeito_resposta: "Sem anexo mantém pendência real.",
  }),
  simNao({
    id: "cart_3",
    tipo_problema: "cartao_saque_embutido",
    nivel: "avancado",
    pergunta: "Aparece no ConsigFácil como cartão benefício ou cartão de crédito?",
    proxima_sim: "cart_4",
    proxima_nao: "cart_fim_pendencia",
    proxima_nao_sei: "cart_4",
    efeito_resposta: "Confirma classificação oficial.",
  }),
  simNao({
    id: "cart_4",
    tipo_problema: "cartao_saque_embutido",
    nivel: "basico",
    pergunta: "O desconto é recorrente em vários meses?",
    proxima_sim: "cart_5",
    proxima_nao: "cart_fim_ok",
    proxima_nao_sei: "cart_5",
    efeito_resposta: "Recorrência indica contrato ativo.",
  }),
  simNao({
    id: "cart_5",
    tipo_problema: "cartao_saque_embutido",
    nivel: "intermediario",
    pergunta: "Houve saque ou valor liberado identificado no extrato/contrato?",
    proxima_sim: "cart_fim_ok",
    proxima_nao: "cart_fim_pendencia",
    proxima_nao_sei: "cart_fim_pendencia",
    efeito_resposta: "Saque embutido documentado.",
  }),
];

// ---------------------------------------------------------------------------
// E) Salário duplicado extrato
// ---------------------------------------------------------------------------
const SALARIO_EXTRATO: PerguntaTriagem[] = [
  simNao({
    id: "sal_1",
    tipo_problema: "salario_duplicado_extrato",
    nivel: "basico",
    pergunta: "A entrada bancária parece ser o salário líquido?",
    proxima_sim: "sal_2",
    proxima_nao: "sal_fim_pendencia",
    proxima_nao_sei: "sal_fim_pendencia",
    efeito_resposta: "Evita somar folha + extrato como dupla renda.",
  }),
  simNao({
    id: "sal_2",
    tipo_problema: "salario_duplicado_extrato",
    nivel: "basico",
    pergunta: "O mês tem contracheque importado?",
    proxima_sim: "sal_3",
    proxima_nao: "sal_fim_pendencia",
    proxima_nao_sei: "sal_3",
    efeito_resposta: "Cruzamento folha × extrato.",
  }),
  simNao({
    id: "sal_3",
    tipo_problema: "salario_duplicado_extrato",
    nivel: "intermediario",
    pergunta: "O valor é parecido com o líquido da folha (diferença até R$ 5)?",
    proxima_sim: "sal_4",
    proxima_nao: "sal_fim_pendencia",
    proxima_nao_sei: "sal_fim_pendencia",
    efeito_resposta: "Confirma mesmo evento financeiro.",
  }),
  simNao({
    id: "sal_4",
    tipo_problema: "salario_duplicado_extrato",
    nivel: "basico",
    pergunta: 'A descrição contém governo, estado, PM, salário ou vencimento?',
    proxima_sim: "sal_fim_ok",
    proxima_nao: "sal_fim_pendencia",
    proxima_nao_sei: "sal_fim_pendencia",
    efeito_resposta: "Marca salario_liquido_conciliado.",
  }),
];

// ---------------------------------------------------------------------------
// F) Transferência própria
// ---------------------------------------------------------------------------
const TRANSFERENCIA: PerguntaTriagem[] = [
  simNao({
    id: "trf_1",
    tipo_problema: "transferencia_propria",
    nivel: "basico",
    pergunta: "A conta de origem ou destino é sua?",
    proxima_sim: "trf_2",
    proxima_nao: "trf_fim_pendencia",
    proxima_nao_sei: "trf_fim_pendencia",
    efeito_resposta: "Não é receita de terceiros.",
  }),
  simNao({
    id: "trf_2",
    tipo_problema: "transferencia_propria",
    nivel: "intermediario",
    pergunta: "O valor saiu de uma conta e entrou em outra no mesmo período?",
    proxima_sim: "trf_3",
    proxima_nao: "trf_fim_pendencia",
    proxima_nao_sei: "trf_fim_pendencia",
    efeito_resposta: "Par saída/entrada.",
  }),
  simNao({
    id: "trf_3",
    tipo_problema: "transferencia_propria",
    nivel: "basico",
    pergunta: "A descrição contém seu nome, CPF ou banco próprio?",
    proxima_sim: "trf_fim_ok",
    proxima_nao: "trf_fim_pendencia",
    proxima_nao_sei: "trf_fim_pendencia",
    efeito_resposta: "Marca transferencia_propria.",
  }),
];

// ---------------------------------------------------------------------------
// G) Empréstimo creditado extrato
// ---------------------------------------------------------------------------
const EMPRESTIMO_CREDITO: PerguntaTriagem[] = [
  simNao({
    id: "emp_1",
    tipo_problema: "emprestimo_creditado_extrato",
    nivel: "basico",
    pergunta: "A entrada veio de banco ou financeira?",
    proxima_sim: "emp_2",
    proxima_nao: "emp_fim_pendencia",
    proxima_nao_sei: "emp_fim_pendencia",
    efeito_resposta: "Origem financeira.",
  }),
  simNao({
    id: "emp_2",
    tipo_problema: "emprestimo_creditado_extrato",
    nivel: "basico",
    pergunta: "A descrição contém empréstimo, crédito, CDC, contrato ou consignado?",
    proxima_sim: "emp_3",
    proxima_nao: "emp_fim_pendencia",
    proxima_nao_sei: "emp_3",
    efeito_resposta: "Não é renda ordinária.",
  }),
  simNao({
    id: "emp_3",
    tipo_problema: "emprestimo_creditado_extrato",
    nivel: "intermediario",
    pergunta: "Existe contrato anexado próximo da data do crédito?",
    proxima_sim: "emp_4",
    proxima_nao: "emp_fim_pendencia",
    proxima_nao_sei: "emp_fim_pendencia",
    efeito_resposta: "Vínculo documental.",
  }),
  simNao({
    id: "emp_4",
    tipo_problema: "emprestimo_creditado_extrato",
    nivel: "intermediario",
    pergunta: "O valor liberado no contrato é parecido com o valor creditado?",
    proxima_sim: "emp_fim_ok",
    proxima_nao: "emp_fim_pendencia",
    proxima_nao_sei: "emp_fim_pendencia",
    efeito_resposta: "Marca emprestimo_creditado_extrato.",
  }),
];

// ---------------------------------------------------------------------------
// Genéricas (outros tipos — fluxo curto)
// ---------------------------------------------------------------------------
function fluxoGenerico(tipo: TipoProblemaTriagem, prefix: string): PerguntaTriagem[] {
  return [
    simNao({
      id: `${prefix}_1`,
      tipo_problema: tipo,
      nivel: "basico",
      pergunta: "Você reconhece este lançamento como esperado na sua análise?",
      proxima_sim: `${prefix}_fim_ok`,
      proxima_nao: `${prefix}_2`,
      proxima_nao_sei: `${prefix}_fim_pendencia`,
      efeito_resposta: "Triagem inicial.",
    }),
    simNao({
      id: `${prefix}_2`,
      tipo_problema: tipo,
      nivel: "intermediario",
      pergunta: "Há documento ou print oficial que confirme o valor?",
      proxima_sim: `${prefix}_fim_ok`,
      proxima_nao: `${prefix}_fim_pendencia`,
      proxima_nao_sei: `${prefix}_fim_pendencia`,
      efeito_resposta: "Exige evidência.",
    }),
  ];
}

const DIVERGENCIA_VALOR: PerguntaTriagem[] = [
  simNao({
    id: "div_1",
    tipo_problema: "divergencia_valor",
    nivel: "basico",
    pergunta:
      "No contracheque desta competência há mais de um desconto do mesmo banco/contrato?",
    ajuda:
      "Várias rubricas pequenas no mesmo mês costumam somar a parcela ConsigFácil (desconto fracionado por margem).",
    proxima_sim: "div_2",
    proxima_nao: "div_3",
    proxima_nao_sei: "div_fim_pendencia",
    efeito_resposta: "Separa fracionado de parcela única.",
  }),
  simNao({
    id: "div_2",
    tipo_problema: "divergencia_valor",
    nivel: "intermediario",
    pergunta: "A soma desses descontos na folha fecha com o valor oficial da parcela (ConsigFácil)?",
    ajuda: "Compare totais — tolerância usual até ~8% por arredondamento.",
    proxima_sim: "div_fim_fracionado",
    proxima_nao: "div_fim_pendencia",
    proxima_nao_sei: "div_fim_pendencia",
    efeito_resposta: "Confirma desconto fracionado conciliado.",
  }),
  simNao({
    id: "div_3",
    tipo_problema: "divergencia_valor",
    nivel: "basico",
    pergunta: "O valor do ConsigFácil (parcela contratada) é o correto para este contrato?",
    proxima_sim: "div_fim_consigfacil",
    proxima_nao: "div_4",
    proxima_nao_sei: "div_fim_pendencia",
    efeito_resposta: "Prioriza fonte oficial.",
  }),
  simNao({
    id: "div_4",
    tipo_problema: "divergencia_valor",
    nivel: "intermediario",
    pergunta:
      "O valor observado na folha reflete o que foi descontado (reajuste, parcela temporária ou leitura correta)?",
    proxima_sim: "div_fim_folha",
    proxima_nao: "div_fim_pendencia",
    proxima_nao_sei: "div_fim_pendencia",
    efeito_resposta: "Prioriza folha/anexo.",
  }),
];
const MARGEM = fluxoGenerico("margem_ultrapassada", "marg");
const SEM_ANEXO = [
  simNao({
    id: "anx_1",
    tipo_problema: "contrato_sem_anexo",
    nivel: "basico",
    pergunta: "Você possui o PDF do contrato para anexar?",
    proxima_sim: "anx_fim_upload",
    proxima_nao: "anx_2",
    proxima_nao_sei: "anx_fim_pendencia",
    efeito_resposta: "Solicita anexo.",
  }),
  simNao({
    id: "anx_2",
    tipo_problema: "contrato_sem_anexo",
    nivel: "avancado",
    pergunta: "O ConsigFácil já confirma o contrato sem precisar do PDF?",
    proxima_sim: "anx_fim_ok",
    proxima_nao: "anx_fim_pendencia",
    proxima_nao_sei: "anx_fim_pendencia",
    efeito_resposta: "Fonte oficial substitui anexo.",
  }),
];

const VENDA_CASADA = [
  simNao({
    id: "vc_1",
    tipo_problema: "venda_casada",
    nivel: "especialista",
    pergunta: "Foi contratado seguro ou produto sem solicitação explícita?",
    proxima_sim: "vc_fim_especialista",
    proxima_nao: "vc_fim_ok",
    proxima_nao_sei: "vc_fim_especialista",
    efeito_resposta: "Possível venda casada — revisão jurídica.",
  }),
];

const JUROS_ABUSIVOS = [
  simNao({
    id: "jur_1",
    tipo_problema: "juros_abusivos",
    nivel: "especialista",
    pergunta: "A taxa (CET/juros) parece muito acima do mercado para a época?",
    proxima_sim: "jur_fim_especialista",
    proxima_nao: "jur_fim_ok",
    proxima_nao_sei: "jur_fim_especialista",
    efeito_resposta: "Sugerir perícia / calculadora BCB.",
  }),
];

const RMC_RCC = fluxoGenerico("rmc_rcc", "rmc");
const CONTRATO_UNICO = fluxoGenerico("contrato_unico", "cu");
const DESCONTO_SEM = fluxoGenerico("desconto_sem_contrato", "dsc");
const CONTRATO_SEM_DESC = fluxoGenerico("contrato_sem_desconto", "csd");
const PIX = fluxoGenerico("pix_desconhecido", "pix");
const SEGURO = fluxoGenerico("seguro_embutido", "seg");
const OUTRO = fluxoGenerico("outro", "out");

export const TODAS_PERGUNTAS_TRIAGEM: PerguntaTriagem[] = [
  ...DESCONTO_FRACIONADO,
  ...POSSIVEL_REFIN,
  ...CONTRATO_DUPLICADO,
  ...CARTAO_SAQUE,
  ...SALARIO_EXTRATO,
  ...TRANSFERENCIA,
  ...EMPRESTIMO_CREDITO,
  ...DIVERGENCIA_VALOR,
  ...MARGEM,
  ...SEM_ANEXO,
  ...VENDA_CASADA,
  ...JUROS_ABUSIVOS,
  ...RMC_RCC,
  ...CONTRATO_UNICO,
  ...DESCONTO_SEM,
  ...CONTRATO_SEM_DESC,
  ...PIX,
  ...SEGURO,
  ...OUTRO,
];

const POR_ID = new Map(TODAS_PERGUNTAS_TRIAGEM.map((p) => [p.id, p]));

const NIVEL_ORDEM: Record<NivelLeitura, number> = {
  basico: 0,
  intermediario: 1,
  avancado: 2,
  especialista: 3,
};

const POR_TIPO = new Map<TipoProblemaTriagem, PerguntaTriagem[]>();
for (const p of TODAS_PERGUNTAS_TRIAGEM) {
  const arr = POR_TIPO.get(p.tipo_problema) ?? [];
  arr.push(p);
  POR_TIPO.set(p.tipo_problema, arr);
}
for (const [tipo, arr] of POR_TIPO) {
  arr.sort((a, b) => NIVEL_ORDEM[a.nivel] - NIVEL_ORDEM[b.nivel]);
  POR_TIPO.set(tipo, arr);
}

export function getPerguntasPorProblema(tipo: TipoProblemaTriagem): PerguntaTriagem[] {
  return POR_TIPO.get(tipo) ?? POR_TIPO.get("outro") ?? [];
}

export function getPerguntaPorId(id: string): PerguntaTriagem | undefined {
  return POR_ID.get(id);
}

export function getPrimeiraPergunta(tipo: TipoProblemaTriagem): PerguntaTriagem | undefined {
  const lista = getPerguntasPorProblema(tipo);
  return lista[0];
}

/** IDs de nó terminal (resolver após chegar aqui). */
export function ehNoTerminal(id: string): boolean {
  return id.includes("_fim_");
}

export function proximaPerguntaId(
  pergunta: PerguntaTriagem,
  resposta: string,
): string | null {
  if (ehNoTerminal(pergunta.id)) return null;
  const next = pergunta.proxima_pergunta_se?.[resposta];
  if (!next) return null;
  return next;
}
