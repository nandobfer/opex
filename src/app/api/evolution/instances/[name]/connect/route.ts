import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { connectInstanceSchema } from "@/features/evolution-api/schemas"
import { connectInstance } from "@/features/evolution-api/server/instances"
import { instanceParam } from "@/features/evolution-api/server/params"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/evolution/instances/[name]/connect — pareia por QR code (`mode: qr`) ou código (`mode: pairing` + número). */
export const POST = withRoute<{ name: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, connectInstanceSchema)
    if (!body.ok) return body.response
    return ok(await connectInstance(instanceParam(params.name), body.data, getLocalUser().id))
})
