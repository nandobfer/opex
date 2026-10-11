import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { ownerDraftEstimateSchema } from "@/features/orcamentos/schemas"
import { OWNER_SCOPE } from "@/features/orcamentos/server/drafts"
import { getOwnerDraftDoc, recomputeOwnerEstimate, requireOwnerDraftEditable, setOwnerEstimateClient } from "@/features/orcamentos/server/owner"
import { prepareBudgetEstimate, runBudgetEstimate, type BudgetEstimateEvent } from "@/features/orcamentos/server/preview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const log = loggerFor({ module: "ai", feature: "budget-preview" })

type Params = { id: string }

/**
 * POST /api/tasks/drafts/[id]/estimate — estima as horas da prévia do dono (NDJSON) e calcula o custo.
 *
 * O corpo opcional `{ clientId }` define/troca/limpa o cliente usado só no **custo**; com as horas já
 * estimadas, o recálculo é **sem IA** (reusa horas e modelo). Sem horas ainda, roda a 2ª fase normal
 * (tags + tarefas semelhantes + provedor de texto/JEV). Erros antes do stream respondem JSON.
 */
export const POST = withRoute<Params>(async ({ req, params }) => {
    const body = await parseBody(req, ownerDraftEstimateSchema)
    if (!body.ok) return body.response

    const draft = await requireOwnerDraftEditable(params.id)
    if (!draft.preview) throw new DomainError(409, "Gere a prévia antes de estimar", "DRAFT_WITHOUT_PREVIEW")
    // Trocar/limpar o cliente só muda o custo: regrava `estimateClientId` e relê o rascunho.
    let current = draft
    if (body.data.clientId !== undefined) {
        await setOwnerEstimateClient(params.id, body.data.clientId)
        current = await getOwnerDraftDoc(params.id)
    }
    const hours = typeof current.estimatedHours === "number" ? current.estimatedHours : null

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
                if (hours !== null) {
                    // Já existem horas: só o custo muda (réplica do stream, sem chamada de IA).
                    const [provider = "estimate", model = ""] = (current.model ?? "").split("/")
                    const { estimate, tags } = await recomputeOwnerEstimate(current)
                    write({ type: "start", provider, model })
                    write({ type: "done", estimate, tags })
                    return
                }
                const prepared = await prepareBudgetEstimate(OWNER_SCOPE, params.id)
                for await (const event of runBudgetEstimate(prepared, req.signal)) write(event)
            } catch (error) {
                log.warn({ err: error instanceof Error ? error.message : error }, "[orcamentos] falha na estimativa do dono")
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
