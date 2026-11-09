import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { opexSkillCreateSchema } from "@/features/opex-agent/skills"
import { createOpexSkill, listOpexSkills } from "@/features/opex-agent/server/skills/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/skills[?refresh=1][&versions=0] — skills do Agente Opex (sem conteúdo), com "Com atualização" (`versions=0` pula o GitHub). */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const params = new URL(req.url).searchParams
    return ok(await listOpexSkills({ refresh: params.get("refresh") === "1", versions: params.get("versions") !== "0" }))
})

/** POST /api/opex/skills — cria uma skill com texto (auditado). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, opexSkillCreateSchema)
    if (!body.ok) return body.response
    return created(await createOpexSkill(body.data, getLocalUser().id))
})
