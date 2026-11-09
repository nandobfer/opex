import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getLocalUser } from "@/lib/local-user"
import { opexSkillEnabledSchema, opexSkillUpdateSchema } from "@/features/opex-agent/skills"
import { deleteOpexSkill, getOpexSkill, setOpexSkillEnabled, updateOpexSkill } from "@/features/opex-agent/server/skills/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/opex/skills/[id] — corpo e lista de arquivos de apoio. */
export const GET = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await getOpexSkill(params.id))
})

/** PUT …/[id] — edita descrição, corpo e arquivos de apoio. */
export const PUT = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, opexSkillUpdateSchema)
    if (!body.ok) return body.response
    return ok(await updateOpexSkill(params.id, body.data, getLocalUser().id))
})

/** PATCH …/[id] — `{ enabled }`: liga/desliga para o Agente Opex do dono. */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, opexSkillEnabledSchema)
    if (!body.ok) return body.response
    return ok(await setOpexSkillEnabled(params.id, body.data.enabled, getLocalUser().id))
})

/** DELETE …/[id] — remove/desinstala e tira a skill da seleção dos rotineiros (D6). */
export const DELETE = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await deleteOpexSkill(params.id, getLocalUser().id))
})
