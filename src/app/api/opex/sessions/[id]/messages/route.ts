import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { sendOpexMessageSchema } from "@/features/opex-agent/schemas"
import { sendMessage } from "@/features/opex-agent/server/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/opex/sessions/[id]/messages — grava a mensagem (texto e/ou `fileIds` já confirmados) e
 * inicia o turno em segundo plano (a resposta chega pelo stream). 409 com a sessão ocupada ou o
 * agente indisponível.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, sendOpexMessageSchema)
    if (!body.ok) return body.response
    return created(await sendMessage(params.id, body.data, getLocalUser().id))
})
