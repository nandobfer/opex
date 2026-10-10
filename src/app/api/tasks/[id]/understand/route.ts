import { withRoute } from "@/lib/api/route"
import { prepareUnderstandTask, runUnderstandTask } from "@/features/ai/server/understand-task"
import type { UnderstandTaskEvent } from "@/features/ai/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/tasks/[id]/understand — "Entender tarefa" com o provedor de IA configurado.
 *
 * Feature indisponível (409) ou tarefa inexistente (404) respondem JSON. Senão, NDJSON
 * (`application/x-ndjson`): `start`, `delta`/`reasoning`/`tool`/`notice` à medida que chegam e um
 * `done` ou `error` final. Fechar a conexão cancela a geração.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const prepared = await prepareUnderstandTask(params.id)
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let open = true
            const write = (event: UnderstandTaskEvent) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
                } catch {
                    open = false
                }
            }
            for await (const event of runUnderstandTask(prepared, req.signal)) write(event)
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
