"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LayoutDashboard, ArrowLeftRight, LogOut } from "lucide-react";
import { toast } from "sonner";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/dashboard/transactions",
    label: "Transações",
    icon: ArrowLeftRight,
  },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 flex md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
              isActive
                ? "text-blue-600"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
      <button
        onClick={handleLogout}
        className="flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
      >
        <LogOut className="h-5 w-5" />
        Sair
      </button>
    </nav>
  );
}
