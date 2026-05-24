/** Converte datas em português (ex.: «20 de Fevereiro de 2026») para ISO YYYY-MM-DD. */

const MESES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function normMes(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function parseDataPorExtensoBr(texto: string): string | undefined {
  const m = texto.match(/\b(\d{1,2})\s+de\s+([A-Za-zÀ-ÿçÇ]+)\s+de\s+(\d{4})\b/i);
  if (!m) return undefined;
  const dia = parseInt(m[1]!, 10);
  const mes = MESES[normMes(m[2]!)];
  const ano = parseInt(m[3]!, 10);
  if (!mes || dia < 1 || dia > 31 || ano < 1995 || ano > 2042) return undefined;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Cabeçalho CCB: «Divinópolis - MG, 20 de Fevereiro de 2026». */
export function parseDataDocumentoCabecalho(
  texto: string,
): { iso: string; local?: string; uf?: string } | null {
  const flat = texto.replace(/\s+/g, " ");
  const m = flat.match(
    /\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{2,48}?)\s*[-–,]\s*([A-Z]{2})\s*,?\s*(\d{1,2})\s+de\s+([A-Za-zÀ-ÿçÇ]+)\s+de\s+(\d{4})\b/i,
  );
  if (!m) {
    const soData = parseDataPorExtensoBr(flat);
    return soData ? { iso: soData } : null;
  }
  const iso = parseDataPorExtensoBr(`${m[3]} de ${m[4]} de ${m[5]}`);
  if (!iso) return null;
  return {
    iso,
    local: m[1].replace(/\s+/g, " ").trim(),
    uf: m[2].toUpperCase(),
  };
}

export function adicionarMesesIso(iso: string, meses: number): string {
  const p = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!p) return iso;
  const y = parseInt(p[1]!, 10);
  const m = parseInt(p[2]!, 10) - 1;
  const d = parseInt(p[3]!, 10);
  const dt = new Date(y, m, d);
  dt.setMonth(dt.getMonth() + meses);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatarIsoPtBr(iso?: string): string {
  if (!iso?.trim()) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
