import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-8">{children}</div>
      </main>
      <MobileNav />
    </div>
  );
}
