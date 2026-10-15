import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { serviceWriteSchema } from "@/features/services/schemas"
import { createService } from "@/features/services/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/services — cria um serviço (lançamento manual de faturamento). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, serviceWriteSchema)
    if (!body.ok) return body.response
    return created(await createService(body.data, getLocalUser().id))
})
