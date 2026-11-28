import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getProjectBootstrap } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/project-bootstraps/[id] — estado do bootstrap (retoma o trabalho perdido num reinício). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getProjectBootstrap(params.id)))
