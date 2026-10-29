import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { mentorApproveSchema } from "@/features/adversarial-agent/mentor/schemas"
import { approveMentorRun } from "@/features/adversarial-agent/server/mentor/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/adversarial/mentor/runs/[id]/approve — grava a memória sugerida (texto opcionalmente editado). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, mentorApproveSchema)
    if (!body.ok) return body.response
    return ok(await approveMentorRun(params.id, body.data.text, getLocalUser().id))
})
