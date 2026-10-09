import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listPeople, refreshPeople } from "@/features/github/server/people"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/github/people — pessoas do GitHub e o desenvolvedor de cada uma. */
export const GET = withRoute(async () => ok(await listPeople()))

/** POST /api/integrations/github/people — atualiza a lista (assignees dos repositórios + autores). */
export const POST = withRoute(async () => ok(await refreshPeople()))
