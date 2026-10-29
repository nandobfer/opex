import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listAuthProviders } from "@/features/opencode-accounts/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/providers/opencode/accounts — providers do OpenCode com as contas (sem segredos). */
export const GET = withRoute(async () => ok(await listAuthProviders()))
