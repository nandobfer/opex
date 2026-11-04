import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { mentorReorgScopeSchema } from "@/features/adversarial-agent/mentor/schemas"
import { recoverOrphanMentorReorgs, startMentorReorg } from "@/features/adversarial-agent/server/mentor/reorg-queue"
import { listMentorReorgs } from "@/features/adversarial-agent/server/mentor/reorganize"
import { loadMentorSettings } from "@/features/adversarial-agent/server/mentor/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/adversarial/mentor/reorganizations — as revisões do acervo mais recentes (histórico). */
export const GET = withRoute(async () => {
    await recoverOrphanMentorReorgs()
    return ok(await listMentorReorgs())
})

/**
 * POST /api/adversarial/mentor/reorganizations { targets?, centralIds? } — inicia a revisão do acervo
 * (uma por vez). Nada é gravado até a aprovação do Plano de reorganização.
 */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, mentorReorgScopeSchema)
    if (!body.ok) return body.response
    const { settings } = await loadMentorSettings()
    return ok(await startMentorReorg(body.data, settings, getLocalUser().id))
})
