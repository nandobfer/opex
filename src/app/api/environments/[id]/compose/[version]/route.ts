import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getComposeRevision } from "@/features/environments/server/compose-revisions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/environments/[id]/compose/[version] — conteúdo de uma revisão do compose gerenciado (Ver). */
export const GET = withRoute<{ id: string; version: string }>(async ({ params }) => {
    return ok(await getComposeRevision(params.id, Number(params.version)))
})
