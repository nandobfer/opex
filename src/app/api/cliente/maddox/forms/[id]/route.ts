import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { replyMaddoxFormSchema } from "@/features/maddox-agent/schemas"
import { replyMaddoxForm } from "@/features/maddox-agent/server/requests"
import { requireClientActor } from "@/features/auth/server/context"
import { assertClientMaddoxEnabled } from "@/features/maddox-agent/server/client-config"
import { clientMaddoxScope } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/cliente/maddox/forms/[id] — responde ou dispensa a pergunta do OpenCode. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requireClientActor(req)
    await assertClientMaddoxEnabled(actor)
    const body = await parseBody(req, replyMaddoxFormSchema)
    if (!body.ok) return body.response
    return ok(await replyMaddoxForm(params.id, body.data, actor.userId, clientMaddoxScope(actor)))
})
