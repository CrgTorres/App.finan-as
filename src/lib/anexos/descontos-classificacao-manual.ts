import type { Payslip, PayslipItem } from "@/types/contracheque";
import { rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";
import { prepararFolhaParaAnaliseGrafico } from "@/lib/anexos/emprestimos-analise-from-payslips";
import {
  descontoClassificadoComoEmprestimoNaFolha,
  descontoVisaoGastosExcluindoIrEAmazonPrev,
  rubricaEhAmazonPrevFppm,
  rubricaEhDescontoDecimoTerceiroSalarioAdiantamento,
  rubricaEhImpostoRendaOuIrrf,
  rubricaEhPensaoAlimenticia,
  rubricaForaDaListaClassificacaoFocoEmprestimos,
} from "@/lib/anexos/payslip-desconto-historico";

export type CategoriaDescontoManual =
  | "emprestimo"
  | "cooperativa"
  | "associacao"
  | "pensao"
  | "gasto_fixo"
  | "outro";

export type OverrideDescontoUsuario = {
  categoria: CategoriaDescontoManual;
  mostrarNoGrafico: boolean;
};

export const LS_CLASSIFICACAO_DESCONTOS = "financaDescontosClassifManualV1";

export function chaveRubricaDescontoUsuario(code: string | undefined, description: string): string {
  const c = (code ?? "").replace(/\D/g, "").slice(0, 6);
  const base = rubricaSemParcelaParaChave(description)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return `${c}|${base}`;
}

export function inferirCategoriaDescontoPadrao(it: PayslipItem): CategoriaDescontoManual {
  if (it.type !== "desconto") return "outro";
  if (rubricaEhDescontoDecimoTerceiroSalarioAdiantamento(it.description)) return "outro";
  if (descontoClassificadoComoEmprestimoNaFolha(it)) return "emprestimo";
  if (rubricaEhPensaoAlimenticia(it.description)) return "pensao";
  const n = it.description.toLowerCase();
  if (/\b(milicred|credisis|sicredi|cresol|cooper|unicred|sicoob|bancoob)\b/i.test(n)) return "cooperativa";
  if (/\b(sindicato|sindical|associac|associa|assembl)\b/i.test(n)) return "associacao";
  return "outro";
}

export type AgregadoRubricaDesconto = {
  chave: string;
  label: string;
  code?: string;
  total: number;
  meses: number;
  detecaoAutoEmprestimo: boolean;
  exemplo: PayslipItem;
};

export function agregarDescontosPorChaveRubrica(payslips: Payslip[]): Map<string, AgregadoRubricaDesconto> {
  const folha = prepararFolhaParaAnaliseGrafico(payslips);
  const mesesPorChave = new Map<string, Set<string>>();
  const out = new Map<string, AgregadoRubricaDesconto>();

  for (const p of folha) {
    const mk = `${p.year}-${p.month}`;
    for (const it of p.items ?? []) {
      if (it.type !== "desconto" || it.value <= 0) continue;
      if (rubricaForaDaListaClassificacaoFocoEmprestimos(it.description)) continue;
      const chave = chaveRubricaDescontoUsuario(it.code, it.description);
      if (!mesesPorChave.has(chave)) mesesPorChave.set(chave, new Set());
      mesesPorChave.get(chave)!.add(mk);

      const cur = out.get(chave);
      const label = rubricaSemParcelaParaChave(it.description).replace(/\s+/g, " ").trim().slice(0, 72);
      if (!cur) {
        out.set(chave, {
          chave,
          label: label.length > 0 ? label : it.description.slice(0, 72),
          code: it.code,
          total: it.value,
          meses: 0,
          detecaoAutoEmprestimo: descontoClassificadoComoEmprestimoNaFolha(it),
          exemplo: { ...it },
        });
      } else {
        cur.total += it.value;
        cur.detecaoAutoEmprestimo = cur.detecaoAutoEmprestimo || descontoClassificadoComoEmprestimoNaFolha(it);
      }
    }
  }

  for (const [chave, agg] of out) {
    agg.meses = mesesPorChave.get(chave)?.size ?? 0;
  }

  return out;
}

export function carregarOverridesClassificacao(): Record<string, OverrideDescontoUsuario> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_CLASSIFICACAO_DESCONTOS);
    if (!raw) return {};
    const o = JSON.parse(raw) as { overrides?: Record<string, OverrideDescontoUsuario> };
    return o.overrides && typeof o.overrides === "object" ? o.overrides : {};
  } catch {
    return {};
  }
}

export function salvarOverridesClassificacao(overrides: Record<string, OverrideDescontoUsuario>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_CLASSIFICACAO_DESCONTOS, JSON.stringify({ overrides }));
}

export function categoriaEfetiva(
  chave: string,
  exemplo: PayslipItem,
  overrides: Record<string, OverrideDescontoUsuario | undefined>
): CategoriaDescontoManual {
  const o = overrides[chave];
  if (o?.categoria) return o.categoria;
  return inferirCategoriaDescontoPadrao(exemplo);
}

export function itemMostrarNoGrafico(
  chave: string,
  exemplo: PayslipItem,
  overrides: Record<string, OverrideDescontoUsuario | undefined>
): boolean {
  if (categoriaEfetiva(chave, exemplo, overrides) === "emprestimo") return true;
  const o = overrides[chave];
  return o?.mostrarNoGrafico !== false;
}

export function itemEntraBaseRoxa(
  it: PayslipItem,
  opts: {
    incluirIr: boolean;
    incluirAmazon: boolean;
    overrides: Record<string, OverrideDescontoUsuario | undefined>;
  }
): boolean {
  if (it.type !== "desconto" || it.value <= 0) return false;
  const chave = chaveRubricaDescontoUsuario(it.code, it.description);
  if (!itemMostrarNoGrafico(chave, it, opts.overrides)) return false;
  /** Uma rubrica agregando IR + Amazon Prev do 13.º: entra no gráfico se qualquer um dos dois estiver ligado (sem duplicar). */
  if (rubricaEhDescontoDecimoTerceiroSalarioAdiantamento(it.description)) {
    return opts.incluirIr || opts.incluirAmazon;
  }
  if (descontoVisaoGastosExcluindoIrEAmazonPrev(it)) return true;
  if (opts.incluirIr && rubricaEhImpostoRendaOuIrrf(it.description)) return true;
  if (opts.incluirAmazon && rubricaEhAmazonPrevFppm(it.description)) return true;
  return false;
}
