/**
 * Tipos do módulo de Triagem Inteligente — perguntas dinâmicas para resolver
 * dúvidas de leitura (desconto fracionado, falso refin, duplicidade, etc.).
 */

export const TIPOS_PROBLEMA_TRIAGEM = [
  "desconto_fracionado",
  "possivel_refinanciamento",
  "contrato_duplicado",
  "contrato_unico",
  "cartao_saque_embutido",
  "rmc_rcc",
  "divergencia_valor",
  "margem_ultrapassada",
  "contrato_sem_anexo",
  "desconto_sem_contrato",
  "contrato_sem_desconto",
  "salario_duplicado_extrato",
  "transferencia_propria",
  "pix_desconhecido",
  "emprestimo_creditado_extrato",
  "seguro_embutido",
  "venda_casada",
  "juros_abusivos",
  "outro",
] as const;

export type TipoProblemaTriagem = (typeof TIPOS_PROBLEMA_TRIAGEM)[number];

export const NIVEIS_LEITURA = ["basico", "intermediario", "avancado", "especialista"] as const;

export type NivelLeitura = (typeof NIVEIS_LEITURA)[number];

export const ROTULOS_NIVEL_LEITURA: Record<NivelLeitura, string> = {
  basico: "Básico",
  intermediario: "Intermediário",
  avancado: "Avançado",
  especialista: "Especialista",
};

export type TipoRespostaTriagem =
  | "sim_nao"
  | "multipla_escolha"
  | "valor"
  | "data"
  | "texto"
  | "upload"
  | "selecao_contrato"
  | "selecao_banco";

export type PerguntaTriagem = {
  id: string;
  tipo_problema: TipoProblemaTriagem;
  nivel: NivelLeitura;
  pergunta: string;
  ajuda?: string;
  tipo_resposta: TipoRespostaTriagem;
  opcoes?: string[];
  regra_acionada_se?: Record<string, unknown>;
  proxima_pergunta_se?: Record<string, string>;
  efeito_resposta: string;
};

export type ContextoTriagem = {
  entidade_tipo: "pendencia" | "linha_base" | "contrato" | "transacao" | "outro";
  entidade_id: string;
  tipo_problema: TipoProblemaTriagem;
  competencia?: string | null;
  banco?: string | null;
  valor_esperado?: number | null;
  valor_observado?: number | null;
  descricao?: string | null;
  id_consignacao?: string | null;
  metadados?: Record<string, unknown>;
};

export type RespostasTriagem = Record<string, string>;

export type ResultadoResolucaoTriagem = {
  resolvido: boolean;
  nova_classificacao: string;
  nivel_confianca: number;
  remover_pendencia: boolean;
  manter_pendencia: boolean;
  motivo: string;
  campos_corrigidos: Record<string, unknown>;
  proxima_acao: string;
  sugerir_especialista?: boolean;
  registrar_padrao?: boolean;
};

export type TriagemRespostaPersistida = {
  id: string;
  user_id?: string;
  tipo_problema: TipoProblemaTriagem;
  nivel: NivelLeitura;
  entidade_tipo: string;
  entidade_id: string;
  pergunta_id: string;
  pergunta: string;
  resposta: unknown;
  resultado: ResultadoResolucaoTriagem;
  resolvido: boolean;
  remover_pendencia: boolean;
  criado_em: string;
};

export type PadraoAprendidoTriagem = {
  id: string;
  user_id?: string;
  tipo_problema: TipoProblemaTriagem;
  condicoes: Record<string, unknown>;
  acao_recomendada: string;
  nivel_confianca: number;
  ativo: boolean;
  criado_em: string;
};

export type TriagemResolvidaLocal = {
  entidade_id: string;
  tipo_problema: TipoProblemaTriagem;
  resultado: ResultadoResolucaoTriagem;
  respostas: RespostasTriagem;
  atualizado_em: string;
};

export const ROTULOS_TIPO_PROBLEMA: Record<TipoProblemaTriagem, string> = {
  desconto_fracionado: "Desconto fracionado na folha",
  possivel_refinanciamento: "Possível refinanciamento",
  contrato_duplicado: "Contrato duplicado",
  contrato_unico: "Contrato único / independente",
  cartao_saque_embutido: "Cartão / saque embutido",
  rmc_rcc: "RMC / RCC",
  divergencia_valor: "Divergência de valor",
  margem_ultrapassada: "Margem ultrapassada",
  contrato_sem_anexo: "Contrato sem anexo",
  desconto_sem_contrato: "Desconto sem contrato oficial",
  contrato_sem_desconto: "Contrato sem desconto em folha",
  salario_duplicado_extrato: "Salário duplicado com extrato",
  transferencia_propria: "Transferência própria",
  pix_desconhecido: "PIX desconhecido",
  emprestimo_creditado_extrato: "Empréstimo creditado no extrato",
  seguro_embutido: "Seguro embutido",
  venda_casada: "Venda casada",
  juros_abusivos: "Juros possivelmente abusivos",
  outro: "Outro",
};
