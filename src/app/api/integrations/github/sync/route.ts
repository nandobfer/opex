import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getSyncStatus } from "@/features/github/server/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/github/sync — rotina e resultado por vínculo ("Sincronizar agora" usa a rota dos Crons). */
export const GET = withRoute(async () => ok(await getSyncStatus()))
