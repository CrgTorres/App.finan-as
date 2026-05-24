import { NextResponse } from "next/server";
import { corrigirTotaisPayslipsGravados } from "@/lib/anexos/corrigir-totais-payslips-gravados";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const resultado = await corrigirTotaisPayslipsGravados(supabase, {
      sincronizarSalario: true,
    });
    return NextResponse.json(resultado);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao corrigir totais.";
    const status = /login|sessão/i.test(msg) ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
