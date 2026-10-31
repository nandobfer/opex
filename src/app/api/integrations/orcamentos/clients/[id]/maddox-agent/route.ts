import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { clientMaddoxAgentConfigSchema } from "@/features/maddox-agent/schemas"
import { getClientMaddoxConfig, saveClientMaddoxConfig } from "@/features/maddox-agent/server/client-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/orcamentos/clients/[id]/maddox-agent — Maddox do cliente (desligado por padrão) e ferramentas ligadas. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await getClientMaddoxConfig(params.id))
})

/** PUT /api/integrations/orcamentos/clients/[id]/maddox-agent — salva (auditado) e avisa o portal em tempo real. */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, clientMaddoxAgentConfigSchema)
    if (!body.ok) return body.response
    return ok(await saveClientMaddoxConfig(params.id, body.data, getLocalUser().id))
})
