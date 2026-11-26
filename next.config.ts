import type { NextConfig } from "next"
import pkg from "./package.json"
import { BASE_PATH } from "./src/lib/base-path"

// Versão do build (PWA, OPE-196): muda a cada `next build` e fica fixa no bundle. O service worker
// (`src/app/sw.js/route.ts`) a embute, então cada deploy instala um SW novo e limpa o cache antigo.
const BUILD_ID = `${pkg.version}-${Date.now().toString(36)}`

const nextConfig: NextConfig = {
    // Subcaminho público (proxy com prefixo). Mesmo valor no acesso direto pelo IP/porta.
    basePath: BASE_PATH || undefined,
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "img.clerk.com",
            },
        ],
    },
    output: "standalone",
    // `ssh2` (aba Controles do OpenCode) carrega binários opcionais em try/catch: fica fora do bundle.
    // Plugins (OPE-172): o kernel Cordis, o Rolldown (binário nativo) e o compilador do Tailwind rodam
    // no servidor fora do bundle do Next.
    serverExternalPackages: ["ssh2", "cordis", "rolldown", "tailwindcss"],
    experimental: {
        // O middleware (`src/middleware.ts`) bufferiza o corpo; o padrão de 10 MB cortaria os anexos da aba Conversas do
        // Secretário (OPE-197: documento até 100 MB, como o WhatsApp). Margem para o multipart.
        proxyClientMaxBodySize: "101mb",
    },
    env: {
        APP_VERSION: pkg.version,
        APP_BUILD_ID: BUILD_ID,
    },
    async redirects() {
        // Acesso direto pela raiz (`http://IP:porta/`) cai no subcaminho do app.
        return BASE_PATH ? [{ source: "/", destination: BASE_PATH, basePath: false, permanent: false }] : []
    },
}

export default nextConfig
