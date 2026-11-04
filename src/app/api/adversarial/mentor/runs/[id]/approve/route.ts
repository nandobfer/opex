import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { mentorApproveSchema } from "@/features/adversarial-agent/mentor/schemas"
import { approveMentorRun } from "@/features/adversarial-agent/server/mentor/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/adversarial/mentor/runs/[id]/approve — grava a memória sugerida (texto opcionalmente
 * editado). Com a parte separada (OPE-132), grava as duas listas; `includeExtra: false` grava só a
 * principal e `extraText` edita a parte separada.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, mentorApproveSchema)
    if (!body.ok) return body.response
    return ok(await approveMentorRun(params.id, body.data.text, getLocalUser().id, body.data.target, { text: body.data.extraText, include: body.data.includeExtra }))
})
