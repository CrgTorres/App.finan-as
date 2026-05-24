import type { Payslip, PayslipItem } from "@/types/contracheque";

export type AvisoDecimoTerceiro = {
  id: string;
  severidade: "info" | "aviso";
  titulo: string;
  detalhe: string;
};

function norm13(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Soma linhas típicas da 1.ª parcela do 13º em **ganhos** (folha de junho / folha especial). */
export function somaAdiantamentoPrimeiraParcela130(items: PayslipItem[]): number {
  let s = 0;
  for (const it of items) {
    if (it.type !== "vantagem" || it.value <= 0) continue;
    const code = (it.code ?? "").trim();
    const d = norm13(it.description);
    if (/^(0122|0933)\b/.test(code)) {
      s += it.value;
      continue;
    }
    if (
      /\b13[0oº]?\.?\s*salario\s*adiant|\b13[0oº]?\.?\s*sal\s*adiant|\bantec\b.*\b13[0oº]?\b|\b13[0oº]?\.?\s*sal\s*media/.test(d)
    ) {
      s += it.value;
    }
  }
  return s;
}

/** Desconto que **abate** o adiantamento já pago (dezembro — ex. 5390 DESC.13.SAL.ADIANT). */
export function somaAbateAdiantamento130Dezembro(items: PayslipItem[]): number {
  let s = 0;
  for (const it of items) {
    if (it.type !== "desconto" || it.value <= 0) continue;
    const code = (it.code ?? "").trim();
    const d = norm13(it.description);
    if (/^5390\b/.test(code) && /\b(desc\.?\s*13|adiant)/.test(d)) {
      s += it.value;
      continue;
    }
    if (/\bdesc\.?\s*13\b.*\badiant|\bdesc\s*13\.?\s*sal.*adiant/.test(d)) {
      s += it.value;
    }
  }
  return s;
}

export function isFolhaEspecialDecimoTerceiroParcialJunho(p: {
  month: number;
  year?: number;
  folha_emit_kind?: string | null;
  gross_salary?: number | null;
  net_salary?: number | null;
  total_discounts?: number | null;
  items?: PayslipItem[] | null;
}): boolean {
  if (p.month !== 6) return false;
  if ((p.folha_emit_kind ?? "mensal_principal") !== "folha_especial") return false;

  const items = p.items ?? [];
  const adiant = somaAdiantamentoPrimeiraParcela130(items);
  if (adiant <= 50) return false;

  const descontosItens = items
    .filter((it) => it.type === "desconto" && it.value > 0)
    .reduce((s, it) => s + it.value, 0);
  const descontosDeclarados = Number(p.total_discounts) || 0;
  const bruto = Number(p.gross_salary) || adiant;
  const liquido = Number(p.net_salary) || 0;

  if (descontosItens > Math.max(20, adiant * 0.05)) return false;
  if (descontosDeclarados > Math.max(20, bruto * 0.03)) return false;
  if (bruto > 0 && liquido > 0 && Math.abs(bruto - liquido) > Math.max(20, bruto * 0.03)) return false;

  return true;
}

export function filtrarPayslipsAnaliseSemAdiantamentoParcial130(payslips: Payslip[]): Payslip[] {
  return payslips.filter((p) => !isFolhaEspecialDecimoTerceiroParcialJunho(p));
}

function quaseIgual(a: number, b: number, tolFrac = 0.025, tolAbs = 8): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(a - b) <= Math.max(tolAbs, tolFrac * Math.max(a, b));
}

function preferirFolhaEspecialJunho(rows: Payslip[], ano: number): Payslip | null {
  const cands = rows.filter(
    (p) =>
      p.month === 6 &&
      p.year === ano &&
      ((p.folha_emit_kind ?? "mensal_principal") as string) === "folha_especial"
  );
  if (cands.length === 0) return null;
  return [...cands].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]!;
}

/**
 * Avisos ao rever extrato mensal: liga junho (adiantamento) a dezembro (abate), para não somar rendimento bruto duas vezes em relatórios.
 */
export function avisosDecimoTerceiroRevisaoContracheque(opts: {
  mes: number;
  ano: number;
  items: PayslipItem[];
  emitKind: string;
  payslipsGravados: Payslip[];
}): AvisoDecimoTerceiro[] {
  const { mes, ano, items, emitKind, payslipsGravados } = opts;
  const out: AvisoDecimoTerceiro[] = [];

  if (mes === 6 && emitKind === "folha_especial") {
    const adiant = somaAdiantamentoPrimeiraParcela130(items);
    if (adiant > 50) {
      out.push({
        id: "jun-1-parcela",
        severidade: "info",
        titulo: "13º salário — 1.ª parcela (junho)",
        detalhe:
          "Este extrato costuma ser só o adiantamento do 13º. Na liquidação de dezembro, o mesmo montante tende a surgir como desconto (ex. rubrica DESC.13.SAL.ADIANT / código 5390), para não pagar duas vezes o mesmo. Nos totais anuais use o **líquido** de cada mês ou o holerite integral de dezembro — não some o bruto de junho (adiantamento) com o bruto integral de dezembro sem descontar o abate.",
      });
    }
  }

  if (mes === 12 && emitKind === "mensal_principal") {
    const abate = somaAbateAdiantamento130Dezembro(items);
    const jun = preferirFolhaEspecialJunho(payslipsGravados, ano);
    const adiantGravado = jun ? somaAdiantamentoPrimeiraParcela130(jun.items ?? []) : 0;
    const adiantNaLeitura = somaAdiantamentoPrimeiraParcela130(items);

    if (abate > 50) {
      if (jun && adiantGravado > 50) {
        if (quaseIgual(abate, adiantGravado)) {
          out.push({
            id: "dez-coerente-jun",
            severidade: "info",
            titulo: "13º — abate alinhado ao adiantamento de junho",
            detalhe: `Desconto de abate ≈ ${abate.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} e 1.ª parcela gravada em junho ≈ ${adiantGravado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Isto confirma a lógica contabilística: o valor já recebido em junho é deduzido na quitação. Em somatórios anuais de «ganhos», não acrescente outra vez o adiantamento de junho ao integral de dezembro.`,
          });
        } else {
          out.push({
            id: "dez-diff-jun",
            severidade: "aviso",
            titulo: "13º — diferença entre abate e adiantamento gravado",
            detalhe: `O abate atual (${abate.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) e o adiantamento de junho na base (${adiantGravado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) não batem de perto. Confira OCR/códigos (5390) ou se houve alteração de rubrica; evite duplicar o 13º em relatórios.`,
          });
        }
      } else {
        out.push({
          id: "dez-sem-jun-base",
          severidade: "info",
          titulo: "13º — abate em dezembro sem folha de junho gravada",
          detalhe:
            "Há desconto de abate do adiantamento (DESC.13…), mas não há na base um contracheque de **junho** (folha especial) para cruzar. Se já tiver recebido a 1.ª parcela em junho, não some esse valor outra vez ao bruto anual. Grave o PDF de junho como «Folha especial / 13º» se ainda não gravou.",
        });
      }
    }

    if (adiantNaLeitura > 100 && abate < 20) {
      out.push({
        id: "dez-ganho-13-sem-abate",
        severidade: "aviso",
        titulo: "Possível leitura só do integral do 13º",
        detalhe:
          "Foram lidas rubricas de adiantamento em ganhos, mas pouco ou nenhum abate (DESC.13). Confira se este é o holerite **completo** de dezembro; o abate pode estar noutra página ou com OCR fraco.",
      });
    }
  }

  return out;
}

/**
 * Cruzamento **ficha corrida**: blocos JUN e DEZ do mesmo ano.
 */
export function avisosDecimoTerceiroFichaCorrida(
  meses: Array<{ month: number; year: number; items: PayslipItem[] }>
): AvisoDecimoTerceiro[] {
  const porAno = new Map<number, { jun?: PayslipItem[]; dez?: PayslipItem[] }>();
  for (const m of meses) {
    let slot = porAno.get(m.year);
    if (!slot) {
      slot = {};
      porAno.set(m.year, slot);
    }
    if (m.month === 6) slot.jun = m.items;
    if (m.month === 12) slot.dez = m.items;
  }

  const out: AvisoDecimoTerceiro[] = [];
  for (const [ano, { jun, dez }] of porAno) {
    if (!jun || !dez) continue;
    const adiant = somaAdiantamentoPrimeiraParcela130(jun);
    const abate = somaAbateAdiantamento130Dezembro(dez);
    if (adiant < 50 || abate < 50) continue;

    if (quaseIgual(adiant, abate)) {
      out.push({
        id: `ficha-${ano}-ok`,
        severidade: "info",
        titulo: `${ano}: 13º — junho e dezembro coerentes na ficha`,
        detalhe: `Adiantamento (junho) ≈ ${adiant.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} e abate (dez.) ≈ ${abate.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Em indicadores anuais, não conte duas vezes o mesmo 13º: o bruto de dezembro já compensa o pago em junho via desconto.`,
      });
    } else {
      out.push({
        id: `ficha-${ano}-dez-prevalece`,
        severidade: "info",
        titulo: `${ano}: 13º — dezembro considerado fechamento`,
        detalhe: `O adiantamento de junho (${adiant.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) e o abate de dezembro (${abate.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) diferem, mas a ficha passa a considerar dezembro como contracheque completo de quitação. Junho fica apenas como referência da parcela parcial, sem abrir pendência.`,
      });
    }
  }
  return out;
}
