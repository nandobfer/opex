import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { restoreDraft } from "@/features/github/server/drafts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/tasks/drafts/[id]/restore — volta o rascunho descartado para o quadro. */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await restoreDraft(params.id, getLocalUser().id)))
