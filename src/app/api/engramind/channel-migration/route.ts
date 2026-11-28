import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { channelMigrationStartSchema } from "@/features/engramind/schemas/channel-migration"
import { getChannelMigrationState, startChannelMigration } from "@/features/engramind/server/channel-migration/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/engramind/channel-migration — modo dos nomes dos canais e a última migração (OPE-206). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await getChannelMigrationState())
})

/** POST /api/engramind/channel-migration — inicia ou retoma a migração (ida ou volta atrás); roda em segundo plano. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, channelMigrationStartSchema)
    if (!body.ok) return body.response
    await startChannelMigration(body.data, getLocalUser().id)
    return ok(await getChannelMigrationState())
})
