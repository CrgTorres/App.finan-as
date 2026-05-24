import type { PayslipItem } from "@/types/contracheque";
import { candidatosParcela7Digitos, rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";
import { padronizarTokensRubricaOficiais } from "@/lib/anexos/rubrica-nomes-oficiais";
import { descontoClassificadoComoEmprestimoNaFolha } from "@/lib/anexos/payslip-desconto-historico";

export type MesItensParaParcela = { month: number; year: number; items: PayslipItem[] };

function competenciaOrd(m: MesItensParaParcela): number {
  return m.year * 12 + m.month;
}

function monthsBetween(
  a: { year: number; month: number },
  b: { year: number; month: number }
): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** Heurística alinhada a empréstimo/consignado (inclui parcela N/M plausível quando o OCR trunca o nome). */
function itemPareceEmprestimoParaParcela(it: PayslipItem): boolean {
  return descontoClassificadoComoEmprestimoNaFolha(it);
}

function chaveContratoParcela(it: PayslipItem): string | null {
  if (!itemPareceEmprestimoParaParcela(it)) return null;
  const c = (it.code ?? "").trim();
  const stem = padronizarTokensRubricaOficiais(rubricaSemParcelaParaChave(it.description))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/([a-z])\1{2,}/g, "$1$1")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .slice(0, 72);
  const v = Number.isFinite(it.value) ? it.value.toFixed(2) : "0.00";
  // A parcela muda todo mês; se ela entrar na chave, linhas sem N/M nunca herdam a sequência vizinha.
  const key = `${c}|${v}|${stem}`;
  return key.length >= 5 ? key : null;
}

function temParcelaCompleta(it: PayslipItem): boolean {
  return (
    it.parcelaAtual != null &&
    it.parcelaTotal != null &&
    it.parcelaAtual >= 1 &&
    it.parcelaTotal >= 1 &&
    it.parcelaAtual <= it.parcelaTotal
  );
}

function aplicarParcelaNoItem(it: PayslipItem, atual: number, total: number): PayslipItem {
  const base = rubricaSemParcelaParaChave(it.description);
  return {
    ...it,
    parcelaAtual: atual,
    parcelaTotal: total,
    description: base.replace(/\s+/g, " ").trim().slice(0, 240),
  };
}

type Ref = { mi: number; ii: number; ord: number; month: number; year: number };

function interpolarPorPrimeiraUltimaOcorrencia(
  refs: Ref[],
  meses: MesItensParaParcela[]
): boolean {
  const completos: Array<{ idx: number; atual: number; total: number }> = [];
  for (let i = 0; i < refs.length; i++) {
    const it = meses[refs[i]!.mi].items[refs[i]!.ii];
    if (!temParcelaCompleta(it)) continue;
    completos.push({ idx: i, atual: it.parcelaAtual!, total: it.parcelaTotal! });
  }
  if (completos.length < 2) return false;

  const first = completos[0]!;
  const last = completos[completos.length - 1]!;
  if (first.total !== last.total) return false;
  const occSpan = last.idx - first.idx;
  if (occSpan <= 0) return false;
  const parcelaSpan = last.atual - first.atual;
  // Regra lógica: para mesmo contrato, parcela deve avançar 1 por ocorrência.
  if (parcelaSpan !== occSpan) return false;

  let changed = false;
  for (let i = first.idx; i <= last.idx; i++) {
    const r = refs[i]!;
    const cur = meses[r.mi].items[r.ii];
    if (temParcelaCompleta(cur)) continue;
    const esperado = first.atual + (i - first.idx);
    if (esperado >= 1 && esperado <= first.total) {
      meses[r.mi].items[r.ii] = aplicarParcelaNoItem(cur, esperado, first.total);
      changed = true;
    }
  }
  return changed;
}

/**
 * Usa o mesmo contrato (código + descrição base) em **meses vizinhos** para:
 * - interpolar parcela quando falta (ex.: sequência 19/48 → ? → 21/48);
 * - desambiguar sufixo de **7 dígitos** quando há vários 3+3 plausíveis.
 */
export function inferirParcelasPorVizinhancaMeses(mesesInput: MesItensParaParcela[]): MesItensParaParcela[] {
  const meses = mesesInput.map((m) => ({
    month: m.month,
    year: m.year,
    items: m.items.map((it) => ({ ...it })),
  }));
  meses.sort((a, b) => competenciaOrd(a) - competenciaOrd(b));

  const byKey = new Map<string, Ref[]>();
  for (let mi = 0; mi < meses.length; mi++) {
    const m = meses[mi];
    for (let ii = 0; ii < m.items.length; ii++) {
      const it = m.items[ii];
      const key = chaveContratoParcela(it);
      if (!key) continue;
      const ord = competenciaOrd(m);
      const arr = byKey.get(key) ?? [];
      arr.push({ mi, ii, ord, month: m.month, year: m.year });
      byKey.set(key, arr);
    }
  }

  for (const [, refs] of byKey) {
    if (refs.length < 2) continue;
    refs.sort((a, b) => a.ord - b.ord);

    const resolve7ComVizinhos = (r: Ref, it: PayslipItem): PayslipItem | null => {
      const cands = candidatosParcela7Digitos(it.description);
      if (cands.length <= 1) return null;
      const j = refs.findIndex((x) => x.mi === r.mi && x.ii === r.ii);
      if (j < 0) return null;

      let pi = j - 1;
      while (pi >= 0 && !temParcelaCompleta(meses[refs[pi]!.mi].items[refs[pi]!.ii])) pi--;
      let ni = j + 1;
      while (ni < refs.length && !temParcelaCompleta(meses[refs[ni]!.mi].items[refs[ni]!.ii])) ni++;

      const prev = pi >= 0 ? meses[refs[pi]!.mi].items[refs[pi]!.ii] : null;
      const next = ni < refs.length ? meses[refs[ni]!.mi].items[refs[ni]!.ii] : null;

      if (prev && next && prev.parcelaTotal === next.parcelaTotal) {
        const esperado =
          prev.parcelaAtual! + monthsBetween(
            { year: refs[pi]!.year, month: refs[pi]!.month },
            { year: r.year, month: r.month }
          );
        if (
          esperado >= 1 &&
          esperado <= prev.parcelaTotal! &&
          esperado + monthsBetween({ year: r.year, month: r.month }, { year: refs[ni]!.year, month: refs[ni]!.month }) ===
            next.parcelaAtual!
        ) {
          const hit = cands.find(
            (c) => c.parcelaAtual === esperado && c.parcelaTotal === prev.parcelaTotal
          );
          if (hit) return aplicarParcelaNoItem(it, hit.parcelaAtual!, hit.parcelaTotal!);
        }
      }

      if (prev && !next) {
        const esperado =
          prev.parcelaAtual! +
          monthsBetween({ year: refs[pi]!.year, month: refs[pi]!.month }, { year: r.year, month: r.month });
        if (esperado >= 1 && esperado <= prev.parcelaTotal!) {
          const hit = cands.find(
            (c) => c.parcelaAtual === esperado && c.parcelaTotal === prev.parcelaTotal
          );
          if (hit) return aplicarParcelaNoItem(it, hit.parcelaAtual!, hit.parcelaTotal!);
        }
      }

      if (!prev && next) {
        const esperado =
          next.parcelaAtual! -
          monthsBetween({ year: r.year, month: r.month }, { year: refs[ni]!.year, month: refs[ni]!.month });
        if (esperado >= 1 && esperado <= next.parcelaTotal!) {
          const hit = cands.find(
            (c) => c.parcelaAtual === esperado && c.parcelaTotal === next.parcelaTotal
          );
          if (hit) return aplicarParcelaNoItem(it, hit.parcelaAtual!, hit.parcelaTotal!);
        }
      }

      return null;
    };

    const interpolar = (r: Ref, it: PayslipItem): PayslipItem | null => {
      if (temParcelaCompleta(it)) return null;

      const j = refs.findIndex((x) => x.mi === r.mi && x.ii === r.ii);
      if (j < 0) return null;

      let pi = j - 1;
      while (pi >= 0 && !temParcelaCompleta(meses[refs[pi]!.mi].items[refs[pi]!.ii])) pi--;
      let ni = j + 1;
      while (ni < refs.length && !temParcelaCompleta(meses[refs[ni]!.mi].items[refs[ni]!.ii])) ni++;

      const prev = pi >= 0 ? meses[refs[pi]!.mi].items[refs[pi]!.ii] : null;
      const next = ni < refs.length ? meses[refs[ni]!.mi].items[refs[ni]!.ii] : null;

      if (prev && next && prev.parcelaTotal === next.parcelaTotal) {
        const esperado =
          prev.parcelaAtual! +
          monthsBetween({ year: refs[pi]!.year, month: refs[pi]!.month }, { year: r.year, month: r.month });
        if (
          esperado >= 1 &&
          esperado <= prev.parcelaTotal! &&
          esperado + monthsBetween({ year: r.year, month: r.month }, { year: refs[ni]!.year, month: refs[ni]!.month }) ===
            next.parcelaAtual!
        ) {
          return aplicarParcelaNoItem(it, esperado, prev.parcelaTotal!);
        }
      }

      if (prev && !next) {
        const esperado =
          prev.parcelaAtual! +
          monthsBetween({ year: refs[pi]!.year, month: refs[pi]!.month }, { year: r.year, month: r.month });
        if (esperado >= 1 && esperado <= prev.parcelaTotal!) {
          return aplicarParcelaNoItem(it, esperado, prev.parcelaTotal!);
        }
      }

      if (!prev && next) {
        const esperado =
          next.parcelaAtual! -
          monthsBetween({ year: r.year, month: r.month }, { year: refs[ni]!.year, month: refs[ni]!.month });
        if (esperado >= 1 && esperado <= next.parcelaTotal!) {
          return aplicarParcelaNoItem(it, esperado, next.parcelaTotal!);
        }
      }

      return null;
    };

    for (let pass = 0; pass < 4; pass++) {
      interpolarPorPrimeiraUltimaOcorrencia(refs, meses);
      for (const r of refs) {
        const cur = meses[r.mi].items[r.ii];
        if (!cur) continue;
        const upd = interpolar(r, cur);
        if (upd) meses[r.mi].items[r.ii] = upd;
      }
      for (const r of refs) {
        const cur = meses[r.mi].items[r.ii];
        if (!cur) continue;
        const upd = resolve7ComVizinhos(r, cur);
        if (upd) meses[r.mi].items[r.ii] = upd;
      }
    }
  }

  return meses;
}
