import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { disconnectGoSipal, getGoSipalSession } from "@/features/go-sipal/session/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/go_sipal/session — situação da sessão (nunca o token). */
export const GET = withRoute(async () => ok(await getGoSipalSession()))

/** DELETE /api/integrations/go_sipal/session — desconecta (apaga o JWT salvo). */
export const DELETE = withRoute(async () => ok(await disconnectGoSipal(getLocalUser().id)))
