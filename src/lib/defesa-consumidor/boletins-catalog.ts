/**
 * Conteúdo **informativo** (não constitui assessoria jurídica).
 * Não são “resumos de processos” específicos: temas típicos e links para pesquisar
 * julgamentos oficiais. Atualização editorial por competência mensal — sem inventar número de recurso/acórdão.
 */

export type BoletimTema =
  | "consignado"
  | "margem"
  | "extrato"
  | "contracheque"
  | "superendividamento"
  | "negociacao"
  | "juros_encargos"
  | "venda_casada"
  | "informacao_tarifas"
  | "bacen_procon";

export interface BoletimFonteConsulta {
  label: string;
  href: string;
}

/** Um “boletim” = foco mensal revisável + orientação objetiva para cruzar com seus dados no app */
export interface BoletimMes {
  id: string;
  /** Mês civil de referência (1–12) e ano para exibição ordenada */
  mes: number;
  ano: number;
  titulo: string;
  subtitulo: string;
  /** Texto corrido por parágrafos */
  texto: readonly string[];
  temas: readonly BoletimTema[];
  /** Pistas documentais alinhadas ao que o app coleta */
  usarDadosDoApp: readonly string[];
  fontesConsulta: readonly BoletimFonteConsulta[];
}

export interface ItemChecklist {
  id: string;
  /** Grupo apenas para agrupamento na UI */
  grupo: string;
  texto: string;
  temaRelacionado: BoletimTema[];
  ajuda?: string;
}

/** Últimos 6 meses civis até `ref`; preenche rótulos a partir dos temas editorialmente fixos por posição na janela. */
export function buildBoletinsJanela6Meses(ref = new Date()): BoletimMes[] {
  const base: Omit<BoletimMes, "mes" | "ano" | "id">[] = [
    {
      titulo: "Margem consignável e amortização duvidosa na folha",
      subtitulo: "Contracheque × contrato × extrato quando o valor da parcela “não fecha”.",
      texto: [
        "Em crédito consignado há limite legal de comprometimento da remuneração; qualquer extrapolação ou rubrica ilegível exige conferência página a página.",
        "O contracheque (ou ficha financeira) contém código, parcela atual/total e banco tomador da operação — use isso antes de iniciar reclamação ou revisão judicial.",
      ],
      temas: ["consignado", "margem", "contracheque"],
      usarDadosDoApp: [
        "Exporte/compartilhe a série de Contracheques (últimos 6 meses) com totais líquidos e rubricas bancárias.",
        "Cruzamento com Extrato onde aparecer lançamentos do mesmo financeiro cobra coerência de datas e valores.",
      ],
      fontesConsulta: [
        { label: "Banco Central — educação financeira crédito", href: "https://www.bcb.gov.br/meubc/" },
        { label: "STJ — Pesquisa de jurisprudência (uso filtro por tema/recurso)", href: "https://www.stj.jus.br/portal/jurisprudencia/" },
      ],
    },
    {
      titulo: "Informação e tarifas no contrato de crédito",
      subtitulo: "CET, IOF, modalidade e plano de amortização legíveis.",
      texto: [
        "O consumidor tem direito a informação clara sobre custo total e condições de correção; documentos escaneados confusos exigem extrato oficial do banco.",
        "Se o extrato mostra tarifas ou encargos não explicados no PDF do contrato arquivado, organize protocolo e anexos por competência.",
      ],
      temas: ["extrato", "informacao_tarifas", "juros_encargos"],
      usarDadosDoApp: [
        "Use linhas de extrato com `source_ref`, `source_file_name` e `source_file_hash` para amarrar o arquivo de origem.",
        "Anote na tela Transações observações de protocolo (data, atendente, número SAC).",
      ],
      fontesConsulta: [
        { label: "BCB — Regulamentação e cidadania financeira", href: "https://www.bcb.gov.br/estabilidadefinanceira/buscanormas" },
        { label: "Consumidor.gov.br", href: "https://www.consumidor.gov.br/" },
      ],
    },
    {
      titulo: "Venda casada e produtos atrelados ao empréstimo",
      subtitulo: "Seguro, cartão ou pacote “obrigatório” sem alternativa real.",
      texto: [
        "Condições que tornam o empréstimo dependente de produto acessório sem opção plausível costumam ser debatidas sob enfoque consumerista e prova documental.",
        "Guarde e-mail, áudio, print de tela e o contrato assinado; confronte com o contracheque (desconto com código e descrição).",
      ],
      temas: ["venda_casada", "consignado", "contracheque"],
      usarDadosDoApp: [
        "Na aba Contracheque, identifique rubricas de seguro/cartão com o mesmo prazo do empréstimo.",
        "Importe extrato do período do fechamento do crédito para ver lançamentos duplicados ou nomes comerciais diferentes.",
      ],
      fontesConsulta: [
        { label: "Senado — Texto e histórico CDC (referência legislativa)", href: "https://www25.senado.leg.br/web/atividade/materias/-/materia/127071" },
        { label: "Procon estadual (lista IBRACON)", href: "https://www.procon.sp.gov.br/" },
      ],
    },
    {
      titulo: "Juros, encargos e revisão de cláusulas no CDC",
      subtitulo: "Quando a discussão passa por abusividade e equilíbrio contratual.",
      texto: [
        "A defesa do consumidor em crédito bancário frequentemente envolve prova de condições de mercado, histórico de pagamento e clareza da taxa efetiva.",
        "Sem contracheque (ou ficha financeira) e extrato organizados, fica difícil demonstrar o impacto real na renda familiar — o app existe para reduzir esse ruído.",
      ],
      temas: ["juros_encargos", "negociacao", "extrato"],
      usarDadosDoApp: [
        "Mantenha PDF de contracheque e extrato do mesmo mês em pastas por competência (YYYY-MM).",
        "Use Análise IA sobre o período já fechado para resumir pressão de despesas vs. renda.",
      ],
      fontesConsulta: [
        { label: "STJ — Portal principal (acesso à jurisprudência)", href: "https://www.stj.jus.br/" },
        { label: "BCB — Registro de reclamações de consumidores", href: "https://www.bcb.gov.br/acessoinformacao/registrarreclamacao" },
      ],
    },
    {
      titulo: "Superendividamento e trilhas de renegociação",
      subtitulo: "Lei 14.181/2021 e condutas de credores — organização de passivos.",
      texto: [
        "A legislação recente reforça deveres de análise de crédito e possibilidades de reestruturação; a prova costuma ser a renda líquida histórica e o endividamento consolidado.",
        "Liste consignados da folha, cartões pelo extrato e empréstimos cadastrados manualmente para ver percentual sobre o líquido.",
      ],
      temas: ["superendividamento", "negociacao", "consignado"],
      usarDadosDoApp: [
        "Painel Contracheque: somatório automático das rubricas bancárias por competência.",
        "Transações: marque acordos, carência e valores de entrada para mediação futura.",
      ],
      fontesConsulta: [
        {
          label: "Planalto — Lei 14.181/2021 (texto legal)",
          href: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14181.htm",
        },
        { label: "Consumidor.gov.br — mediação administrativa", href: "https://www.consumidor.gov.br/" },
      ],
    },
    {
      titulo: "Canais regulatórios: Bacen e Procon com dossiê objetivo",
      subtitulo: "Como aumentar chances de resposta rápida com números, não narrativa solta.",
      texto: [
        "Reclamações bem sucedidas costumam trazer valores exatos (parcela, CET, número de contrato), linha do tempo e comprovação do prejuízo na folha.",
        "Este app já centraliza parte desse material: use como índice e anexe PDFs na plataforma do órgão.",
      ],
      temas: ["bacen_procon", "extrato", "contracheque"],
      usarDadosDoApp: [
        "Exporte relatório mental das telas Contracheque + Transações (por mês) antes de registrar no Bacen/consumidor.gov.",
      ],
      fontesConsulta: [
        { label: "Banco Central — Registro de reclamação do consumidor", href: "https://www.bcb.gov.br/acessoinformacao/registrarreclamacao" },
        { label: "consumidor.gov.br", href: "https://www.consumidor.gov.br/" },
      ],
    },
  ];

  const out: BoletimMes[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const b = base[i]!;
    out.push({
      id: `boletim-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      mes: d.getMonth() + 1,
      ano: d.getFullYear(),
      ...b,
    });
  }
  return out;
}

export const CHECKLIST_DEFESA_CONSUMIDOR: readonly ItemChecklist[] = [
  {
    id: "c1",
    grupo: "Evidências na folha",
    texto: "Tenho PDF do contracheque da competência em que a contestação começou",
    temaRelacionado: ["contracheque", "consignado"],
    ajuda: "Importe em Contracheque; confira totais oficiais antes de salvar.",
  },
  {
    id: "c2",
    grupo: "Evidências na folha",
    texto: "As rubricas de consignado trazem banco, parcela e valor coerentes com o contrato",
    temaRelacionado: ["consignado", "margem"],
  },
  {
    id: "c3",
    grupo: "Evidências na folha",
    texto: "Identifiquei possível venda casada (seguro/cartão atrelado sem alternativa documentada)",
    temaRelacionado: ["venda_casada"],
  },
  {
    id: "c4",
    grupo: "Extrato e encargos",
    texto: "Importei extrato do mesmo período do empréstimo ou da tarifa contestada",
    temaRelacionado: ["extrato", "informacao_tarifas"],
  },
  {
    id: "c5",
    grupo: "Extrato e encargos",
    texto: "Conferi se tarifas/IOF/CET batem com o que foi explicado na contratação",
    temaRelacionado: ["juros_encargos", "informacao_tarifas"],
  },
  {
    id: "c6",
    grupo: "Endividamento",
    texto: "Calculei consignados da folha + dívidas fora da folha vs. minha renda líquida",
    temaRelacionado: ["superendividamento", "margem"],
  },
  {
    id: "c7",
    grupo: "Endividamento",
    texto: "Cadastrei empréstimos manuais ativos para não subestimar comprometimento",
    temaRelacionado: ["consignado", "negociacao"],
  },
  {
    id: "c8",
    grupo: "Protocolo",
    texto: "Registrei em Transações data e número de protocolo do banco/Procon/Bacen",
    temaRelacionado: ["bacen_procon"],
  },
  {
    id: "c9",
    grupo: "Protocolo",
    texto: "Guardei comprovante de envio (PDF, print ou e-mail) em pasta por competência",
    temaRelacionado: ["bacen_procon"],
  },
  {
    id: "c10",
    grupo: "Próximos passos",
    texto: "Revisei o conteúdo com advogado ou Defensoria antes de aceitar acordo final",
    temaRelacionado: ["negociacao", "juros_encargos"],
    ajuda: "O app não substitui orientação profissional.",
  },
];

export const TEMA_LABEL: Record<BoletimTema, string> = {
  consignado: "Consignado",
  margem: "Margem",
  extrato: "Extrato",
  contracheque: "Contracheque",
  superendividamento: "Superendividamento",
  negociacao: "Negociação / mediação",
  juros_encargos: "Juros e encargos",
  venda_casada: "Venda casada",
  informacao_tarifas: "Informação e tarifas",
  bacen_procon: "Bacen / Procon / consumidor.gov",
};
