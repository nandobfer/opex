import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { serviceWriteSchema } from "@/features/services/schemas"
import { getService, setServiceArchived, updateService } from "@/features/services/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/services/[id] — serviço completo (dono). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getService(params.id)))

/** PATCH /api/services/[id] — edita o serviço (recalcula os valores e regera a IA se a descrição mudar). */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, serviceWriteSchema)
    if (!body.ok) return body.response
    return ok(await updateService(params.id, body.data, getLocalUser().id))
})

/** DELETE /api/services/[id] — arquiva o serviço (soft delete); restaurável pelo filtro "Mostrar arquivados". */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await setServiceArchived(params.id, true, getLocalUser().id)
    return ok({ id: params.id })
})
