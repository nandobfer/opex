import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listDockerBuilders } from "@/features/agentic/server/docker-builders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/agentic/centrals/[id]/docker-builders — builders do Docker (buildx) na máquina do OpenCode. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await listDockerBuilders(params.id)))
