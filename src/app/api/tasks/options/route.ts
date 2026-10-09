import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getTaskOptions } from "@/features/tasks/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/tasks/options — produtos e desenvolvedores para os filtros. */
export const GET = withRoute(async () => ok(await getTaskOptions()))
