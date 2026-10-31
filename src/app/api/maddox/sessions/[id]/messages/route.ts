import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { sendOpexMessageSchema } from "@/features/opex-agent/schemas"
import { sendMaddoxMessage } from "@/features/maddox-agent/server/runner"
import { MADDOX_OWNER_SCOPE } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/sessions/[id]/messages — grava a mensagem e inicia o turno no OpenCode (resposta pelo stream). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, sendOpexMessageSchema)
    if (!body.ok) return body.response
    return created(await sendMaddoxMessage(params.id, body.data, getLocalUser().id, MADDOX_OWNER_SCOPE))
})
