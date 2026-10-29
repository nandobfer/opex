import { ok } from "@/lib/api/responses"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { feedbackSchema, optionalFeedbackSchema, setWorkbenchStageSchema } from "@/features/agentic/schemas"
import { adversarialFix, adversarialRerun, adversarialSkip, approve, cancelWait, implement, interrupt, rebuildPreview, reconnect, reopen, requestCorrection, retry, revisePlan, setWorkbenchStage, submitPrFeedback } from "@/features/agentic/server/workflow"
import { adversarialFixSchema } from "@/features/adversarial-agent/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const WITH_FEEDBACK = { "revise-plan": revisePlan, "request-correction": requestCorrection, "submit-pr-feedback": submitPrFeedback, reopen } as const
const WITH_OPTIONAL_TEXT = { implement } as const
const WITHOUT_BODY = { approve, retry, interrupt, reconnect, "cancel-wait": cancelWait, "adversarial-skip": adversarialSkip, "adversarial-rerun": adversarialRerun, "rebuild-preview": (id: string) => rebuildPreview(id) } as const

/**
 * POST /api/agentic/workbenches/[id]/actions/[action] — ações da mesa. `revise-plan`,
 * `request-correction`, `submit-pr-feedback` e `reopen` exigem `{ text, fileIds? }` (vai para o planejador);
 * `implement` aceita `{ text?, fileIds? }` (informações adicionais anexadas ao prompt de implementação).
 * `fileIds`: anexos confirmados em `/api/agentic/files` (vão ao agente no prompt do turno);
 * `approve`, `retry`, `interrupt`, `reconnect`, `cancel-wait` e `rebuild-preview` (Gerar nova prévia) não têm corpo. Responde na hora com a mesa: a saída
 * do agente chega pelo stream de eventos. Com o limite de mesas da central cheio, as ações que saem de Plano pronto,
 * Prévia pronta, PR aberto ou de uma mesa concluída deixam a mesa **aguardando vaga** (`slotQueue`); `cancel-wait`
 * desfaz a espera. Agente Adversário: `adversarial-fix` aceita `{ text?, excluded? }` (achados desmarcados);
 * `adversarial-skip` e `adversarial-rerun` não têm corpo.
 * `set-stage` exige `{ stage, reason }`: define uma etapa de espera ou conclui a mesa sem PR (`stage: "done"`),
 * interrompendo o turno em andamento; transição inválida responde 409.
 */
export const POST = withRoute<{ id: string; action: string }>(async ({ req, params }) => {
    if (params.action in WITH_FEEDBACK) {
        const body = await parseBody(req, feedbackSchema)
        if (!body.ok) return body.response
        return ok(await WITH_FEEDBACK[params.action as keyof typeof WITH_FEEDBACK](params.id, body.data.text, body.data.fileIds))
    }
    if (params.action in WITH_OPTIONAL_TEXT) {
        const body = await parseBody(req, optionalFeedbackSchema)
        if (!body.ok) return body.response
        return ok(await WITH_OPTIONAL_TEXT[params.action as keyof typeof WITH_OPTIONAL_TEXT](params.id, body.data.text, body.data.fileIds))
    }
    if (params.action === "adversarial-fix") {
        const body = await parseBody(req, adversarialFixSchema)
        if (!body.ok) return body.response
        return ok(await adversarialFix(params.id, body.data))
    }
    if (params.action === "set-stage") {
        const body = await parseBody(req, setWorkbenchStageSchema)
        if (!body.ok) return body.response
        return ok(await setWorkbenchStage(params.id, body.data))
    }
    if (params.action in WITHOUT_BODY) return ok(await WITHOUT_BODY[params.action as keyof typeof WITHOUT_BODY](params.id))
    throw new DomainError(404, "Ação desconhecida", "UNKNOWN_ACTION")
})
