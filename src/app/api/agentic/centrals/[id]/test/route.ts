import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { testCentral } from "@/features/agentic/server/tester"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/agentic/centrals/[id]/test — confere diretório, git, branches, gh e docker compose. */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await testCentral(params.id)))
