import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { opexJobInputSchema } from "@/features/opex-agent/jobs"
import { cancelOpexJob, getOpexJob, updateOpexJob } from "@/features/opex-agent/server/jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/jobs/[id] — detalhe do job. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getOpexJob(params.id)))

/**
 * PATCH /api/opex/jobs/[id] — edita um job agendado do dono (409 `OPEX_JOB_NOT_SCHEDULED` se já
 * começou; 403 `OPEX_JOB_CLIENT_READONLY` num job do portal).
 */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, opexJobInputSchema)
    if (!body.ok) return body.response
    return ok(await updateOpexJob(params.id, body.data, getLocalUser().id))
})

/** DELETE /api/opex/jobs/[id] — cancela um job agendado (fica no histórico como cancelado). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => ok(await cancelOpexJob(params.id, getLocalUser().id)))
