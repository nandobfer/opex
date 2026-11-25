import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { simulateSchema } from "@/features/secretary-agent/schemas"
import { simulateSecretary } from "@/features/secretary-agent/server/simulate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/secretary/simulate — Simulação: o turno com as configurações em edição, sem enviar nem gravar (só o dono). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, simulateSchema)
    if (!body.ok) return body.response
    return ok(await simulateSecretary(body.data))
})
