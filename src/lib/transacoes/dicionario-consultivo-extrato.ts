/**
 * Dicionário consultivo de termos típicos em extratos bancários (BR).
 *
 * - **Receitas**: prioriza subtipos `Salário` e `Freelance` quando a descrição é explícita;
 *   mantém `Receita` para PIX/TED/pagamento recebido genérico.
 * - **Despesas**: fragmentos adicionais às regras fixas do classificador (marcas, serviços, lazer, pets).
 *
 * Ao incluir frases: preferir trechos que raramente aparecem em “falso positivo”
 * (ex.: evitar “99” sozinho — usar “99 app”, “99pay”).
 */

import type { Category } from "@/types";

export type BlocoConsultivoReceita = {
  /** Texto curto para quem edita o glossário (não entra no match). */
  consultivo: string;
  categoria: Extract<Category, "Salário" | "Freelance" | "Receita">;
  /** Maior = avaliado primeiro (mais específico). */
  prioridade: number;
  confiancaPct: number;
  frases: readonly string[];
};

/**
 * Regras de entrada: ordem efetiva = `prioridade` decrescente, depois primeira frase que der match.
 */
export const BLOCOS_RECEITA_CONSULTIVO: readonly BlocoConsultivoReceita[] = [
  {
    consultivo: "Remuneração militar / corporação (texto de extrato comum).",
    categoria: "Salário",
    prioridade: 96,
    confiancaPct: 91,
    frases: ["soldo", "soldos"],
  },
  {
    consultivo: "Trabalho com vínculo / folha / depósitos típicos de salário.",
    categoria: "Salário",
    prioridade: 94,
    confiancaPct: 93,
    frases: [
      "salário",
      "salario",
      "ordenado",
      "folha de pagamento",
      "folha pagamento",
      "deposito salarial",
      "depósito salarial",
      "adiantamento salarial",
      "adianta salarial",
      "13 salário",
      "13 salario",
      "decimo terceiro",
      "décimo terceiro",
      "ferias proporcionais",
      "férias proporcionais",
      "rescisão trabalhista",
      "rescissao trabalhista",
      "contracheque",
      "vale transporte empresa",
      "deposito empresa",
      "deposito fgts",
    ],
  },
  {
    consultivo: "Autônomo / MEI / serviços PJ e recebimentos típicos de trabalho informal formalizado.",
    categoria: "Freelance",
    prioridade: 92,
    confiancaPct: 88,
    frases: [
      "honorarios",
      "honorários",
      "servicos prestados",
      "serviços prestados",
      "pix mei",
      "recebimento mei",
      "mei -",
      "- mei",
      "mei empresa",
      "prestacao de servico",
      "prestação de serviço",
      "nota fiscal de servico",
      "nota fiscal de serviço",
      "nfs-e",
      "nfse",
      "rps ",
      "rpa ",
      "payoneer",
      "mercado pago recebimentos",
      "recebimento mercado livre",
    ],
  },
  {
    consultivo: "Transferências e créditos genéricos (mantém categoria ampla Receita).",
    categoria: "Receita",
    prioridade: 70,
    confiancaPct: 90,
    frases: [
      "transferencia recebida",
      "transferência recebida",
      "pix recebido",
      "pagamento recebido",
      "credito TED",
      "crédito ted",
      "ted recebido",
      "credito DOC",
      "doc recebido",
    ],
  },
  {
    consultivo: "Rendimentos de conta / estornos como entrada.",
    categoria: "Receita",
    prioridade: 62,
    confiancaPct: 84,
    frases: [
      "rendimento aplicacao",
      "rendimento de aplicacao",
      "rendimento cdb",
      "juros conta",
      "cashback recebido",
      "valor estornado",
      "estorno de compra",
      "devolução pix",
      "devolucao pix",
      "restituição IR",
      "restituicao ir",
    ],
  },
];

/** Estrutura espelha {@link ./classificador-palavras-chave.ts} — mesclado em `REGRAS_DESPESA`. */
export type FragmentoRegraDespesaDicionario = Readonly<{
  tier: 1 | 2 | 3 | 4;
  frases: readonly string[];
  palavrasInteiras?: readonly string[];
  categoria: Category;
  forca: "forte" | "media";
  etiquetaMotivo?: string;
  prioridade: number;
}>;

/**
 * Despesas adicionais (streaming, pets, educação digital, varejo, etc.).
 * Prioridades escolhidas para não furar regras já fortes (IFOOD, UBER, …).
 */
export const FRAGMENTOS_DESPESA_DICIONARIO: readonly FragmentoRegraDespesaDicionario[] = [
  /* Lazer / assinaturas */
  { tier: 1, frases: ["netflix"], prioridade: 8212, categoria: "Lazer", forca: "forte", etiquetaMotivo: "NETFLIX" },
  { tier: 1, frases: ["spotify"], prioridade: 8211, categoria: "Lazer", forca: "forte", etiquetaMotivo: "SPOTIFY" },
  { tier: 1, frases: ["disney plus", "disney+"], prioridade: 8210, categoria: "Lazer", forca: "forte" },
  { tier: 1, frases: ["prime video", "amazon prime"], prioridade: 8209, categoria: "Lazer", forca: "forte" },
  { tier: 1, frases: ["hbo max", "max.com"], prioridade: 8208, categoria: "Lazer", forca: "forte" },
  { tier: 1, frases: ["globoplay", "paramount+"], prioridade: 8207, categoria: "Lazer", forca: "forte" },
  { tier: 1, frases: ["youtube premium"], prioridade: 8206, categoria: "Lazer", forca: "forte" },
  { tier: 1, frases: ["deezer"], prioridade: 8205, categoria: "Lazer", forca: "forte" },
  { tier: 1, frases: ["ingresso.com", "sympla", "eventim"], prioridade: 8203, categoria: "Lazer", forca: "media" },
  { tier: 1, frases: ["steam games", "steampowered"], prioridade: 8202, categoria: "Lazer", forca: "media", etiquetaMotivo: "STEAM" },
  {
    tier: 1,
    palavrasInteiras: ["steam"],
    frases: [],
    prioridade: 8201,
    categoria: "Lazer",
    forca: "media",
    etiquetaMotivo: "STEAM",
  },

  /* Pets */
  {
    tier: 1,
    frases: [
      "pet shop",
      "petshop",
      "petz ",
      "cobasi",
      "petlove",
      "zeedog",
      "zee.dog",
      "racão",
      "racao ",
      "veterinário",
      "veterinario",
      "clinica veterinária",
      "clínica veterinária",
    ],
    prioridade: 8188,
    categoria: "Pets",
    forca: "forte",
    etiquetaMotivo: "PETS",
  },

  /* Mercado — redes conhecidas */
  {
    tier: 1,
    frases: [
      "carrefour",
      "atacadao",
      "atacadão",
      "assai ",
      "pão de açúcar",
      "pao de acucar",
      "extra hiper",
      "makro ",
      "sams club",
      "sam's club",
    ],
    prioridade: 8172,
    categoria: "Mercado",
    forca: "forte",
    etiquetaMotivo: "VAREJO",
  },

  /* Alimentação — delivery / vale */
  {
    tier: 1,
    frases: ["rappi", "zé delivery", "ze delivery", "ifood shop", "alelo refeição", "alelo refeicao", "vr refeição", "vr refeicao"],
    prioridade: 8195,
    categoria: "Alimentação",
    forca: "forte",
    etiquetaMotivo: "DELIVERY/VALE",
  },

  /* Transporte — apps */
  {
    tier: 1,
    frases: ["99 app", "99app", "99 pay", "99pay", "99 pop", "99pop", "indriver", "in driver", "bolt "],
    prioridade: 8193,
    categoria: "Transporte",
    forca: "forte",
    etiquetaMotivo: "APP MOBILIDADE",
  },

  /* Educação — plataformas */
  {
    tier: 1,
    frases: [
      "hotmart",
      "udemy",
      "alura",
      "rocketseat",
      "descomplica",
      "coursera",
      "ensino a distancia",
      "ensino a distância",
      "educacao a distancia",
      "educação a distância",
      "curso online",
    ],
    prioridade: 3145,
    categoria: "Educação",
    forca: "media",
    etiquetaMotivo: "CURSO/PLATAFORMA",
  },

  /* Conta de consumo — software / nuvem */
  {
    tier: 1,
    frases: [
      "microsoft 365",
      "office 365",
      "google one",
      "icloud",
      "dropbox",
      "notion ",
      "openai",
      "chatgpt",
      "github copilot",
      "adobe ",
      "canva ",
    ],
    prioridade: 3125,
    categoria: "Conta de consumo",
    forca: "media",
    etiquetaMotivo: "ASSINATURA DIGITAL",
  },

  /* Saúde — operadoras (plano) */
  {
    tier: 1,
    frases: [
      "unimed ",
      "amil ",
      "sulamerica",
      "sul américa",
      "bradesco saude",
      "bradesco saúde",
      "notre dame intermedica",
      "plano de saude",
      "plano de saúde",
      "mensalidade plano",
    ],
    prioridade: 8042,
    categoria: "Saúde",
    forca: "media",
    etiquetaMotivo: "PLANO SAÚDE",
  },

  /* Moradia — complemento */
  {
    tier: 1,
    frases: [
      "condomínio",
      "taxa condominial",
      "taxa de condomínio",
      "água e esgoto",
      "agua e esgoto",
      "conta de luz",
      "pagamento luz",
      "energia eletrica",
      "energia elétrica",
      "lavanderia",
      "tinturaria",
      "tinturária",
    ],
    prioridade: 3152,
    categoria: "Moradia",
    forca: "media",
    etiquetaMotivo: "MORADIA",
  },
];
