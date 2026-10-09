import type { NextConfig } from "next"
import pkg from "./package.json"
import { BASE_PATH } from "./src/lib/base-path"

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
    env: {
        APP_VERSION: pkg.version,
    },
    async redirects() {
        // Acesso direto pela raiz (`http://IP:porta/`) cai no subcaminho do app.
        return BASE_PATH ? [{ source: "/", destination: BASE_PATH, basePath: false, permanent: false }] : []
    },
}

export default nextConfig
