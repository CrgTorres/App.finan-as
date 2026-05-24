import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BaseFinanceiraNormalizada } from "@/lib/dashboard/base-financeira-normalizada";
import { buildExportacaoFinanceiraPayload } from "@/lib/exportacao/build-exportacao-financeira-payload";

function somaValores(rows: Array<{ valor?: number }>): number {
  return rows.reduce((s, r) => s + (typeof r.valor === "number" ? r.valor : 0), 0);
}

function formatNumero(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function periodo(registros: BaseFinanceiraNormalizada["registros"]): { inicio: string; fim: string } {
  const datas = registros.map((r) => r.data).filter(Boolean).sort();
  return {
    inicio: datas[0] ?? "—",
    fim: datas[datas.length - 1] ?? "—",
  };
}

export function ExportacaoPreviewTabela({ base }: { base: BaseFinanceiraNormalizada }) {
  const payload = buildExportacaoFinanceiraPayload(base);
  const per = periodo(base.registros);
  const qtdBancos = new Set(
    base.registros
      .map((r) => r.banco)
      .filter((b) => b && b !== "Nao aplicavel" && b !== "Nao identificado"),
  ).size;
  const totalReceitas = somaValores(base.receitas);
  const totalDescontos = somaValores(base.descontos);
  const totalEmprestimos = somaValores(base.emprestimos);
  const contagensAbas = Object.entries(payload.sheets).map(([aba, rows]) => ({ aba, total: rows.length }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <ResumoCard titulo="Total de registros" valor={String(base.registros.length)} />
        <ResumoCard titulo="Período inicial" valor={per.inicio} />
        <ResumoCard titulo="Período final" valor={per.fim} />
        <ResumoCard titulo="Bancos identificados" valor={String(qtdBancos)} />
        <ResumoCard titulo="Total receitas" valor={formatNumero(totalReceitas)} />
        <ResumoCard titulo="Total descontos" valor={formatNumero(totalDescontos)} />
        <ResumoCard titulo="Total empréstimos" valor={formatNumero(totalEmprestimos)} />
        <ResumoCard titulo="Total alertas" valor={String(base.alertas.length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registros por aba</CardTitle>
          <CardDescription>Contagem de linhas que será gerada no Excel multi-abas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {contagensAbas.map((row) => (
            <div key={row.aba} className="rounded-lg border px-3 py-2 text-xs">
              <p className="truncate text-muted-foreground">{row.aba}</p>
              <p className="text-base font-semibold tabular-nums">{row.total}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prévia da Base_Normalizada</CardTitle>
          <CardDescription>Primeiras 20 linhas filtradas, com valores numéricos e datas yyyy-mm-dd.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Categoria</th>
                <th className="py-2 pr-3">Banco</th>
                <th className="py-2 pr-3">Descrição</th>
                <th className="py-2 pr-3 text-right">Valor</th>
                <th className="py-2 pr-3">Risco</th>
              </tr>
            </thead>
            <tbody>
              {base.registros.slice(0, 20).map((e) => (
                <tr key={e.evento_id} className="border-t">
                  <td className="py-2 pr-3 tabular-nums">{e.data}</td>
                  <td className="py-2 pr-3">{e.tipo_evento}</td>
                  <td className="py-2 pr-3">{e.categoria}</td>
                  <td className="py-2 pr-3">{e.banco}</td>
                  <td className="max-w-[360px] truncate py-2 pr-3">{e.descricao_padronizada}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{e.valor.toFixed(2)}</td>
                  <td className="py-2 pr-3">{e.risco}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ResumoCard({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{valor}</CardTitle>
        <CardDescription>{titulo}</CardDescription>
      </CardHeader>
    </Card>
  );
}

