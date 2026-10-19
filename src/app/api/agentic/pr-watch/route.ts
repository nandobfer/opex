import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { loadPrWatchSchedule } from "@/features/agentic/server/pr-watch-schedule"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/pr-watch — agendamento do acompanhamento do PR (ligado, próxima verificação, executando agora). */
export const GET = withRoute(async () => ok(await loadPrWatchSchedule()))
