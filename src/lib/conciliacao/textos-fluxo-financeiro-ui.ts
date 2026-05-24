/**
 * Rótulos do painel de fluxo financeiro (ASCII + escapes Unicode).
 * Evita mojibake quando o bundler/servidor interpreta o fonte com encoding errado.
 */
export const FLUXO_FINANCEIRO_UI = {
  tituloCard: "Fluxo financeiro real",
  descricaoCard:
    "Camadas independentes: folha, banco e consignados n\u00e3o s\u00e3o somados entre si.",
  semDados:
    "Sem dados conciliados ainda. Anexe contracheques, importe extratos e cadastre contratos.",

  folha: {
    titulo: "Folha oficial",
    descricao:
      "Composi\u00e7\u00e3o da folha \u2014 eixo pr\u00f3prio, n\u00e3o soma com banco nem consignado.",
    recebido: "Recebido folha",
    bruto: "Bruto folha",
    liquido: "L\u00edquido folha",
  },

  banco: {
    titulo: "Fluxo banc\u00e1rio real",
    descricao: "Entradas e sa\u00eddas do extrato \u2014 eixo pr\u00f3prio.",
    liquido: "L\u00edquido banco",
    entradas: "Entradas banc\u00e1rias",
    saidas: "Sa\u00eddas banc\u00e1rias",
  },

  consignado: {
    titulo: "Passivo consign\u00e1vel",
    descricao:
      "Descontos de empr\u00e9stimo e cart\u00e3o \u2014 n\u00e3o mistura com folha bruta.",
    passivoMes: (valor: string) => `Passivo consign\u00e1vel no m\u00eas: ${valor}`,
    emprestimos: "Empr\u00e9stimos",
    cartaoRmc: "Cart\u00e3o / RMC / RCC / saque",
    cartaoSaque: "Cart\u00e3o / saque",
    fracionadoMargem: "Desconto fracionado por margem",
    fracionadoLegenda: "Fracionado margem",
  },

  operacional: {
    titulo: "Opera\u00e7\u00f5es estruturais",
    descricao: "Refinanciamento, portabilidade e eventos operacionais.",
    refinanciamentos: "Refinanciamentos",
    portabilidades: "Portabilidades",
    suspensoes: "Suspens\u00f5es (qtd.)",
    quitacoes: "Quita\u00e7\u00f5es (qtd.)",
  },
} as const;
