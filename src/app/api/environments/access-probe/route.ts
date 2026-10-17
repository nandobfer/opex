import { withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { requireAdminSession } from "@/features/auth/server/context"
import { loadEnvironmentSettings } from "@/features/ai/server/settings"
import { runAccessProbe } from "@/features/environments/server/access-probe"

/**
 * Preflight exclusivo do dono (Administração de sistema): pede ao agente que busque o envelope de
 * teste e devolva o valor que só o Opex conhece, provando o caminho servidor → agente antes de
 * qualquer operação real.
 */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const { settings } = await loadEnvironmentSettings()
    return ok(await runAccessProbe(settings))
})
