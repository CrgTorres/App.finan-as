"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function UserHeader() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  if (!userEmail) return null;

  const initials = userEmail[0].toUpperCase();

  return (
    <div className="flex md:hidden items-center justify-end gap-2 px-4 pt-4 pb-1">
      <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5 shadow-sm">
        <div className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">
          {initials}
        </div>
        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium max-w-[160px] truncate">
          {userEmail}
        </span>
      </div>
    </div>
  );
}
