import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { cancelOpexWatch, getOpexWatch } from "@/features/opex-agent/server/watches"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/watches/[id] — detalhe da observação. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getOpexWatch(params.id)))

/** DELETE /api/opex/watches/[id] — cancela uma observação ativa (409 `OPEX_WATCH_NOT_ACTIVE` depois de disparar). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => ok(await cancelOpexWatch(params.id, getLocalUser().id)))
