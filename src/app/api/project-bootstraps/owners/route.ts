import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listRepoOwners } from "@/features/project-bootstrap/server/github"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/project-bootstraps/owners — a conta do token do GitHub e as organizações acessíveis. */
export const GET = withRoute(async () => ok(await listRepoOwners()))
