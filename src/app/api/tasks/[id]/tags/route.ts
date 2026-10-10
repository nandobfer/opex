import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { AiProviderError } from "@/lib/ai/errors"
import { prepareTaskTags, runTaskTags } from "@/features/ai/server/task-tags"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/tasks/[id]/tags — gera (ou regenera) as tags da tarefa com a IA, segundo a taxonomia
 * da feature "Tags de tarefas". Feature indisponível (409) ou tarefa inexistente (404) respondem
 * JSON com o motivo; sucesso devolve `{ tags }`.
 */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    const prepared = await prepareTaskTags(params.id)
    try {
        return ok({ tags: await runTaskTags(prepared) })
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "AI_PROVIDER_ERROR")
        throw error
    }
})
