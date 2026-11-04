import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { mentorReorgScopeSchema } from "@/features/adversarial-agent/mentor/schemas"
import { previewMentorReorg } from "@/features/adversarial-agent/server/mentor/reorganize"
import { loadMentorSettings } from "@/features/adversarial-agent/server/mentor/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const list = (value: string | null) => (value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [])

/**
 * GET /api/adversarial/mentor/reorganizations/preview-count?targets&centralIds — quantas memórias o
 * recorte tem, quantas chamadas de IA serão feitas e o custo médio por memória das últimas revisões.
 */
export const GET = withRoute(async ({ req }) => {
    const params = req.nextUrl.searchParams
    const query = mentorReorgScopeSchema.safeParse({ targets: list(params.get("targets")), centralIds: list(params.get("centralIds")) })
    if (!query.success) return validationError(query.error)
    const { settings } = await loadMentorSettings()
    return ok(await previewMentorReorg(query.data, settings))
})
