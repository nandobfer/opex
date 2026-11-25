import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { SecretaryProviderError } from "@/features/secretary-agent/ai-errors"
import { safeErr, secretaryLog } from "@/features/secretary-agent/server/log"
import { simulateSchema } from "@/features/secretary-agent/schemas"
import { simulateSecretary } from "@/features/secretary-agent/server/simulate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/secretary/simulate — Simulação: o turno com as configurações em edição, sem enviar nem gravar (só o dono). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, simulateSchema)
    if (!body.ok) return body.response
    try {
        return ok(await simulateSecretary(body.data))
    } catch (error) {
        if (!(error instanceof SecretaryProviderError)) throw error
        secretaryLog.warn({ ...safeErr(error.cause), reason: error.message }, "[secretario] Falha de IA na simulação")
        throw new DomainError(502, error.message, "SECRETARY_PROVIDER_ERROR")
    }
})
