import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { opexJobInputSchema, opexJobListQuerySchema } from "@/features/opex-agent/jobs"
import { createOpexJob, listOpexJobs } from "@/features/opex-agent/server/jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/opex/jobs?filter=scheduled|finished|all&origin=all|owner|client&clientId=&userId= — jobs
 * do Agente Opex (do dono e dos usuários do portal).
 */
export const GET = withRoute(async ({ req }) => {
    const params = new URL(req.url).searchParams
    const query = opexJobListQuerySchema.safeParse({
        filter: params.get("filter") ?? undefined,
        origin: params.get("origin") ?? undefined,
        clientId: params.get("clientId") || undefined,
        userId: params.get("userId") || undefined,
    })
    return ok(await listOpexJobs(query.success ? query.data : { filter: "all", origin: "all" }))
})

/** POST /api/opex/jobs — agenda um prompt do agente (`when: "now"` começa na hora). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, opexJobInputSchema)
    if (!body.ok) return body.response
    return created(await createOpexJob(body.data, { actorId: getLocalUser().id, createdBy: "user" }))
})
