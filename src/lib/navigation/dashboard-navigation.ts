import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  UploadCloud,
  Landmark,
  Brain,
  WalletCards,
  UserCog,
  FileUp,
  ClipboardList,
  ScanLine,
  ListOrdered,
  ShieldCheck,
  ScrollText,
  AlertCircle,
  Sparkles,
  Scale,
  FolderOpen,
  SlidersHorizontal,
  HeartPulse,
  Download,
} from "lucide-react";

export type DashboardNavItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  badge?: string | number;
  description?: string;
  aliases?: string[];
  children?: DashboardNavItem[];
  hiddenFromMain?: boolean;
};

export type DashboardNavGroup = {
  label: string;
  items: DashboardNavItem[];
};

/** Grupos de navegação — Fase 1 (menu enxuto, rotas legadas preservadas). */
export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  {
    label: "Visão",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Visão executiva da rotina financeira.",
        aliases: [],
      },
    ],
  },
  {
    label: "Operar",
    items: [
      {
        label: "Importar",
        href: "/dashboard/importar",
        icon: UploadCloud,
        description:
          "Central de entrada de dados: folha, banco, notas e ConsigFácil.",
        aliases: [
          "/dashboard/import",
          "/dashboard/contracheque",
          "/dashboard/nota-fiscal",
        ],
        children: [
          {
            label: "Extrato bancário",
            href: "/dashboard/import",
            icon: FileUp,
            hiddenFromMain: true,
          },
          {
            label: "Folha / contracheque",
            href: "/dashboard/contracheque",
            icon: ClipboardList,
            hiddenFromMain: true,
          },
          {
            label: "Nota fiscal",
            href: "/dashboard/nota-fiscal",
            icon: ScanLine,
            hiddenFromMain: true,
          },
          {
            label: "ConsigFácil",
            href: "/dashboard/consignacoes",
            icon: ListOrdered,
            description: "Importar print do portal na página de consignações.",
            hiddenFromMain: true,
          },
        ],
      },
      {
        label: "Consignações",
        href: "/dashboard/consignacoes",
        icon: Landmark,
        description: "Margem, contratos, conciliação e pendências operacionais.",
        aliases: ["/dashboard/conciliacao"],
        children: [
          {
            label: "Visão geral",
            href: "/dashboard/consignacoes",
            hiddenFromMain: true,
          },
          {
            label: "Margem",
            href: "/dashboard/consignacoes",
            hiddenFromMain: true,
          },
          {
            label: "Contratos",
            href: "/dashboard/consignacoes",
            hiddenFromMain: true,
          },
          {
            label: "Pendências",
            href: "/dashboard/consignacoes",
            hiddenFromMain: true,
          },
          {
            label: "Portal ConsigFácil",
            href: "/dashboard/conciliacao",
            icon: ShieldCheck,
            hiddenFromMain: true,
          },
          {
            label: "Conciliação",
            href: "/dashboard/conciliacao",
            icon: ShieldCheck,
            hiddenFromMain: true,
          },
        ],
      },
    ],
  },
  {
    label: "Analisar",
    items: [
      {
        label: "Análise",
        href: "/dashboard/analise",
        icon: Brain,
        description: "IA, triagem, jurídico e evidências.",
        aliases: [
          "/dashboard/triagem",
          "/dashboard/boletins",
          "/dashboard/contrato-emprestimo",
        ],
        children: [
          {
            label: "Resumo IA",
            href: "/dashboard/analise",
            icon: Sparkles,
            hiddenFromMain: true,
          },
          {
            label: "Triagem",
            href: "/dashboard/triagem",
            icon: AlertCircle,
            hiddenFromMain: true,
          },
          {
            label: "Jurídico",
            href: "/dashboard/analise",
            hiddenFromMain: true,
          },
          {
            label: "Evidências",
            href: "/dashboard/analise",
            hiddenFromMain: true,
          },
          {
            label: "Boletins",
            href: "/dashboard/boletins",
            icon: Scale,
            hiddenFromMain: true,
          },
          {
            label: "Contratos anexados",
            href: "/dashboard/contrato-emprestimo",
            icon: ScrollText,
            hiddenFromMain: true,
          },
        ],
      },
    ],
  },
  {
    label: "Financeiro",
    items: [
      {
        label: "Transações",
        href: "/dashboard/transactions",
        icon: WalletCards,
        description: "Movimentações bancárias e fluxo financeiro.",
        aliases: [],
      },
    ],
  },
  {
    label: "Conta",
    items: [
      {
        label: "Meu perfil",
        href: "/dashboard/perfil",
        icon: UserCog,
        description: "Configurações, saúde dos dados e exportação.",
        aliases: [
          "/dashboard/configuracao-leitura",
          "/dashboard/saude-dados",
          "/dashboard/exportacao",
        ],
        children: [
          {
            label: "Perfil",
            href: "/dashboard/perfil",
            hiddenFromMain: true,
          },
          {
            label: "Perfil de leitura",
            href: "/dashboard/configuracao-leitura",
            icon: SlidersHorizontal,
            hiddenFromMain: true,
          },
          {
            label: "Saúde dos dados",
            href: "/dashboard/saude-dados",
            icon: HeartPulse,
            hiddenFromMain: true,
          },
          {
            label: "Exportação / Power BI",
            href: "/dashboard/exportacao",
            icon: Download,
            hiddenFromMain: true,
          },
        ],
      },
    ],
  },
];

export function isDashboardNavItemActive(
  pathname: string,
  item: DashboardNavItem,
): boolean {
  if (pathname === item.href) return true;
  if (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)) {
    return true;
  }
  if (
    item.aliases?.some(
      (alias) =>
        pathname === alias || pathname.startsWith(`${alias}/`),
    )
  ) {
    return true;
  }
  if (item.children?.some((child) => isDashboardNavItemActive(pathname, child))) {
    return true;
  }
  return false;
}

/** Itens de primeiro nível (um por entrada de menu principal). */
export function flattenDashboardNav(
  groups: DashboardNavGroup[] = DASHBOARD_NAV_GROUPS,
): DashboardNavItem[] {
  return groups.flatMap((group) => group.items);
}

/** Apenas entradas do menu principal (máx. 6). */
export function getMainDashboardNavItems(
  groups: DashboardNavGroup[] = DASHBOARD_NAV_GROUPS,
): DashboardNavItem[] {
  return flattenDashboardNav(groups).filter((item) => !item.hiddenFromMain);
}

/** Itens do menu inferior mobile (5 entradas). */
export const MOBILE_DASHBOARD_NAV_HREFS = [
  "/dashboard",
  "/dashboard/importar",
  "/dashboard/consignacoes",
  "/dashboard/analise",
  "/dashboard/perfil",
] as const;

export function getMobileDashboardNavItems(): DashboardNavItem[] {
  const main = getMainDashboardNavItems();
  return MOBILE_DASHBOARD_NAV_HREFS.map(
    (href) => main.find((item) => item.href === href)!,
  ).filter(Boolean);
}

/** Resolve item principal ativo (para destacar no mobile). */
export function findActiveMainDashboardNavItem(
  pathname: string,
  groups: DashboardNavGroup[] = DASHBOARD_NAV_GROUPS,
): DashboardNavItem | undefined {
  return getMainDashboardNavItems(groups).find((item) =>
    isDashboardNavItemActive(pathname, item),
  );
}
