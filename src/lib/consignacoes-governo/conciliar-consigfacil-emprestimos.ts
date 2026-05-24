import type { Loan } from "@/types/contracheque";
import type {
  ConsigfacilContrato,
  FonteCanonicaFinanceira,
} from "@/types/consigfacil";
import type { BaseConciliadaLinha } from "@/lib/conciliacao/conciliacao-financeira";
import {
  avaliarCompatibilidadeRubrica,
  PESO_SCORE_MATCH_RUBRICA_FORTE,
} from "@/lib/contratos/rubrica-identificador-forte";
import { validarEstruturaParcela } from "@/lib/contratos/validar-estrutura-parcela";
import {
  avaliarBloqueioCorrelacaoPorValor,
  extrairFlagsContinuidadeContrato,
  logCorrelacaoBloqueadaPorValor,
} from "@/lib/consigfacil/regras-correlacao-institucional";
import { extrairInstituicaoOriginalFolha } from "@/lib/conciliacao/contexto-instituicao-folha-consigfacil";
import {
  ehRubricaElegivelCorrelacaoConsigfacil,
  linhaEhRubricaConsignavel,
} from "@/lib/conciliacao/regras-natureza-consignavel";
import {
  entradaPassivoDeLinhaBase,
  entradaPassivoDeLoan,
  identificarPassivoConsignavelEstrutural,
  MIN_SCORE_ESTRUTURAL_CORRELACAO,
} from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";

/**
 * Resultado da conciliação contrato ConsigFácil ↔ Loan/BaseConciliada.
 *
 * Para cada `ConsigfacilContrato` produzimos:
 *  - `loan_id` (vínculo com o cadastro interno) quando há match seguro
 *  - `linhas_base_conciliada_ids` (vínculos com transações/rubricas do conciliador)
 *  - `fonte_principal` calculada
 *  - `divergencias[]` para alertas
 */
export type ResultadoConciliacaoConsigfacil = {
  id_consignacao: string;
  loan_id: string | null;
  linhas_base_conciliada_ids: string[];
  match_score: number;
  fonte_principal: FonteCanonicaFinanceira;
  divergencias: string[];
};

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similaridadeInstituicao(a: string, b: string): number {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const tokensA = new Set(na.split(" ").filter((t) => t.length >= 3));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length >= 3));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let inter = 0;
  for (const t of tokensA) if (tokensB.has(t)) inter++;
  return inter / Math.min(tokensA.size, tokensB.size);
}

function diffValor(a: number, b: number): number {
  if (a <= 0 || b <= 0) return Infinity;
  return Math.abs(a - b) / Math.max(a, b);
}

/**
 * Cruza um contrato oficial com a lista de `Loan` cadastrados pelo usuário.
 *
 * Critérios (todos ponderados):
 *  - similaridade do nome da instituição
 *  - diferença percentual entre `valor_parcela` e `installment_amount`
 *  - número de parcelas próximo (`parcelas_total` ≈ `total_installments`)
 *  - rubrica/código (quando preenchidos) batendo
 */
export function conciliarContratoConsigfacilComLoans(
  c: ConsigfacilContrato,
  loans: Loan[],
): { loan: Loan | null; score: number; divergencias: string[] } {
  let melhor: { loan: Loan; score: number; divergencias: string[] } | null = null;
  for (const l of loans) {
    const passivo = identificarPassivoConsignavelEstrutural(
      entradaPassivoDeLoan(l, {
        id_consignacao_consigfacil: c.id_consignacao,
      }),
    );
    if (
      !ehRubricaElegivelCorrelacaoConsigfacil(l.description ?? l.institution_name ?? "", {
        paid_installments: l.paid_installments,
        total_installments: l.total_installments,
        codigo_rubrica: l.rubrica_code,
      })
    ) {
      continue;
    }

    const bloqueioInst = avaliarBloqueioCorrelacaoPorValor({
      bancoHistorico: l.institution_name ?? l.description,
      bancoConsigfacil: c.instituicao,
      rubricaOriginal: l.description ?? null,
      descricaoFolha: l.description ?? null,
      idConsignacao: c.id_consignacao,
      codigoInstituicao: c.codigo_instituicao,
      textoContrato: c.texto_bruto,
      valorObservado: l.installment_amount,
      valorConsigfacil: c.valor_parcela,
    });
    if (bloqueioInst.bloquear_correlacao_por_valor) continue;

    const rub = avaliarCompatibilidadeRubrica(
      c.texto_bruto,
      l.description ?? l.institution_name,
      c.codigo_instituicao,
      l.rubrica_code,
    );
    if (!rub.compativel) continue;

    const vp = validarEstruturaParcela(c.parcela_atual ?? 0, c.parcelas_total);
    const vl = validarEstruturaParcela(l.paid_installments ?? 0, l.total_installments ?? 0);
    if (vp.ocr_invalido || vl.ocr_invalido) continue;

    let pontos = passivo.score_estrutural;
    const divergencias: string[] = [];
    if (rub.rubrica_a && rub.rubrica_b && rub.rubrica_a === rub.rubrica_b) {
      pontos += PESO_SCORE_MATCH_RUBRICA_FORTE;
    }

    const simInst = similaridadeInstituicao(c.instituicao, l.institution_name ?? l.description);
    if (simInst >= 0.6) pontos += Math.round(20 * simInst);
    if (simInst > 0 && simInst < 0.4) divergencias.push("Instituição diverge entre ConsigFácil e cadastro.");

    if (c.parcelas_total > 0 && l.total_installments > 0) {
      const dParc = Math.abs(c.parcelas_total - l.total_installments) / Math.max(c.parcelas_total, l.total_installments);
      if (dParc === 0) pontos += 15;
      else if (dParc <= 0.1) pontos += 10;
      else if (dParc <= 0.25) {
        pontos += 4;
        divergencias.push(`Quantidade de parcelas diverge (${c.parcelas_total} oficial × ${l.total_installments} cadastro).`);
      }
    }

    if (
      passivo.parcela_atual != null &&
      c.parcela_atual != null &&
      Math.abs(passivo.parcela_atual - c.parcela_atual) <= 2
    ) {
      pontos += 12;
    }

    const dValor = diffValor(c.valor_parcela, l.installment_amount);
    if (dValor <= 0.05 && (passivo.tem_parcela_nm || simInst >= 0.5)) pontos += 5;
    else if (dValor <= 0.15 && passivo.tem_instituicao_financeira) pontos += 2;
    else if (Number.isFinite(dValor) && dValor > 0.15 && !passivo.tem_parcela_nm && simInst < 0.4) {
      divergencias.push(`Valor próximo sem estrutura institucional — ignorado (${(dValor * 100).toFixed(1)}%).`);
    }

    if (c.codigo_instituicao && l.rubrica_code) {
      const codC = c.codigo_instituicao.replace(/\D+/g, "");
      const codL = l.rubrica_code.replace(/\D+/g, "");
      if (codC && codL && (codC.includes(codL) || codL.includes(codC))) pontos += 10;
    }

    // Datas: se start_date está perto da data_contrato, soma um pouco
    if (l.start_date && c.data_contrato) {
      const dist = Math.abs(Date.parse(l.start_date) - Date.parse(c.data_contrato));
      if (Number.isFinite(dist)) {
        const dias = dist / 86_400_000;
        if (dias <= 31) pontos += 10;
        else if (dias <= 90) pontos += 5;
      }
    }

    if (!melhor || pontos > melhor.score) {
      melhor = { loan: l, score: pontos, divergencias };
    }
  }

  if (!melhor || melhor.score < MIN_SCORE_ESTRUTURAL_CORRELACAO) {
    return { loan: null, score: melhor?.score ?? 0, divergencias: [] };
  }
  return melhor;
}

/**
 * Cruza um contrato oficial com a `Base_Conciliada` para encontrar linhas
 * relacionadas (descontos mensais da rubrica, créditos de empréstimo).
 *
 * Retorna `ids` das linhas que provavelmente pertencem a este contrato.
 */
/**
 * Vínculo folha ↔ contrato exige evidência institucional (nunca só valor).
 */
export function linhaElegivelVinculoInstitucionalConsigfacil(
  linha: BaseConciliadaLinha,
  contrato: ConsigfacilContrato,
): boolean {
  if (!linhaEhRubricaConsignavel(linha)) return false;

  const folha = extrairInstituicaoOriginalFolha(
    linha.descricao_original || linha.descricao_normalizada,
    linha.instituicao_original_folha ?? linha.banco_origem,
  );
  const flags = extrairFlagsContinuidadeContrato(
    contrato,
    linha.competencia,
    folha.banco_original,
  );
  const bloqueio = avaliarBloqueioCorrelacaoPorValor({
    bancoHistorico: folha.banco_original,
    bancoConsigfacil: flags.banco_atual,
    possuiDocumentoMigracao: flags.possuiDocumentoMigracao,
    possuiHistoricoTransicao: flags.possuiHistoricoTransicao,
    competencia: linha.competencia,
    dataImplantacaoConsigfacil: flags.dataImplantacaoConsigfacil,
    rubricaOriginal: linha.descricao_original || linha.descricao_normalizada,
    descricaoFolha: linha.descricao_original || linha.descricao_normalizada,
    idConsignacao: contrato.id_consignacao,
    codigoInstituicao: contrato.codigo_instituicao,
    textoContrato: contrato.texto_bruto,
    valorObservado: Math.abs(linha.valor),
    valorConsigfacil: contrato.valor_parcela,
  });

  if (bloqueio.bloquear_correlacao_por_valor) {
    const valorParecido =
      contrato.valor_parcela > 0 &&
      diffValor(contrato.valor_parcela, Math.abs(linha.valor)) <= 0.15;
    if (valorParecido) {
      logCorrelacaoBloqueadaPorValor({
        rubrica_original: linha.descricao_original || linha.descricao_normalizada,
        banco_original: folha.banco_original,
        valor_observado: Math.abs(linha.valor),
        contrato_consigfacil: contrato.id_consignacao,
        banco_consigfacil: contrato.instituicao,
        valor_consigfacil: contrato.valor_parcela,
        motivo: bloqueio.motivo_log,
      });
    }
    return false;
  }

  return true;
}

export function conciliarContratoConsigfacilComBaseConciliada(
  c: ConsigfacilContrato,
  baseConciliada: BaseConciliadaLinha[],
): string[] {
  const ids: string[] = [];
  for (const l of baseConciliada) {
    if (!linhaElegivelVinculoInstitucionalConsigfacil(l, c)) continue;

    const passivo = identificarPassivoConsignavelEstrutural(entradaPassivoDeLinhaBase(l));
    if (passivo.score_estrutural < MIN_SCORE_ESTRUTURAL_CORRELACAO) continue;

    const rub = avaliarCompatibilidadeRubrica(
      c.texto_bruto,
      l.descricao_original || l.descricao_normalizada,
      c.codigo_instituicao,
      null,
    );
    const folha = extrairInstituicaoOriginalFolha(
      l.descricao_original || l.descricao_normalizada,
      l.instituicao_original_folha ?? l.banco_origem,
    );
    const simInst = similaridadeInstituicao(
      c.instituicao,
      folha.banco_original ?? l.descricao_normalizada,
    );
    const parcelaCoerente =
      passivo.parcela_atual != null &&
      c.parcela_atual != null &&
      Math.abs(passivo.parcela_atual - c.parcela_atual) <= 2 &&
      passivo.parcela_total != null &&
      c.parcelas_total > 0 &&
      Math.abs(passivo.parcela_total - c.parcelas_total) <= 3;

    const vinculoEstrutural =
      rub.compativel || parcelaCoerente || simInst >= 0.55 || passivo.tem_instituicao_financeira;
    if (!vinculoEstrutural) continue;

    ids.push(l.id);
  }
  return ids;
}

/**
 * Decide a `fonte_principal` para um contrato dado o que conseguimos cruzar.
 *
 * Regra geral:
 *  - tem ConsigFácil com `confianca >= 0.6` → "consigfacil_oficial"
 *  - tem `Loan` cadastrado com `tipo_contrato === "anexo"` → "contrato_anexado"
 *  - achou em payslip → "contracheque"
 *  - achou em extrato → "extrato_bancario"
 *  - veio só de OCR → "ocr"
 *  - resto → "inferencia"
 */
export function decidirFontePrincipal(
  c: ConsigfacilContrato | null,
  loan: Loan | null,
  achouEmContracheque: boolean,
  achouEmExtrato: boolean,
): FonteCanonicaFinanceira {
  if (c && c.confianca >= 0.6) return "consigfacil_oficial";
  if (loan && (loan.tipo_contrato === "anexo" || loan.origem === "anexo")) return "contrato_anexado";
  if (achouEmContracheque) return "contracheque";
  if (achouEmExtrato) return "extrato_bancario";
  if (loan?.origem === "ocr") return "ocr";
  return "inferencia";
}
