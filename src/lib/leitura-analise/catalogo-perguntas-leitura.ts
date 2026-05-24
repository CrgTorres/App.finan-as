/**
 * Perguntas práticas derivadas de dificuldades reais do projeto.
 * Atualize `CATALOGO_PERGUNTAS_LEITURA_VERSION` ao incluir/alterar perguntas.
 */

export const CATALOGO_PERGUNTAS_LEITURA_VERSION = 3;

export type OpcaoPerguntaLeitura = {
  valor: string;
  rotulo: string;
  /** Explica o efeito da escolha (transparência para o usuário). */
  efeito: string;
};

export type PerguntaLeituraCatalogo = {
  id: string;
  ordem: number;
  pergunta: string;
  /** Por que o sistema pergunta isso (contexto do desenvolvimento). */
  origemSistema: string;
  obrigatoria: boolean;
  opcoes: OpcaoPerguntaLeitura[];
  /** Tags para agrupar na UI. */
  grupo: "fontes" | "folha" | "consigfacil" | "refin" | "margem" | "conferencia";
};

/**
 * Catálogo central — novas questões entram aqui com `ordem` e `origemSistema` claros.
 */
export const CATALOGO_PERGUNTAS_LEITURA: PerguntaLeituraCatalogo[] = [
  {
    id: "fonte_consigfacil",
    ordem: 1,
    grupo: "fontes",
    pergunta: "Você importa snapshots do portal ConsigFácil (Governo AM)?",
    origemSistema:
      "Sem ConsigFácil o sistema inferia refinanciamento só por banco/data/parcela e gerava falsos positivos (ex.: múltiplos contratos Daycoval no mesmo servidor).",
    obrigatoria: true,
    opcoes: [
      { valor: "sim_regular", rotulo: "Sim, uso como base oficial", efeito: "Habilita auditoria oficial e match com códigos do portal." },
      { valor: "sim_parcial", rotulo: "Sim, mas nem sempre atualizado", efeito: "Modo consignado com tolerâncias um pouco maiores." },
      { valor: "nao", rotulo: "Ainda não / não tenho acesso", efeito: "Leitura padrão ou básica — sem regras de contrato único ConsigFácil." },
    ],
  },
  {
    id: "descontos_quebrados_folha",
    ordem: 2,
    grupo: "folha",
    pergunta:
      "No contracheque aparecem descontos do MESMO banco/código em valores menores que somam a parcela oficial?",
    origemSistema:
      "Quebra por margem >30%, suspensão parcial ou desconto fracionado gerava pendências falsas de duplicidade e refinanciamento.",
    obrigatoria: true,
    opcoes: [
      { valor: "frequente", rotulo: "Sim, é comum neste vínculo", efeito: "Ativa conciliação de desconto fracionado por margem (tolerância R$2 / 1%)." },
      { valor: "as_vezes", rotulo: "Às vezes, em meses específicos", efeito: "Aceita fracionado com tolerância padrão." },
      { valor: "nunca", rotulo: "Não / cada linha é uma parcela inteira", efeito: "Trata cada desconto como linha independente." },
    ],
  },
  {
    id: "refin_mesmo_banco_indicio_oficial",
    ordem: 3,
    grupo: "refin",
    pergunta:
      "Quando houver contratos do mesmo banco em datas próximas, o sistema deve considerar refinanciamento apenas se houver indício oficial?",
    origemSistema:
      "No caso Carlos Torres, contratos com mesmo banco e datas próximas foram confirmados como operações únicas quando possuem códigos, parcelas e sequências diferentes no ConsigFácil. Essa pergunta evita falso refinanciamento.",
    obrigatoria: true,
    opcoes: [
      {
        valor: "sim_exigir_oficial",
        rotulo: "Sim, exigir indício oficial",
        efeito:
          "exigir_indicio_oficial=true, minimo_indicios=3, mesmo_banco_data_proxima_nao_basta=true.",
      },
      {
        valor: "nao_inferencia",
        rotulo: "Não, permitir inferência automática",
        efeito: "Permite refin por proximidade de banco/data com menos restrições.",
      },
      {
        valor: "sempre_conferencia",
        rotulo: "Sempre mandar para conferência",
        efeito: "Não marca refin automático; pendências vão para conferência manual.",
      },
    ],
  },
  {
    id: "desconto_fracionado_soma_parcela",
    ordem: 4,
    grupo: "folha",
    pergunta:
      "Se descontos pequenos/quebrados somarem exatamente a parcela oficial, o sistema deve conciliar automaticamente?",
    origemSistema:
      "Alguns descontos aparecem quebrados por margem, suspensão parcial ou ajuste operacional. Se a soma fecha com a parcela oficial ConsigFácil, não deve virar pendência.",
    obrigatoria: true,
    opcoes: [
      {
        valor: "sim_auto",
        rotulo: "Sim, conciliar automaticamente",
        efeito:
          "aceitar_desconto_fracionado=true, tolerância R$2/1%, remove da conferência quando conciliado.",
      },
      {
        valor: "nao_conferencia",
        rotulo: "Não, manter para conferência",
        efeito: "Cada desconto permanece pendente até revisão manual.",
      },
      {
        valor: "so_tolerancia",
        rotulo: "Conciliar apenas até tolerância",
        efeito: "Concilia só se diferença ≤ tolerância configurada.",
      },
    ],
  },
  {
    id: "multiplos_contratos_mesmo_banco",
    ordem: 5,
    grupo: "consigfacil",
    pergunta:
      "Existem vários contratos ATIVOS do mesmo banco com datas próximas e parcelas parecidas?",
    origemSistema:
      "O detector antigo marcava refinanciamento automático só por proximidade — descartado após conferência ConsigFácil (contratos únicos).",
    obrigatoria: true,
    opcoes: [
      { valor: "sim_oficiais_distintos", rotulo: "Sim, mas códigos/parcelas oficiais são diferentes", efeito: "Regra de contrato único confirmado; não marcar refin sem indício oficial." },
      { valor: "sim_pode_ser_refin", rotulo: "Sim e acredito que um substituiu o outro", efeito: "Permite detector de refin com indícios fortes." },
      { valor: "nao", rotulo: "Não / um contrato por banco", efeito: "Detector de refin mais simples." },
    ],
  },
  {
    id: "refin_sem_texto_portal",
    ordem: 6,
    grupo: "refin",
    pergunta:
      "Já houve suspeita de refinanciamento SEM texto oficial no portal (só mesmo banco + data)?",
    origemSistema:
      "Regra atual: mínimo 3 indícios e ≥1 forte (suspenso, quitado, portabilidade, vínculo explícito).",
    obrigatoria: true,
    opcoes: [
      { valor: "sim_gerou_erro", rotulo: "Sim, e o sistema errou", efeito: "Exige indício oficial; descarta refin por proximidade." },
      { valor: "sim_acertou", rotulo: "Sim, e faz sentido marcar", efeito: "Mantém detector com indícios fortes." },
      { valor: "nao", rotulo: "Não se aplica", efeito: "Configuração neutra." },
    ],
  },
  {
    id: "ocr_rubricas",
    ordem: 7,
    grupo: "folha",
    pergunta: "O OCR do contracheque renomeia rubricas ou gera códigos ilegíveis?",
    origemSistema:
      "Pendências de análise marcam OCR fraco, rubrica renomeada e limite de tokens — exigem revisão guiada.",
    obrigatoria: true,
    opcoes: [
      { valor: "grave", rotulo: "Sim, frequentemente", efeito: "Não confia em inferência fraca; mais itens em conferência." },
      { valor: "leve", rotulo: "Poucos erros pontuais", efeito: "Aceita inferência com revisão amostral." },
      { valor: "nao", rotulo: "Leitura estável / digito manual", efeito: "Pode automatizar mais." },
    ],
  },
  {
    id: "cartao_rmc_rcc",
    ordem: 8,
    grupo: "consigfacil",
    pergunta: "Há cartão consignado, RMC, RCC ou saque embutido na folha?",
    origemSistema:
      "Modalidades com margem diferente e confirmação obrigatória; patch payslips cartão saque embutido.",
    obrigatoria: true,
    opcoes: [
      { valor: "sim_varios", rotulo: "Sim, mais de um tipo", efeito: "Exige confirmação e pendência se sem vínculo loan." },
      { valor: "sim_um", rotulo: "Sim, apenas um tipo", efeito: "Conferência focada em cartão/RMC." },
      { valor: "nao", rotulo: "Só empréstimo consignado comum", efeito: "Ignora regras específicas de cartão." },
    ],
  },
  {
    id: "margem_acima_30",
    ordem: 9,
    grupo: "margem",
    pergunta: "A margem consignável já passou de 30% ou houve suspensão parcial de desconto?",
    origemSistema:
      "Margem histórica unificada e descontos fracionados no mesmo mês competência.",
    obrigatoria: true,
    opcoes: [
      { valor: "sim", rotulo: "Sim", efeito: "Prioriza soma de descontos quebrados e histórico de margem." },
      { valor: "nao_sei", rotulo: "Não sei / preciso conferir", efeito: "Modo cauteloso para margem." },
      { valor: "nao", rotulo: "Não", efeito: "Sem ajuste especial de margem." },
    ],
  },
  {
    id: "extrato_bancario",
    ordem: 10,
    grupo: "fontes",
    pergunta: "Você importa extrato bancário para cruzar com a folha?",
    origemSistema:
      "Conciliação folha × extrato e pagamentos de empréstimo no extrato.",
    obrigatoria: true,
    opcoes: [
      { valor: "sim_completo", rotulo: "Sim, período completo", efeito: "Prioriza cruzamento extrato; match mais exigente." },
      { valor: "sim_parcial", rotulo: "Sim, só alguns meses", efeito: "Cruzamento parcial." },
      { valor: "nao", rotulo: "Não", efeito: "Análise centrada em contracheque + ConsigFácil." },
    ],
  },
  {
    id: "folhas_multiplas",
    ordem: 11,
    grupo: "folha",
    pergunta: "Há mais de um tipo de folha (normal, especial, férias, 13º)?",
    origemSistema:
      "Competências duplicadas e fundir anexos geram pendência de duplicidade na análise.",
    obrigatoria: true,
    opcoes: [
      { valor: "sim", rotulo: "Sim", efeito: "Alerta duplicidade entre competências." },
      { valor: "nao", rotulo: "Só folha mensal padrão", efeito: "Menos filtros de duplicidade." },
    ],
  },
  {
    id: "tolerancia_valor",
    ordem: 12,
    grupo: "conferencia",
    pergunta:
      "Qual diferença de valor (R$) entre folha e ConsigFácil você aceita sem revisar manualmente?",
    origemSistema:
      "Parâmetro config.conciliacao.tolerancia_valor (padrão R$ 2,00 no caso desconto fracionado).",
    obrigatoria: true,
    opcoes: [
      { valor: "2", rotulo: "Até R$ 2,00 (recomendado)", efeito: "Tolerância oficial do projeto." },
      { valor: "5", rotulo: "Até R$ 5,00", efeito: "Menos pendências; risco de passar divergência real." },
      { valor: "0", rotulo: "Zero — qualquer centavo reviso", efeito: "Modo avançado: tudo vira pendência." },
    ],
  },
  {
    id: "modo_conferencia",
    ordem: 13,
    grupo: "conferencia",
    pergunta: "Como prefere a lista final de conferência?",
    origemSistema:
      "Filtro pendenciasConferenciaReais remove contratos únicos e descontos fracionados já conciliados.",
    obrigatoria: true,
    opcoes: [
      { valor: "so_pendencias_reais", rotulo: "Só pendências reais (recomendado)", efeito: "Oculta falsos positivos já resolvidos pela auditoria." },
      { valor: "todas_linhas", rotulo: "Ver todas as linhas em revisão", efeito: "Mostra também possíveis duplicidades não resolvidas." },
      { valor: "manual_total", rotulo: "Quero revisar tudo manualmente", efeito: "Nível avançado; score alto para automação." },
    ],
  },
  {
    id: "visualizacao_triagem_consolidada",
    ordem: 14,
    grupo: "conferencia",
    pergunta: "Na triagem resolutiva, usar visualização consolidada inteligente?",
    origemSistema:
      "Agrupa ocorrências automáticas iguais (banco, competência, motivo) em um único card contextual.",
    obrigatoria: false,
    opcoes: [
      {
        valor: "sim",
        rotulo: "Sim — central contextual (recomendado)",
        efeito: "Oculta linhas repetidas já resolvidas pelo motor; mostra contextos consolidados.",
      },
      {
        valor: "nao",
        rotulo: "Não — listar cada linha",
        efeito: "Mantém todos os cards individuais na fila.",
      },
    ],
  },
  {
    id: "evidencias_contrato",
    ordem: 15,
    grupo: "conferencia",
    pergunta: "Contratos sem PDF/anexo de evidência devem bloquear a conciliação?",
    origemSistema:
      "Pendência sem_evidencia e fluxo de anexos em empréstimos.",
    obrigatoria: true,
    opcoes: [
      { valor: "sim", rotulo: "Sim, exijo evidência", efeito: "Pendência até anexar contrato." },
      { valor: "emprestimo_confirmado_basta", rotulo: "Cadastro + ConsigFácil bastam", efeito: "Evidência opcional se match alto." },
      { valor: "nao", rotulo: "Não bloquear", efeito: "Segue só com dados oficiais/folha." },
    ],
  },
];

export function respostasPadraoFormulario(): Record<string, string> {
  const padrao: Record<string, string> = {};
  for (const p of CATALOGO_PERGUNTAS_LEITURA) {
    padrao[p.id] = p.opcoes[0]?.valor ?? "";
  }
  return padrao;
}
