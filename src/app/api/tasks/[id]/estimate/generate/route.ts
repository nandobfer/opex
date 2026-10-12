import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { prepareTaskEstimate, runTaskEstimate, type TaskEstimateEvent } from "@/features/tasks/server/estimate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const log = loggerFor({ module: "ai", feature: "estimate-hours" })

/**
 * POST /api/tasks/[id]/estimate/generate — estima as horas da tarefa com IA (NDJSON).
 *
 * Reusa o núcleo de "Estimar prazos" (tags + tarefas semelhantes + uma chamada de texto/JEV) sobre
 * os dados da própria tarefa e grava o snapshot ao final, inflado pelo cliente atual. Erros antes do
 * stream respondem JSON (`DomainError` pelo `withRoute`).
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const prepared = await prepareTaskEstimate(params.id)
    const actorId = getLocalUser().id
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let open = true
            const write = (event: TaskEstimateEvent) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
                } catch {
                    open = false
                }
            }
            try {
                for await (const event of runTaskEstimate(prepared, actorId, req.signal)) write(event)
            } catch (error) {
                log.warn({ err: error instanceof Error ? error.message : error }, "[orcamentos] falha na estimativa da tarefa")
                write({ type: "error", message: error instanceof Error ? error.message : "Falha ao estimar a tarefa" })
            } finally {
                if (open) controller.close()
            }
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
