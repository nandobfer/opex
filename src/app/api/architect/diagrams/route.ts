import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listArchitectHistory } from "@/features/architect-agent/server/diagrams"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/architect/diagrams — as versões mais recentes de todas as mesas (aba Histórico, sem o grafo). */
export const GET = withRoute(async () => ok(await listArchitectHistory()))
