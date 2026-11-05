import { z } from "zod"
import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { reprovisionRoutineAgent } from "@/features/routine-agents/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({ mode: z.enum(["reprovision", "retry"]) })

/** POST /api/routine-agents/[id]/provisioning — "Reprovisionar" (extras) ou "Tentar de novo" (o que faltou). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, schema)
    if (!body.ok) return body.response
    return ok(await reprovisionRoutineAgent(params.id, body.data.mode, getLocalUser().id))
})
