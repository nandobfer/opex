import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listActiveTimers } from "@/features/time/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/time/active — timers ativos no Go! Sipal. */
export const GET = withRoute(async () => ok(await listActiveTimers()))
