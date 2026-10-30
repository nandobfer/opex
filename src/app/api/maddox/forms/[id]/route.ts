import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { replyMaddoxFormSchema } from "@/features/maddox-agent/schemas"
import { replyMaddoxForm } from "@/features/maddox-agent/server/requests"
import { MADDOX_OWNER_SCOPE } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/forms/[id] — responde (`answer`) ou dispensa (`cancel`) a pergunta do OpenCode. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, replyMaddoxFormSchema)
    if (!body.ok) return body.response
    return ok(await replyMaddoxForm(params.id, body.data, getLocalUser().id, MADDOX_OWNER_SCOPE))
})
