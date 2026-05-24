/** Erros transitórios do Web Locks API usado pelo @supabase/auth-js entre abas/requisições. */
export function isSupabaseNavigatorLockError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("lock broken") ||
    msg.includes("stole it") ||
    (msg.includes("steal") && msg.includes("lock"))
  );
}
