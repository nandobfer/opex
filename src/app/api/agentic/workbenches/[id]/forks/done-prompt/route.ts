import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { forksDonePromptSchema } from "@/features/agentic/schemas"
import { resolveForksDonePrompt } from "@/features/agentic/server/forks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/agentic/workbenches/[id]/forks/done-prompt `{ decision }` — resposta à pergunta da mesa
 * concluída com forks em aberto: `conclude` conclui os forks; `keep` os mantém utilizáveis.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, forksDonePromptSchema)
    if (!body.ok) return body.response
    return ok(await resolveForksDonePrompt(params.id, body.data.decision))
})
