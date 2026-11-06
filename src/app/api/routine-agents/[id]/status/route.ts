import { z } from "zod"
import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { setRoutineAgentStatus } from "@/features/routine-agents/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({ action: z.enum(["pause", "resume", "archive", "unarchive"]) })

/** POST /api/routine-agents/[id]/status — Pausar, Retomar, Arquivar ou Desarquivar. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, schema)
    if (!body.ok) return body.response
    return ok(await setRoutineAgentStatus(params.id, body.data.action, getLocalUser().id))
})
