import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { mentorReorgApplySchema } from "@/features/adversarial-agent/mentor/schemas"
import { applyMentorReorg } from "@/features/adversarial-agent/server/mentor/reorganize"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/adversarial/mentor/reorganizations/[id]/apply { itemIds?, overrides? } — aprova o plano
 * (tudo ou os itens escolhidos) e aplica no Engramind com o serviço de memórias do Mentor.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, mentorReorgApplySchema)
    if (!body.ok) return body.response
    return ok(await applyMentorReorg(params.id, body.data, getLocalUser().id))
})
