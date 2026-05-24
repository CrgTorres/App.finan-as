import { AnexoContratoEmprestimoStandalone } from "@/components/contracheque/AnexoContratoEmprestimoStandalone";

export default function ContratoEmprestimoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          Contrato de empréstimo
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Anexe PDF ou imagem da proposta / CCB / orçamento (ex.: Daycoval «Orçamento da Operação»). Leitura automática
          e armazenamento alinhados à análise de evidências.
        </p>
      </div>
      <AnexoContratoEmprestimoStandalone />
    </div>
  );
}
