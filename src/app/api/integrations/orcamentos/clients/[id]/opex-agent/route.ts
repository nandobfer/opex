import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { clientOpexAgentConfigSchema } from "@/features/opex-agent/schemas"
import { getClientOpexConfig, saveClientOpexConfig } from "@/features/opex-agent/server/client-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/integrations/orcamentos/clients/[id]/opex-agent — configuração do Agente Opex do cliente. */
export const GET = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await getClientOpexConfig(params.id))
})

/** PUT …/opex-agent — ativa/desativa e escolhe as ferramentas do agente para o cliente (auditado). */
export const PUT = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, clientOpexAgentConfigSchema)
    if (!body.ok) return body.response
    return ok(await saveClientOpexConfig(params.id, body.data, getLocalUser().id))
})
