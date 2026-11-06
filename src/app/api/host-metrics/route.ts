import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getHostMetrics } from "@/features/host-metrics/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Recursos do servidor do OpenCode (CPU, RAM, swap e disco), do último resultado em memória. */
export const GET = withRoute(async () => ok(await getHostMetrics()))
