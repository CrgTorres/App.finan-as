/**
 * Perfil do titular da conta (utilizador) para cruzar com consumidor do contrato.
 * Fontes: variáveis de ambiente, localStorage opcional, texto de contracheques gravados.
 */

export type PerfilTitularApp = {
  cpf?: string;
  cpfDigitos?: string;
  nome?: string;
  fontes: string[];
};

const STORAGE_KEY = "financa_pessoal_titular_v1";

/** Nome do titular: sem espaços extras, sempre MAIÚSCULAS (qualquer fonte/teclado). */
export function normalizarNomeTitular(nome: string): string {
  return nome
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

/** CPF: só dígitos (máx. 11) e máscara 000.000.000-00. */
export function formatarCpfEntrada(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function perfilTitularEstaCompleto(p: Partial<PerfilTitularApp>): boolean {
  const nome = p.nome ? normalizarNomeTitular(p.nome) : "";
  return Boolean(nome.length >= 4 && p.cpfDigitos?.length === 11);
}

export function cpfSoDigitos(cpf?: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? d : null;
}

export function formatarCpf11(d: string): string {
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Persiste nome/CPF neste dispositivo (complementa perfil no Supabase). */
export function salvarPerfilTitularLocal(opts: { nome?: string; cpfDigitos?: string }): void {
  if (typeof window === "undefined") return;
  const prev = lerStorage();
  const nome = opts.nome ? normalizarNomeTitular(opts.nome) : prev.nome;
  const cpfDigitos = opts.cpfDigitos ?? prev.cpfDigitos;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        nome,
        cpf: cpfDigitos ? formatarCpf11(cpfDigitos) : undefined,
      }),
    );
  } catch {
    /* ignore quota */
  }
}

function lerStorage(): Partial<PerfilTitularApp> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as { cpf?: string; nome?: string };
    const d = cpfSoDigitos(j.cpf);
    return {
      cpf: d ? formatarCpf11(d) : undefined,
      cpfDigitos: d ?? undefined,
      nome: j.nome ? normalizarNomeTitular(j.nome) : undefined,
    };
  } catch {
    return {};
  }
}

/** Perfil a partir de `.env.local` (cliente). */
export function perfilTitularDeEnv(): PerfilTitularApp {
  const fontes: string[] = [];
  let cpfDigitos: string | null = null;
  let nome: string | undefined;

  const rawCpf = (process.env.NEXT_PUBLIC_USER_CPF_DIGITS_FOR_PDF ?? "").replace(/\D/g, "");
  if (rawCpf.length === 11) {
    cpfDigitos = rawCpf;
    fontes.push("CPF em NEXT_PUBLIC_USER_CPF_DIGITS_FOR_PDF");
  }

  const rawNome = normalizarNomeTitular(process.env.NEXT_PUBLIC_USER_FULL_NAME ?? "");
  if (rawNome.length >= 4) {
    nome = rawNome;
    fontes.push("Nome em NEXT_PUBLIC_USER_FULL_NAME");
  }

  const st = lerStorage();
  if (st.cpfDigitos && !cpfDigitos) {
    cpfDigitos = st.cpfDigitos;
    fontes.push("CPF guardado neste dispositivo");
  }
  if (st.nome && !nome) {
    nome = st.nome;
    fontes.push("Nome guardado neste dispositivo");
  }

  return {
    cpf: cpfDigitos ? formatarCpf11(cpfDigitos) : undefined,
    cpfDigitos: cpfDigitos ?? undefined,
    nome,
    fontes,
  };
}

/** Extrai CPF e nome do servidor a partir de texto de contracheque / ficha. */
export function inferirTitularDeTextoFolha(texto: string): PerfilTitularApp {
  const fontes: string[] = [];
  const flat = texto.replace(/\s+/g, " ");
  let cpfDigitos: string | null = null;
  let nome: string | undefined;

  const cpfs = [...flat.matchAll(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/g)].map((m) =>
    m[1].replace(/\D/g, ""),
  );
  if (cpfs.length > 0) {
    const freq = new Map<string, number>();
    for (const c of cpfs) freq.set(c, (freq.get(c) ?? 0) + 1);
    cpfDigitos = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (cpfDigitos) fontes.push("CPF mais frequente em contracheque/ficha");
  }

  const blocoServ = flat.match(
    /(?:nome\s+do\s+)?servidor|dados\s+do\s+servidor|identifica[cç][aã]o\s+do\s+servidor[\s\S]{0,400}/i,
  );
  if (blocoServ) {
    const nm = blocoServ[0].match(
      /(?:nome|servidor)\s*[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{8,64}?)(?=\s+(?:CPF|Mat|cargo|$))/i,
    );
    if (nm) {
      nome = nm[1].replace(/\s+/g, " ").trim();
      fontes.push("Nome em bloco de servidor (folha)");
    }
  }

  if (!nome && cpfDigitos) {
    const idx = flat.search(new RegExp(cpfDigitos.slice(0, 3)));
    if (idx > 10) {
      const antes = flat.slice(Math.max(0, idx - 100), idx);
      const caps = antes.match(/([A-ZÁÀÂÃÉÍÓÔÕÚÇ][A-ZÁÀÂÃÉÍÓÔÕÚÇa-záàâãéíóôõúç\s.'-]{8,56})\s*$/);
      if (caps) {
        nome = caps[1].replace(/\s+/g, " ").trim();
        fontes.push("Nome antes do CPF na folha");
      }
    }
  }

  return {
    cpf: cpfDigitos ? formatarCpf11(cpfDigitos) : undefined,
    cpfDigitos: cpfDigitos ?? undefined,
    nome: nome ? normalizarNomeTitular(nome) : undefined,
    fontes,
  };
}

export function unirPerfisTitular(...partes: PerfilTitularApp[]): PerfilTitularApp {
  const fontes = [...new Set(partes.flatMap((p) => p.fontes))];
  const cpfDigitos = partes.find((p) => p.cpfDigitos)?.cpfDigitos;
  const nomeBruto = partes.find((p) => p.nome)?.nome;
  const nome = nomeBruto ? normalizarNomeTitular(nomeBruto) : undefined;
  return {
    cpf: cpfDigitos ? formatarCpf11(cpfDigitos) : undefined,
    cpfDigitos,
    nome,
    fontes,
  };
}
