import Link from "next/link";
import {
  UploadCloud,
  FileUp,
  ClipboardList,
  ScanLine,
  ListOrdered,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ATALHOS = [
  {
    title: "Extrato bancário",
    description: "OFX, CSV ou planilha do banco para conciliar com a folha.",
    href: "/dashboard/import",
    icon: FileUp,
  },
  {
    title: "Folha / contracheque",
    description: "PDF da ficha financeira, contracheque e leitura automática de rubricas.",
    href: "/dashboard/contracheque",
    icon: ClipboardList,
  },
  {
    title: "Nota fiscal",
    description: "NF-e e comprovantes para cruzar gastos com o fluxo bancário.",
    href: "/dashboard/nota-fiscal",
    icon: ScanLine,
  },
  {
    title: "ConsigFácil",
    description: "Print ou texto do portal — margem e contratos em andamento.",
    href: "/dashboard/consignacoes",
    icon: ListOrdered,
  },
] as const;

export default function ImportarHubPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UploadCloud className="h-6 w-6 text-blue-600" aria-hidden />
          Importar
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Central de entrada de dados: folha, banco, notas e ConsigFácil. Escolha o tipo de
          documento — cada fluxo abre na ferramenta especializada, sem alterar os dados já
          importados.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ATALHOS.map((atalho) => {
          const Icon = atalho.icon;
          return (
            <Link key={atalho.href} href={atalho.href} className="group block h-full">
              <Card className="h-full transition-colors hover:border-blue-400/50 hover:bg-blue-50/30 dark:hover:bg-blue-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4 text-blue-600 shrink-0" aria-hidden />
                    {atalho.title}
                    <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-70 transition-opacity" />
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {atalho.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <span className="text-[11px] font-mono text-muted-foreground">{atalho.href}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
