import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { searchGithubUsers } from "@/features/github/server/lookups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/github/users?q= — pessoas conhecidas + busca no GitHub. */
export const GET = withRoute(async ({ req }) => ok(await searchGithubUsers((new URL(req.url).searchParams.get("q") ?? "").slice(0, 80))))
