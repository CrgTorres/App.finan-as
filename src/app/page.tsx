import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  PieChart,
  Download,
  Shield,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const features = [
  {
    icon: TrendingUp,
    title: "Dashboard inteligente",
    description:
      "Visualize receitas, despesas e saldo em tempo real com cards e gráficos claros.",
  },
  {
    icon: PieChart,
    title: "Gráficos por categoria",
    description:
      "Entenda onde seu dinheiro está indo com gráficos de pizza por categoria.",
  },
  {
    icon: Download,
    title: "Exportar CSV",
    description:
      "Exporte suas transações filtradas em .csv para analisar no Excel ou Google Sheets.",
  },
  {
    icon: Shield,
    title: "Dados seguros",
    description:
      "Autenticação e Row Level Security do Supabase garantem que só você veja seus dados.",
  },
];

const benefits = [
  "Registro de receitas e despesas",
  "Categorização automática",
  "Filtros por mês, ano e categoria",
  "Busca por descrição",
  "Interface responsiva mobile",
  "Gráficos visuais interativos",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600 rounded-lg">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-800">FinançaHub</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Entrar
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Começar grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-sm font-medium px-4 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            Controle financeiro simples e visual
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight">
            Suas finanças em{" "}
            <span className="text-blue-600">ordem e no controle</span>
          </h1>

          <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Registre receitas e despesas, acompanhe seu saldo mensal com
            gráficos intuitivos e tome decisões financeiras mais inteligentes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="gap-2 px-8">
                Começar gratuitamente
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="px-8">
                Já tenho conta
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900">
              Tudo que você precisa para controlar suas finanças
            </h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto">
              Interface minimalista inspirada nos melhores apps de finanças
              pessoais do Brasil.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="p-6 rounded-2xl border border-slate-100 bg-slate-50 hover:border-blue-100 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="p-2.5 bg-blue-100 rounded-xl w-fit mb-4">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                Tudo incluído, sem complicação
              </h2>
              <p className="text-slate-500 mb-8">
                Uma ferramenta completa para pessoas físicas que querem
                organizar as finanças sem complexidade.
              </p>
              <ul className="space-y-3">
                {benefits.map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-center gap-3 text-slate-700"
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <span className="font-semibold text-slate-700">
                  Resumo — Maio 2026
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Receitas</span>
                  <span className="font-semibold text-emerald-600">
                    R$ 8.500,00
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Despesas</span>
                  <span className="font-semibold text-red-600">
                    R$ 4.320,00
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <span className="text-sm font-medium text-slate-700">
                    Saldo
                  </span>
                  <span className="font-bold text-blue-600 text-lg">
                    R$ 4.180,00
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {["Moradia", "Alimentação", "Transporte", "Lazer"].map(
                  (cat) => (
                    <span
                      key={cat}
                      className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full"
                    >
                      {cat}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-blue-600">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold text-white">
            Pronto para organizar suas finanças?
          </h2>
          <p className="text-blue-100">
            Crie sua conta gratuitamente e comece a registrar suas transações
            hoje mesmo.
          </p>
          <Link href="/register">
            <Button
              size="lg"
              variant="secondary"
              className="gap-2 px-8 bg-white text-blue-700 hover:bg-blue-50"
            >
              Criar conta grátis
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="py-8 px-4 border-t border-slate-200 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="p-1 bg-blue-600 rounded-md">
            <TrendingUp className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-semibold text-slate-700">FinançaHub</span>
        </div>
        <p className="text-xs text-slate-400">
          Controle financeiro pessoal · Desenvolvido com Next.js + Supabase
        </p>
      </footer>
    </div>
  );
}
