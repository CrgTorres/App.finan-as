import type {
  EmprestimoContratoAnalise,
  PadroesConsumoAnalise,
} from "@/lib/anexos/analise-financeira-contracheque-padroes";

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

function ordCompetencia(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
}

/**
 * Ajusta métricas derivadas de contratos para refletir a lista canônica (deduplicada),
 * mantendo séries mensais/anuais de rubricas intactas.
 */
export function ajustarPadroesComContratosCanonicos(
  padroes: PadroesConsumoAnalise,
  contratos: EmprestimoContratoAnalise[],
): PadroesConsumoAnalise {
  if (contratos.length === 0) return padroes;

  const instMap = new Map<string, { aparicoes: number; valor: number }>();
  for (const c of contratos) {
    const nome = c.instituicaoDetectada?.trim() || "Outras / não identificadas";
    const cur = instMap.get(nome) ?? { aparicoes: 0, valor: 0 };
    cur.aparicoes += c.quantidadeAparicoes;
    cur.valor += c.totalPago;
    instMap.set(nome, cur);
  }
  const instituicoesMaisRecorrentes = [...instMap.entries()]
    .map(([nome, v]) => ({
      nome,
      aparicoes: v.aparicoes,
      valorTotalSomado: arredondar(v.valor),
    }))
    .sort((a, b) => b.aparicoes - a.aparicoes)
    .slice(0, 12);

  const simult = new Map<string, number>();
  for (const c of contratos) {
    const meses = c.mesesDetectados.length ? c.mesesDetectados : [c.primeiraAparicao];
    for (const mes of meses) {
      simult.set(mes, (simult.get(mes) ?? 0) + 1);
    }
  }
  const mesesContratosSimultaneosMax = [...simult.entries()]
    .map(([competencia, quantidade]) => ({
      competencia: ordCompetencia(competencia),
      quantidade,
    }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 8);

  return {
    ...padroes,
    instituicoesMaisRecorrentes,
    mesesContratosSimultaneosMax,
  };
}
