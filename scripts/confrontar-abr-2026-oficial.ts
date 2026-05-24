/**
 * Confronto: contracheque oficial 04/2026 (SEAD) × parser + histórico simulado.
 * Executar: npx tsx scripts/confrontar-abr-2026-oficial.ts
 */
import { parseSeadPayslipText } from "../src/lib/anexos/sead-payslip-parse";
import {
  compararDescontosComHistorico,
  compararGanhosComHistorico,
  historicoDescontosPorChave,
  historicoGanhosPorChave,
} from "../src/lib/anexos/payslip-desconto-historico";
import type { Payslip } from "../src/types/contracheque";

/** Texto alinhado ao holerite oficial (camada de texto típica SEAD). */
const TEXTO_OFICIAL_ABR_2026 = `
GOVERNO DO ESTADO DO AMAZONAS
CONTRACHEQUE
DATA 04/2026
CODIGO DESCRICAO PARC INF BASE GANHOS DESCONTOS
0075 SOLDO H 220,00 4.743,30
0249 GRATIF.DE TROPA V 2.644,61
0413 DIF.DE REAJ.SALARIAL V 302,39
0585 GRATIF.DE CURSO 25% V 1.846,98
0621 GRAT.MOT.B-L.3725 V 353,12
0772 DIF.REAJ.SAL.S/PREV. V 5,00
0880 ETAPAS DEC.37055/16 Q 30,00 600,00
5253 IMPOSTO DE RENDA P 27,50 1.118,23
5813 B DAYCOVAL 002|120 V 149,00
5881 BANCOOB EMPRESTIMO 053|072 V 254,94
5897 DAYCOVAL EMP02 003|048 V 250,00
5904 BB-EMP 077|088 V 49,08
5945 DAYCOVAL EMP03 003|120 V 99,00
5990 MANUT.FAMIL.S/I.R.01 V 18,00 1.333,62
6392 AMAZONPREV FPPM V 1.001,41
6456 BANCOOB EMPRESTIMO 033|048 V 371,29
6511 CREDICESTA COMPRA 001|001 V 338,40
TOTAL DE GANHOS 10.495,40
TOTAL DE DESCONTOS 4.964,97
LIQUIDO 5.530,43
`;

/** Valores oficiais (imagem/PDF). */
const OFICIAL = {
  bruto: 10495.4,
  descontos: 4964.97,
  liquido: 5530.43,
  rubricas: [
    { code: "0075", desc: "SOLDO", tipo: "ganho" as const, valor: 4743.3, parc: null },
    { code: "0249", desc: "GRATIF.DE TROPA", tipo: "ganho" as const, valor: 2644.61, parc: null },
    { code: "0413", desc: "DIF.DE REAJ.SALARIAL", tipo: "ganho" as const, valor: 302.39, parc: null },
    { code: "0585", desc: "GRATIF.DE CURSO 25%", tipo: "ganho" as const, valor: 1846.98, parc: null },
    { code: "0621", desc: "GRAT.MOT.B-L.3725", tipo: "ganho" as const, valor: 353.12, parc: null },
    { code: "0772", desc: "DIF.REAJ.SAL.S/PREV.", tipo: "ganho" as const, valor: 5.0, parc: null },
    { code: "0880", desc: "ETAPAS DEC.37055/16", tipo: "ganho" as const, valor: 600.0, parc: null },
    { code: "5253", desc: "IMPOSTO DE RENDA", tipo: "desconto" as const, valor: 1118.23, parc: null },
    { code: "5813", desc: "B DAYCOVAL", tipo: "desconto" as const, valor: 149.0, parc: "002/120" },
    { code: "5881", desc: "BANCOOB EMPRESTIMO", tipo: "desconto" as const, valor: 254.94, parc: "053/072" },
    { code: "5897", desc: "DAYCOVAL EMP02", tipo: "desconto" as const, valor: 250.0, parc: "003/048" },
    { code: "5904", desc: "BB-EMP", tipo: "desconto" as const, valor: 49.08, parc: "077/088" },
    { code: "5945", desc: "DAYCOVAL EMP03", tipo: "desconto" as const, valor: 99.0, parc: "003/120" },
    { code: "5990", desc: "MANUT.FAMIL.S/I.R.01", tipo: "desconto" as const, valor: 1333.62, parc: null },
    { code: "6392", desc: "AMAZONPREV FPPM", tipo: "desconto" as const, valor: 1001.41, parc: null },
    { code: "6456", desc: "BANCOOB EMPRESTIMO", tipo: "desconto" as const, valor: 371.29, parc: "033/048" },
    { code: "6511", desc: "CREDICESTA COMPRA", tipo: "desconto" as const, valor: 338.4, parc: "001/001" },
  ],
};

function near(a: number, b: number, eps = 0.02): boolean {
  return Math.abs(a - b) <= eps;
}

function payslipHistoricoMarco2026(): Payslip[] {
  /** Histórico típico (março/2026) — parcelas anteriores. */
  const mk = (
    items: Array<{
      code: string;
      description: string;
      value: number;
      type: "vantagem" | "desconto";
      parcelaAtual?: number;
      parcelaTotal?: number;
    }>,
  ) =>
    ({
      month: 3,
      year: 2026,
      gross_salary: 10400,
      net_salary: 5480,
      total_discounts: 4920,
      items,
      folha_emit_kind: "ficha_import",
      document_kind: "ficha_financeira",
    }) as Payslip;

  return [
    mk([
      { code: "0075", description: "SOLDO", value: 4743.3, type: "vantagem" },
      { code: "0249", description: "GRATIF.DE TROPA", value: 2644.61, type: "vantagem" },
      { code: "0585", description: "GRATIF.DE CURSO 25%", value: 1846.98, type: "vantagem" },
      { code: "0880", description: "ETAPAS DEC.37055/16", value: 600, type: "vantagem" },
      { code: "5253", description: "IMPOSTO DE RENDA", value: 1100, type: "desconto" },
      {
        code: "5813",
        description: "B DAYCOVAL",
        value: 149,
        type: "desconto",
        parcelaAtual: 1,
        parcelaTotal: 120,
      },
      {
        code: "5881",
        description: "BANCOOB EMPRESTIMO",
        value: 254.94,
        type: "desconto",
        parcelaAtual: 52,
        parcelaTotal: 72,
      },
      {
        code: "5897",
        description: "DAYCOVAL EMP02",
        value: 250,
        type: "desconto",
        parcelaAtual: 2,
        parcelaTotal: 48,
      },
      {
        code: "5904",
        description: "BB-EMP",
        value: 49.08,
        type: "desconto",
        parcelaAtual: 76,
        parcelaTotal: 88,
      },
      {
        code: "5945",
        description: "DAYCOVAL EMP03",
        value: 99,
        type: "desconto",
        parcelaAtual: 2,
        parcelaTotal: 120,
      },
      { code: "5990", description: "MANUT.FAMIL.S/I.R.01", value: 1333.62, type: "desconto" },
      { code: "6392", description: "AMAZONPREV FPPM", value: 1001.41, type: "desconto" },
      {
        code: "6456",
        description: "BANCOOB EMPRESTIMO",
        value: 371.29,
        type: "desconto",
        parcelaAtual: 32,
        parcelaTotal: 48,
      },
    ]),
  ];
}

const parsed = parseSeadPayslipText(TEXTO_OFICIAL_ABR_2026);
const historico = payslipHistoricoMarco2026();
const histD = historicoDescontosPorChave(historico, { mes: 4, ano: 2026 });
const histG = historicoGanhosPorChave(historico, { mes: 4, ano: 2026 });
const cmpD = compararDescontosComHistorico(parsed.items, histD);
const cmpG = compararGanhosComHistorico(parsed.items, histG);

console.log("=== TOTAIS ===");
console.log({
  oficial: { bruto: OFICIAL.bruto, descontos: OFICIAL.descontos, liquido: OFICIAL.liquido },
  sistema: {
    bruto: parsed.grossSalary,
    descontos: parsed.totalDiscounts,
    liquido: parsed.netSalary,
  },
  okBruto: near(parsed.grossSalary, OFICIAL.bruto),
  okDesc: near(parsed.totalDiscounts, OFICIAL.descontos),
  okLiq: near(parsed.netSalary, OFICIAL.liquido),
});

console.log("\n=== RUBRICAS OFICIAL × SISTEMA ===");
const faltando: string[] = [];
const valorErrado: string[] = [];
const parcelaErrada: string[] = [];

for (const o of OFICIAL.rubricas) {
  const found = parsed.items.filter(
    (it) =>
      (it.code ?? "").replace(/\D/g, "").slice(-4) === o.code &&
      it.type === (o.tipo === "ganho" ? "vantagem" : "desconto"),
  );
  const it = found.find((x) => near(x.value, o.valor)) ?? found[0];
  if (!it) {
    faltando.push(`${o.code} ${o.desc}`);
    continue;
  }
  if (!near(it.value, o.valor)) {
    valorErrado.push(`${o.code}: oficial ${o.valor} sistema ${it.value} («${it.description}»)`);
  }
  if (o.parc) {
    const [a, t] = o.parc.split("/").map((x) => parseInt(x, 10));
    if (it.parcelaAtual !== a || it.parcelaTotal !== t) {
      parcelaErrada.push(
        `${o.code}: oficial ${o.parc} sistema ${it.parcelaAtual ?? "?"}/${it.parcelaTotal ?? "?"} desc=«${it.description}»`,
      );
    }
  }
}

console.log({ faltando, valorErrado, parcelaErrada, lidas: parsed.items.length });

console.log("\n=== ITENS LIDOS ===");
for (const it of parsed.items) {
  const par =
    it.parcelaAtual != null && it.parcelaTotal != null
      ? ` ${String(it.parcelaAtual).padStart(3, "0")}/${it.parcelaTotal}`
      : "";
  console.log(
    `${it.code ?? "----"} | ${it.type === "vantagem" ? "ganho" : "desc"} | ${it.value.toFixed(2)} |${par} ${it.description.slice(0, 48)}`,
  );
}

console.log("\n=== ALERTAS DESCONTOS (vs histórico mar/2026 simulado) ===");
for (const a of cmpD.alertas) {
  console.log(`L${a.idx + 1} [${a.nivel}] ${a.rubrica.slice(0, 40)} — ${a.mensagem}`);
}

console.log("\n=== ALERTAS GANHOS ===");
for (const a of cmpG.alertas) {
  console.log(`L${a.idx + 1} [${a.nivel}] ${a.rubrica.slice(0, 40)} — ${a.mensagem}`);
}

/** OCR degradado (como no print do utilizador). */
const TEXTO_OCR_RUIM = TEXTO_OFICIAL_ABR_2026.replace(/003\|048/g, "Jooo/048")
  .replace(/B DAYCOVAL 002\|120/g, "B DAYCOVAL loo")
  .replace(/053\|072/g, "losa/072");

const parsedOcr = parseSeadPayslipText(TEXTO_OCR_RUIM);
const cmpOcr = compararDescontosComHistorico(parsedOcr.items, histD);
console.log("\n=== OCR DEGRADADO — alertas desconto ===");
for (const a of cmpOcr.alertas) {
  console.log(`L${a.idx + 1} [${a.nivel}] ${a.rubrica.slice(0, 48)} — ${a.mensagem.slice(0, 80)}`);
}
