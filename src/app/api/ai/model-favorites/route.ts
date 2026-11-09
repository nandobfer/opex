import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { modelFavoriteSchema } from "@/features/ai/model-favorites/schemas"
import { addModelFavorite, listModelFavorites, removeModelFavorite } from "@/features/ai/model-favorites/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/model-favorites — modelos favoritos do usuário (`{ provider, model }`, em ordem de criação). */
export const GET = withRoute(async () => ok(await listModelFavorites(getLocalUser().id)))

/** POST /api/ai/model-favorites — favorita `{ provider, model }` (idempotente) e devolve a lista. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, modelFavoriteSchema)
    if (!body.ok) return body.response
    return ok(await addModelFavorite(body.data, getLocalUser().id))
})

/** DELETE /api/ai/model-favorites — remove `{ provider, model }` (corpo JSON; idempotente) e devolve a lista. */
export const DELETE = withRoute(async ({ req }) => {
    const body = await parseBody(req, modelFavoriteSchema)
    if (!body.ok) return body.response
    return ok(await removeModelFavorite(body.data, getLocalUser().id))
})
