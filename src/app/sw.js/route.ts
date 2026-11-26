import { BASE_PATH } from "@/lib/base-path"
import { buildServiceWorkerScript, serviceWorkerConfig } from "@/features/pwa/service-worker"

/** Por requisição, para os cabeçalhos abaixo valerem sempre (o navegador nunca guarda o script). */
export const dynamic = "force-dynamic"

/**
 * Service worker do PWA (OPE-196), público (ver `src/features/auth/paths.ts`). A versão vem do build
 * (`APP_BUILD_ID`, `next.config.ts`): cada deploy muda o script e o navegador instala o novo.
 */
export function GET() {
    const script = buildServiceWorkerScript(serviceWorkerConfig(process.env.APP_BUILD_ID || "dev", BASE_PATH))
    return new Response(script, {
        headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    })
}
