import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { cancelGoSipalCode, sendGoSipalCode } from "@/features/go-sipal/session/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/integrations/go_sipal/session/code — pede o código de acesso para o e-mail configurado. */
export const POST = withRoute(async () => ok(await sendGoSipalCode(getLocalUser().id)))

/** DELETE /api/integrations/go_sipal/session/code — desiste do código pendente. */
export const DELETE = withRoute(async () => ok(await cancelGoSipalCode(getLocalUser().id)))
