import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/** Diretório deste app (não use process.cwd(): no Cursor o cwd pode ser a raiz do monorepo). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** Evita aviso de “multiple lockfiles” quando o repo tem outros package-lock na raiz acima deste app. */
  turbopack: {
    root: projectRoot,
  },
  allowedDevOrigins: ["192.168.0.2"],
};

export default nextConfig;
