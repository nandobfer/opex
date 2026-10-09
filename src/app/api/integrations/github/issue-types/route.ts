import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listGithubIssueTypes } from "@/features/github/server/lookups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/github/issue-types — Issue Types das organizações vinculadas. */
export const GET = withRoute(async () => ok(await listGithubIssueTypes()))
