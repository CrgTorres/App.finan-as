import type { BaseFinanceiraEvento } from "@/lib/dashboard/base-financeira-normalizada";

/**
 * Categoria canônica de uma linha de recebido. Cobre tanto rubricas detalhadas do
 * contracheque (composição do BRUTO) como entradas bancárias do extrato/transação
 * (composição do FLUXO DE CAIXA). Os dois conjuntos NUNCA devem ser somados juntos
 * para "total recebido" porque o salário do extrato já é o líquido do contracheque.
 */
export type ReceitaCategoriaCanonica =
  | "soldo"
  | "etapas"
  | "gratificacao_tropa"
  | "gratificacao_curso"
  | "gratificacao_mot"
  | "servico_extra"
  | "adicional_ferias"
  | "decimo_terceiro"
  | "diaria"
  | "abono_fardamento"
  | "diferenca_salarial"
  | "reajuste_salarial"
  | "enquadramento"
  | "salario_liquido_transacao"
  | "pix_recebido"
  | "transferencia_recebida"
  | "outros_recebidos";

/** Agrupador analítico — usado em gráficos de composição salarial. */
export type ReceitaGrupo =
  | "remuneracao_base"
  | "gratificacoes"
  | "verbas_eventuais"
  | "decimo_ferias"
  | "entradas_bancarias";

/**
 * Como a linha deve ser contabilizada em totais:
 * - `rubrica_bruta`: soma para o BRUTO do contracheque.
 * - `entrada_bancaria`: soma para o FLUXO DE CAIXA bancário.
 * - `liquido_recebido`: é uma entrada bancária de salário sem rubricas de contracheque
 *   conhecidas no mesmo mês — pode ser usada como líquido recebido.
 * - `liquido_conciliacao`: é uma entrada bancária de salário coincidente com as
 *   rubricas do contracheque do mesmo mês — NÃO somar com o bruto (duplicidade).
 */
export type ReceitaTipoCalculo =
  | "rubrica_bruta"
  | "entrada_bancaria"
  | "liquido_recebido"
  | "liquido_conciliacao";

export type ClassificacaoReceita = {
  categoria: ReceitaCategoriaCanonica;
  grupo: ReceitaGrupo;
  tipo_calculo: ReceitaTipoCalculo;
  eh_rubrica_contracheque: boolean;
  eh_entrada_bancaria: boolean;
};

const GRUPO_POR_CATEGORIA: Record<ReceitaCategoriaCanonica, ReceitaGrupo> = {
  soldo: "remuneracao_base",
  etapas: "remuneracao_base",
  gratificacao_tropa: "gratificacoes",
  gratificacao_curso: "gratificacoes",
  gratificacao_mot: "gratificacoes",
  servico_extra: "gratificacoes",
  diaria: "verbas_eventuais",
  abono_fardamento: "verbas_eventuais",
  diferenca_salarial: "verbas_eventuais",
  reajuste_salarial: "verbas_eventuais",
  enquadramento: "verbas_eventuais",
  decimo_terceiro: "decimo_ferias",
  adicional_ferias: "decimo_ferias",
  salario_liquido_transacao: "entradas_bancarias",
  pix_recebido: "entradas_bancarias",
  transferencia_recebida: "entradas_bancarias",
  outros_recebidos: "entradas_bancarias",
};

/**
 * Normaliza descrição para matching (caixa alta, sem acentos, espaços únicos).
 * Mantém pontuação e barras porque vários códigos vêm como "1/3 FERIAS", "DEC.37055/16".
 */
export function normalizarDescricaoRecebido(descricao: string | null | undefined): string {
  return (descricao ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ordem importa: regras mais específicas vêm primeiro (ex.: 13º antes de "SALARIO").
 * Cada regex é avaliada contra a descrição normalizada de `normalizarDescricaoRecebido`.
 */
const REGRAS_CONTRACHEQUE: ReadonlyArray<[RegExp, ReceitaCategoriaCanonica]> = [
  [/(?:^|\s)13[O\.\s]\s*SAL/, "decimo_terceiro"],
  [/(?:^|\s)13[\.\s]*SAL[\.\s]*ADIANTADO/, "decimo_terceiro"],
  [/\bANTEC[\.\s]*13/, "decimo_terceiro"],
  [/(?:DIF[\.\s]*)?ADIC(?:IONAL)?[\.\s]*1\/3[\.\s]*FERIAS/, "adicional_ferias"],
  [/\bSOLDO\b/, "soldo"],
  [/\bETAPAS\b/, "etapas"],
  [/GRATIF[\.\s]*DE\s*TROPA/, "gratificacao_tropa"],
  [/GRATIF[\.\s]*DE\s*CURSO/, "gratificacao_curso"],
  [/GRAT[\.\s]*MOT/, "gratificacao_mot"],
  [/SERV[\.\s]*EXTRA/, "servico_extra"],
  [/\bDIARIAS?\b/, "diaria"],
  [/ABONO\s*FARDAMENTO/, "abono_fardamento"],
  [/DIF[\.\s]*(?:DE\s*)?REAJ[\.\s]*SAL/, "reajuste_salarial"],
  [/DIFERENCA\s*DE\s*SALARIO/, "diferenca_salarial"],
  [/DIF[\.\s]*DE\s*ENQUADRAMENTO/, "enquadramento"],
];

const REGRAS_TRANSACAO: ReadonlyArray<[RegExp, ReceitaCategoriaCanonica]> = [
  [/\bPIX\s+RECEBIDO\b/, "pix_recebido"],
  [/\b(?:TRANSFERENCIA|TED|DOC)\s+RECEBIDA?\b/, "transferencia_recebida"],
  [/\bSAL[AÁ]?RIO\b/, "salario_liquido_transacao"],
];

/**
 * Decide a categoria canônica + grupo + tipo de cálculo + flags.
 * O `tipo_calculo` aqui ainda não considera duplicidade — para ajustar conforme o
 * contexto mensal use `detectarPossivelDuplicidadeRecebido` depois.
 */
export function classificarRecebido(registro: BaseFinanceiraEvento): ClassificacaoReceita {
  const ehContracheque = registro.origem === "contracheque";
  const ehTransacao = registro.origem === "transacao";
  const desc = normalizarDescricaoRecebido(registro.descricao_padronizada);

  let categoria: ReceitaCategoriaCanonica = "outros_recebidos";

  if (ehContracheque) {
    for (const [regex, cat] of REGRAS_CONTRACHEQUE) {
      if (regex.test(desc)) {
        categoria = cat;
        break;
      }
    }
  } else if (ehTransacao) {
    for (const [regex, cat] of REGRAS_TRANSACAO) {
      if (regex.test(desc)) {
        categoria = cat;
        break;
      }
    }
  }

  let grupo = GRUPO_POR_CATEGORIA[categoria];
  // Rubrica desconhecida do contracheque → cai em verbas_eventuais, nunca em entradas_bancarias.
  if (ehContracheque && categoria === "outros_recebidos") {
    grupo = "verbas_eventuais";
  }

  const tipo_calculo: ReceitaTipoCalculo = ehContracheque
    ? "rubrica_bruta"
    : categoria === "salario_liquido_transacao"
      ? "liquido_recebido"
      : "entrada_bancaria";

  return {
    categoria,
    grupo,
    tipo_calculo,
    eh_rubrica_contracheque: ehContracheque,
    eh_entrada_bancaria: ehTransacao,
  };
}

export type ContextoMensalRecebido = {
  competencia: string;
  /** Indica que o mês tem rubricas vindas do contracheque (qualquer categoria de receita). */
  temRubricasContracheque: boolean;
};

export type ResultadoDuplicidadeRecebido = {
  possivel_duplicidade: boolean;
  /** Tipo de cálculo ajustado (vira `liquido_conciliacao` quando há duplicidade). */
  tipo_calculo_ajustado: ReceitaTipoCalculo;
  observacao: string;
  competencia_conciliada: boolean;
};

const OBSERVACAO_DUPLICIDADE_SALARIO =
  "Possível líquido recebido referente ao contracheque do mês; não somar com rubricas para cálculo de bruto.";

/**
 * Marca o "Salário" do extrato como `liquido_conciliacao` quando há rubricas de
 * contracheque no mesmo mês — evita inflar o BRUTO ao somar líquido + bruto.
 */
export function detectarPossivelDuplicidadeRecebido(
  registro: BaseFinanceiraEvento,
  contexto: ContextoMensalRecebido,
  classificacao: ClassificacaoReceita,
  opcoes?: { possuiFonteBancariaReal?: boolean },
): ResultadoDuplicidadeRecebido {
  if (opcoes?.possuiFonteBancariaReal === false) {
    return {
      possivel_duplicidade: false,
      tipo_calculo_ajustado: classificacao.tipo_calculo,
      observacao: "",
      competencia_conciliada: false,
    };
  }
  if (
    classificacao.categoria === "salario_liquido_transacao" &&
    contexto.temRubricasContracheque
  ) {
    return {
      possivel_duplicidade: true,
      tipo_calculo_ajustado: "liquido_conciliacao",
      observacao: OBSERVACAO_DUPLICIDADE_SALARIO,
      competencia_conciliada: true,
    };
  }
  return {
    possivel_duplicidade: false,
    tipo_calculo_ajustado: classificacao.tipo_calculo,
    observacao: "",
    competencia_conciliada: false,
  };
}

/** Linha da aba Recebidos_Normalizados. Power BI: tipos simples (number/string/boolean). */
export type ReceitaCanonicaRow = {
  data: string;
  competencia: string;
  origem: BaseFinanceiraEvento["origem"];
  descricao_original: string;
  descricao_normalizada: string;
  receita_categoria_canonica: ReceitaCategoriaCanonica;
  receita_grupo: ReceitaGrupo;
  valor: number;
  tipo_calculo: ReceitaTipoCalculo;
  eh_rubrica_contracheque: boolean;
  eh_entrada_bancaria: boolean;
  possivel_duplicidade: boolean;
  observacao: string;
  documento_origem: string;
  referencia_origem: string;
};

/**
 * Enriquecimento adicionado ao evento da `Base_Normalizada` quando ele é uma receita.
 * Demais eventos (descontos, empréstimos, etc.) recebem todos os campos como `null`
 * para manter o schema estável no Power BI.
 */
export type EnriquecimentoReceitaBase = {
  receita_categoria_canonica: ReceitaCategoriaCanonica | null;
  receita_grupo: ReceitaGrupo | null;
  receita_tipo_calculo: ReceitaTipoCalculo | null;
  receita_eh_rubrica_contracheque: boolean | null;
  receita_eh_entrada_bancaria: boolean | null;
  receita_possivel_duplicidade: boolean | null;
  receita_competencia_conciliada: boolean | null;
  receita_observacao: string | null;
};

/** Linha do bloco "recebidos" dentro de Resumo_Mensal. */
export type ResumoMensalRecebidosRow = {
  competencia: string;
  recebido_bruto_contracheque: number;
  recebido_liquido_contracheque: number;
  entrada_bancaria_salario: number;
  outras_entradas_bancarias: number;
  pix_recebido: number;
  transferencias_recebidas: number;
  /** Para gráficos de composição salarial: vem só do contracheque (bruto). */
  total_recebido_para_grafico: number;
  /** Para fluxo de caixa bancário: soma só entradas do extrato (sem rubricas). */
  total_recebido_para_fluxo_caixa: number;
};

export type ResultadoBuildReceitasCanonicas = {
  /** Linhas para a aba Recebidos_Normalizados. */
  rows: ReceitaCanonicaRow[];
  /** Resumo mensal agregando rubricas vs. entradas bancárias (sem somar entre si). */
  resumoMensal: ResumoMensalRecebidosRow[];
  /**
   * Mapa `evento_id → enriquecimento` para mesclar nos eventos da Base_Normalizada.
   * Apenas eventos de receita (entrada) recebem valores reais; demais ficam vazios.
   */
  enriquecimentoPorEventoId: Map<string, EnriquecimentoReceitaBase>;
};

function arred(n: number): number {
  return Math.round(n * 100) / 100;
}

const ENRIQUECIMENTO_VAZIO: EnriquecimentoReceitaBase = {
  receita_categoria_canonica: null,
  receita_grupo: null,
  receita_tipo_calculo: null,
  receita_eh_rubrica_contracheque: null,
  receita_eh_entrada_bancaria: null,
  receita_possivel_duplicidade: null,
  receita_competencia_conciliada: null,
  receita_observacao: null,
};

export function enriquecimentoReceitaVazio(): EnriquecimentoReceitaBase {
  return { ...ENRIQUECIMENTO_VAZIO };
}

/**
 * Constrói a aba `Recebidos_Normalizados` + bloco de Resumo_Mensal de recebidos
 * + mapa de enriquecimento para mesclar nos eventos da Base_Normalizada.
 *
 * Regras críticas:
 * - Só processa eventos de RECEITA (entrada_saida === "entrada" + tipo_evento === "receita").
 * - Identifica meses com rubricas de contracheque para marcar duplicidade do "Salário" bancário.
 * - Resumo mensal NUNCA soma rubricas com entradas bancárias no mesmo total.
 */
export type OpcoesBuildReceitasCanonicas = {
  /** Sem extrato importado: não marcar duplicidade salário×folha nem fluxo bancário inferido. */
  possuiFonteBancariaReal?: boolean;
};

export function buildReceitasCanonicas(
  baseNormalizada: BaseFinanceiraEvento[],
  opcoes?: OpcoesBuildReceitasCanonicas,
): ResultadoBuildReceitasCanonicas {
  const possuiFonteBancariaReal = opcoes?.possuiFonteBancariaReal !== false;
  const entradas = baseNormalizada.filter(
    (e) => e.entrada_saida === "entrada" && e.tipo_evento === "receita",
  );

  const comRubricaContracheque = new Set<string>();
  for (const e of entradas) {
    if (e.origem === "contracheque") comRubricaContracheque.add(e.competencia);
  }

  const rows: ReceitaCanonicaRow[] = [];
  const enriquecimentoPorEventoId = new Map<string, EnriquecimentoReceitaBase>();

  for (const e of entradas) {
    const classificacao = classificarRecebido(e);
    const dup = detectarPossivelDuplicidadeRecebido(
      e,
      {
        competencia: e.competencia,
        temRubricasContracheque: comRubricaContracheque.has(e.competencia),
      },
      classificacao,
      { possuiFonteBancariaReal },
    );

    const descNormalizada = normalizarDescricaoRecebido(e.descricao_padronizada);

    rows.push({
      data: e.data,
      competencia: e.competencia,
      origem: e.origem,
      descricao_original: e.descricao_padronizada,
      descricao_normalizada: descNormalizada,
      receita_categoria_canonica: classificacao.categoria,
      receita_grupo: classificacao.grupo,
      valor: arred(e.valor),
      tipo_calculo: dup.tipo_calculo_ajustado,
      eh_rubrica_contracheque: classificacao.eh_rubrica_contracheque,
      eh_entrada_bancaria: classificacao.eh_entrada_bancaria,
      possivel_duplicidade: dup.possivel_duplicidade,
      observacao: dup.observacao,
      documento_origem: e.documento_origem,
      referencia_origem: e.referencia_origem,
    });

    enriquecimentoPorEventoId.set(e.evento_id, {
      receita_categoria_canonica: classificacao.categoria,
      receita_grupo: classificacao.grupo,
      receita_tipo_calculo: dup.tipo_calculo_ajustado,
      receita_eh_rubrica_contracheque: classificacao.eh_rubrica_contracheque,
      receita_eh_entrada_bancaria: classificacao.eh_entrada_bancaria,
      receita_possivel_duplicidade: dup.possivel_duplicidade,
      receita_competencia_conciliada: dup.competencia_conciliada,
      receita_observacao: dup.observacao,
    });
  }

  const mapaResumo = new Map<string, ResumoMensalRecebidosRow>();
  function obterLinhaResumo(competencia: string): ResumoMensalRecebidosRow {
    let r = mapaResumo.get(competencia);
    if (!r) {
      r = {
        competencia,
        recebido_bruto_contracheque: 0,
        recebido_liquido_contracheque: 0,
        entrada_bancaria_salario: 0,
        outras_entradas_bancarias: 0,
        pix_recebido: 0,
        transferencias_recebidas: 0,
        total_recebido_para_grafico: 0,
        total_recebido_para_fluxo_caixa: 0,
      };
      mapaResumo.set(competencia, r);
    }
    return r;
  }

  for (const r of rows) {
    const acc = obterLinhaResumo(r.competencia);
    if (r.eh_rubrica_contracheque) {
      acc.recebido_bruto_contracheque += r.valor;
      continue;
    }
    switch (r.receita_categoria_canonica) {
      case "salario_liquido_transacao":
        acc.entrada_bancaria_salario += r.valor;
        if (r.tipo_calculo === "liquido_conciliacao") {
          // Mantém o MAIOR salário-transação como referência de líquido conciliado:
          // se o mês tem dois salários (adiantamento + folha), o líquido conciliado
          // é o maior — não somar para não duplicar com o bruto.
          acc.recebido_liquido_contracheque = Math.max(
            acc.recebido_liquido_contracheque,
            r.valor,
          );
        }
        break;
      case "pix_recebido":
        acc.pix_recebido += r.valor;
        break;
      case "transferencia_recebida":
        acc.transferencias_recebidas += r.valor;
        break;
      default:
        acc.outras_entradas_bancarias += r.valor;
    }
  }

  for (const r of mapaResumo.values()) {
    r.total_recebido_para_grafico = arred(r.recebido_bruto_contracheque);
    r.total_recebido_para_fluxo_caixa = arred(
      r.entrada_bancaria_salario +
        r.pix_recebido +
        r.transferencias_recebidas +
        r.outras_entradas_bancarias,
    );
    r.recebido_bruto_contracheque = arred(r.recebido_bruto_contracheque);
    r.recebido_liquido_contracheque = arred(r.recebido_liquido_contracheque);
    r.entrada_bancaria_salario = arred(r.entrada_bancaria_salario);
    r.outras_entradas_bancarias = arred(r.outras_entradas_bancarias);
    r.pix_recebido = arred(r.pix_recebido);
    r.transferencias_recebidas = arred(r.transferencias_recebidas);
  }

  rows.sort(
    (a, b) =>
      a.competencia.localeCompare(b.competencia) ||
      a.data.localeCompare(b.data) ||
      a.descricao_normalizada.localeCompare(b.descricao_normalizada),
  );

  const resumoMensal = Array.from(mapaResumo.values()).sort((a, b) =>
    a.competencia.localeCompare(b.competencia),
  );

  return { rows, resumoMensal, enriquecimentoPorEventoId };
}

/**
 * Entradas do dicionário de colunas referentes aos campos receita_* (na Base_Normalizada)
 * e às colunas da aba Recebidos_Normalizados.
 */
export function dicionarioColunasRecebidos(): Array<Record<string, string>> {
  const linhas: Array<[string, string]> = [
    ["receita_categoria_canonica", "Categoria canônica do recebido (soldo, etapas, salario_liquido_transacao, …). Vazio fora de receitas."],
    ["receita_grupo", "Grupo agregador (remuneracao_base, gratificacoes, verbas_eventuais, decimo_ferias, entradas_bancarias)."],
    ["receita_tipo_calculo", "rubrica_bruta | entrada_bancaria | liquido_recebido | liquido_conciliacao."],
    ["receita_eh_rubrica_contracheque", "true para linhas vindas do contracheque (compõem o BRUTO)."],
    ["receita_eh_entrada_bancaria", "true para linhas vindas do extrato/transação (compõem o FLUXO DE CAIXA)."],
    ["receita_possivel_duplicidade", "true quando salário-transação coincide com rubricas do mesmo mês — não somar com bruto."],
    ["receita_competencia_conciliada", "true quando o líquido do mês foi conciliado com a transação bancária."],
    ["receita_observacao", "Texto explicativo da regra de duplicidade/conciliação."],
    ["descricao_original", "Descrição como aparece no documento (CPF mascarado quando detectado)."],
    ["descricao_normalizada", "Descrição em caixa alta sem acentos para matching."],
    ["recebido_bruto_contracheque", "Soma das rubricas de receita do contracheque (Resumo_Mensal)."],
    ["recebido_liquido_contracheque", "Líquido recebido conciliado com a transação 'Salário' do mês (Resumo_Mensal)."],
    ["entrada_bancaria_salario", "Soma das transações classificadas como salário no extrato (Resumo_Mensal)."],
    ["outras_entradas_bancarias", "Demais entradas bancárias não enquadradas em pix/transferência/salário (Resumo_Mensal)."],
    ["total_recebido_para_grafico", "Total a usar em gráficos de composição salarial = bruto do contracheque."],
    ["total_recebido_para_fluxo_caixa", "Total a usar em fluxo de caixa bancário = soma das entradas bancárias."],
  ];
  return linhas.map(([coluna, descricao]) => ({ coluna, descricao }));
}
