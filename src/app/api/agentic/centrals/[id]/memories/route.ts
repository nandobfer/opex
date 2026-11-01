import { withRoute } from "@/lib/api/route"
import { createMemoryRoute, listMemoriesRoute } from "@/features/ai/server/memory-routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/centrals/[id]/memories — memórias do agente desenvolvedor desta central. */
export const GET = withRoute<{ id: string }>(async ({ params }) => listMemoriesRoute("developer-central", { centralId: params.id }))

/** POST /api/agentic/centrals/[id]/memories — nova memória da central (`{ texto, categoria?, fixada? }`). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => createMemoryRoute(req, "developer-central", { centralId: params.id }))
