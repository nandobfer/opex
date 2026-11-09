import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { opexSkillInstallSchema } from "@/features/opex-agent/skills"
import { installOpexSkills } from "@/features/opex-agent/server/skills/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opex/skills/install — instala as skills marcadas (resultado por skill). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, opexSkillInstallSchema)
    if (!body.ok) return body.response
    return ok(await installOpexSkills(body.data, getLocalUser().id))
})
