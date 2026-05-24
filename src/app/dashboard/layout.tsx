import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserHeader } from "@/components/layout/user-header";
import { DashboardInfoTickerFooter } from "@/components/layout/dashboard-info-ticker-footer";
import { CompletarPerfilTitularBanner } from "@/components/contratos/CompletarPerfilTitularBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="relative flex min-h-screen flex-1 min-w-0 flex-col">
        <main className="flex-1 overflow-auto pb-[14.5rem] md:pb-[12rem]">
          <UserHeader />
          <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
            <CompletarPerfilTitularBanner />
            {children}
          </div>
        </main>
        <DashboardInfoTickerFooter />
      </div>
      <MobileNav />
    </div>
  );
}
