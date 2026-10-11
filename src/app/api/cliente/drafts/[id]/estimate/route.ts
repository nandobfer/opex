import { withRoute } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { clientScope } from "@/features/orcamentos/server/drafts"
import { prepareBudgetEstimate, runBudgetEstimate, type BudgetEstimateEvent } from "@/features/orcamentos/server/preview"
import { requireClient } from "@/features/orcamentos/server/token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const log = loggerFor({ module: "ai", feature: "budget-preview" })

type Params = { id: string }

/**
 * POST /api/cliente/drafts/[id]/estimate — estima as horas e o orçamento da prévia (2ª fase).
 *
 * Exige a prévia já gerada (409). Feature indisponível (409) ou rascunho inexistente (404) respondem
 * JSON. Senão, NDJSON: `start`, eventos de progresso e um `done` (com o orçamento) ou `error` final.
 */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const client = await requireClient(req)
    const prepared = await prepareBudgetEstimate(clientScope(client), params.id)
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let open = true
            const write = (event: BudgetEstimateEvent) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
                } catch {
                    open = false
                }
            }
            try {
                for await (const event of runBudgetEstimate(prepared, req.signal)) write(event)
            } catch (error) {
                log.warn({ err: error instanceof Error ? error.message : error }, "[orcamentos] falha na estimativa")
                write({ type: "error", message: error instanceof Error ? error.message : "Falha ao estimar o orçamento" })
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
