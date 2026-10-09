import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listDiscardedDrafts } from "@/features/github/server/drafts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/github/drafts — rascunhos descartados (Restaurar). */
export const GET = withRoute(async () => ok(await listDiscardedDrafts()))
