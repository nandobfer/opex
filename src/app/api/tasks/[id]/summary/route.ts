import { withRoute } from "@/lib/api/route"
import { prepareTaskSummary, runTaskSummary } from "@/features/ai/server/task-summary"
import type { TaskSummaryEvent } from "@/features/ai/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/tasks/[id]/summary — gera (ou regenera) o resumo de 1 linha da tarefa com a IA.
 *
 * Feature indisponível (409) ou tarefa inexistente (404) respondem JSON. Senão, NDJSON
 * (`application/x-ndjson`): `start`, `delta`/`reasoning`/`tool`/`notice` e um `done` ou `error`
 * final. O resumo é gravado no `done`. Fechar a conexão cancela a geração.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const prepared = await prepareTaskSummary(params.id)
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let open = true
            const write = (event: TaskSummaryEvent) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
                } catch {
                    open = false
                }
            }
            for await (const event of runTaskSummary(prepared, req.signal)) write(event)
            if (open) controller.close()
        },
    })
    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    })
})
