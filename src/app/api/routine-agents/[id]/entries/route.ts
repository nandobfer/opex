import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { routineEntryInputSchema } from "@/features/routine-agents/schemas"
import { addRoutineEntry, listRoutineEntries } from "@/features/routine-agents/server/entries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** GET /api/routine-agents/[id]/entries — entradas do dono (mais recentes primeiro). */
export const GET = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    return ok(await listRoutineEntries(params.id))
})

/** POST — grava uma entrada (uma memória no canal escolhido). */
export const POST = withRoute<Params>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, routineEntryInputSchema)
    if (!body.ok) return body.response
    return ok(await addRoutineEntry(params.id, body.data, getLocalUser().id), { status: 201 })
})
