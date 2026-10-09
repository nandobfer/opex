import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listGithubRepos } from "@/features/github/server/lookups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/github/repos[?refresh=1] — repositórios acessíveis pelo token (cache de 5 min). */
export const GET = withRoute(async ({ req }) => ok(await listGithubRepos(new URL(req.url).searchParams.get("refresh") === "1")))
