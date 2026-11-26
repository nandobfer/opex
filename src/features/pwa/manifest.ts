import type { MetadataRoute } from "next"
import { withBasePath } from "@/lib/base-path"
import { PWA_BACKGROUND, PWA_DESCRIPTION, PWA_ICONS, PWA_NAME } from "./constants"

/**
 * Manifest do PWA (OPE-196). Função **pura**: recebe o subcaminho público para o teste cobrir qualquer
 * `BASE_PATH`. `start_url`, `id` e `scope` apontam para a raiz do app, que redireciona para os
 * Dashboards (com sessão) ou para `/login` (sem sessão).
 */
export function buildManifest(basePath: string): MetadataRoute.Manifest {
    const root = `${basePath}/`
    return {
        id: root,
        name: PWA_NAME,
        short_name: PWA_NAME,
        description: PWA_DESCRIPTION,
        lang: "pt-BR",
        dir: "ltr",
        start_url: root,
        scope: root,
        display: "standalone",
        theme_color: PWA_BACKGROUND,
        background_color: PWA_BACKGROUND,
        icons: PWA_ICONS.map((icon) => ({ src: withBasePath(icon.src, basePath), sizes: icon.sizes, type: "image/png", purpose: icon.purpose })),
    }
}
