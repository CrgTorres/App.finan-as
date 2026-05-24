import { normalizarNomeBanco } from "@/lib/auditoria/normalizar-banco";
import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { fingerprintContratoInferido } from "@/lib/anexos/evidencias-emprestimos";
import { obterValorParcela } from "@/lib/anexos/contrato-inferido-valor-parcela";
import { padronizarTokensRubricaOficiais } from "@/lib/anexos/rubrica-nomes-oficiais";
import type { ContratoExtraido, SugestaoVinculoContrato } from "@/types/contrato-extraido";

const EPS_PARCELA = 0.06;

function apenasDigitosCpf(cpf?: string): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? d : null;
}

function ordMesYm(ym: string): number | null {
  const m = ym.trim().match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = parseInt(m[1]!, 10);
  const mo = parseInt(m[2]!, 10);
  if (Number.isNaN(y) || Number.isNaN(mo)) return null;
  return y * 12 + (mo - 1);
}

function mesesProximos(a: string | undefined, primeiraCompetencia: string): boolean {
  const ma = a ? ordMesYm(a.length >= 7 ? a.slice(0, 7) : a) : null;
  const mb = ordMesYm(primeiraCompetencia);
  if (ma == null || mb == null) return false;
  return Math.abs(ma - mb) <= 2;
}

function bancoProvavelContrato(c: EmprestimoContratoAnalise): string | null {
  const fromInst = c.instituicaoDetectada?.trim();
  if (fromInst) return normalizarNomeBanco(fromInst);
  const d = padronizarTokensRubricaOficiais(c.descricao);
  return normalizarNomeBanco(d.slice(0, 64));
}

export function pontuarVinculoContratoInferido(
  ex: ContratoExtraido,
  c: EmprestimoContratoAnalise,
): { score: number; motivos: string[] } {
  const motivos: string[] = [];
  let score = 0;

  const bE = ex.banco?.trim() ? normalizarNomeBanco(ex.banco) : null;
  const bC = bancoProvavelContrato(c);
  if (bE && bC && bE === bC) {
    score += 35;
    motivos.push("Mesmo banco (normalizado)");
  } else if (bE && bC && (bC.includes(bE) || bE.includes(bC))) {
    score += 22;
    motivos.push("Banco compatível (parcial)");
  }

  if (ex.parcela != null && ex.parcela > 0) {
    const vpC = obterValorParcela(c);
    if (vpC != null && Math.abs(ex.parcela - vpC) <= EPS_PARCELA) {
      score += 35;
      motivos.push("Valor da parcela coincide");
    } else if (vpC != null && Math.abs(ex.parcela - vpC) <= 2) {
      score += 15;
      motivos.push("Parcela próxima (tolerância larga)");
    }
  }

  if (ex.parcelas != null && c.totalParcelas != null && ex.parcelas === c.totalParcelas) {
    score += 25;
    motivos.push("Mesmo número de parcelas");
  }

  if (
    (ex.dataContratacao && mesesProximos(ex.dataContratacao, c.primeiraAparicao)) ||
    (ex.primeiroVencimento && mesesProximos(ex.primeiroVencimento, c.primeiraAparicao))
  ) {
    score += 15;
    motivos.push("Datas alinhadas à primeira competência na folha");
  }

  if (ex.cpf && apenasDigitosCpf(ex.cpf)) {
    score += 5;
    motivos.push("CPF presente no documento (comparar manualmente com cadastro)");
  }

  const desc = `${c.descricao} ${c.codigo}`.toLowerCase();
  if (ex.numeroProposta && desc.includes(ex.numeroProposta.toLowerCase())) {
    score += 20;
    motivos.push("Número de proposta aparece na rubrica");
  }

  return { score: Math.min(100, score), motivos };
}

export function sugerirVinculosContrato(
  ex: ContratoExtraido,
  candidatos: EmprestimoContratoAnalise[],
  limite = 5,
): SugestaoVinculoContrato[] {
  const scored = candidatos.map((c) => {
    const { score, motivos } = pontuarVinculoContratoInferido(ex, c);
    const fingerprint = fingerprintContratoInferido(c);
    const vp = obterValorParcela(c);
    const vpStr = vp != null ? vp.toFixed(2) : c.valorParcela.toFixed(2);
    const resumoContrato = `${c.descricao.slice(0, 72)}${c.descricao.length > 72 ? "…" : ""} · R$ ${vpStr}`;
    return { fingerprint, score, motivos, resumoContrato } satisfies SugestaoVinculoContrato;
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limite);
}

export function melhorFingerprintSeAltaConfianca(
  sugestoes: SugestaoVinculoContrato[],
  minScore = 70,
): string | null {
  const top = sugestoes[0];
  if (top && top.score >= minScore) return top.fingerprint;
  return null;
}
