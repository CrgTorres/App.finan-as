import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { corrigirTotaisPayslipsGravados } from "../lib/anexos/corrigir-totais-payslips-gravados";

function carregarEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key]) continue;
    process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
}

async function main() {
  carregarEnvLocal();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
  const userId = process.env.PAYSLIP_FIX_USER_ID ?? process.argv[2];

  if (!supabaseUrl || !serviceRole) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Opcional: PAYSLIP_FIX_USER_ID ou argv[2] com uuid do utilizador.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let targetUserId = userId;
  if (!targetUserId) {
    const { data: users, error } = await supabase.auth.admin.listUsers({ perPage: 5 });
    if (error) throw error;
    const u = users.users[0];
    if (!u) throw new Error("Nenhum utilizador na base — passe PAYSLIP_FIX_USER_ID.");
    targetUserId = u.id;
    console.info("[corrigir-totais] utilizador:", u.email ?? u.id);
  }

  const dryRun = process.argv.includes("--dry-run");
  const resumo = await corrigirTotaisPayslipsGravados(supabase, {
    userId: targetUserId,
    dryRun,
    sincronizarSalario: !dryRun,
  });

  console.info("[corrigir-totais] concluído", {
    dryRun,
    analisados: resumo.analisados,
    corrigidos: resumo.corrigidos,
    ignorados: resumo.ignorados,
    erros: resumo.erros,
  });
  for (const l of resumo.linhas.slice(0, 20)) {
    console.info(
      `  ${String(l.month).padStart(2, "0")}/${l.year}: bruto ${l.antes.bruto} → ${l.depois.bruto} (${l.rubricas} rubricas)`,
    );
  }
  if (resumo.linhas.length > 20) {
    console.info(`  … +${resumo.linhas.length - 20} competências`);
  }
  if (resumo.primeiraMensagemErro) console.error("primeiro erro:", resumo.primeiraMensagemErro);
}

void main().catch((error) => {
  console.error("[corrigir-totais] falhou", error);
  process.exitCode = 1;
});
