import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineChannelActionSchema } from "@/features/routine-agents/schemas"
import { applyRoutineChannelAction } from "@/features/routine-agents/server/provisioning-channels"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/routine-agents/[id]/provisioning/channels — Remover/bloquear, desbloquear ou assinar de novo um canal extra (OPE-143). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, routineChannelActionSchema)
    if (!body.ok) return body.response
    return ok(await applyRoutineChannelAction(params.id, body.data.action, body.data.channel, getLocalUser().id))
})
