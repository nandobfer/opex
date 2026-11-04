import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { addFavoriteColorSchema } from "@/features/color-palette/schemas"
import { addFavoriteColor } from "@/features/color-palette/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/color-palette/favorites — adiciona `{ color, name? }` às favoritas e devolve a lista. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, addFavoriteColorSchema)
    if (!body.ok) return body.response
    return ok(await addFavoriteColor(body.data, getLocalUser().id))
})
