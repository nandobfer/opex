import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listGithubLabels } from "@/features/github/server/lookups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/github/labels — labels dos repositórios vinculados. */
export const GET = withRoute(async () => ok(await listGithubLabels()))
