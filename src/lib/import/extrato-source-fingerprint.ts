export function normalizeExtratoDescriptionForRef(s: string): string {
  return s.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Hash estável por linha: data + valor + tipo + descrição normalizada + nome do arquivo */
export async function buildExtratoSourceRefFingerprint(params: {
  date: string;
  description: string;
  amount: number;
  type: string;
  fileName: string;
  /** Opcional — ex.: Mercado Pago (único por operação). */
  idOperacao?: string | null;
}): Promise<string | null> {
  try {
    const idPart =
      params.idOperacao && String(params.idOperacao).trim()
        ? `|OP:${String(params.idOperacao).trim()}`
        : "";
    const raw = `${params.date}|${params.type}|${Number(params.amount).toFixed(2)}|${normalizeExtratoDescriptionForRef(params.description)}|${params.fileName}${idPart}`;
    const buf = new TextEncoder().encode(raw);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(hash);
    let hex = "";
    for (let i = 0; i < bytes.length; i++)
      hex += bytes[i].toString(16).padStart(2, "0");
    return hex;
  } catch {
    return null;
  }
}

export async function sha256HexOfFile(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(hash);
    let hex = "";
    for (let i = 0; i < bytes.length; i++)
      hex += bytes[i].toString(16).padStart(2, "0");
    return hex;
  } catch {
    return null;
  }
}
