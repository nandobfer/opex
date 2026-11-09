import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { opexSkillUpdateManySchema } from "@/features/opex-agent/skills"
import { updateOpexSkills } from "@/features/opex-agent/server/skills/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opex/skills/update — atualiza skills instaladas com a versão do repositório (`ids` ou `all`). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, opexSkillUpdateManySchema)
    if (!body.ok) return body.response
    return ok(await updateOpexSkills(body.data, getLocalUser().id))
})
