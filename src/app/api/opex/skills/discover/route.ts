import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { opexSkillDiscoverSchema } from "@/features/opex-agent/skills"
import { discoverOpexSkills } from "@/features/opex-agent/server/skills/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opex/skills/discover — descobre as skills (pastas com SKILL.md) de um repositório do GitHub. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, opexSkillDiscoverSchema)
    if (!body.ok) return body.response
    return ok(await discoverOpexSkills(body.data.source))
})
