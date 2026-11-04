import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getColorPalette } from "@/features/color-palette/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/color-palette — cores favoritas do seletor de cores. */
export const GET = withRoute(async () => ok(await getColorPalette()))
