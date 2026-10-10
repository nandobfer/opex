import { created } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { approveDraft } from "@/features/orcamentos/server/portal"
import { requireClient } from "@/features/orcamentos/server/token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { id: string }

/** POST /api/cliente/drafts/[id]/approve — cria a tarefa de acordo com a prévia aprovada. */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const client = await requireClient(req)
    return created(await approveDraft(client, params.id, client.name))
})
