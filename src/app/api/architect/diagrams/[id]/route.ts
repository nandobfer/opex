import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getDiagram } from "@/features/architect-agent/server/diagrams"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/architect/diagrams/[id] — uma versão do diagrama, com o grafo. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getDiagram(params.id)))
