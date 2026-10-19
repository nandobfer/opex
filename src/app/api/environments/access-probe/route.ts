import { withRoute, DomainError } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { randomId } from "@/lib/random-id"
import { requireAdminSession } from "@/features/auth/server/context"
import { loadEnvironmentSettings } from "@/features/ai/server/settings"
import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { probeHost } from "@/features/environments/server/host"

/**
 * "Testar acesso ao host" (Administração de sistema, só o dono): pelo shell do OpenCode, sem modelo,
 * grava/lê/remove um acesso de teste no diretório de acesso e confere Docker e Docker Compose.
 */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const { settings } = await loadEnvironmentSettings()
    const client = await getOpencodeClient().catch(() => {
        throw new DomainError(502, "OpenCode indisponível: confira a integração do OpenCode", "HOST_UNREACHABLE")
    })
    return ok(await probeHost(client, settings, randomId().replace(/-/g, "").slice(0, 16)))
})
