import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { parseHexColor } from "@/lib/colors"
import { getLocalUser } from "@/lib/local-user"
import { favoriteColorSchema } from "@/features/color-palette/schemas"
import { removeFavoriteColor, updateFavoriteColor } from "@/features/color-palette/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function colorFromPath(hex: string): string {
    const color = parseHexColor(hex)
    if (!color) throw new DomainError(400, "Cor inválida: use o formato RRGGBB", "VALIDATION_ERROR")
    return color
}

/** PATCH /api/color-palette/favorites/A78BFA — edita `{ color, name? }` da favorita, mantendo a posição. */
export const PATCH = withRoute<{ hex: string }>(async ({ req, params }) => {
    const current = colorFromPath(params.hex)
    const body = await parseBody(req, favoriteColorSchema)
    if (!body.ok) return body.response
    return ok(await updateFavoriteColor(current, body.data, getLocalUser().id))
})

/** DELETE /api/color-palette/favorites/A78BFA — remove a favorita (hex sem `#` no caminho). */
export const DELETE = withRoute<{ hex: string }>(async ({ params }) => {
    return ok(await removeFavoriteColor(colorFromPath(params.hex), getLocalUser().id))
})
