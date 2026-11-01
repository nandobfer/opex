import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { retryDiagram } from "@/features/architect-agent/server/diagrams"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/architect/diagrams/[id]/retry — "Tentar novamente": refaz a mesma versão que falhou. */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await retryDiagram(params.id)))
