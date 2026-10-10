import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { startTimerSchema } from "@/features/time/schemas"
import { startTimer } from "@/features/time/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/time/start — inicia o timer da tarefa. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, startTimerSchema)
    if (!body.ok) return body.response
    return created(await startTimer(body.data, getLocalUser().id))
})
