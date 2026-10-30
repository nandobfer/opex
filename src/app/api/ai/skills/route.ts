import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { listAiSkills } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/skills — skills instaladas no servidor OpenCode (sem o conteúdo). */
export const GET = withRoute(async ({ req }) => {
    try {
        return ok(await listAiSkills({ fresh: req.nextUrl.searchParams.get("refresh") === "1", signal: req.signal }))
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "AI_PROVIDER_ERROR")
        throw error
    }
})
